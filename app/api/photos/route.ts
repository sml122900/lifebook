import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { isPhotoPeriodAnchor } from "@/lib/life-events";
import { validatePlace } from "@/lib/place-validate";
import { attachPhotoToMemory, createIndependentPhoto } from "@/lib/photos";

// FormData 의 숫자 필드(lat/lng) 파싱 — 빈/비숫자면 null.
function numFromForm(v: FormDataEntryValue | null): number | null {
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
import {
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  type AllowedMimeType,
  detectImageType,
  isHeicByMagic,
} from "@/lib/storage";

// Phase Photo (2단계) — 정식 업로드 라우트.
// 1단계 test-upload 와 차이: DB 동시 생성 (UserMemory + Photo transaction),
// 사용자가 year/month/caption 함께 보냄.
//
// 검증 순서 (1단계와 동일 + 추가):
//   1. auth()
//   2. multipart 파싱 (file + year + month? + caption?)
//   3. 용량 / mimeType / HEIC / magic number
//   4. year 유효성 (1900 ≤ year ≤ 현재+1), month 유효성 (1~12 or null)
//   5. caption 길이 (≤200자)
//   6. createIndependentPhoto (Storage + DB transaction, 실패 시 롤백)

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1900;
const YEAR_MAX = CURRENT_YEAR + 1;
const CAPTION_MAX = 200;

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "올바른 형식이 아니에요." },
      { status: 400 },
    );
  }

  // ── 파일 검증 ───────────────────────────────────────────────
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "사진을 골라주세요." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { ok: false, error: "빈 파일이에요." },
      { status: 400 },
    );
  }
  if (file.size > MAX_PHOTO_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return NextResponse.json(
      {
        ok: false,
        error: `사진은 10MB 까지 올릴 수 있어요. (지금 ${mb}MB)`,
      },
      { status: 400 },
    );
  }

  const declaredMime = file.type;
  if (declaredMime === "image/heic" || declaredMime === "image/heif") {
    return NextResponse.json(
      {
        ok: false,
        error:
          "아이폰 HEIC 형식은 아직 받지 못해요. 설정 > 카메라 > 포맷 > '호환성' 으로 바꾼 뒤 다시 찍어주세요.",
      },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(declaredMime as AllowedMimeType)) {
    return NextResponse.json(
      { ok: false, error: "jpeg, png, webp 형식만 올릴 수 있어요." },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (isHeicByMagic(buffer)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "아이폰 HEIC 형식은 아직 받지 못해요. 설정 > 카메라 > 포맷 > '호환성' 으로 바꾼 뒤 다시 찍어주세요.",
      },
      { status: 400 },
    );
  }
  const detected = detectImageType(buffer);
  if (!detected) {
    return NextResponse.json(
      { ok: false, error: "이미지 파일이 아니거나 지원하지 않는 형식이에요." },
      { status: 400 },
    );
  }
  if (detected !== declaredMime) {
    return NextResponse.json(
      {
        ok: false,
        error: "파일 형식이 일치하지 않아요. 다른 사진을 시도해 주세요.",
      },
      { status: 400 },
    );
  }

  // ── caption 검증 (양쪽 공통) ───────────────────────────────
  const captionRaw = form.get("caption");
  let caption: string | null = null;
  if (typeof captionRaw === "string") {
    const trimmed = captionRaw.trim();
    if (trimmed.length > CAPTION_MAX) {
      return NextResponse.json(
        {
          ok: false,
          error: `한 줄 설명은 ${CAPTION_MAX}자까지 적을 수 있어요.`,
        },
        { status: 400 },
      );
    }
    caption = trimmed === "" ? null : trimmed;
  }

  // ── 첨부 / 독립 분기 ────────────────────────────────────────
  // memoryId 가 있으면 기존 life_event 메모리에 첨부(3단계), 없으면 독립 사진.
  // 첨부는 year/month 가 메모리에서 상속되므로 폼 입력이 불필요.
  const memoryIdRaw = form.get("memoryId");
  const memoryId =
    typeof memoryIdRaw === "string" && memoryIdRaw.trim() !== ""
      ? memoryIdRaw.trim()
      : null;

  if (memoryId) {
    // 기간 이벤트의 어느 점에 띄울지(start|end|both). 미지정·잘못된 값은 both.
    const anchorRaw = form.get("periodAnchor");
    const periodAnchor = isPhotoPeriodAnchor(anchorRaw) ? anchorRaw : "both";
    try {
      const result = await attachPhotoToMemory(userId, memoryId, {
        fileBuffer: buffer,
        mimeType: detected,
        caption,
        periodAnchor,
      });
      if (!result.ok) {
        const msg =
          result.reason === "memory_not_found"
            ? "사진을 붙일 기록을 찾을 수 없어요."
            : "이 기록에는 사진을 붙일 수 없어요.";
        return NextResponse.json(
          { ok: false, error: msg },
          { status: result.reason === "memory_not_found" ? 404 : 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        photoId: result.photoId,
        memoryId,
      });
    } catch (e) {
      console.error("[photo-attach]", e);
      return NextResponse.json(
        { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." },
        { status: 500 },
      );
    }
  }

  // ── 독립 사진 — year / month 검증 후 새 메모리 + Photo ──────
  const yearRaw = form.get("year");
  const yearNum = typeof yearRaw === "string" ? Number(yearRaw) : NaN;
  if (
    !Number.isInteger(yearNum) ||
    yearNum < YEAR_MIN ||
    yearNum > YEAR_MAX
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: `사진을 찍은 해를 ${YEAR_MIN}~${YEAR_MAX} 범위로 적어주세요.`,
      },
      { status: 400 },
    );
  }

  const monthRaw = form.get("month");
  let monthNum: number | null = null;
  if (typeof monthRaw === "string" && monthRaw.trim() !== "") {
    const m = Number(monthRaw);
    if (!Number.isInteger(m) || m < 1 || m > 12) {
      return NextResponse.json(
        { ok: false, error: "달은 1~12 사이로 적어주세요. 모르면 비워두세요." },
        { status: 400 },
      );
    }
    monthNum = m;
  }

  // ── 장소(선택) — 독립 사진에만. 미선택이면 undefined. ──────────
  const placeNameRaw = form.get("placeName");
  let place;
  if (typeof placeNameRaw === "string" && placeNameRaw.trim() !== "") {
    const addrRaw = form.get("placeAddress");
    const srcRaw = form.get("placeSource");
    const pv = validatePlace({
      placeName: placeNameRaw,
      placeAddress: typeof addrRaw === "string" ? addrRaw : null,
      lat: numFromForm(form.get("lat")),
      lng: numFromForm(form.get("lng")),
      placeSource: typeof srcRaw === "string" ? srcRaw : null,
    });
    if (!pv.ok) {
      return NextResponse.json({ ok: false, error: pv.error }, { status: 400 });
    }
    place = pv.place;
  }

  // ── 저장 (Storage + DB transaction, 실패 시 Storage 롤백) ──
  try {
    const result = await createIndependentPhoto(userId, {
      fileBuffer: buffer,
      mimeType: detected,
      year: yearNum,
      month: monthNum,
      caption,
      place,
    });
    return NextResponse.json({
      ok: true,
      photoId: result.photoId,
      memoryId: result.memoryId,
    });
  } catch (e) {
    console.error("[photo-upload]", e);
    return NextResponse.json(
      { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
