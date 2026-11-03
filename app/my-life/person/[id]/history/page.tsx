import { notFound } from "next/navigation";

import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getPersonBody } from "@/lib/node-body";

import { requireV3UserId } from "../../../_body/guard";
import { HistoryPage } from "../../../_body/HistoryPage";

// 인물 글 이전 판(D1 20판 — 2026-11-03).
export default async function PersonHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getPersonBody(userId, id);
  if (!body) notFound();
  return (
    <HistoryPage
      userId={userId}
      nodeType="PERSON"
      nodeId={id}
      version={body.version}
      photos={body.photos}
      backHref={`/my-life/person/${id}/edit`}
      backLabel={MY_LIFE_COPY.body.personTitle(body.name)}
      doneHref={`/my-life/person/${id}/edit`}
    />
  );
}
