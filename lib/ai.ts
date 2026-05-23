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
  // ⚠️ Phase 8 token-deduction hook lands here. Every paid AI call in
  // the product must flow through this single function so the deduction
  // (and any retry / backoff) only needs to be wired up once.
  const model = opts.model ?? DEFAULT_MODEL;
  const res = await getClient().messages.create({
    model,
    max_tokens: opts.maxTokens ?? 1024,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages,
  });

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
