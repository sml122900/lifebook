// POST /api/tutorial-chat
//   body: { question: string, prior?: { role: "user"|"assistant", text: string }[] }
//   → { text: string }
//
// G1 — Lifebook 사용 안내 전용 챗. 웹검색 X, DB X, 토큰 차감 X(무료).
// 전역 선택 모델을 따르되, 무료 도움말이라 opus 는 sonnet 으로 클램프
// (무료-opus 누수 방지). 어르신·가족의 "어떻게 쓰나요?" 류 질문에만 답함.

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { chat } from "@/lib/ai";
import { modelId } from "@/lib/ai-model";
import { getUserAiModel } from "@/lib/user-ai-model";

const TUTORIAL_SYSTEM = `너는 Lifebook 서비스 사용을 돕는 친절한 도우미야. 60~80대 어르신과 가족이 쓴다. 따뜻하되 간결하게, 쉬운 말로 안내한다.

[기능 안내]
- 이야기 나누기: AI 동반자와 대화하며 인생 이야기를 들려주면 자동으로 인생 연혁에 기록됨. 말로 해도 되고 글로 써도 됨.
- 그 시절 이야기: 태어난 해·고향 기준으로 그 시절 사건·노래를 함께 떠올림.
- 인생 연혁: 지금까지 기록된 이야기가 시간순으로 쌓이는 곳.
- 인물록: 이야기에 나온 가족·친구가 모이는 곳.
- 포스터: 인생 이야기를 한 장의 그림으로 만들어 인쇄.

[태도]
- 한 번에 하나씩, 짧게. 어려운 말 금지.
- 모르는 건 모른다 하고, 사람 도움이 필요하면 가족에게 물어보라 안내.
- 서비스와 무관한 질문엔 부드럽게 사용법 안내로 돌아옴.

[응답] 짧고 명확하게. 필요하면 단계로.`;

type Prior = { role: "user" | "assistant"; text: string };

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let question: string, prior: Prior[];
  try {
    const body = (await req.json()) as { question?: unknown; prior?: unknown };
    if (typeof body.question !== "string" || !body.question.trim()) {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }
    question = body.question.trim().slice(0, 500);
    prior = Array.isArray(body.prior)
      ? (body.prior as Prior[])
          .filter((p) => typeof p.role === "string" && typeof p.text === "string")
          .slice(-8)
          .map((p) => ({ role: p.role as "user" | "assistant", text: String(p.text).slice(0, 400) }))
      : [];
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const messages: { role: "user" | "assistant"; content: string }[] = [
      ...prior.map((p) => ({ role: p.role, content: p.text })),
      { role: "user" as const, content: question },
    ];
    // 전역 모델 따름. 무료라 opus → sonnet 클램프.
    const tier = await getUserAiModel(session.user.id);
    const model = modelId(tier === "opus" ? "sonnet" : tier);
    const result = await chat(messages, {
      system: TUTORIAL_SYSTEM,
      model,
      maxTokens: 400,
      temperature: 0.3,
    });
    return NextResponse.json({ text: result.text });
  } catch (e) {
    console.error("[tutorial-chat]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "답을 가져오지 못했어요." }, { status: 500 });
  }
}
