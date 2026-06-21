// Phase 10 — CLOVA STT 제출 API.
//
// POST /api/clova-stt
//   { audioPath: string }   Supabase recordings 버킷 경로
//
// 흐름: signed URL 발급 → 오디오 다운로드 → CLOVA 제출 → token 즉시 반환.
// ★ 완료까지 await 금지 — Vercel Hobby 함수 타임아웃 초과 방지.
//
// 인증: session 필수. consentVersion < 2 이면 STT 거부.
// (음성 저장 동의가 v2 기준 — PIPA 국내 위탁처리(CLOVA/NCP)는 처리방침 내 처리)

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { getRecordingSignedUrl } from "@/lib/storage";
import { submitRecognition } from "@/lib/clova-speech";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  }
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    return NextResponse.json(
      { ok: false, error: "음성 녹음 동의가 필요해요." },
      { status: 403 },
    );
  }

  let audioPath: string;
  try {
    const body = (await req.json()) as { audioPath?: unknown };
    if (typeof body.audioPath !== "string" || !body.audioPath.trim()) {
      return NextResponse.json({ ok: false, error: "audioPath 가 필요해요." }, { status: 400 });
    }
    audioPath = body.audioPath.trim();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청이에요." }, { status: 400 });
  }

  // 경로에 userId 접두사가 있는지 확인해 소유권 보호
  const userId = session.user.id;
  if (!audioPath.startsWith(`${userId}/`)) {
    return NextResponse.json({ ok: false, error: "권한이 없어요." }, { status: 403 });
  }

  try {
    // Supabase → 오디오 다운로드
    const signedUrl = await getRecordingSignedUrl(audioPath);
    const audioRes = await fetch(signedUrl);
    if (!audioRes.ok) {
      throw new Error(`오디오 다운로드 실패 (${audioRes.status})`);
    }
    const arrayBuffer = await audioRes.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    // Content-Type 은 signed URL 응답 헤더에서 읽거나 경로 확장자로 유추
    const contentType = audioRes.headers.get("content-type") ?? mimeFromPath(audioPath);

    // CLOVA 제출 → token 즉시 반환
    const { token } = await submitRecognition(audioBuffer, contentType);
    return NextResponse.json({ ok: true, token });
  } catch (e) {
    console.error("[clova-stt] submit failed", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { ok: false, error: "음성 처리를 시작하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 502 },
    );
  }
}

function mimeFromPath(path: string): string {
  if (path.endsWith(".ogg")) return "audio/ogg";
  if (path.endsWith(".mp3")) return "audio/mpeg";
  if (path.endsWith(".mp4")) return "audio/mp4";
  return "audio/webm";
}
