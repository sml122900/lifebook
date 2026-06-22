// CLOVA Voice (TTS) 서버 전용 래퍼.
//
// ★ NCP_TTS_KEY_ID / NCP_TTS_KEY_SECRET 은 서버 전용. 절대 클라 번들 금지.
//   (CLOVA Speech 의 X-CLOVASPEECH-API-KEY 와 별개 — NCP API Gateway 키)
//
// 응답: MP3 바이너리 직접 반환 (스트리밍 X, 완성 후 전달).
// 지연: 100자 기준 ~700ms.

const TTS_ENDPOINT = "https://naveropenapi.apigw.ntruss.com/tts-premium/v1/tts";

// 음성 설정. 외할머니 청취 테스트 후 speaker/speed 교체.
export const TTS_CONFIG = {
  speaker: "nsujin",  // 40대 여성, 중저음·또렷
  speed: -2,          // -5(최저)~5(최고). -2 = 살짝 느리게
  format: "mp3",
} as const;

export type TtsOptions = {
  speaker?: string;
  speed?: number;
  format?: "mp3" | "wav";
};

function assertEnv() {
  if (!process.env.NCP_TTS_KEY_ID || !process.env.NCP_TTS_KEY_SECRET) {
    throw new Error("NCP_TTS_KEY_ID 또는 NCP_TTS_KEY_SECRET 환경변수가 없어요.");
  }
}

// CLOVA Voice 호출 → MP3 Buffer 반환.
// text 는 한국어 최대 약 600자(2,000 bytes). 초과분은 자동 절사.
export async function synthesizeSpeech(
  text: string,
  opts: TtsOptions = {},
): Promise<Buffer> {
  assertEnv();

  const speaker = opts.speaker ?? TTS_CONFIG.speaker;
  const speed = opts.speed ?? TTS_CONFIG.speed;
  const format = opts.format ?? TTS_CONFIG.format;

  // 2,000 byte 제한. 한국어 UTF-8 = 3 bytes/char → 약 666자.
  const safeText = Buffer.byteLength(text, "utf8") > 1900
    ? text.slice(0, 600)
    : text;

  const body = new URLSearchParams({
    speaker,
    text: safeText,
    speed: String(speed),
    format,
  });

  const res = await fetch(TTS_ENDPOINT, {
    method: "POST",
    headers: {
      "X-NCP-APIGW-API-KEY-ID": process.env.NCP_TTS_KEY_ID!,
      "X-NCP-APIGW-API-KEY": process.env.NCP_TTS_KEY_SECRET!,
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`CLOVA Voice 실패 (${res.status}): ${msg.slice(0, 200)}`);
  }

  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}
