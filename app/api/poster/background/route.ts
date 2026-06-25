// P5-5c — 맞춤배경 same-origin 스트림. PosterCompose 가 canvas(luminance·P7-a
// export)에서 읽으므로 cross-origin signed URL 대신 same-origin 으로 서빙해
// canvas taint 를 피한다. 본인 Poster.customBgPath 만 스트림(권한).

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { downloadPosterBackground } from "@/lib/storage";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  const poster = await prisma.poster.findUnique({
    where: { userId: session.user.id },
    select: { customBgPath: true },
  });
  if (!poster?.customBgPath) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const buf = await downloadPosterBackground(poster.customBgPath);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        // 본인만 접근(서명 없음)·자주 안 바뀜 → 짧은 private 캐시.
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (e) {
    console.error("[poster-bg]", e instanceof Error ? e.message : e);
    return new NextResponse("Error", { status: 500 });
  }
}
