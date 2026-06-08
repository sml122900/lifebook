import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import { createIndependentPhoto } from "@/lib/photos";
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

  // ── year / month / caption 검증 ─────────────────────────────
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

  // ── 저장 (Storage + DB transaction, 실패 시 Storage 롤백) ──
  try {
    const result = await createIndependentPhoto(userId, {
      fileBuffer: buffer,
      mimeType: detected,
      year: yearNum,
      month: monthNum,
      caption,
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
