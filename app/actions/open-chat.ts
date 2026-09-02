"use server";

// v3 통합 채팅(P2) — 골격+확인질문이 다 끝난 뒤 "open" 단계의 자유 대화 한 턴.
// 멀티턴 상태·요약·저장 없음(그런 구조가 필요해지면 STAGE4 엔진처럼 별도
// 발전시킬 대상 — 지금은 짧게 듣고 반응만).

import { auth } from "@/auth";
import { chat } from "@/lib/ai";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

const OPEN_CHAT_SYSTEM_PROMPT = `당신은 어르신의 인생 이야기를 듣는 따뜻한 말동무입니다.
사용자가 자유롭게 꺼내는 이야기에 짧고 존중하는 태도로 반응하세요. 필요하면
자연스럽게 한 가지 정도만 되물어도 됩니다. 재촉하지 마세요. 한국어만
쓰고 한자는 쓰지 마세요. 1~2문장으로 짧게 답하세요. 말투는 구어체로만
답하세요("-습니다/-였습니다" 같은 문어체 높임 어미 대신 "~네요", "~군요" 처럼
자연스러운 대화체를 쓰세요).`;

export async function respondToOpenChat(userId: string, text: string): Promise<string> {
  await requireUserId(userId);
  try {
    const res = await chat(
      [{ role: "user", content: text }],
      { system: OPEN_CHAT_SYSTEM_PROMPT, maxTokens: 250 },
    );
    return res.text.trim() || "네, 잘 들었어요.";
  } catch (e) {
    console.error("[open-chat]", e);
    return "네, 잘 들었어요. 편하게 더 말씀해주세요.";
  }
}
