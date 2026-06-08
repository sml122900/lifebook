import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { deletePhotoOwned } from "@/lib/photos";

// Phase Photo (2단계) — 사진 1장 삭제.
// 권한: 본인 photo 만 (deletePhotoOwned 가 userId 강제).
// 흐름: Storage remove → DB transaction(Photo delete + photo-only 메모리도 정리).

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ photoId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  const { photoId } = await ctx.params;
  if (!photoId || photoId.length < 4) {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }
  try {
    const r = await deletePhotoOwned(session.user.id, photoId);
    if (!r.deleted) {
      return NextResponse.json(
        { ok: false, error: "사진을 찾을 수 없어요." },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[photo-delete]", e);
    return NextResponse.json(
      { ok: false, error: "삭제에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
