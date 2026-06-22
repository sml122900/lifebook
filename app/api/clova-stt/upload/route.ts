// Phase 10 — 녹음 업로드.
//
// POST /api/clova-stt/upload  (multipart/form-data)
//   file: audio blob
//   mimeType: string (optional, 기본 audio/webm)
//
// 기존 /api/recordings 는 DB UserMemory.id 소유권 검사 → 저장 전 memoryId 없음.
// 여기서는 rec_{timestamp} 경로로 recordings 버킷에 직접 올리고
// storagePath 만 반환. 저장 시 UserMemory.audioPath / CompanionSession.audioPaths 에 씀.
// (경로 prefix 가 userId 라 버킷 격리 유지)
//
// ⚠️ 영구 보존 파일: 특히 동반자 세션 오디오(어르신 목소리)는 대체 불가.
//    "rec_" 로 시작하는 recordings 버킷 파일은 절대 일괄 삭제하지 마세요.
//    정리 스크립트 작성 시 CompanionSession.audioPaths DB 먼저 확인.

import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { isAllowedAudioMime, MAX_RECORDING_BYTES, RECORDINGS_BUCKET } from "@/lib/storage";
import { createClient } from "@supabase/supabase-js";

function getClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "로그인이 필요해요." }, { status: 401 });
  }
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    return NextResponse.json({ ok: false, error: "음성 녹음 동의가 필요해요." }, { status: 403 });
  }

  const userId = session.user.id;
  let file: File | null = null;
  let mimeType = "audio/webm";

  try {
    const fd = await req.formData();
    const f = fd.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json({ ok: false, error: "파일이 없어요." }, { status: 400 });
    }
    file = f;
    const m = fd.get("mimeType");
    if (typeof m === "string" && m.trim()) mimeType = m.trim();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청이에요." }, { status: 400 });
  }

  if (file.size <= 0 || file.size > MAX_RECORDING_BYTES) {
    return NextResponse.json({ ok: false, error: "파일 크기가 맞지 않아요." }, { status: 400 });
  }
  if (!isAllowedAudioMime(mimeType)) {
    return NextResponse.json({ ok: false, error: "지원하지 않는 형식이에요." }, { status: 400 });
  }

  const ext = mimeType.split(";")[0].trim() === "audio/ogg" ? "ogg" : "webm";
  const recId = `rec_${Date.now()}`;
  const storagePath = `${userId}/${recId}.${ext}`;
  const baseMime = mimeType.split(";")[0].trim();

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const client = getClient();
    const { error } = await client.storage
      .from(RECORDINGS_BUCKET)
      .upload(storagePath, buf, { contentType: baseMime, upsert: true });
    if (error) throw error;
    return NextResponse.json({ ok: true, audioPath: storagePath });
  } catch (e) {
    console.error("[clova-stt/upload]", e);
    return NextResponse.json({ ok: false, error: "업로드에 실패했어요." }, { status: 500 });
  }
}
