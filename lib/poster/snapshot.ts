// 포스터 주문 스냅샷 — /poster/view 와 주문 생성이 공유하는 단일 빌더.
//
// Poster.selections(+override) + life_event·v3 브릿지 → P3 문장 → PosterCompose props
// ({ownerName, nodes, memos}). 주문 시점에 ProductOrder.posterSnapshot 으로
// 박아 두면, 사용자가 이후 포스터를 편집해도 발주 파일은 주문 시점으로 고정된다.
// 관리자 페이지는 이 스냅샷으로 P7-a export(브라우저)한다.
//
// P3 문장은 selections 항목에 원본 해시와 함께 저장해 둔다(lib/poster/ai-cache.ts).
// - /poster/view(buildPosterSnapshot): 해시가 맞는 항목은 저장 문장, 없거나 안 맞는
//   항목만 AI 로 만들어 저장.
// - 주문(buildOrderSnapshot): AI 를 부르지 않고 저장 문장만 → 주문 = 직전 시안.

import { prisma } from "@/lib/db";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";
import { sentenceSourceHash } from "@/lib/poster/ai-cache";
import type { ItemOverride, PosterSelectionFull } from "@/lib/poster/overrides";
import { parseSelectionsFull, toStoredSelection } from "@/lib/poster/overrides";
import { refineForPosterBatch, type PosterEventInput } from "@/lib/poster/poster-sentences";
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

// life_event + v3 브릿지 행(getLifeEvents 밖이라 syncV3Bridge 결과로 합침).
// nodeYear = 노드에 그릴 연도. 구간 이야기 행은 앵커 연도로 정렬만 하고 연도는
// 안 그린다(null → 연도 표시를 켜도 빈 칸, 시대 대사건 보간에서도 빠짐).
type Entry = { title: string; content: string | null; eventYear: number; nodeYear: number | null };

type Parts = {
  ordered: PosterSelectionFull[];
  byId: Map<string, Entry>;
  // 문장 AI 입력·원본 해시 — ordered 와 같은 순서.
  inputs: PosterEventInput[];
  hashes: string[];
  poster: { showNodeYears: boolean; eraTier: number; removedEraEvents: string[] } | null;
  userBirthYear: number | null;
};

// 선택이 없으면 null.
async function loadParts(userId: string): Promise<Parts | null> {
  const [poster, events, userBirthYear, bridge] = await Promise.all([
    prisma.poster.findUnique({
      where: { userId },
      select: {
        selections: true,
        template: true,
        showNodeYears: true,
        eraTier: true,
        removedEraEvents: true,
      },
    }),
    getLifeEvents(userId),
    getBirthYear(userId),
    syncV3Bridge(userId),
  ]);

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
  const template = poster?.template ?? null;
  const hashes = ordered.map((s, i) => sentenceSourceHash(inputs[i], s.type, template));
  return { ordered, byId, inputs, hashes, poster, userBirthYear };
}

// 저장 문장 — 지금 원본 해시와 같을 때만.
function savedText(s: PosterSelectionFull, hash: string): string | undefined {
  return s.sourceHash === hash ? s.generatedText : undefined;
}

// texts[i] = ordered[i] 의 문장(노드=라벨·메모=문장).
function assemble(ownerName: string, parts: Parts, texts: string[]): PosterSnapshot {
  const { ordered, byId, poster, userBirthYear } = parts;
  const nodes: SnapshotNode[] = [];
  const memos: SnapshotMemo[] = [];
  ordered.forEach((s, i) => {
    if (s.type === "node") {
      nodes.push({
        eventId: s.eventId,
        order: s.order,
        year: byId.get(s.eventId)!.nodeYear,
        label: texts[i],
        override: s.override,
      });
    } else {
      memos.push({
        eventId: s.eventId,
        order: s.order,
        text: texts[i],
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

// /poster/view — 선택이 없으면 null(빈 화면). ownerName 은 호출자가 세션에서 전달.
export async function buildPosterSnapshot(
  userId: string,
  ownerName: string,
): Promise<PosterSnapshot | null> {
  const parts = await loadParts(userId);
  if (!parts) return null;

  const texts = parts.ordered.map((s, i) => savedText(s, parts.hashes[i]));
  const missing = texts.flatMap((t, i) => (t === undefined ? [i] : []));
  if (missing.length > 0) {
    const { sentences, fromAi } = await refineForPosterBatch(missing.map((i) => parts.inputs[i]));
    const generatedAt = new Date().toISOString();
    const generated = missing.map((idx, k) => {
      const s = parts.ordered[idx];
      const text = s.type === "node" ? sentences[k].nodeLabel : sentences[k].memoText;
      texts[idx] = text;
      return { eventId: s.eventId, type: s.type, generatedText: text, sourceHash: parts.hashes[idx], generatedAt };
    });
    // 응답을 못 읽어 기본값으로 채운 문장은 화면에만 쓰고 저장 안 함(다음 로드에 다시 생성).
    if (fromAi) await saveGeneratedSentences(userId, generated);
  }

  return assemble(ownerName, parts, texts as string[]);
}

export type OrderSnapshotResult =
  | { ok: true; snapshot: PosterSnapshot }
  | { ok: false; reason: "empty" | "stale" };

// 주문 — AI 를 부르지 않고 /poster/view 에서 저장한 문장만 쓴다(주문 = 직전 시안).
// 저장 문장이 없거나 원본이 바뀐 항목이 있으면 stale(시안을 다시 보면 해결).
// 단 사용자가 직접 고친 문구(textOverride)가 있는 항목은 그 문구가 그려지므로 통과.
export async function buildOrderSnapshot(
  userId: string,
  ownerName: string,
): Promise<OrderSnapshotResult> {
  const parts = await loadParts(userId);
  if (!parts) return { ok: false, reason: "empty" };

  const texts: string[] = [];
  for (const [i, s] of parts.ordered.entries()) {
    const text = savedText(s, parts.hashes[i]) ?? s.override?.textOverride;
    if (text === undefined) return { ok: false, reason: "stale" };
    texts.push(text);
  }
  return { ok: true, snapshot: assemble(ownerName, parts, texts) };
}

// 새로 만든 문장 저장 — DB 의 selections 를 다시 읽어 같은 항목(eventId+type)에만 붙인다
// (그사이 바뀐 선택·편집을 덮어쓰지 않게).
async function saveGeneratedSentences(
  userId: string,
  generated: Required<Pick<PosterSelectionFull, "eventId" | "type" | "generatedText" | "sourceHash" | "generatedAt">>[],
): Promise<void> {
  const current = await prisma.poster.findUnique({ where: { userId }, select: { selections: true } });
  const byKey = new Map(generated.map((g) => [`${g.eventId}\u0000${g.type}`, g]));
  const next = parseSelectionsFull(current?.selections).map((s) => {
    const g = byKey.get(`${s.eventId}\u0000${s.type}`);
    return g ? { ...s, generatedText: g.generatedText, sourceHash: g.sourceHash, generatedAt: g.generatedAt } : s;
  });
  await prisma.poster.update({ where: { userId }, data: { selections: next.map(toStoredSelection) } });
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
