// Phase 10 — 통녹음 STT 토큰 차감 API.
//
// POST /api/clova-stt/charge
//   { audioPath: string, durationSec: number }
//
// 전사 COMPLETED 후 클라가 호출. 녹음 시간 기준 서비스 토큰 차감.
// 과금 플래그(STT_TOKEN_CHARGING_ENABLED) OFF 이면 차감 없이 성공 반환.
//
// 멱등성: 같은 audioPath 로 이미 charge 된 경우 재차감 없이 성공 반환.
// 멱등 키 = (userId, audioPath, reason="stt_recording") 조합.
//
// 소유권: audioPath 가 userId/ 로 시작해야 한다 (upload 엔드포인트와 동일 정책).

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { calcSttTokens, STT_TOKEN_CHARGING_ENABLED } from "@/lib/stt-cost";
import { chargeOneShot } from "@/lib/tokens/charge";
import { InsufficientBalanceError } from "@/lib/tokens/errors";

const REASON = "stt_recording";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  }
  const userId = session.user.id;

  let audioPath: string;
  let durationSec: number;
  try {
    const body = (await req.json()) as { audioPath?: unknown; durationSec?: unknown };
    if (typeof body.audioPath !== "string" || !body.audioPath.trim()) {
      return NextResponse.json({ ok: false, error: "audioPath 가 필요해요." }, { status: 400 });
    }
    if (typeof body.durationSec !== "number" || body.durationSec < 0) {
      return NextResponse.json({ ok: false, error: "durationSec 가 필요해요." }, { status: 400 });
    }
    audioPath = body.audioPath.trim();
    durationSec = body.durationSec;
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청이에요." }, { status: 400 });
  }

  // 소유권 확인 (upload 엔드포인트와 동일 정책)
  if (!audioPath.startsWith(`${userId}/`)) {
    return NextResponse.json({ ok: false, error: "권한이 없어요." }, { status: 403 });
  }

  // 과금 비활성화 — 프로토타입 모드
  if (!STT_TOKEN_CHARGING_ENABLED) {
    return NextResponse.json({ ok: true, tokensSpent: 0, reason: "charging_disabled" });
  }

  // 멱등성 — 이미 차감된 경우 재차감 없이 성공 반환
  const existing = await prisma.tokenTransaction.findFirst({
    where: { userId, refId: audioPath, reason: REASON },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json({ ok: true, tokensSpent: 0, reason: "already_charged" });
  }

  const tokens = calcSttTokens(durationSec);

  try {
    const result = await chargeOneShot(userId, 0, 0, REASON, audioPath, tokens);
    return NextResponse.json({
      ok: true,
      tokensSpent: result.tokensSpent,
      balanceAfter: result.balanceAfter,
    });
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { ok: false, error: "토큰이 부족해요. 충전 후 다시 시도해 주세요." },
        { status: 402 },
      );
    }
    console.error("[clova-stt/charge]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: "차감 처리 중 문제가 생겼어요." },
      { status: 500 },
    );
  }
}
