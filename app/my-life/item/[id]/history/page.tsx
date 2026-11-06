import { notFound } from "next/navigation";

import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { getItemBody } from "@/lib/node-body";

import { requireV3UserId } from "../../../_body/guard";
import { HistoryPage } from "../../../_body/HistoryPage";

// 사용자 항목 글 이전 판(custom-graph 2단계 — 인물 글과 같은 20판).
export default async function ItemHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireV3UserId();
  const body = await getItemBody(userId, id);
  if (!body) notFound();
  return (
    <HistoryPage
      userId={userId}
      nodeType="CUSTOM"
      nodeId={id}
      version={body.version}
      photos={body.photos}
      backHref={`/my-life/item/${id}/edit`}
      backLabel={MY_LIFE_COPY.custom.itemTitle(body.name)}
      doneHref={`/my-life/item/${id}/edit`}
    />
  );
}
