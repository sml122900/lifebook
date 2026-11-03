// 본문 사진 서명 주소(1시간) — 상세·편집·이전 판 화면 공용. 한 장 실패해도 나머지는 보이게.

import type { BodyPhoto } from "@/lib/node-body";
import { getSignedUrl } from "@/lib/storage";

import type { PhotoMap } from "./BodyView";

export async function photoMapOf(photos: BodyPhoto[]): Promise<PhotoMap> {
  const entries = await Promise.all(
    photos.map(async (p) => {
      let url: string | null = null;
      try {
        url = await getSignedUrl(p.storagePath);
      } catch (e) {
        console.error("[node-body] signed url", e instanceof Error ? e.message : e);
      }
      return [p.id, { url, caption: p.caption }] as const;
    }),
  );
  return Object.fromEntries(entries);
}
