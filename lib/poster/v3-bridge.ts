// v3 → 포스터 브릿지. 설계: docs/phase/v3-poster-bridge.md
//
// 포스터 파이프라인(P1 후보·P4 합성·주문 스냅샷)은 UserMemory 행만 읽는데, v3
// 가입자의 인생 사건은 LifeEvent/Episode 에 있다. 확정된 v3 사건을 포스터가 읽는
// UserMemory 행(createdVia="v3_bridge")으로 비춰 둔다.
//
// - 고정 id `v3_${lifeEventId}` 로 upsert — 다시 돌려도 id 가 같아 Poster.selections
//   의 편집 override 가 그대로 이어진다(clear-and-rebuild 폐기).
// - 원천에서 사라지거나 대상에서 빠진 행만 삭제.
// - 온디맨드: loadPosterEditor·buildPosterSnapshot 에서만 호출.
// - getLifeEvents 화이트리스트 밖이라 연혁에는 안 보이고, 가족 룸 목록에서도 뺀다
//   (lib/rooms.ts).

import { prisma } from "../db";
import { isSubstantiveEpisodeContent } from "../episode-text";
import { CREATED_VIA_LIFE_EVENT } from "../life-events";
import { removeStorageObjects } from "../storage";
import type { PosterCandidate } from "./poster-candidates";
import type { PosterSelectionItem } from "./select-constants";

export const CREATED_VIA_V3_BRIDGE = "v3_bridge";

// 포스터 사건으로 인정하는 createdVia — 소유권 가드 4곳이 공유한다.
export const POSTER_EVENT_CREATED_VIA = [CREATED_VIA_LIFE_EVENT, CREATED_VIA_V3_BRIDGE];

export function bridgeMemoryId(lifeEventId: string): string {
  return `v3_${lifeEventId}`;
}

export type V3BridgeRow = {
  id: string;
  title: string;
  content: string | null; // 실질 Episode 가 없으면 null → node 고정
  year: number;
};

const CONFIRMED_STATUSES = ["CONFIRMED", "CORRECTED"] as const;

// 확정 v3 사건 → 브릿지 행 동기화 후 현재 행(연도순)을 돌려준다. 바뀐 행만 쓴다.
export async function syncV3Bridge(userId: string): Promise<V3BridgeRow[]> {
  const [events, existing] = await Promise.all([
    prisma.lifeEvent.findMany({
      where: { userId, status: { in: [...CONFIRMED_STATUSES] } },
      orderBy: { sequenceOrder: "asc" },
      select: {
        id: true,
        label: true,
        year: true,
        correctedLabel: true,
        correctedYear: true,
        episodes: { select: { content: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.userMemory.findMany({
      where: { userId, createdVia: CREATED_VIA_V3_BRIDGE },
      select: { id: true, title: true, content: true, eventYear: true },
    }),
  ]);

  const rows: V3BridgeRow[] = [];
  for (const e of events) {
    const year = e.correctedYear ?? e.year;
    if (year === null) continue; // placeholder 연도 금지
    const bodies = e.episodes
      .filter((ep) => isSubstantiveEpisodeContent(ep.content))
      .map((ep) => ep.content.trim());
    rows.push({
      id: bridgeMemoryId(e.id),
      title: e.correctedLabel ?? e.label,
      content: bodies.length > 0 ? bodies.join("\n\n") : null,
      year,
    });
  }
  rows.sort((a, b) => a.year - b.year); // 같은 해는 sequenceOrder 유지(안정 정렬)

  const existingById = new Map(existing.map((m) => [m.id, m]));
  const changed = rows.filter((r) => {
    const m = existingById.get(r.id);
    return !m || m.title !== r.title || m.content !== r.content || m.eventYear !== r.year;
  });
  const liveIds = new Set(rows.map((r) => r.id));
  const staleIds = existing.filter((m) => !liveIds.has(m.id)).map((m) => m.id);

  if (staleIds.length > 0) await deleteBridgeRows(userId, staleIds);
  if (changed.length > 0) {
    await prisma.$transaction(
      changed.map((r) => {
        const data = { year: r.year, title: r.title, eventTitle: r.title, eventYear: r.year, content: r.content };
        return prisma.userMemory.upsert({
          where: { id: r.id },
          create: { id: r.id, userId, createdVia: CREATED_VIA_V3_BRIDGE, ...data },
          update: data,
        });
      }),
    );
  }

  return rows;
}

// 브릿지 행 삭제 — DB 먼저(Photo 는 cascade), 연결 사진 파일은 그 뒤 정리. 파일
// 정리가 실패해도 포스터 화면을 막지 않고 로그만 남긴다.
async function deleteBridgeRows(userId: string, ids: string[]): Promise<void> {
  const photos = await prisma.photo.findMany({
    where: { memoryId: { in: ids }, userId },
    select: { storagePath: true },
  });
  await prisma.userMemory.deleteMany({
    where: { id: { in: ids }, userId, createdVia: CREATED_VIA_V3_BRIDGE },
  });
  if (photos.length === 0) return;
  try {
    await removeStorageObjects("photos", photos.map((p) => p.storagePath));
  } catch (e) {
    console.error("[poster/v3-bridge] 사진 파일 정리 실패:", e instanceof Error ? e.message : e);
  }
}

// 본문 없는 브릿지 행은 node 고정 — P1 후보와 저장돼 있던 선택 둘 다 memo → node.
export function applyBodilessNodeRule(
  candidates: PosterCandidate[],
  savedSelections: PosterSelectionItem[],
  rows: V3BridgeRow[],
): { candidates: PosterCandidate[]; savedSelections: PosterSelectionItem[] } {
  const bodiless = new Set(rows.filter((r) => r.content === null).map((r) => r.id));
  return {
    candidates: candidates.map((c): PosterCandidate =>
      bodiless.has(c.eventId) ? { ...c, suggestedType: "node" } : c,
    ),
    savedSelections: savedSelections.map((s): PosterSelectionItem =>
      bodiless.has(s.eventId) ? { ...s, type: "node" } : s,
    ),
  };
}

// /poster 게이트 — life_event 행이 있거나, 연도 있는 확정 v3 사건이 있으면 포스터를
// 만들 수 있다. findFirst 최대 2회.
export async function hasPosterSourceEvents(userId: string): Promise<boolean> {
  const life = await prisma.userMemory.findFirst({
    where: { userId, isDraft: false, createdVia: CREATED_VIA_LIFE_EVENT, eventYear: { not: null } },
    select: { id: true },
  });
  if (life) return true;
  const v3 = await prisma.lifeEvent.findFirst({
    where: {
      userId,
      status: { in: [...CONFIRMED_STATUSES] },
      OR: [{ correctedYear: { not: null } }, { year: { not: null } }],
    },
    select: { id: true },
  });
  return v3 !== null;
}
