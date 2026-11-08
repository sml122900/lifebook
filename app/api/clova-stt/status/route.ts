// Phase 10 — CLOVA STT 폴링 API.
//
// GET /api/clova-stt/status?token=xxx
//
// 클라가 3~5초 간격으로 호출. COMPLETED 또는 FAILED 가 나올 때까지 반복.
// 인증: session 필수.

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { recordChatUsage } from "@/lib/chat-v3-usage";
import { getRecognitionResult } from "@/lib/clova-speech";
import { clovaSttMicroUsd } from "@/lib/stt-cost";

// token 값은 CLOVA 가 발급한 UUID — alphanumeric + hyphen
const TOKEN_RE = /^[A-Za-z0-9-]{10,64}$/;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  }

  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!TOKEN_RE.test(token)) {
    return NextResponse.json({ ok: false, error: "잘못된 token 이에요." }, { status: 400 });
  }

  try {
    const result = await getRecognitionResult(token);
    // 원가 원장(2026-11-08) — 완료를 받은 조회에서 한 번(두 화면 모두 COMPLETED 를 받으면 조회를 멈춘다). 길이 = 마지막 말 끝(ms).
    if (result.status === "COMPLETED") {
      const sec = Math.max(0, ...result.segments.map((s) => s.end)) / 1000;
      await recordChatUsage(session.user.id, "STT", { model: "clova-speech", inputTokens: 0, outputTokens: 0, extraMicroUsd: clovaSttMicroUsd(sec) });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[clova-stt/status]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: "결과를 가져오지 못했어요." },
      { status: 502 },
    );
  }
}
