// Phase 10 — STT 전사 텍스트 Claude 다듬기.
//
// POST /api/clova-stt/refine  { text: string }
// 반환: { ok: true, refined: string }
//
// voice-cleanup.ts 의 cleanupVoiceText 재사용. 토큰 차감 없음 — Phase 1 은 무료.
// (향후 chargeOneShot 붙이는 경우 이 라우트에서 처리)

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { cleanupVoiceText } from "@/lib/voice-cleanup";

const MAX_LEN = 8000; // chars

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  }

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== "string") {
      return NextResponse.json({ ok: false, error: "text 가 필요해요." }, { status: 400 });
    }
    text = body.text.trim().slice(0, MAX_LEN);
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청이에요." }, { status: 400 });
  }

  if (!text) return NextResponse.json({ ok: true, refined: "" });

  try {
    const result = await cleanupVoiceText(text);
    return NextResponse.json({ ok: true, refined: result.cleaned });
  } catch (e) {
    console.error("[clova-stt/refine]", e);
    // 실패해도 클라에서 원본 그대로 보여주면 됨 — 에러 전파 안 함
    return NextResponse.json({ ok: true, refined: text });
  }
}
