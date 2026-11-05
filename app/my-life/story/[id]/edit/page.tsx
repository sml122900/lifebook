import Link from "next/link";
import { notFound } from "next/navigation";

import { Paper } from "@/components/ui/Paper";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getEpisodeBody } from "@/lib/node-body";
import { displayTitle } from "@/lib/story-title";

import { BodyEditor } from "../../../_body/BodyEditor";
import { requireV3UserId } from "../../../_body/guard";
import { photoMapOf } from "../../../_body/photo-urls";

// 이야기 글 고치기(블로그식 — 2b-3c, 2026-11-03). 저장 = lib/node-body saveEpisodeBody(평문 동기화·이전 판).
const C = MY_LIFE_COPY.body;

export default async function StoryEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getEpisodeBody(userId, id);
  if (!body) notFound();
  const map = await photoMapOf(body.photos);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-8">
      <Link href={`/my-life/story/${id}`} className="self-start text-lg text-action underline underline-offset-4">
        ← {displayTitle(body)}
      </Link>
      <h1 className="m-0 text-[28px]">{C.editTitle}</h1>
      <Paper>
      <BodyEditor
        kind="story"
        nodeId={id}
        memoryId={body.memoryId}
        initialDoc={body.doc}
        version={body.version}
        photos={body.photos.map((p) => ({ id: p.id, url: map[p.id]?.url ?? null, caption: p.caption }))}
        doneHref={`/my-life/story/${id}`}
      />
      </Paper>
    </main>
  );
}
