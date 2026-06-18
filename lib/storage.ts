// Phase Photo 1단계 — Supabase Storage 클라이언트 + 사진 헬퍼.
//
// 🚨 보안: service_role 키는 모든 RLS 우회 마스터 키. 절대 클라/로그/grep
// 으로 노출 X. NEXT_PUBLIC_ 접두사 X (이 파일은 환경변수를 SUPABASE_URL /
// SUPABASE_SERVICE_ROLE_KEY 로 직접 읽어 자연스럽게 서버 only — Next 가
// NEXT_PUBLIC_ 접두사 외 환경변수는 클라 번들에 안 박는다).
//
// 1단계 정책:
//   - 버킷: photos (private, 대시보드에서 생성됨)
//   - 허용 mimeType: image/jpeg, image/png, image/webp
//   - 최대 용량: 10MB
//   - HEIC 거부 (사용자 안내는 호출자가 분기)
//   - magic number 검증으로 mimeType 위장 차단
//   - 경로: {userId}/{photoId}.{ext} — userId 격리

import { randomUUID } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const PHOTOS_BUCKET = "photos";
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

// ── 녹음 버킷 ────────────────────────────────────────────────────────
export const RECORDINGS_BUCKET = "recordings";
export const MAX_RECORDING_BYTES = 25 * 1024 * 1024; // 25MB (~10분 webm 여유)
export const ALLOWED_AUDIO_BASE_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/mpeg",
] as const;

// codecs 접미사(예: audio/webm;codecs=opus) 허용 — MediaRecorder 브라우저 기본값.
export function isAllowedAudioMime(mime: string): boolean {
  const base = mime.split(";")[0].trim().toLowerCase();
  return (ALLOWED_AUDIO_BASE_TYPES as readonly string[]).includes(base);
}

function audioExt(mime: string): string {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (base === "audio/mp4") return "mp4";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/mpeg") return "mp3";
  return "webm"; // Chrome/Edge 기본
}

export type RecordingUploadResult = {
  storagePath: string;
  mimeType: string;
  bytes: number;
};

// 항목당 1개 — memoryId 를 파일명으로 사용. upsert=true 라 재녹음 시 덮어씀.
export async function uploadRecording(
  userId: string,
  memoryId: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<RecordingUploadResult> {
  const baseMime = mimeType.split(";")[0].trim().toLowerCase();
  const storagePath = `${userId}/${memoryId}.${audioExt(mimeType)}`;
  const client = getServiceClient();
  const { error } = await client.storage
    .from(RECORDINGS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: baseMime,
      upsert: true, // 재녹음 덮어쓰기
    });
  if (error) throw new Error(`Recording upload 실패: ${error.message}`);
  return { storagePath, mimeType: baseMime, bytes: fileBuffer.length };
}

export async function getRecordingSignedUrl(storagePath: string): Promise<string> {
  const client = getServiceClient();
  const { data, error } = await client.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`Recording signed URL 발급 실패: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

// signed URL 만료 (초). 1시간.
export const SIGNED_URL_TTL_SECONDS = 3600;

// service_role 클라이언트 — 모듈 스코프 lazy 싱글턴. 매 요청 마다 새로
// 만들면 connection 누적 위험.
let _client: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 없어요.",
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

// ── magic number 검증 ─────────────────────────────────────────
// mimeType 만 믿으면 스크립트 위장 파일 통과 가능 (위험 #8).
// 파일 첫 N 바이트 헤더로 실제 타입을 확정한다.

export function detectImageType(buf: Uint8Array): AllowedMimeType | null {
  // JPEG: FF D8 FF
  if (
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff
  ) {
    return "image/jpeg";
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  // WebP: "RIFF" .... "WEBP" (offset 0-3, 8-11)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// HEIC/HEIF 명시 감지 — 사용자 안내 메시지 분기에 사용.
// ftyp 박스 (offset 4-7) + HEIF 계열 브랜드 (offset 8-11).
export function isHeicByMagic(buf: Uint8Array): boolean {
  if (buf.length < 12) return false;
  if (
    buf[4] !== 0x66 ||
    buf[5] !== 0x74 ||
    buf[6] !== 0x79 ||
    buf[7] !== 0x70
  ) {
    return false;
  }
  const brand = String.fromCharCode(buf[8], buf[9], buf[10], buf[11]);
  return ["heic", "heix", "mif1", "msf1", "hevc", "hevx"].includes(brand);
}

// ── 업로드 / signed URL / 목록 ──────────────────────────────

export type UploadResult = {
  storagePath: string;
  mimeType: AllowedMimeType;
  bytes: number;
};

// raw put. 권한·magic number 검증은 호출자(라우트)가 책임.
export async function uploadPhoto(
  userId: string,
  fileBuffer: Buffer,
  mimeType: AllowedMimeType,
): Promise<UploadResult> {
  const ext =
    mimeType === "image/jpeg"
      ? "jpg"
      : mimeType === "image/png"
        ? "png"
        : "webp";
  const photoId = randomUUID();
  const storagePath = `${userId}/${photoId}.${ext}`;
  const client = getServiceClient();
  const { error } = await client.storage
    .from(PHOTOS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false, // 같은 path 중복 거부 (cuid 라 충돌 0이지만 방어)
    });
  if (error) {
    // 서버 로그용 상세는 호출자가 console.error, 응답엔 친화 메시지만.
    throw new Error(`Storage upload 실패: ${error.message}`);
  }
  return { storagePath, mimeType, bytes: fileBuffer.length };
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const client = getServiceClient();
  const { data, error } = await client.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw new Error(`signed URL 발급 실패: ${error?.message ?? "unknown"}`);
  }
  return data.signedUrl;
}

// Storage 파일 삭제. orphan 파일 방지 — DB delete 흐름에서 호출.
// 존재하지 않는 path 도 에러 안 던짐(Supabase 동작) — idempotent.
export async function removePhoto(storagePath: string): Promise<void> {
  const client = getServiceClient();
  const { error } = await client.storage
    .from(PHOTOS_BUCKET)
    .remove([storagePath]);
  if (error) {
    throw new Error(`Storage remove 실패: ${error.message}`);
  }
}

// 1단계 검증용 — Storage 폴더 list. 정식(2단계+)은 lib/photos.ts 의
// listUserPhotos (DB 기반). 1단계 archive 후에도 같은 폴더 list 가
// 디버깅에 유용해 함수는 보존(이름만 분리: photos.ts 와 충돌 회피).
export async function listStoragePhotos(userId: string): Promise<
  {
    path: string;
    signedUrl: string;
    bytes: number;
  }[]
> {
  const client = getServiceClient();
  const { data, error } = await client.storage
    .from(PHOTOS_BUCKET)
    .list(userId, {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    });
  if (error) {
    throw new Error(`list 실패: ${error.message}`);
  }
  if (!data || data.length === 0) return [];
  const results = await Promise.all(
    data
      .filter((f) => f.name && !f.name.startsWith("."))
      .map(async (f) => {
        const path = `${userId}/${f.name}`;
        const url = await getSignedUrl(path);
        const bytes =
          typeof f.metadata?.size === "number" ? f.metadata.size : 0;
        return { path, signedUrl: url, bytes };
      }),
  );
  return results;
}
