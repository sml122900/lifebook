// 기억 에이전트 연구 트랙 — 기억 카드 검색 (R1-8). phase/기억에이전트_R1-R4_기획.md §3.
//
// 한 대상(userId)의 카드만 전수 비교한다(사용자당 수백 장 — ANN 인덱스 없음, §12 과제).
// 점수 = RRF(k=60)로 섞은 두 순위
//   ① 벡터: 질문(voyage-3.5 query) ↔ 카드 요약 임베딩 코사인
//   ② 키워드: 카드의 키워드·호칭·장소가 질문에 들어 있거나, 질문 낱말이 카드 요약·인용에 있는 수
// 강제 필터: 연도 범위 겹침(연도 모름은 포함하되 불이익)·인물·종류.
// 시기 힌트(선택): 강제 필터가 아니라 겹치는 카드에 가산점 — 모순 기록(81년 vs 82년)을
//   떨어뜨리지 않기 위해. searchWithQuestion 은 질문 속 시기 표현을 resolvePeriod 로 힌트화.
// 조회 시점 생존 확인: 결과 카드의 원본이 지금도 있는지(삭제·초안 반려·캐스케이드)와 연결
//   인물이 지금도 있는지(§12) 원본 테이블에 묶음 조회 — 동기화 전이라도 지운 기억은 안 나온다.
// 한 원본의 카드가 상위를 독차지하지 않게 원본당 최대 3장.

import { prisma } from "../db";
import { loadPeriodContext } from "./context";
import { labEmbed } from "./embed";
import { resolvePeriod } from "./period";
import { normText } from "./sources";

const RRF_K = 60;
const PER_SOURCE_CAP = 3;
const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 20;
// 시기 가산점: 힌트 구간과 겹침 / 연도 모름 / 연도 있지만 안 겹침. 강제 필터일 때 연도 모름 불이익.
const HINT_OVERLAP = 1.3;
const HINT_MISS = 0.85;
const FILTER_UNDATED = 0.8;

export type SearchParams = {
  query: string;
  keywords?: string[];
  yearFrom?: number;
  yearTo?: number;
  timeHint?: { yearFrom: number; yearTo: number } | null;
  personIds?: string[];
  kinds?: string[];
  limit?: number;
  useVector?: boolean;
  refId?: string;
};

export type CardHit = {
  cardId: string;
  sourceType: string;
  sourceId: string;
  kind: string;
  summary: string;
  quote: string | null;
  when: {
    from: number | null;
    to: number | null;
    precision: string;
    basis: string;
  };
  people: { id: string; name: string }[];
  personMentions: string[];
  placeNames: string[];
  scores: {
    vector: number | null;
    keyword: number;
    rrf: number;
    final: number;
  };
};

export type SearchResult = {
  hits: CardHit[];
  candidates: number;
  vectorUsed: boolean;
  droppedDeadSource: number;
  droppedDeadPerson: number;
  timeHint: { yearFrom: number; yearTo: number } | null;
};

// 조사·흔한 질문어를 뗀 낱말(LLM 0). 의미 매칭은 벡터가 맡고 여기선 겹치는 낱말만.
const JOSA =
  /(으로|에서|에게|께서|이랑|하고|부터|까지|처럼|보다|이나|은|는|이|가|을|를|에|의|와|과|랑|도|만|로)$/;
const STOP = new Set([
  "나",
  "내",
  "저",
  "제",
  "우리",
  "뭐",
  "무슨",
  "무엇",
  "어떤",
  "어디",
  "언제",
  "누구",
  "어떻게",
  "몇",
  "왜",
  "했지",
  "했었지",
  "있었지",
  "했어",
  "했나",
  "했더라",
  "하고",
  "하는",
  "했다고",
  "라고",
  "다고",
  "있어",
  "것",
  "거",
  "걸",
  "때",
  "좀",
  "그",
  "그때",
  "이야기",
  "얘기",
  "편이야",
  "무렵",
  "주로",
  "처음",
  "정말",
]);
export function queryTokens(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[^가-힣A-Za-z0-9]+/)
        .map((t) => t.replace(JOSA, ""))
        .filter((t) => t.length >= 2 && !STOP.has(t)),
    ),
  ];
}

const compact = (s: string) => normText(s).replace(/\s+/g, "").toLowerCase();

type Candidate = {
  id: string;
  sourceType: string;
  sourceId: string;
  kind: string;
  summary: string;
  quote: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  timePrecision: string;
  timeBasis: string;
  personIds: string[];
  personMentions: string[];
  placeNames: string[];
  keywords: string[];
};

export function keywordScore(
  c: Candidate,
  query: string,
  extra: string[] = [],
): number {
  const q = compact([query, ...extra].join(" "));
  const terms = [...c.keywords, ...c.personMentions, ...c.placeNames]
    .map(compact)
    .filter((t) => t.length >= 2);
  const termHits = new Set(terms.filter((t) => q.includes(t))).size;
  const text = compact(`${c.summary} ${c.quote ?? ""}`);
  const tokenHits = queryTokens([query, ...extra].join(" ")).filter((t) =>
    text.includes(t.toLowerCase()),
  ).length;
  return termHits + tokenHits;
}

function overlaps(
  c: { yearFrom: number | null; yearTo: number | null },
  from: number,
  to: number,
): boolean {
  if (c.yearFrom === null) return false;
  return c.yearFrom <= to && (c.yearTo ?? c.yearFrom) >= from;
}

// 원본이 지금도 있는가(유형별 묶음 조회). 반환: 살아 있는 "유형\0id" 집합.
// 에이전트(lib/lab/agent.ts)의 get_card·답변 검증도 같은 판정을 쓴다.
export async function aliveSourceKeys(
  userId: string,
  cards: { sourceType: string; sourceId: string }[],
): Promise<Set<string>> {
  const ids = (t: string) => [
    ...new Set(cards.filter((c) => c.sourceType === t).map((c) => c.sourceId)),
  ];
  const [ep, sk, le, era, photo, person, user] = await Promise.all([
    prisma.episode.findMany({
      where: { id: { in: ids("EPISODE") }, lifeEvent: { userId } },
      select: { id: true },
    }),
    prisma.lifeEvent.findMany({
      where: {
        id: { in: ids("SKELETON_EVENT") },
        userId,
        status: { in: ["CONFIRMED", "CORRECTED"] },
      },
      select: { id: true },
    }),
    prisma.userMemory.findMany({
      where: {
        id: { in: ids("LIFE_EVENT_MEMORY") },
        userId,
        createdVia: "life_event",
        isDraft: false,
      },
      select: { id: true },
    }),
    prisma.userMemory.findMany({
      where: {
        id: { in: ids("ERA_MEMORY") },
        userId,
        createdVia: "era_event",
        content: { not: null },
      },
      select: { id: true },
    }),
    prisma.userMemory.findMany({
      where: {
        id: { in: ids("PHOTO_MEMORY") },
        userId,
        createdVia: "photo",
        content: { not: null },
      },
      select: { id: true },
    }),
    prisma.person.findMany({
      where: { id: { in: ids("PERSON_MEMO") }, userId, isDraft: false },
      select: { id: true },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
  ]);
  const alive = new Set<string>();
  const add = (t: string, rows: { id: string }[]) =>
    rows.forEach((r) => alive.add(`${t}\u0000${r.id}`));
  add("EPISODE", ep);
  add("SKELETON_EVENT", sk);
  add("LIFE_EVENT_MEMORY", le);
  add("ERA_MEMORY", era);
  add("PHOTO_MEMORY", photo);
  add("PERSON_MEMO", person);
  if (user) alive.add(`PROFILE\u0000${userId}`);
  return alive;
}

export async function searchCards(
  userId: string,
  p: SearchParams,
): Promise<SearchResult> {
  const limit = Math.min(Math.max(p.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const hardYear = p.yearFrom !== undefined || p.yearTo !== undefined;
  // 한쪽만 주면 반대쪽은 열린 구간(int4 컬럼이라 안전한 경계값).
  const from = p.yearFrom ?? -9999;
  const to = p.yearTo ?? 9999;

  const candidates: Candidate[] = await prisma.memoryCard.findMany({
    where: {
      userId,
      unit: { status: "ACTIVE" },
      ...(p.kinds?.length ? { kind: { in: p.kinds } } : {}),
      ...(p.personIds?.length ? { personIds: { hasSome: p.personIds } } : {}),
      ...(hardYear
        ? {
            OR: [
              { yearFrom: null },
              {
                yearFrom: { lte: to },
                OR: [
                  { yearTo: { gte: from } },
                  { yearTo: null, yearFrom: { gte: from } },
                ],
              },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      sourceType: true,
      sourceId: true,
      kind: true,
      summary: true,
      quote: true,
      yearFrom: true,
      yearTo: true,
      timePrecision: true,
      timeBasis: true,
      personIds: true,
      personMentions: true,
      placeNames: true,
      keywords: true,
    },
  });

  // ① 벡터
  const sims = new Map<string, number>();
  const vectorUsed =
    p.useVector !== false && p.query.trim() !== "" && candidates.length > 0;
  if (vectorUsed) {
    const [qv] = await labEmbed([p.query], "query", {
      userId,
      refId: p.refId ?? "search",
    });
    const rows = await prisma.$queryRaw<{ id: string; sim: number }[]>`
      SELECT id, (1 - (embedding <=> ${`[${qv.join(",")}]`}::vector(1024)))::float AS sim
      FROM "MemoryCard" WHERE "userId" = ${userId} AND embedding IS NOT NULL`;
    for (const r of rows) sims.set(r.id, r.sim);
  }
  const vecRank = new Map(
    candidates
      .filter((c) => sims.has(c.id))
      .sort((a, b) => (sims.get(b.id) ?? 0) - (sims.get(a.id) ?? 0))
      .map((c, i) => [c.id, i + 1]),
  );
  // ② 키워드
  const kw = new Map(
    candidates.map((c) => [c.id, keywordScore(c, p.query, p.keywords)]),
  );
  const kwRank = new Map(
    candidates
      .filter((c) => (kw.get(c.id) ?? 0) > 0)
      .sort((a, b) => (kw.get(b.id) ?? 0) - (kw.get(a.id) ?? 0))
      .map((c, i) => [c.id, i + 1]),
  );

  const scored = candidates
    .map((c) => {
      const vr = vecRank.get(c.id);
      const kr = kwRank.get(c.id);
      const rrf = (vr ? 1 / (RRF_K + vr) : 0) + (kr ? 1 / (RRF_K + kr) : 0);
      let factor = 1;
      if (hardYear && c.yearFrom === null) factor *= FILTER_UNDATED;
      if (p.timeHint && c.yearFrom !== null) {
        factor *= overlaps(c, p.timeHint.yearFrom, p.timeHint.yearTo)
          ? HINT_OVERLAP
          : HINT_MISS;
      }
      return { c, rrf, final: rrf * factor };
    })
    .filter((s) => s.rrf > 0)
    .sort(
      (a, b) =>
        b.final - a.final || (sims.get(b.c.id) ?? 0) - (sims.get(a.c.id) ?? 0),
    );

  // 조회 시점 생존 확인(상위 일부만) + 인물 생존(§12) + 원본당 상한.
  const pool = scored.slice(0, limit * 6);
  const alive = await aliveSourceKeys(
    userId,
    pool.map((s) => s.c),
  );
  const personIdsInPool = [...new Set(pool.flatMap((s) => s.c.personIds))];
  const livePeople = await prisma.person.findMany({
    where: { id: { in: personIdsInPool }, userId, isDraft: false },
    select: { id: true, name: true },
  });
  const nameOf = new Map(livePeople.map((x) => [x.id, x.name]));

  const hits: CardHit[] = [];
  const perSource = new Map<string, number>();
  let droppedDeadSource = 0;
  let droppedDeadPerson = 0;
  for (const s of pool) {
    if (hits.length >= limit) break;
    const key = `${s.c.sourceType}\u0000${s.c.sourceId}`;
    if (!alive.has(key)) {
      droppedDeadSource += 1;
      continue;
    }
    const people = s.c.personIds.filter((id) => nameOf.has(id));
    if (
      p.personIds?.length &&
      !people.some((id) => p.personIds!.includes(id))
    ) {
      droppedDeadPerson += 1; // 인물 필터로만 걸렸는데 그 인물이 지워진 카드
      continue;
    }
    if ((perSource.get(key) ?? 0) >= PER_SOURCE_CAP) continue;
    perSource.set(key, (perSource.get(key) ?? 0) + 1);
    hits.push({
      cardId: s.c.id,
      sourceType: s.c.sourceType,
      sourceId: s.c.sourceId,
      kind: s.c.kind,
      summary: s.c.summary,
      quote:
        s.c.quote && s.c.quote.length > 80
          ? `${s.c.quote.slice(0, 79)}…`
          : s.c.quote,
      when: {
        from: s.c.yearFrom,
        to: s.c.yearTo,
        precision: s.c.timePrecision,
        basis: s.c.timeBasis,
      },
      people: people.map((id) => ({ id, name: nameOf.get(id) as string })),
      personMentions: s.c.personMentions,
      placeNames: s.c.placeNames,
      scores: {
        vector: sims.has(s.c.id)
          ? Number((sims.get(s.c.id) as number).toFixed(4))
          : null,
        keyword: kw.get(s.c.id) ?? 0,
        rrf: Number(s.rrf.toFixed(5)),
        final: Number(s.final.toFixed(5)),
      },
    });
  }
  return {
    hits,
    candidates: candidates.length,
    vectorUsed,
    droppedDeadSource,
    droppedDeadPerson,
    timeHint: p.timeHint ?? null,
  };
}

// 자연어 질문 그대로 검색(LLM 0): 질문 속 시기 표현을 resolvePeriod 로 풀어 가산점 힌트로만 쓴다.
// 평가기(db/lab-eval.ts retrieval)와 검색 디버그 화면이 같은 경로를 쓴다.
export async function searchWithQuestion(
  userId: string,
  p: SearchParams & { useQuestionTimeHint?: boolean },
): Promise<SearchResult> {
  let timeHint = p.timeHint ?? null;
  if (!timeHint && p.useQuestionTimeHint !== false) {
    const { ctx } = await loadPeriodContext(userId);
    const r = resolvePeriod(p.query, ctx);
    if (r.ok) timeHint = { yearFrom: r.yearFrom, yearTo: r.yearTo };
  }
  return searchCards(userId, { ...p, timeHint });
}
