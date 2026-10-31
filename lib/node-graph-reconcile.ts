// 노드 그래프 정합 점검 — docs/phase/node-graph-self.md §6 2b.4. 순수 모듈(auth 없음).
// db/reconcile-node-links.ts(전체 사용자 — 실고객 계정 제외)와 회귀(픽스처 사용자 한정)가 같은
// 함수를 부른다. 점검은 개수만 돌려준다(이름·id·본문 없음).
//
//   1 끝이 없는 연결(종류별)      → 정리 대상     6 낡은 이야기 본문(평문 ≠ Episode.content) — 보고만
//   2 연결 주인 ≠ 양 끝 노드 주인 — 보고만        7 본문 사진 블록이 없는 사진을 가리킴 — 보고만
//   3 방향 위반·허용 안 된 쌍 — 보고만             8 고아 초안 인물                → 정리 대상
//   4 한 쌍 두 곳(주 소속·대상 인물) — 보고만      9 확인 대기 연결 수·가장 오래된 대기 일수 — 지표
//   5 본문 정합(노드 없음 → 정리 대상 / 주인 불일치·남의 메모리 — 보고만)   10 장소형 인물 수 — 지표
// 정리(applyNodeGraphCleanup)는 1·5(노드 없음)·8 만, 점검과 같은 조건의 DELETE 한 문장씩.

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
  pendingPeopleLinks: number; // 9 — 그중 이야기→인물(확인 화면 대상)
  oldestPendingDays: number | null; // 9
  locationPeople: number; // 10
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

const n = (v: unknown) => Number(v ?? 0);

export async function countNodeGraphIssues(s: NodeGraphScope = {}): Promise<NodeGraphIssues> {
  const linkScope = scope(`nl."userId"`, s);
  const [ends, [dir], [dup], [body], [stale], [photo], [orphan], [pend], [loc]] = await Promise.all([
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
  };
}

export type NodeGraphCleanup = { danglingLinks: number; bodiesMissingNode: number; orphanDrafts: number };

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
  return { danglingLinks, bodiesMissingNode, orphanDrafts };
}
