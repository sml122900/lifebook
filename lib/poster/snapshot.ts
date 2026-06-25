// 포스터 주문 스냅샷 — /poster/view 와 주문 생성이 공유하는 단일 빌더.
//
// Poster.selections(+override) + life_event → P3 refine → PosterCompose props
// ({ownerName, nodes, memos}). 주문 시점에 ProductOrder.posterSnapshot 으로
// 박아 두면, 사용자가 이후 포스터를 편집해도 발주 파일은 주문 시점으로 고정된다.
// 관리자 페이지는 이 스냅샷으로 P7-a export(브라우저)한다.

import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import type { ItemOverride } from "@/lib/poster/overrides";
import { parseSelectionsFull } from "@/lib/poster/overrides";
import { refineForPosterBatch } from "@/lib/poster/poster-sentences";

export type SnapshotNode = {
  eventId: string;
  order: number;
  year: number | null;
  label: string;
  override?: ItemOverride;
};
export type SnapshotMemo = {
  eventId: string;
  order: number;
  text: string;
  override?: ItemOverride;
};
export type PosterSnapshot = {
  ownerName: string;
  nodes: SnapshotNode[];
  memos: SnapshotMemo[];
};

// 선택이 없으면 null(주문 불가·빈 화면). ownerName 은 호출자가 세션에서 전달.
export async function buildPosterSnapshot(
  userId: string,
  ownerName: string,
): Promise<PosterSnapshot | null> {
  const [poster, events] = await Promise.all([
    prisma.poster.findUnique({ where: { userId }, select: { selections: true } }),
    getLifeEvents(userId),
  ]);

  const byId = new Map(
    events.filter((e) => e.kind === "life_event").map((e) => [e.id, e]),
  );
  const ordered = parseSelectionsFull(poster?.selections)
    .filter((s) => byId.has(s.eventId))
    .sort((a, b) => a.order - b.order);

  if (ordered.length === 0) return null;

  const inputs = ordered.map((s) => {
    const e = byId.get(s.eventId)!;
    return { title: e.title, content: e.content, year: e.eventYear };
  });
  const sentences = await refineForPosterBatch(inputs);

  const nodes: SnapshotNode[] = [];
  const memos: SnapshotMemo[] = [];
  ordered.forEach((s, i) => {
    const sent = sentences[i];
    if (!sent) return;
    if (s.type === "node") {
      nodes.push({
        eventId: s.eventId,
        order: s.order,
        year: byId.get(s.eventId)!.eventYear,
        label: sent.nodeLabel,
        override: s.override,
      });
    } else {
      memos.push({
        eventId: s.eventId,
        order: s.order,
        text: sent.memoText,
        override: s.override,
      });
    }
  });

  return { ownerName, nodes, memos };
}
