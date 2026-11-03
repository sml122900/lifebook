import { notFound } from "next/navigation";

import { getEpisodeBody } from "@/lib/node-body";
import { displayTitle } from "@/lib/story-title";

import { requireV3UserId } from "../../../_body/guard";
import { HistoryPage } from "../../../_body/HistoryPage";

// 이야기 이전 판(Q23 재결정·D1 20판 — 2026-11-03).
export default async function StoryHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getEpisodeBody(userId, id);
  if (!body) notFound();
  return (
    <HistoryPage
      userId={userId}
      nodeType="EPISODE"
      nodeId={id}
      version={body.version}
      photos={body.photos}
      backHref={`/my-life/story/${id}`}
      backLabel={displayTitle(body)}
      doneHref={`/my-life/story/${id}`}
    />
  );
}
