import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  isAllowedAudioMime,
  MAX_RECORDING_BYTES,
  uploadRecording,
} from "@/lib/storage";

// Phase 7b — 녹음 업로드 API. FormData: file(audio blob) + memoryId OR monthEventId.
//
// 인증: auth() 가드(proxy.ts 의 API 보호와 별개로 defense-in-depth).
// 소유권: userId + (memoryId 직접 OR monthEventId→조회) 로 확인.
// 크기 상한: 25MB (MAX_RECORDING_BYTES). 빈 파일(size≤0) 거부.
// MIME: audio/webm·mp4·ogg·mpeg 허용, codecs 접미사 허용.
// 저장: recordings 버킷 + UserMemory.audioPath 갱신. upsert=true 재녹음 덮어씀.

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { ok: false, error: "로그인이 필요해요." },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  // FormData 파싱
  let file: File | null = null;
  let memoryId: string | null = null;
  let monthEventId: string | null = null;
  try {
    const formData = await req.formData();
    const f = formData.get("file");
    if (!(f instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "파일이 없어요." },
        { status: 400 },
      );
    }
    file = f;
    const mid = formData.get("memoryId");
    const eid = formData.get("monthEventId");
    if (typeof mid === "string" && mid.trim()) memoryId = mid.trim();
    if (typeof eid === "string" && eid.trim()) monthEventId = eid.trim();
  } catch {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }

  if (!memoryId && !monthEventId) {
    return NextResponse.json(
      { ok: false, error: "잘못된 요청이에요." },
      { status: 400 },
    );
  }

  // 빈 파일 가드 (마이크 없음·권한 거부·무음 캡처 방어)
  if (file.size <= 0) {
    return NextResponse.json(
      { ok: false, error: "빈 파일이에요." },
      { status: 400 },
    );
  }

  // 크기 상한 25MB
  if (file.size > MAX_RECORDING_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "녹음 파일이 너무 커요. 25MB 이내(약 10분)로 녹음해 주세요.",
      },
      { status: 400 },
    );
  }

  // MIME 체크 (codecs 접미사 포함 허용)
  const mimeType = file.type || "audio/webm";
  if (!isAllowedAudioMime(mimeType)) {
    return NextResponse.json(
      { ok: false, error: "지원하지 않는 오디오 형식이에요." },
      { status: 400 },
    );
  }

  // memoryId 확보 — monthEventId 경유 시 era_event 행 조회
  let resolvedId = memoryId;
  if (!resolvedId && monthEventId) {
    const row = await prisma.userMemory.findFirst({
      where: { userId, monthEventId, createdVia: "era_event" },
      select: { id: true },
    });
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "해당 기록을 찾을 수 없어요." },
        { status: 404 },
      );
    }
    resolvedId = row.id;
  }

  // 소유권 확인 (resolvedId + userId 일치 검증)
  const memory = await prisma.userMemory.findFirst({
    where: { id: resolvedId!, userId },
    select: { id: true },
  });
  if (!memory) {
    return NextResponse.json(
      { ok: false, error: "해당 기록을 찾을 수 없어요." },
      { status: 404 },
    );
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const { storagePath } = await uploadRecording(
      userId,
      resolvedId!,
      buffer,
      mimeType,
    );

    await prisma.userMemory.updateMany({
      where: { id: resolvedId!, userId },
      data: { audioPath: storagePath },
    });

    return NextResponse.json({ ok: true, audioPath: storagePath });
  } catch (e) {
    console.error("[recordings] upload failed", e);
    return NextResponse.json(
      { ok: false, error: "녹음 저장에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}
