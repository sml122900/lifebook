// Claude (Anthropic) API wrapper.
//
// Phase 7 uses this for guided memory conversations. Every AI call goes
// through `chat()` so:
//   - the API key only reads from process.env (no hardcoding)
//   - Phase 8's token-deduction hook lands in exactly one place
//   - we can swap models / tweak max_tokens centrally
//
// Default model: claude-haiku-4-5 — fast and cheap enough for the
// per-event chat loop, with quality comfortable for guided questions
// in Korean. Caller can override per call.

import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";

// V4 — Opus 4.7 (reasoning 모델) 은 temperature 파라미터를 거부한다
// ("temperature is deprecated for this model"). 비서 "가장 정확하게"
// 깊이가 Opus 를 호출할 때 이 가드가 필요. 모델 이름 prefix 로 판정.
function supportsTemperature(model: string): boolean {
  return !model.startsWith("claude-opus-4-7");
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
};

export type ChatResult = {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
};

export async function chat(
  messages: ChatMessage[],
  opts: ChatOptions = {},
): Promise<ChatResult> {
  const model = opts.model ?? DEFAULT_MODEL;

  // ──────────────────────────────────────────────────────────────────
  // PHASE 8 — TOKEN DEDUCTION HOOK
  //
  // Every paid AI call in the product must flow through this single
  // function. Phase 8 wraps the call with:
  //   1. pre-call: lookup user balance, refuse if insufficient
  //   2. post-call: charge tokens (input + output)
  //   3. on failure: refund / don't charge
  //
  // For now we just log so we can sanity-check usage in dev. The
  // caller never sees the deduction directly — it's bookkeeping that
  // belongs next to the API call.
  // ──────────────────────────────────────────────────────────────────

  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    ...(supportsTemperature(model)
      ? { temperature: opts.temperature ?? 0.7 }
      : {}),
    system: opts.system,
    messages,
  });

  console.log(
    `[ai] model=${res.model} in=${res.usage.input_tokens} out=${res.usage.output_tokens} total=${res.usage.input_tokens + res.usage.output_tokens}`,
  );

  // The SDK returns a content[] union; for our prompts we only ever ask
  // for plain text. Concatenate any text blocks defensively.
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
    model: res.model,
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

  console.log(
    `[ai:web_search] model=${res.model} in=${res.usage.input_tokens} out=${res.usage.output_tokens} blocks=${res.content.length}`,
  );

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
