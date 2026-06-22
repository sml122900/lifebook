// POST /api/companion
//   body: { message: string, history: { role: "user"|"assistant", content: string }[] }
//   → { reply: string }
//
// 프로파일(birthYear·region·인물·장소)은 서버에서 DB 조회 — 클라가 보내지 않음.
// history 는 클라가 들고 매 턴 전송 (서버 stateless). v1 = 전체 유지, 트리밍 없음.

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { chat, ChatMessage } from "@/lib/ai";
import { COMPANION_MODEL, fetchCompanionProfile, buildSystemPrompt } from "@/lib/companion";

const MAX_MESSAGE_LEN = 3000; // STT 결과 최대 길이 방어
const MAX_HISTORY_ITEMS = 100; // 50턴 (user+assistant 각 1) — 남용 방지

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    return NextResponse.json({ error: "동의가 필요해요." }, { status: 403 });
  }

  let message: string;
  let history: ChatMessage[];
  try {
    const body = (await req.json()) as { message?: unknown; history?: unknown };

    if (typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "message 가 필요해요." }, { status: 400 });
    }
    message = body.message.trim().slice(0, MAX_MESSAGE_LEN);

    if (!Array.isArray(body.history)) {
      return NextResponse.json({ error: "history 는 배열이어야 해요." }, { status: 400 });
    }
    history = body.history
      .slice(0, MAX_HISTORY_ITEMS)
      .filter(
        (h): h is ChatMessage =>
          h !== null &&
          typeof h === "object" &&
          (h.role === "user" || h.role === "assistant") &&
          typeof h.content === "string",
      );
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  try {
    const profile = await fetchCompanionProfile(session.user.id);
    const systemPrompt = buildSystemPrompt(profile);

    const messages: ChatMessage[] = [...history, { role: "user", content: message }];

    const result = await chat(messages, {
      system: systemPrompt,
      model: COMPANION_MODEL,
      maxTokens: 250,
      temperature: 0.8,
    });

    return NextResponse.json({ reply: result.text });
  } catch (e) {
    console.error("[companion]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "동반자와 연결에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
