import { NextResponse, type NextRequest } from "next/server";

import { auth } from "@/auth";
import {
  ALLOWED_MIME_TYPES,
  MAX_PHOTO_BYTES,
  type AllowedMimeType,
  detectImageType,
  getSignedUrl,
  isHeicByMagic,
  uploadPhoto,
} from "@/lib/storage";

// Phase Photo 1단계 — Storage 검증용 업로드 라우트.
// multipart/form-data 받아 → 권한·용량·mimeType·magic number 검증 → upload.
// DB 변경 0. 다음 단계에서 Photo 모델 + transaction 추가.
//
// 검증 순서 (가장 싼 것부터):
//   1. auth() — 로그인
//   2. multipart 파싱
//   3. file 객체·용량
//   4. 선언된 mimeType 화이트리스트 (HEIC 명시면 친화 안내)
//   5. magic number — HEIC 헤더 감지 (브라우저가 jpeg 로 잘못 보내는 경우)
//   6. magic number — 실제 이미지 헤더 추출
//   7. 선언 mimeType 과 실제 헤더 일치 (위장 차단)
//   8. upload + signed URL

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

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "파일을 골라주세요." },
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

  // 선언된 mimeType (브라우저 보고)
  const declaredMime = file.type;

  // HEIC 명시 라벨 — 친화 안내로 즉시 분기.
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
      {
        ok: false,
        error: "jpeg, png, webp 형식만 올릴 수 있어요.",
      },
      { status: 400 },
    );
  }

  // 파일 내용 읽기 — 여기까지 와야 디스크/메모리 사용. 위 검증으로 잘못된
  // 요청은 모두 차단.
  const buffer = Buffer.from(await file.arrayBuffer());

  // HEIC magic — 브라우저가 image/jpeg 로 잘못 보내는 경우(macOS Safari 등)
  // 명시 mimeType 가 통과해도 헤더로 다시 확인.
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

  // 실제 이미지 헤더로 타입 확정 (위장 차단).
  const detected = detectImageType(buffer);
  if (!detected) {
    return NextResponse.json(
      {
        ok: false,
        error: "이미지 파일이 아니거나 지원하지 않는 형식이에요.",
      },
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

  try {
    const result = await uploadPhoto(userId, buffer, detected);
    const signedUrl = await getSignedUrl(result.storagePath);
    return NextResponse.json({
      ok: true,
      path: result.storagePath,
      signedUrl,
      bytes: result.bytes,
      mimeType: result.mimeType,
    });
  } catch (e) {
    // 서버 로그만 (디테일 노출 X — Storage 에러가 service_role 단서 포함 가능).
    console.error("[photo-test-upload]", e);
    return NextResponse.json(
      {
        ok: false,
        error: "업로드에 실패했어요. 잠시 후 다시 시도해 주세요.",
      },
      { status: 500 },
    );
  }
}
