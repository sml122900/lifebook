// Phase 7.3 — guided question generator for the memory conversation.
//
// RAG guard (per CLAUDE.md): Claude only reasons about the event handed
// to it and never invents facts. Wording rules below are enforced in
// the system prompt; if the model misbehaves we still surface a safe
// fallback so the user always sees something.

import { chat } from "./ai";

export type MemoryEventContext = {
  title: string;
  description: string | null;
  year: number;
  category: "anchor" | "trigger";
  domain: string;
  ageAtYear: number | null;
};

const SYSTEM_PROMPT = `당신은 사용자가 인생 연혁을 정리하도록 돕는 따뜻한 인터뷰어입니다. 사용자가 어떤 사건이나 노래를 떠올릴 때, 그 시절 자신의 기억을 자연스럽게 꺼낼 수 있도록 짧은 질문을 던집니다.

규칙:
- 사용자에게 제공된 사건/노래 정보만 다루세요. 사실을 새로 만들어내거나 사용자가 말하지 않은 내용을 추측하지 마세요.
- 사용자에게 사건의 역사적 사실을 설명하지 마세요. 사용자의 개인 기억을 끌어내는 것이 목적입니다.
- 따뜻하고 자연스러운 한국어 톤. 취조하듯 단답형(예/아니오)으로 묻지 마세요.
- 시니어 친화: 어려운 단어를 피하고, 한 질문은 짧고 명확하게.
- 민감정보(건강, 정치성향, 종교, 재산)는 절대 묻지 마세요.

출력 형식: 반드시 다음과 같이 질문 세 개만 출력하세요. 머리말·설명·결말 없이.
1. <첫 번째 질문>
2. <두 번째 질문>
3. <세 번째 질문>`;

function buildUserPrompt(ctx: MemoryEventContext): string {
  const lines: string[] = [];
  lines.push(`연도: ${ctx.year}년`);
  if (ctx.ageAtYear !== null && ctx.ageAtYear >= 0) {
    lines.push(`사용자 당시 나이: ${ctx.ageAtYear}살`);
  }
  lines.push(`종류: ${ctx.category === "trigger" ? `${ctx.domain} 트리거` : `${ctx.domain} 사건`}`);
  lines.push(`제목: ${ctx.title}`);
  if (ctx.description) {
    lines.push(`설명: ${ctx.description}`);
  }
  lines.push("");
  lines.push(
    "이 사건/노래에 대해 사용자가 자신의 추억을 떠올릴 수 있도록, 위 규칙을 지켜 질문 세 개를 만들어 주세요.",
  );
  return lines.join("\n");
}

// Pull `1. ...` / `2. ...` style lines out of the model's reply and
// trim the leading numbering. Anything else (intros, blank lines) is
// dropped.
function parseQuestions(text: string): string[] {
  const matches = text.match(/^\s*\d+[.)\s]\s*.+$/gm) ?? [];
  return matches
    .map((line) => line.replace(/^\s*\d+[.)\s]\s*/, "").trim())
    .filter((q) => q.length > 0);
}

// Reasonable safety net so the page never renders empty. These are
// generic enough to suit either an anchor or a trigger.
const FALLBACK_QUESTIONS = [
  "그 시절을 떠올리면 가장 먼저 어떤 장면이 생각나세요?",
  "그때 함께 있던 사람이 있다면 누구였나요?",
  "지금 돌아보면 그 시간을 어떻게 부르고 싶으세요?",
];

const SUMMARIZE_SYSTEM_PROMPT = `당신은 사용자가 적은 추억 한 토막을 인생 연혁 카드의 짧은 제목으로 정리합니다.

규칙:
- 사용자가 직접 쓴 단어만 사용하세요. 사용자가 말하지 않은 사람·장소·감정·디테일을 새로 만들어내지 마세요.
- 한 문장, 25자 이내. 따옴표·이모지·말줄임표 없이.
- 사용자의 추억임이 드러나는 톤. 사건의 일반 설명이 아닌 개인 기억으로.

출력: 제목 한 줄만. 다른 말은 일절 출력하지 마세요.`;

function buildSummarizePrompt(
  ctx: MemoryEventContext,
  answer: string,
): string {
  return [
    `사건/노래: ${ctx.title}${ctx.description ? ` (${ctx.description})` : ""}`,
    `연도: ${ctx.year}년`,
    "",
    "사용자가 적은 추억:",
    answer,
  ].join("\n");
}

export async function summarizeAnswer(
  ctx: MemoryEventContext,
  answer: string,
): Promise<string> {
  const trimmed = answer.trim();
  if (trimmed === "") return "추억";
  try {
    const res = await chat(
      [{ role: "user", content: buildSummarizePrompt(ctx, trimmed) }],
      { system: SUMMARIZE_SYSTEM_PROMPT, maxTokens: 64, temperature: 0.4 },
    );
    const title = res.text.replace(/^["'"\s]+|["'"\s]+$/g, "").trim();
    if (!title) return ctx.title;
    return title.length > 40 ? title.slice(0, 40) : title;
  } catch (err) {
    console.error("[memory-chat] summarize failed:", err);
    return ctx.title;
  }
}

export async function generateGuidedQuestions(
  ctx: MemoryEventContext,
): Promise<string[]> {
  try {
    const res = await chat(
      [{ role: "user", content: buildUserPrompt(ctx) }],
      { system: SYSTEM_PROMPT, maxTokens: 512, temperature: 0.8 },
    );
    const qs = parseQuestions(res.text);
    if (qs.length === 0) return FALLBACK_QUESTIONS;
    return qs.slice(0, 4);
  } catch (err) {
    console.error("[memory-chat] generation failed:", err);
    return FALLBACK_QUESTIONS;
  }
}
