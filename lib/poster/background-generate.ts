// P5-2 — AI 맞춤 배경 생성 + 후처리 (서버 전용).
//
// buildBackgroundPrompt(P5-1) 결과 → OpenAI 이미지 생성 → 1037×1517 PNG
// (river-bg 규격, P4 합성 입력 호환). 키는 process.env.OPENAI_API_KEY 서버
// 전용 — 절대 클라/로그로 내보내지 않는다(에러 로깅도 키 없는 body 만).
//
// 모델·품질·사이즈는 상수로 분리(상향 가능). 경영방: 저품질 $0.01 티어 시작.

import sharp from "sharp";

import { POSTER_W, POSTER_H } from "./compose-layout";
import type { BackgroundPrompt } from "./background-prompt";

// gpt-image-1 지원: size 1024x1024 / 1024x1536(portrait) / 1536x1024,
// quality low|medium|high|auto. 저품질부터 시작, env 로 상향 가능.
export const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
export const OPENAI_IMAGE_QUALITY = process.env.OPENAI_IMAGE_QUALITY ?? "low";
export const OPENAI_IMAGE_SIZE = process.env.OPENAI_IMAGE_SIZE ?? "1024x1536";

const OPENAI_URL = "https://api.openai.com/v1/images/generations";

export type BgGenCode =
  | "no_key"
  | "auth"
  | "forbidden"
  | "rate"
  | "bad_request"
  | "upstream"
  | "network"
  | "empty";

export class BackgroundGenError extends Error {
  constructor(
    public code: BgGenCode,
    message: string,
  ) {
    super(message);
    this.name = "BackgroundGenError";
  }
}

// gpt-image-1 은 별도 negative 파라미터가 없어 프롬프트에 금지 지시로 접합.
function mergePrompt(p: BackgroundPrompt): string {
  return `${p.prompt}\n\n[금지] 다음 요소는 절대 그리지 마라: ${p.negativePrompt}`;
}

// OpenAI 이미지 생성 → 원본 PNG 버퍼(생성 사이즈). 키 없으면 no_key 에러.
export async function generateBackgroundRaw(p: BackgroundPrompt): Promise<Buffer> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new BackgroundGenError(
      "no_key",
      "OPENAI_API_KEY 가 설정되지 않았어요(서버 환경변수).",
    );
  }

  let res: Response;
  try {
    res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: OPENAI_IMAGE_MODEL,
        prompt: mergePrompt(p),
        size: OPENAI_IMAGE_SIZE,
        quality: OPENAI_IMAGE_QUALITY,
        n: 1,
      }),
    });
  } catch (e) {
    throw new BackgroundGenError(
      "network",
      `이미지 생성 요청 실패(네트워크): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (!res.ok) {
    // 서버 로그만 — OpenAI 에러 body 에는 키가 없다(요청 헤더에만). 사용자엔 분류 메시지.
    const body = await res.text().catch(() => "");
    console.error("[bg-gen] openai error", res.status, body.slice(0, 400));
    if (res.status === 401)
      throw new BackgroundGenError("auth", "OpenAI 인증 실패(키를 확인해 주세요).");
    if (res.status === 403)
      throw new BackgroundGenError(
        "forbidden",
        "이 모델 사용 권한이 없어요(OpenAI 조직 인증 필요할 수 있어요).",
      );
    if (res.status === 429)
      throw new BackgroundGenError("rate", "요청이 많아요. 잠시 후 다시 시도해 주세요.");
    if (res.status === 400)
      throw new BackgroundGenError(
        "bad_request",
        "이미지 생성 요청이 거부됐어요(프롬프트를 확인해 주세요).",
      );
    throw new BackgroundGenError("upstream", `이미지 생성에 실패했어요(${res.status}).`);
  }

  const data = (await res.json()) as {
    data?: { b64_json?: string; url?: string }[];
  };
  const first = data.data?.[0];
  if (first?.b64_json) return Buffer.from(first.b64_json, "base64");
  // url 폴백(일부 모델). gpt-image-1 은 b64 반환.
  if (first?.url) {
    const img = await fetch(first.url);
    return Buffer.from(await img.arrayBuffer());
  }
  throw new BackgroundGenError("empty", "이미지 데이터가 비었어요.");
}

// 1037×1517 cover-fit + 중앙 crop → PNG (river-bg 규격, edge-stretch 없음).
export async function postProcessTo1037x1517(input: Buffer): Promise<Buffer> {
  return sharp(input)
    .resize(POSTER_W, POSTER_H, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();
}

// 빌더 결과 → 최종 1037×1517 PNG 버퍼(P4 <image> 입력).
export async function generatePosterBackground(
  p: BackgroundPrompt,
): Promise<Buffer> {
  const raw = await generateBackgroundRaw(p);
  return postProcessTo1037x1517(raw);
}
