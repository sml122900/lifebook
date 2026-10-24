// 포스터 주문 스냅샷 — /poster/view 와 주문 생성이 공유하는 단일 빌더.
//
// Poster.selections(+override) + life_event·v3 브릿지 → P3 refine → PosterCompose props
// ({ownerName, nodes, memos}). 주문 시점에 ProductOrder.posterSnapshot 으로
// 박아 두면, 사용자가 이후 포스터를 편집해도 발주 파일은 주문 시점으로 고정된다.
// 관리자 페이지는 이 스냅샷으로 P7-a export(브라우저)한다.

import { prisma } from "@/lib/db";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";
import type { ItemOverride } from "@/lib/poster/overrides";
import { parseSelectionsFull } from "@/lib/poster/overrides";
import { refineForPosterBatch } from "@/lib/poster/poster-sentences";
import { POSTER_EVENT_CREATED_VIA, syncV3Bridge } from "@/lib/poster/v3-bridge";

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
  // 노드에 연도를 박을지(기본 false=숨김). 주문 스냅샷에 박혀 발주 파일까지 고정.
  showNodeYears: boolean;
  // 기능2c — 시대 대사건 설정(클라가 getEraEventsForPoster 로 필터·배치).
  //   birthYear=생애범위 기준, eraTier=0/1/2/3, removedEraEvents=뺀 id.
  //   주문 스냅샷에 박혀 발주 파일까지 고정.
  birthYear: number | null;
  eraTier: number;
  removedEraEvents: string[];
};

// 선택이 없으면 null(주문 불가·빈 화면). ownerName 은 호출자가 세션에서 전달.
export async function buildPosterSnapshot(
  userId: string,
  ownerName: string,
): Promise<PosterSnapshot | null> {
  const [poster, events, userBirthYear, bridge] = await Promise.all([
    prisma.poster.findUnique({
      where: { userId },
      select: {
        selections: true,
        showNodeYears: true,
        eraTier: true,
        removedEraEvents: true,
      },
    }),
    getLifeEvents(userId),
    getBirthYear(userId),
    syncV3Bridge(userId),
  ]);

  // life_event + v3 브릿지 행(getLifeEvents 밖이라 syncV3Bridge 결과로 합침).
  // nodeYear = 노드에 그릴 연도. 구간 이야기 행은 앵커 연도로 정렬만 하고 연도는
  // 안 그린다(null → 연도 표시를 켜도 빈 칸, 시대 대사건 보간에서도 빠짐).
  type Entry = { title: string; content: string | null; eventYear: number; nodeYear: number | null };
  const byId = new Map<string, Entry>([
    ...events
      .filter((e) => e.kind === "life_event")
      .map((e) => [e.id, { title: e.title, content: e.content, eventYear: e.eventYear, nodeYear: e.eventYear }] as const),
    ...bridge.map(
      (b) => [b.id, { title: b.title, content: b.content, eventYear: b.year, nodeYear: b.isPeriod ? null : b.year }] as const,
    ),
  ]);
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
        year: byId.get(s.eventId)!.nodeYear,
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

  // 시대 대사건 설정 — birthYear(User BIRTH) ?? 가장 이른 노드 연도. 필터·배치는
  // 클라(PosterCompose)가 getEraEventsForPoster 로 수행(티어 토글 즉시 반영).
  const nodeYears = nodes.map((n) => n.year).filter((y): y is number => y != null);
  const birthYear = userBirthYear ?? (nodeYears.length ? Math.min(...nodeYears) : null);

  return {
    ownerName,
    nodes,
    memos,
    showNodeYears: poster?.showNodeYears ?? false,
    birthYear,
    eraTier: poster?.eraTier ?? 1,
    removedEraEvents: poster?.removedEraEvents ?? [],
  };
}

// /poster/order 게이트 — selections 중 지금 존재하는 사건이 하나라도 있는지(count 1회).
// 지워진 사건 id(유령)만 남은 포스터로 주문 화면에 들어가지 않게 한다(스냅샷과 같은 기준).
export async function hasLiveSelections(
  userId: string,
  rawSelections: unknown,
): Promise<boolean> {
  const ids = parseSelectionsFull(rawSelections).map((s) => s.eventId);
  if (ids.length === 0) return false;
  const live = await prisma.userMemory.count({
    where: {
      userId,
      id: { in: ids },
      isDraft: false,
      createdVia: { in: POSTER_EVENT_CREATED_VIA },
      eventYear: { not: null },
    },
  });
  return live > 0;
}
