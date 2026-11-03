// 노드 본문 보기 — 문단·소제목·사진(2b-3c, 2026-11-03 · lib/node-body). 이야기 상세·이전 판 화면 공용(훅 없음).

import type { BodyDoc } from "@/lib/node-body-doc";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";

const C = MY_LIFE_COPY.body;

// 사진 id → 보여 줄 주소(서명 주소 — 못 만들었으면 null)·지금 캡션. 없는 id = 지워진 사진.
export type PhotoMap = Record<string, { url: string | null; caption: string | null }>;

export function BodyView({ doc, photos }: { doc: BodyDoc; photos: PhotoMap }) {
  return (
    <div className="flex flex-col gap-4">
      {doc.blocks.map((b, i) =>
        b.type === "paragraph" ? (
          <p key={i} className="m-0 whitespace-pre-line text-lg leading-relaxed text-ink">
            {b.text}
          </p>
        ) : b.type === "heading" ? (
          <h2 key={i} className="m-0 mt-2 text-2xl">
            {b.text}
          </h2>
        ) : (
          <BodyPhoto key={i} photo={photos[b.photoId]} />
        ),
      )}
    </div>
  );
}

export function BodyPhoto({ photo }: { photo: PhotoMap[string] | undefined }) {
  if (!photo?.url) {
    return <p className="m-0 rounded-md border-2 border-dashed border-line px-4 py-6 text-center text-lg text-ink-soft">{C.photoGone}</p>;
  }
  return (
    <figure className="m-0 flex flex-col gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt={photo.caption ?? ""} className="w-full rounded-md border border-line" />
      {photo.caption && <figcaption className="text-lg text-ink-soft">{photo.caption}</figcaption>}
    </figure>
  );
}
