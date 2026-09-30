// 기억 에이전트 연구 트랙 — lab 전용 Anthropic 클라이언트.
//
// 결정 3: 전용 키 LAB_ANTHROPIC_API_KEY 만 읽는다. 없으면 실행 거부하고, 운영 키
// (ANTHROPIC_API_KEY)로 절대 대체하지 않는다 — 연구 원가가 운영 예산을 먹지 않게.
// lib/ai.ts 는 클라이언트를 export 하지 않고 tools·프롬프트 캐싱을 지원하지 않아
// (기존 파일 무수정) SDK 를 직접 쓰는 얇은 래퍼를 둔다.
//
// 순서: ① 키 확인(없으면 네트워크 0) ② 월 예산 가드(최대 예상 원가) ③ 호출
// ④ LabUsage 기록(실사용 토큰).

import Anthropic from "@anthropic-ai/sdk";

import {
  assertLabBudget,
  estimateCostMicroUsd,
  recordLabUsage,
  type LabPurpose,
} from "./usage";

export class LabConfigError extends Error {
  constructor() {
    super(
      "LAB_ANTHROPIC_API_KEY 가 없어 lab LLM 호출을 거부했어요(운영 키로 대체하지 않음).",
    );
    this.name = "LabConfigError";
  }
}

let client: Anthropic | null = null;
let clientKey: string | null = null;
function getLabClient(): Anthropic {
  const key = process.env.LAB_ANTHROPIC_API_KEY;
  if (!key) throw new LabConfigError();
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key });
    clientKey = key;
  }
  return client;
}

export async function labMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
  meta: { purpose: LabPurpose; userId: string | null; refId?: string },
): Promise<Anthropic.Message> {
  const anthropic = getLabClient();

  // 입력 토큰은 호출 전엔 모르므로 글자 수로 보수 추정(한글 1자 ≈ 1토큰 이하),
  // 출력은 max_tokens 전부를 쓴다고 가정.
  const approxInput = JSON.stringify([
    params.system ?? "",
    params.messages,
    params.tools ?? [],
  ]).length;
  await assertLabBudget(
    estimateCostMicroUsd(params.model, {
      input: approxInput,
      output: params.max_tokens,
    }),
  );

  // Opus 4.x 는 temperature 를 거부한다(lib/ai.ts supportsTemperature 와 같은 규칙).
  const body = params.model.startsWith("claude-opus-4")
    ? { ...params, temperature: undefined }
    : params;
  const res = await anthropic.messages.create(body);

  await recordLabUsage({
    purpose: meta.purpose,
    model: params.model,
    userId: meta.userId,
    refId: meta.refId,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0,
  });
  return res;
}
