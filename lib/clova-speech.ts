// Phase 10 — CLOVA Speech (New) 서버 전용 래퍼.
//
// ★ CLOVA_SPEECH_SECRET 은 서버 전용. 절대 클라 번들에 포함 금지.
//
// 비동기 흐름 (Vercel Hobby 함수 타임아웃 초과 방지):
//   submitRecognition  → CLOVA 에 제출 → token 즉시 반환 (수 초 이내)
//   getRecognitionResult(token) → 폴링 — 클라가 주도
//
// 포맷: audio/webm;codecs=opus(Chrome 기본), OGG, WAV 모두 200 COMPLETED 확인.
// 변환 불필요 — 7b 저장 포맷 그대로 재사용.
//
// ⚠️ 90분 이상 대용량 파일은 Vercel Hobby 함수 25MB/10s 제한에 걸릴 수 있음.
// Supabase에서 직접 스트리밍 또는 청크 분할은 Phase 2 과제로 남김.

const INVOKE_URL = process.env.CLOVA_SPEECH_INVOKE_URL ?? "";
const API_KEY = process.env.CLOVA_SPEECH_SECRET ?? "";

export type ClovaStatus = "SUBMITTED" | "RUNNING" | "COMPLETED" | "FAILED";

export type ClovaSegment = {
  start: number;  // ms
  end: number;    // ms
  text: string;
  speakerLabel?: string;
};

export type ClovaResult = {
  status: ClovaStatus;
  text: string;
  segments: ClovaSegment[];
};

function assertEnv() {
  if (!INVOKE_URL || !API_KEY) {
    throw new Error("CLOVA_SPEECH_INVOKE_URL 또는 CLOVA_SPEECH_SECRET 환경변수가 없어요.");
  }
}

// CLOVA 에 오디오 제출 → token 즉시 반환. 완료 대기 금지.
export async function submitRecognition(
  audioBuffer: Buffer,
  mimeType: string,
): Promise<{ token: string }> {
  assertEnv();

  const params = JSON.stringify({
    language: "ko-KR",
    completion: "async",
    // 화자 분리 — 1인 통녹음에서도 켜두면 segment 가 명확히 분리됨.
    // 단독 녹음이라 speakerCountMin/Max = 1 고정.
    diarization: { enable: true, speakerCountMin: 1, speakerCountMax: 1 },
    wordAlignment: true,
    fullText: true,
    noiseFiltering: true,
  });

  const boundary = `----ClovaSpeech${Date.now()}`;
  const CRLF = "\r\n";
  const parts: Buffer[] = [];

  // params 파트
  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="params"${CRLF}` +
        `Content-Type: application/json${CRLF}${CRLF}`,
    ),
    Buffer.from(params),
    Buffer.from(CRLF),
  );

  // media 파트 — Content-Type 에 codecs 접미사 제거해 전달
  const baseMime = mimeType.split(";")[0].trim();
  parts.push(
    Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="media"; filename="audio.${extFromMime(baseMime)}"${CRLF}` +
        `Content-Type: ${baseMime}${CRLF}${CRLF}`,
    ),
    audioBuffer,
    Buffer.from(CRLF),
    Buffer.from(`--${boundary}--${CRLF}`),
  );

  const body = Buffer.concat(parts);

  const res = await fetch(`${INVOKE_URL}/recognizer/upload`, {
    method: "POST",
    headers: {
      "X-CLOVASPEECH-API-KEY": API_KEY,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`CLOVA 제출 실패 (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as { token?: string; result?: string };
  if (!data.token) {
    throw new Error("CLOVA 응답에 token 이 없어요.");
  }
  return { token: data.token };
}

// 폴링 — 클라가 주기적으로 호출. COMPLETED 또는 FAILED 가 나올 때까지 반복.
export async function getRecognitionResult(token: string): Promise<ClovaResult> {
  assertEnv();

  const res = await fetch(`${INVOKE_URL}/recognizer/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { "X-CLOVASPEECH-API-KEY": API_KEY },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`CLOVA 폴링 실패 (${res.status})`);
  }

  const data = (await res.json()) as {
    result?: string;
    text?: string;
    segments?: ClovaSegment[];
  };

  return {
    status: (data.result ?? "RUNNING") as ClovaStatus,
    text: data.text ?? "",
    segments: Array.isArray(data.segments) ? data.segments : [],
  };
}

function extFromMime(mime: string): string {
  if (mime === "audio/ogg") return "ogg";
  if (mime === "audio/mp4") return "mp4";
  if (mime === "audio/mpeg") return "mp3";
  return "webm";
}
