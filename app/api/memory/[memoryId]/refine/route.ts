import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { refineMemorySpelling } from "@/lib/memory-refine";

// 문장 다듬기 MVP — 맞춤법·띄어쓰기·명백한 오타만 교정 (무료).
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
  try {
    const result = await refineMemorySpelling(session.user.id, memoryId);
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
    });
  } catch (e) {
    console.error("[memory-refine]", e);
    return NextResponse.json(
      { ok: false, error: "다듬기에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
