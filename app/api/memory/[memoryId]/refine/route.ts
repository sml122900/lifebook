import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { withUsageLedger, BudgetBlockedError } from "@/lib/ai";
import { budgetMessage } from "@/lib/budget-copy";
import { refineMemorySpelling } from "@/lib/memory-refine";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import { getUserAiModel } from "@/lib/user-ai-model";
import { lowBalanceTail } from "@/lib/tokens/policy";

// 문장 다듬기 Lv2 — 맞춤법·군말·자모깨짐·비문 교정. 모델 = 전역 User.aiModel
// (haiku/sonnet/opus)로 단가가 갈리며, 실제 교정본이 저장될 때만 과금.
// 권한: 본인 메모리만 (refineMemorySpelling 이 userId 강제 → 일치 없으면 404).

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ memoryId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  const { memoryId } = await ctx.params;
  if (!memoryId || memoryId.length < 4) {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }

  // 모델 = 전역 선택(클라 tier 무시).
  const tier = await getUserAiModel(session.user.id);

  try {
    const result = await withUsageLedger(session.user.id, "REFINE", () => refineMemorySpelling(session.user.id, memoryId, tier));
    if (result.status === "not_found") {
      return NextResponse.json(
        { ok: false, error: "글을 찾을 수 없어요." },
        { status: 404 },
      );
    }
    if (result.status === "empty") {
      return NextResponse.json(
        { ok: false, error: "다듬을 글이 아직 없어요." },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      status: result.status,
      refinedText: result.refinedText ?? null,
      tokensSpent: result.tokensSpent ?? 0,
      balanceAfter: result.balanceAfter ?? null,
    });
  } catch (e) {
    // 한도 일원화(2026-11-08) — 한도에 걸리면 모델을 부르지 않고 거절 문구(429)
    if (e instanceof BudgetBlockedError) return NextResponse.json({ error: budgetMessage(e.reason) }, { status: 429 });
    if (e instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { ok: false, error: "토큰이 부족해요." + lowBalanceTail(" 충전 후 다시 시도해주세요.") }, // 충전 비공개 동안 "토큰이 부족해요."만 [임시 — 성민 확정 필요] 2026-11-09
        { status: 402 },
      );
    }
    console.error("[memory-refine]", e);
    return NextResponse.json(
      { ok: false, error: "다듬기에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
