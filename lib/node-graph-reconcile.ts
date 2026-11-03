// 노드 그래프 정합 점검 — docs/phase/node-graph-self.md §6 2b.4. 순수 모듈(auth 없음).
// db/reconcile-node-links.ts(전체 사용자 — 실고객 계정 제외)와 회귀(픽스처 사용자 한정)가 같은
// 함수를 부른다. 점검은 개수만 돌려준다(이름·id·본문 없음).
//
//   1 끝이 없는 연결(종류별)      → 정리 대상     6 낡은 이야기 본문(평문 ≠ Episode.content) — 보고만
//   2 연결 주인 ≠ 양 끝 노드 주인 — 보고만        7 본문 사진 블록이 없는 사진을 가리킴 — 보고만
//   3 방향 위반·허용 안 된 쌍 — 보고만             8 고아 초안 인물                → 정리 대상
//   4 한 쌍 두 곳(주 소속·대상 인물) — 보고만      9 확인 대기 연결 수·가장 오래된 대기 일수 — 지표
//   5 본문 정합(노드 없음 → 정리 대상 / 주인 불일치·남의 메모리 — 보고만)   10 장소형 인물 수 — 지표
//   11 모임·장소 묶음 구성원 행의 주인 ≠ 묶음·구성원 주인 — 보고만(My Life 개편 3단계)
//   12 이야기 없는 시기↔사람 연결 — 그 시기 이야기(주 소속·추가 소속)에 그 분이 하나도 안 나옴(대상 인물·확정 연결)
//      출처 STORY(이야기 따라) → 정리 대상 · DIRECT(직접·칸 전 기존 행) → 보고만(2026-11-02 3단계 E2E — §14.7·§14.8)
//   13 이야기 기록(브릿지 메모리 createdVia="episode")의 장소 행 중 장소 노드(placeId) 없는 것 — 보고만(늘 0 이어야.
//      My Life 는 이야기 장소를 장소 노드로만 그린다 — 2026-11-03 이름만 남은 장소 예외 제거, my-life-restructure §15.8)
// 정리(applyNodeGraphCleanup)는 1·5(노드 없음)·8·12(STORY) 만, 점검과 같은 조건의 DELETE 한 문장씩.

import { prisma } from "./db";
import { Prisma } from "./generated/prisma/client";
import { ALLOWED_PAIRS } from "./node-graph";

export type NodeGraphScope = { userId?: string; excludeUserIds?: string[] };

export type NodeGraphIssues = {
  danglingLinks: number; // 1 — 연결 행 수(양 끝 중 하나라도 없음)
  danglingByType: Record<string, number>; // 1 — 없는 끝의 종류별
  ownerMismatch: number; // 2
  badDirectionOrPair: number; // 3
  primaryMembershipDup: number; // 4 — LIFE_EVENT→EPISODE 가 이야기의 주 소속과 같음
  episodeSubjectDup: number; // 4 — EPISODE→PERSON 이 Episode.personId 와 같음
  bodyMissingNode: number; // 5
  bodyOwnerMismatch: number; // 5
  bodyForeignMemory: number; // 5
  staleBodies: number; // 6
  missingPhotoBlocks: number; // 7
  orphanDrafts: number; // 8
  pendingLinks: number; // 9 — PROPOSED 전체
  pendingPeopleLinks: number; // 9 — 그중 이야기→인물(옛 인물 확인 화면 대상 — 화면·만드는 경로 2026-11-03 삭제, 늘 0 이어야)
  oldestPendingDays: number | null; // 9
  locationPeople: number; // 10
  memberOwnerMismatch: number; // 11 — PersonGroupMember·PlaceGroupMember
  storyPeriodPeopleWithoutStory: number; // 12 — 그 시기 이야기에 그 분이 안 나오는 시기↔사람 중 출처 STORY(정리 대상)
  directPeriodPeopleWithoutStory: number; // 12 — 같은 조건, 출처 DIRECT(보고만)
  storyPlacesWithoutNode: number; // 13 — 이야기 기록의 placeId 없는 장소 행(보고만)
};

function scope(col: string, s: NodeGraphScope): Prisma.Sql {
  const c = Prisma.raw(col);
  if (s.userId) return Prisma.sql`${c} = ${s.userId}`;
  if (s.excludeUserIds && s.excludeUserIds.length > 0) return Prisma.sql`${c} NOT IN (${Prisma.join(s.excludeUserIds)})`;
  return Prisma.sql`TRUE`;
}

// 노드 (종류, id) 의 주인 userId. 노드가 없으면 NULL. 이야기는 소속 중심의 주인.
function ownerOf(typeCol: string, idCol: string): Prisma.Sql {
  const t = Prisma.raw(typeCol);
  const id = Prisma.raw(idCol);
  return Prisma.sql`CASE ${t}
    WHEN 'LIFE_EVENT' THEN (SELECT x."userId" FROM "LifeEvent" x WHERE x.id = ${id})
    WHEN 'EPISODE' THEN (SELECT le."userId" FROM "Episode" ep JOIN "LifeEvent" le ON le.id = ep."lifeEventId" WHERE ep.id = ${id})
    WHEN 'PERSON_GROUP' THEN (SELECT x."userId" FROM "PersonGroup" x WHERE x.id = ${id})
    WHEN 'PERSON' THEN (SELECT x."userId" FROM "Person" x WHERE x.id = ${id})
    WHEN 'PLACE_GROUP' THEN (SELECT x."userId" FROM "PlaceGroup" x WHERE x.id = ${id})
    WHEN 'PLACE' THEN (SELECT x."userId" FROM "Place" x WHERE x.id = ${id})
  END`;
}

const ORPHAN_DRAFT = Prisma.sql`p."isDraft" AND p."companionSessionId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "NodeLink" l WHERE l."fromType" = 'PERSON' AND l."fromId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "NodeLink" l WHERE l."toType" = 'PERSON' AND l."toId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "PersonLifeEvent" x WHERE x."personId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "Episode" x WHERE x."personId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "PersonEvent" x WHERE x."personId" = p.id)
  AND NOT EXISTS (SELECT 1 FROM "PersonGroupMember" x WHERE x."personId" = p.id)`;

// 12 — 시기↔사람 연결 x 에 대해 "그 시기 이야기 중 그 분이 나오는 것"이 없음. 그 시기 이야기 = 주 소속(Episode.lifeEventId) +
// 추가 소속(NodeLink LIFE_EVENT→EPISODE). 나옴 = 대상 인물(Episode.personId) 또는 확정 연결(EPISODE→PERSON CONFIRMED).
const PERIOD_PERSON_WITHOUT_STORY = Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "Episode" ep
    WHERE (ep."lifeEventId" = x."lifeEventId"
        OR EXISTS (SELECT 1 FROM "NodeLink" m WHERE m."fromType" = 'LIFE_EVENT' AND m."fromId" = x."lifeEventId" AND m."toType" = 'EPISODE' AND m."toId" = ep.id))
      AND (ep."personId" = x."personId"
        OR EXISTS (SELECT 1 FROM "NodeLink" l WHERE l."fromType" = 'EPISODE' AND l."fromId" = ep.id AND l."toType" = 'PERSON' AND l."toId" = x."personId" AND l.status = 'CONFIRMED')))`;

const n = (v: unknown) => Number(v ?? 0);

export async function countNodeGraphIssues(s: NodeGraphScope = {}): Promise<NodeGraphIssues> {
  const linkScope = scope(`nl."userId"`, s);
  const [ends, [dir], [dup], [body], [stale], [photo], [orphan], [pend], [loc], [mem], [ple], [spl]] = await Promise.all([
    // 1·2 — 문제 있는 끝만 돌려받는다(정상이면 0행).
    prisma.$queryRaw<{ id: string; t: string; missing: boolean }[]>`
      SELECT nl.id, e.t::text AS t, (e.owner IS NULL) AS missing
      FROM "NodeLink" nl
      CROSS JOIN LATERAL (VALUES
        (nl."fromType", ${ownerOf(`nl."fromType"`, `nl."fromId"`)}),
        (nl."toType", ${ownerOf(`nl."toType"`, `nl."toId"`)})
      ) AS e(t, owner)
      WHERE ${linkScope} AND (e.owner IS NULL OR e.owner <> nl."userId")`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "NodeLink" nl
      WHERE ${linkScope} AND (
        (nl."fromType"::text || '>' || nl."toType"::text) NOT IN (${Prisma.join([...ALLOWED_PAIRS])})
        OR nl."fromType" > nl."toType"
        OR (nl."fromType" = nl."toType" AND nl."fromId" COLLATE "C" >= nl."toId" COLLATE "C"))`,
    prisma.$queryRaw<{ primary_dup: number; subject_dup: number }[]>`
      SELECT
        (SELECT count(*)::int FROM "NodeLink" nl JOIN "Episode" ep ON ep.id = nl."toId"
          WHERE ${linkScope} AND nl."fromType" = 'LIFE_EVENT' AND nl."toType" = 'EPISODE' AND ep."lifeEventId" = nl."fromId") AS primary_dup,
        (SELECT count(*)::int FROM "NodeLink" nl JOIN "Episode" ep ON ep.id = nl."fromId"
          WHERE ${linkScope} AND nl."fromType" = 'EPISODE' AND nl."toType" = 'PERSON' AND ep."personId" = nl."toId") AS subject_dup`,
    prisma.$queryRaw<{ missing: number; mismatch: number; foreign_mem: number }[]>`
      SELECT
        count(*) FILTER (WHERE o.owner IS NULL)::int AS missing,
        count(*) FILTER (WHERE o.owner IS NOT NULL AND o.owner <> nb."userId")::int AS mismatch,
        count(*) FILTER (WHERE m."userId" IS NOT NULL AND m."userId" <> nb."userId")::int AS foreign_mem
      FROM "NodeBody" nb
      CROSS JOIN LATERAL (SELECT ${ownerOf(`nb."nodeType"`, `nb."nodeId"`)} AS owner) o
      LEFT JOIN "UserMemory" m ON m.id = nb."memoryId"
      WHERE ${scope(`nb."userId"`, s)}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "NodeBody" nb JOIN "Episode" ep ON ep.id = nb."nodeId"
      WHERE ${scope(`nb."userId"`, s)} AND nb."nodeType" = 'EPISODE' AND nb."plainText" <> ep.content`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "NodeBody" nb
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(nb.doc -> 'blocks') = 'array' THEN nb.doc -> 'blocks' ELSE '[]'::jsonb END) AS b
      WHERE ${scope(`nb."userId"`, s)} AND b ->> 'type' = 'photo'
        AND NOT EXISTS (SELECT 1 FROM "Photo" ph WHERE ph.id = b ->> 'photoId')`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Person" p WHERE ${scope(`p."userId"`, s)} AND ${ORPHAN_DRAFT}`,
    prisma.$queryRaw<{ total: number; people: number; oldest: Date | null }[]>`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE nl."fromType" = 'EPISODE' AND nl."toType" = 'PERSON')::int AS people,
        min(nl."createdAt") AS oldest
      FROM "NodeLink" nl WHERE ${linkScope} AND nl.status = 'PROPOSED'`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "Person" p WHERE ${scope(`p."userId"`, s)} AND p."subjectType" = 'location'`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT
        (SELECT count(*)::int FROM "PersonGroupMember" m JOIN "PersonGroup" g ON g.id = m."groupId" JOIN "Person" x ON x.id = m."personId"
          WHERE ${scope(`m."userId"`, s)} AND (g."userId" <> m."userId" OR x."userId" <> m."userId"))
        + (SELECT count(*)::int FROM "PlaceGroupMember" m JOIN "PlaceGroup" g ON g.id = m."groupId" JOIN "Place" x ON x.id = m."placeId"
          WHERE ${scope(`m."userId"`, s)} AND (g."userId" <> m."userId" OR x."userId" <> m."userId")) AS n`,
    prisma.$queryRaw<{ story: number; direct: number }[]>`
      SELECT count(*) FILTER (WHERE x.origin = 'STORY')::int AS story, count(*) FILTER (WHERE x.origin <> 'STORY')::int AS direct
      FROM "PersonLifeEvent" x WHERE ${scope(`x."userId"`, s)} AND ${PERIOD_PERSON_WITHOUT_STORY}`,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "MemoryPlace" mp JOIN "UserMemory" m ON m.id = mp."memoryId"
      WHERE ${scope(`m."userId"`, s)} AND m."createdVia" = 'episode' AND mp."placeId" IS NULL`,
  ]);

  const danglingByType: Record<string, number> = {};
  for (const e of ends.filter((x) => x.missing)) danglingByType[e.t] = (danglingByType[e.t] ?? 0) + 1;
  return {
    danglingLinks: new Set(ends.filter((x) => x.missing).map((x) => x.id)).size,
    danglingByType,
    ownerMismatch: new Set(ends.filter((x) => !x.missing).map((x) => x.id)).size,
    badDirectionOrPair: n(dir.n),
    primaryMembershipDup: n(dup.primary_dup),
    episodeSubjectDup: n(dup.subject_dup),
    bodyMissingNode: n(body.missing),
    bodyOwnerMismatch: n(body.mismatch),
    bodyForeignMemory: n(body.foreign_mem),
    staleBodies: n(stale.n),
    missingPhotoBlocks: n(photo.n),
    orphanDrafts: n(orphan.n),
    pendingLinks: n(pend.total),
    pendingPeopleLinks: n(pend.people),
    oldestPendingDays: pend.oldest ? Math.floor((Date.now() - new Date(pend.oldest).getTime()) / 86_400_000) : null,
    locationPeople: n(loc.n),
    memberOwnerMismatch: n(mem.n),
    storyPeriodPeopleWithoutStory: n(ple.story),
    directPeriodPeopleWithoutStory: n(ple.direct),
    storyPlacesWithoutNode: n(spl.n),
  };
}

export type NodeGraphCleanup = { danglingLinks: number; bodiesMissingNode: number; orphanDrafts: number; storyPeriodPeople: number };

// 정리 — 점검 1·5(노드 없음)·8 과 같은 조건으로만 지운다. 본문 삭제는 트리거가 그 본문 전용
// 사진 메모리(createdVia="node_body")를 같이 지운다.
export async function applyNodeGraphCleanup(s: NodeGraphScope = {}): Promise<NodeGraphCleanup> {
  const danglingLinks = await prisma.$executeRaw`
    DELETE FROM "NodeLink" nl WHERE ${scope(`nl."userId"`, s)} AND (
      ${ownerOf(`nl."fromType"`, `nl."fromId"`)} IS NULL OR ${ownerOf(`nl."toType"`, `nl."toId"`)} IS NULL)`;
  const bodiesMissingNode = await prisma.$executeRaw`
    DELETE FROM "NodeBody" nb WHERE ${scope(`nb."userId"`, s)} AND ${ownerOf(`nb."nodeType"`, `nb."nodeId"`)} IS NULL`;
  const orphanDrafts = await prisma.$executeRaw`
    DELETE FROM "Person" p WHERE ${scope(`p."userId"`, s)} AND ${ORPHAN_DRAFT}`;
  const storyPeriodPeople = await prisma.$executeRaw`
    DELETE FROM "PersonLifeEvent" x WHERE ${scope(`x."userId"`, s)} AND x.origin = 'STORY' AND ${PERIOD_PERSON_WITHOUT_STORY}`;
  return { danglingLinks, bodiesMissingNode, orphanDrafts, storyPeriodPeople };
}
