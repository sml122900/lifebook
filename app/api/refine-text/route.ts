import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { refineRawText } from "@/lib/memory-refine";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import type { ModelTier } from "@/lib/tokens/policy";

// 순수 텍스트 다듬기 API — UserMemory 없이 텍스트를 직접 받아 교정한다.
// 온보딩/CategoryForm 같은 "저장 전 미리보기" 흐름용. DB 저장 없이 차감만.
// 권한: 인증 필수.

const VALID_TIERS: ReadonlySet<string> = new Set(["haiku", "sonnet", "opus"]);
const TEXT_MAX = 4000;

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  let text = "";
  let tier: ModelTier = "haiku";
  try {
    const body = (await req.json().catch(() => null)) as
      | { text?: unknown; tier?: unknown }
      | null;
    if (!body || typeof body.text !== "string") {
      return NextResponse.json(
        { ok: false, error: "잘못된 요청이에요." },
        { status: 400 },
      );
    }
    text = body.text;
    if (body.tier !== undefined) {
      if (typeof body.tier !== "string" || !VALID_TIERS.has(body.tier)) {
        return NextResponse.json(
          { ok: false, error: "잘못된 요청이에요." },
          { status: 400 },
        );
      }
      tier = body.tier as ModelTier;
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }

  if (text.trim().length === 0) {
    return NextResponse.json(
      { ok: false, error: "다듬을 글이 없어요." },
      { status: 400 },
    );
  }
  if (text.length > TEXT_MAX) {
    return NextResponse.json(
      { ok: false, error: "글이 너무 길어요." },
      { status: 400 },
    );
  }

  try {
    const result = await refineRawText(session.user.id, text, tier);
    if (result.status === "empty") {
      return NextResponse.json(
        { ok: false, error: "다듬을 글이 없어요." },
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
    console.error("[refine-text]", e);
    return NextResponse.json(
      { ok: false, error: "다듬기에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
