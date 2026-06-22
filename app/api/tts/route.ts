// POST /api/tts
//   body: { text: string }
//   → MP3 binary (Content-Type: audio/mpeg)
//
// 인증: 로그인 + consentVersion >= CURRENT.
// 클라는 응답 Blob 으로 blob URL 만들어 <audio> 에 주입.
// 음성 길이 상한(600자)은 lib/clova-tts 에서 자동 절사.

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { synthesizeSpeech } from "@/lib/clova-tts";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "로그인이 필요해요." }, { status: 401 });
  }
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    return NextResponse.json({ error: "동의가 필요해요." }, { status: 403 });
  }

  let text: string;
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "text 가 필요해요." }, { status: 400 });
    }
    text = body.text.trim();
  } catch {
    return NextResponse.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }

  try {
    const mp3 = await synthesizeSpeech(text);
    return new Response(new Uint8Array(mp3), {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(mp3.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[tts]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: "음성 변환에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}
