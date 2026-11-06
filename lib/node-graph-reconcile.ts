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
//   14 사용자 노드(CustomNode — docs/phase/custom-graph.md §2.3) — 보고만(늘 0 이어야): 종류 값 밖 · 자리 규칙(카테고리에 자리 /
//      묶음·항목에 자리 없음·자리가 카테고리 아님·자리가 기본 카테고리 행) · 남의 parentId · 자기 자신 부모(CHECK 가 막음) · 고리 ·
//      기본 카테고리 행 오용(종류·자리·값·자식·연결) · 같은 종류 넣기(MEMBER) · 역할과 종류 불일치 · 자리와 겹치는 넣기
//   15 행성 꾸미기(NodeDecoration — U4, docs/phase/ui-space.md 부록 A) — 노드 없음(지운 노드의 꾸미기가 남음 — 정리 함수가 늘
//      지우므로 늘 0 이어야) → 정리 대상 · 주인 불일치 · 목록 밖 모양(lib/space-decor — DB CHECK 없음) — 보고만
// 정리(applyNodeGraphCleanup)는 1·5(노드 없음)·8·12(STORY)·15(노드 없음) 만, 점검과 같은 조건의 DELETE 한 문장씩.

import { prisma } from "./db";
import { Prisma } from "./generated/prisma/client";
import { ALLOWED_PAIRS } from "./node-graph";
import { DECOR_SHAPES } from "./space-decor";

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
  custom: CustomNodeIssues; // 14 — 사용자 노드(보고만)
  decorMissingNode: number; // 15 — 노드 없는 꾸미기(정리 대상)
  decorOwnerMismatch: number; // 15 — 꾸미기 주인 ≠ 노드 주인(보고만)
  decorBadShape: number; // 15 — 목록 밖 모양(보고만)
};

export type CustomNodeIssues = {
  badKind: number; // 종류 값이 CATEGORY·GROUP·ITEM 밖
  badHome: number; // 카테고리에 자리 · 묶음·항목에 자리 없음 · 자리가 카테고리 아님 · 자리가 기본 카테고리 행
  foreignParent: number; // 자리(parentId)가 남의 노드
  selfParent: number; // 자기 자신이 자리(CHECK CustomNode_parent_not_self_check 가 막음 — 늘 0)
  cycles: number; // 자리를 따라 올라가면 자기에게 돌아오는 노드(고리)
  builtinMisuse: number; // 기본 카테고리 행이 카테고리 아님·자리 있음·값 밖·자식 있음·연결 있음
  sameKindMember: number; // 같은 종류끼리 넣기(MEMBER)
  roleMismatch: number; // 역할이 노드 종류 규칙과 다름(넣기여야 하는데 관련·관련이어야 하는데 넣기·허용 안 된 관련 쌍)
  homeMember: number; // 담기는 쪽의 자리가 담는 쪽인데 넣기 연결도 있음(한 쌍 두 곳)
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
    WHEN 'CUSTOM' THEN (SELECT x."userId" FROM "CustomNode" x WHERE x.id = ${id})
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

// 14 — 종류 순서(카테고리 3 > 묶음 2 > 항목 1). 담는 쪽 = 순서가 높은 쪽(lib/node-graph customPairRole 과 같은 규칙).
const ORD = (alias: string) => Prisma.raw(`(CASE ${alias}.kind WHEN 'CATEGORY' THEN 3 WHEN 'GROUP' THEN 2 WHEN 'ITEM' THEN 1 ELSE 0 END)`);

async function countCustomNodeIssues(s: NodeGraphScope): Promise<CustomNodeIssues> {
  const cs = scope(`c."userId"`, s);
  const ls = scope(`nl."userId"`, s);
  const [r] = await prisma.$queryRaw<Record<string, number>[]>`
    SELECT
      (SELECT count(*)::int FROM "CustomNode" c WHERE ${cs} AND c.kind NOT IN ('CATEGORY', 'GROUP', 'ITEM')) AS bad_kind,
      (SELECT count(*)::int FROM "CustomNode" c LEFT JOIN "CustomNode" p ON p.id = c."parentId"
        WHERE ${cs} AND ((c.kind = 'CATEGORY' AND c."parentId" IS NOT NULL)
          OR (c.kind IN ('GROUP', 'ITEM') AND (c."parentId" IS NULL OR p.kind <> 'CATEGORY' OR p.builtin IS NOT NULL)))) AS bad_home,
      (SELECT count(*)::int FROM "CustomNode" c JOIN "CustomNode" p ON p.id = c."parentId" WHERE ${cs} AND p."userId" <> c."userId") AS foreign_parent,
      (SELECT count(*)::int FROM "CustomNode" c WHERE ${cs} AND c."parentId" = c.id) AS self_parent,
      (WITH RECURSIVE walk(start, cur, depth) AS (
          SELECT c.id, c."parentId", 1 FROM "CustomNode" c WHERE ${cs} AND c."parentId" IS NOT NULL
          UNION ALL
          SELECT w.start, p."parentId", w.depth + 1 FROM walk w JOIN "CustomNode" p ON p.id = w.cur
          WHERE w.cur <> w.start AND p."parentId" IS NOT NULL AND w.depth < 50)
        SELECT count(DISTINCT start)::int FROM walk WHERE cur = start AND depth > 1) AS cycles,
      (SELECT count(*)::int FROM "CustomNode" c WHERE ${cs} AND c.builtin IS NOT NULL AND (
          c.kind <> 'CATEGORY' OR c."parentId" IS NOT NULL OR c.builtin NOT IN ('PEOPLE', 'PLACES')
          OR EXISTS (SELECT 1 FROM "CustomNode" k WHERE k."parentId" = c.id)
          OR EXISTS (SELECT 1 FROM "NodeLink" l WHERE (l."fromType" = 'CUSTOM' AND l."fromId" = c.id) OR (l."toType" = 'CUSTOM' AND l."toId" = c.id)))) AS builtin_misuse,
      (SELECT count(*)::int FROM "NodeLink" nl JOIN "CustomNode" f ON f.id = nl."fromId" JOIN "CustomNode" t ON t.id = nl."toId"
        WHERE ${ls} AND nl."fromType" = 'CUSTOM' AND nl."toType" = 'CUSTOM' AND f.kind = t.kind AND nl.role = 'MEMBER') AS same_kind_member,
      (SELECT count(*)::int FROM "NodeLink" nl JOIN "CustomNode" t ON t.id = nl."toId"
        WHERE ${ls} AND nl."fromType" <> 'CUSTOM' AND nl."toType" = 'CUSTOM' AND (
          (t.kind IN ('CATEGORY', 'GROUP') AND nl.role <> 'MEMBER')
          OR (t.kind = 'ITEM' AND (nl.role <> '' OR nl."fromType" NOT IN ('LIFE_EVENT', 'EPISODE', 'PERSON', 'PLACE')))))
      + (SELECT count(*)::int FROM "NodeLink" nl JOIN "CustomNode" f ON f.id = nl."fromId" JOIN "CustomNode" t ON t.id = nl."toId"
        WHERE ${ls} AND nl."fromType" = 'CUSTOM' AND nl."toType" = 'CUSTOM' AND (
          (f.kind = t.kind AND nl.role <> 'MEMBER' AND NOT (f.kind = 'ITEM' AND nl.role = ''))
          OR (f.kind <> t.kind AND nl.role <> 'MEMBER'))) AS role_mismatch,
      (SELECT count(*)::int FROM "NodeLink" nl JOIN "CustomNode" f ON f.id = nl."fromId" JOIN "CustomNode" t ON t.id = nl."toId"
        WHERE ${ls} AND nl."fromType" = 'CUSTOM' AND nl."toType" = 'CUSTOM' AND nl.role = 'MEMBER' AND f.kind <> t.kind
          AND ((${ORD("f")} > ${ORD("t")} AND t."parentId" = f.id) OR (${ORD("t")} > ${ORD("f")} AND f."parentId" = t.id))) AS home_member`;
  return {
    badKind: n(r.bad_kind),
    badHome: n(r.bad_home),
    foreignParent: n(r.foreign_parent),
    selfParent: n(r.self_parent),
    cycles: n(r.cycles),
    builtinMisuse: n(r.builtin_misuse),
    sameKindMember: n(r.same_kind_member),
    roleMismatch: n(r.role_mismatch),
    homeMember: n(r.home_member),
  };
}

export async function countNodeGraphIssues(s: NodeGraphScope = {}): Promise<NodeGraphIssues> {
  const linkScope = scope(`nl."userId"`, s);
  const [ends, [dir], [dup], [body], [stale], [photo], [orphan], [pend], [loc], [mem], [ple], [spl], custom, [deco]] = await Promise.all([
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
    countCustomNodeIssues(s),
    prisma.$queryRaw<{ missing: number; mismatch: number; bad_shape: number }[]>`
      SELECT
        count(*) FILTER (WHERE o.owner IS NULL)::int AS missing,
        count(*) FILTER (WHERE o.owner IS NOT NULL AND o.owner <> d."userId")::int AS mismatch,
        count(*) FILTER (WHERE d.shape NOT IN (${Prisma.join(DECOR_SHAPES.map((x) => x.key))}))::int AS bad_shape
      FROM "NodeDecoration" d
      CROSS JOIN LATERAL (SELECT ${ownerOf(`d."nodeType"`, `d."nodeId"`)} AS owner) o
      WHERE ${scope(`d."userId"`, s)}`,
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
    custom,
    decorMissingNode: n(deco.missing),
    decorOwnerMismatch: n(deco.mismatch),
    decorBadShape: n(deco.bad_shape),
  };
}

export type NodeGraphCleanup = { danglingLinks: number; bodiesMissingNode: number; orphanDrafts: number; storyPeriodPeople: number; decorationsMissingNode: number };

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
  const decorationsMissingNode = await prisma.$executeRaw`
    DELETE FROM "NodeDecoration" d WHERE ${scope(`d."userId"`, s)} AND ${ownerOf(`d."nodeType"`, `d."nodeId"`)} IS NULL`;
  return { danglingLinks, bodiesMissingNode, orphanDrafts, storyPeriodPeople, decorationsMissingNode };
}
