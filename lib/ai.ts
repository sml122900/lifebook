// Claude (Anthropic) API 래퍼.
//
// Phase 7 가이드 추억 대화가 이걸 쓴다. 모든 AI 호출은 `chat()` 한 곳을
// 거치므로:
//   - API 키는 process.env 에서만 읽는다(하드코딩 금지)
//   - Phase 8 토큰 차감 훅이 정확히 한 곳에 들어간다
//   - 모델 교체·max_tokens 조정을 중앙에서 한다
//
// 기본 모델: claude-haiku-4-5 — 사건별 대화 루프에 충분히 빠르고 저렴하며,
// 한국어 가이드 질문 품질도 무난. 호출자가 호출마다 덮어쓸 수 있다.

import { AsyncLocalStorage } from "node:async_hooks";

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// 오늘의 인터뷰 — 문항별 AI 사용량 기록. trackAiUsage(usage, fn) 안에서 일어난
// chat() 호출이 usage 에 합산된다(호출부·기존 서버 액션 시그니처 무변). 바깥에선
// 아무 일도 안 한다.
export type AiUsage = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  model: string | null;
};

const usageStore = new AsyncLocalStorage<AiUsage>();

export function newAiUsage(): AiUsage {
  return { calls: 0, inputTokens: 0, outputTokens: 0, model: null };
}

export function trackAiUsage<T>(usage: AiUsage, fn: () => Promise<T>): Promise<T> {
  return usageStore.run(usage, fn);
}

// Opus 4.x (reasoning 모델) 은 temperature 파라미터를 거부한다
// ("temperature is deprecated for this model"). 4.7·4.8 모두 해당 — opus-4
// 패밀리 전체를 가드(버전 올려도 안전). 비서 "가장 정확하게"·다듬기 "가장 정밀"이
// Opus 를 호출할 때 필요. temperature 생략 시 모델 기본값 사용(영향 미미).
function supportsTemperature(model: string): boolean {
  return !model.startsWith("claude-opus-4");
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  client = new Anthropic({ apiKey: key });
  return client;
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatOptions = {
  system?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // 프롬프트 캐싱(2026-11-03 — docs/phase/my-life-restructure.md §17). 프롬프트 문장·순서는 그대로, 캐시 표시만.
  //   "system"       — 시스템 지시문 끝에 표시(고정 지시문을 여러 호출이 같이 씀 — 제안 카드).
  //   "conversation" — 시스템 지시문 + 마지막 메시지 끝에 표시(같은 대화의 다음 턴이 앞부분을 읽음 — 자유 대화·인터뷰 후속·말동무).
  // 모델별 최소 길이(Haiku 4.5 4,096 · Sonnet 4.6·Opus 4.8 1,024 토큰)보다 짧으면 API 가 캐시 없이 그대로 처리한다(추가 요금 없음).
  cache?: "system" | "conversation";
};

export type ChatResult = {
  text: string;
  // 입력 토큰 전체 = 캐시 없이 읽은 것 + 캐시에 쓴 것 + 캐시에서 읽은 것(캐싱 전과 같은 뜻 — 토큰 차감·인터뷰 기록은 그대로).
  inputTokens: number;
  outputTokens: number;
  model: string;
  cacheWriteTokens: number; // usage.cache_creation_input_tokens(기본 입력가의 1.25배)
  cacheReadTokens: number; // usage.cache_read_input_tokens(기본 입력가의 0.1배)
};

// 캐시 표시 — 시스템 지시문은 블록 하나로, "conversation" 이면 마지막 메시지도 블록으로 바꿔 끝에 표시(내용 그대로).
function withCache(
  messages: ChatMessage[],
  opts: ChatOptions,
): { system: string | Anthropic.TextBlockParam[] | undefined; messages: Anthropic.MessageParam[] } {
  if (!opts.cache) return { system: opts.system, messages };
  const mark = { type: "ephemeral" } as const;
  const system = opts.system ? [{ type: "text" as const, text: opts.system, cache_control: mark }] : opts.system;
  const last = messages[messages.length - 1];
  if (opts.cache !== "conversation" || !last?.content) return { system, messages };
  return {
    system,
    messages: [...messages.slice(0, -1), { role: last.role, content: [{ type: "text", text: last.content, cache_control: mark }] }],
  };
}

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const model = opts.model ?? DEFAULT_MODEL;

  // ──────────────────────────────────────────────────────────────────
  // PHASE 8 — 토큰 차감 훅
  //
  // 제품의 모든 유료 AI 호출은 이 함수 하나를 거친다. Phase 8 은 호출을
  // 다음으로 감싼다:
  //   1. 호출 전: 사용자 잔액 조회, 부족하면 거부
  //   2. 호출 후: 토큰 차감 (입력 + 출력)
  //   3. 실패 시: 환불 / 차감 안 함
  //
  // 지금은 dev 에서 사용량을 점검하려고 로그만 남긴다. 호출자는 차감을
  // 직접 보지 않는다 — API 호출 옆에 두는 부기(bookkeeping)다.
  // ──────────────────────────────────────────────────────────────────

  const req = withCache(messages, opts);
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(supportsTemperature(model)
      ? { temperature: opts.temperature ?? 0.7 }
      : {}),
    system: req.system,
    messages: req.messages,
  });
  const cacheWriteTokens = res.usage.cache_creation_input_tokens ?? 0;
  const cacheReadTokens = res.usage.cache_read_input_tokens ?? 0;
  const inputTokens = res.usage.input_tokens + cacheWriteTokens + cacheReadTokens;

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[ai] model=${res.model} in=${inputTokens} out=${res.usage.output_tokens} total=${inputTokens + res.usage.output_tokens} cacheWrite=${cacheWriteTokens} cacheRead=${cacheReadTokens}`,
    );
  }

  const tracked = usageStore.getStore();
  if (tracked) {
    tracked.calls += 1;
    tracked.inputTokens += inputTokens;
    tracked.outputTokens += res.usage.output_tokens;
    tracked.model = res.model;
  }

  // SDK 는 content[] union 을 돌려준다. 우리 프롬프트는 항상 평문만
  // 요청하므로, text 블록들을 방어적으로 이어 붙인다.
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  return {
    text,
    inputTokens,
    outputTokens: res.usage.output_tokens,
    model: res.model,
    cacheWriteTokens,
    cacheReadTokens,
  };
}

// Phase V1 — 타임머신 비서가 사용하는 웹 검색 경로.
//
// chat() 과 분리한 이유:
//   - tools (web_search_20250305) 가 끼면 응답이 multi-turn 가능
//     (tool_use → tool_result → 최종 텍스트). SDK 의 messages.create
//     는 한 번에 도구 사용까지 끝내고 텍스트를 돌려준다 (web_search 는
//     "server tool" — Anthropic 인프라가 검색 실행, 우리는 결과만 받음).
//   - 인용(citations) 을 별도 필드로 뽑아 답변과 함께 반환.
//
// ⚠️ Claude Console 에서 "웹 검색" 도구가 활성화돼 있어야 작동한다.
// 비활성이면 SDK 가 400 류 에러를 던지므로 호출자가 캐치해서 사용자에게
// 안내하도록.
//
// 호출자(timemachine-assistant) 가 반환된 in/out 토큰을 chargeOneShot 에
// 그대로 넘긴다. web_search 자체 비용($0.01/회) 은 토큰 정책에 가산
// (assistant 쪽에서 +1 토큰).
export type Citation = {
  url: string;
  title: string;
};

export type WebSearchResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  citations: Citation[];
};

type AnyBlock = Record<string, unknown>;

export async function chatWithWebSearch(
  messages: ChatMessage[],
  opts: ChatOptions & { maxSearches?: number } = {},
): Promise<WebSearchResult> {
  const model = opts.model ?? DEFAULT_MODEL;

  // SDK 0.98.x 의 tool typing 이 server tool (web_search) 을 아직 정확히
  // 표현 못 해 unknown 캐스팅. 형식 자체는 Anthropic 공식 문서 그대로.
  const tools = [
    {
      type: "web_search_20250305",
      name: "web_search",
      max_uses: opts.maxSearches ?? 1,
    },
  ] as unknown as Parameters<
    Anthropic["messages"]["create"]
  >[0]["tools"];

  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(supportsTemperature(model)
      ? { temperature: opts.temperature ?? 0.4 }
      : {}),
    system: opts.system,
    messages,
    tools,
  });

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[ai:web_search] model=${res.model} in=${res.usage.input_tokens} out=${res.usage.output_tokens} blocks=${res.content.length}`,
    );
  }

  // text 블록만 합쳐 본문. citations 는 text 블록 내부의 citations
  // (혹은 web_search_tool_result 블록의 sources) 에서 수집.
  let text = "";
  const citations: Citation[] = [];
  const seen = new Set<string>();
  const pushCite = (url: unknown, title: unknown) => {
    if (typeof url !== "string" || url === "" || seen.has(url)) return;
    seen.add(url);
    citations.push({ url, title: typeof title === "string" ? title : url });
  };

  for (const blk of res.content as unknown as AnyBlock[]) {
    if (blk.type === "text" && typeof blk.text === "string") {
      text += blk.text;
      const cites = blk.citations as AnyBlock[] | undefined;
      if (Array.isArray(cites)) {
        for (const c of cites) {
          pushCite(c.url, c.title);
        }
      }
    } else if (blk.type === "web_search_tool_result") {
      const content = blk.content as AnyBlock[] | undefined;
      if (Array.isArray(content)) {
        for (const item of content) {
          pushCite(item.url, item.title);
        }
      }
    }
  }

  return {
    text: text.trim(),
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    model: res.model,
    citations,
  };
}
