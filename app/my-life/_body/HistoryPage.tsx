// 이전 판 화면 본문 — 이야기·인물 공용(서버 부품). 판 목록은 lib/node-body listRevisions(최근 20판, 최신 순).

import Link from "next/link";

import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { listRevisions, type BodyNodeType, type BodyPhoto } from "@/lib/node-body";
import { displayTitle, shortTitle } from "@/lib/story-title";

import { formatWhen } from "./guard";
import { photoMapOf } from "./photo-urls";
import { RevisionList } from "./RevisionList";

const C = MY_LIFE_COPY.body;

export async function HistoryPage(o: {
  userId: string;
  nodeType: BodyNodeType;
  nodeId: string;
  version: number;
  photos: BodyPhoto[]; // 지금 이 글의 메모리 사진(판에 있던 사진이 지워졌으면 자리 표시)
  backHref: string;
  backLabel: string;
  doneHref: string;
}) {
  const [revs, photos] = await Promise.all([listRevisions(o.userId, o.nodeType, o.nodeId), photoMapOf(o.photos)]);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <Link href={o.backHref} className="self-start text-lg text-action underline underline-offset-4">
        ← {o.backLabel}
      </Link>
      <header className="flex flex-col gap-2">
        <h1 className="m-0 text-[28px]">{C.historyTitle}</h1>
        <p className="m-0 text-lg text-ink-soft">{C.historyIntro}</p>
      </header>
      <RevisionList
        items={revs.map((r) => ({
          id: r.id,
          when: formatWhen(r.createdAt),
          lead: r.plainText.trim() ? shortTitle(displayTitle({ title: "", content: r.plainText })) : C.historyPhoto,
          chars: r.plainText.length,
          doc: r.doc,
          unsaved: r.unsaved,
        }))}
        version={o.version}
        photos={photos}
        doneHref={o.doneHref}
      />
    </main>
  );
}
