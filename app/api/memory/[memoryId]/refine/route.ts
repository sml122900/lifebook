import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { refineMemorySpelling } from "@/lib/memory-refine";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import { getUserAiModel } from "@/lib/user-ai-model";

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
    const result = await refineMemorySpelling(session.user.id, memoryId, tier);
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
    if (e instanceof InsufficientBalanceError) {
      return NextResponse.json(
        { ok: false, error: "토큰이 부족해요. 충전 후 다시 시도해주세요." },
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
