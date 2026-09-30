// 기억 에이전트 R1-8 — 검색 로직 검증 (LLM 0, 임베딩 0 — 키워드 순위만).
//
// 이 스크립트가 만들고 지우는 임시 사용자(wtest_labsearch_*)로만 쓴다(테스트 격리 규칙).
// 가짜 추출기로 카드를 만들고 useVector:false 로 검색해 필터·생존 확인·원본당 상한·시기
// 가산점을 본다. 실제 벡터 검색 품질은 db/lab-eval.ts --mode retrieval 이 잰다.
//
// 실행: npx tsx db/test-lab-search.ts

import "dotenv/config";

import { deleteAccountTx } from "../lib/account-deletion";
import { prisma } from "../lib/db";
import type { CardDraft, Extractor } from "../lib/lab/extract";
import {
  queryTokens,
  searchCards,
  searchWithQuestion,
} from "../lib/lab/search";
import { syncSubject } from "../lib/lab/sync";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

// 본문 낱말을 키워드로, 본문에 이름이 나오는 인물을 연결. "다섯" 이 들어간 원본은 카드 5장.
const fake: Extractor = async (unit, _ctx, people) => {
  const field = unit.fields.content ? "content" : "memo";
  const text = unit.fields[field];
  const personIds = people
    .filter((p) => text.includes(p.name))
    .map((p) => p.id);
  const card = (i: number): CardDraft => ({
    kind: text.includes("좋아") ? "PREFERENCE" : "EVENT",
    summary: `화자 카드 ${i}: ${text}`,
    quote: text.slice(0, 4),
    quoteField: field,
    quoteStart: 0,
    quoteEnd: 4,
    yearFrom: unit.yearFrom,
    yearTo: unit.yearTo,
    month: null,
    timePrecision: "YEAR",
    timeBasis: "SOURCE_FIELD",
    timeExpression: null,
    lifeStage: null,
    personIds,
    personMentions: [],
    placeNames: [],
    keywords: queryTokens(text),
    extractorModel: "fake",
  });
  const n = text.includes("다섯") ? 5 : 1;
  return {
    cards: Array.from({ length: n }, (_, i) => card(i)),
    llm: true,
    droppedQuote: 0,
    droppedSensitive: 0,
  };
};

async function main() {
  // 순수: 질문 낱말
  const toks = queryTokens("군대 있을 때 무슨 노래를 불렀지?");
  check(
    "낱말: 조사 떼고 질문어 빼기(노래를→노래, 무슨 제외)",
    toks.includes("군대") && toks.includes("노래") && !toks.includes("무슨"),
    toks,
  );

  const ts = Date.now();
  const tmp = `wtest_labsearch_${ts}`;
  await prisma.user.create({
    data: {
      id: tmp,
      email: `withdrawal-test-labsearch-${ts}@test`,
      name: "labsearch",
    },
  });
  try {
    await prisma.onboardingProfile.create({
      data: { userId: tmp, birthYear: 1950, region: "서울" },
    });
    const mem = (year: number, content: string) =>
      prisma.userMemory.create({
        data: {
          userId: tmp,
          createdVia: "life_event",
          year,
          title: content.slice(0, 8),
          eventTitle: content.slice(0, 8),
          eventYear: year,
          content,
          precision: "APPROXIMATE",
          category: "FAMILY",
        },
      });
    const fishing = await mem(1970, "철수와 낚시를 갔다.");
    await mem(1990, "서울로 이사를 왔다.");
    await mem(1980, "철수와 등산을 했다.");
    const five = await mem(1985, "다섯 가지 낚시 이야기.");
    const chulsoo = await prisma.person.create({
      data: {
        userId: tmp,
        name: "철수",
        relation: "친구",
        metYear: null,
        memo: "낚시 친구 철수.",
      },
    });
    await prisma.lifeProfile.create({
      data: {
        userId: tmp,
        interests: [],
        schools: [],
        residences: [],
        favMovies: [],
        favGames: [],
        favMusic: [],
        hobbies: "낚시",
      },
    });
    await syncSubject(tmp, { extractor: fake, embed: false });

    const search = (p: Parameters<typeof searchCards>[1]) =>
      searchCards(tmp, { useVector: false, limit: 20, ...p });
    const r1 = await search({ query: "낚시" });
    const src = (r: Awaited<ReturnType<typeof search>>) =>
      r.hits.map((h) => h.sourceType);
    check(
      "키워드: '낚시' → 사건·인물 메모·프로필 카드",
      r1.hits.some((h) => h.sourceId === fishing.id) &&
        src(r1).includes("PERSON_MEMO") &&
        src(r1).includes("PROFILE"),
      r1.hits.map((h) => h.summary),
    );
    check("벡터 미사용 표시", !r1.vectorUsed);

    const r2 = await search({
      query: "낚시 이사 등산",
      yearFrom: 1965,
      yearTo: 1975,
    });
    const years = r2.hits.map((h) => h.when.from);
    check(
      "연도 강제 필터 1965~1975: 1970 포함·1990/1980 제외, 연도 모름(프로필) 포함",
      years.includes(1970) &&
        !years.includes(1990) &&
        !years.includes(1980) &&
        r2.hits.some((h) => h.sourceType === "PROFILE"),
      years,
    );
    const dated = r2.hits.find((h) => h.when.from === 1970);
    const undated = r2.hits.find((h) => h.sourceType === "PROFILE");
    check(
      "강제 필터일 때 연도 모름 카드는 불이익(최종점 < RRF)",
      !!undated &&
        undated.scores.final < undated.scores.rrf &&
        !!dated &&
        dated.scores.final === dated.scores.rrf,
      { undated: undated?.scores, dated: dated?.scores },
    );

    const r3 = await search({
      query: "낚시 등산 이사",
      personIds: [chulsoo.id],
    });
    check(
      "인물 필터: 철수 연결 카드만",
      r3.hits.length > 0 &&
        r3.hits.every((h) => h.people.some((p) => p.id === chulsoo.id)),
      r3.hits.map((h) => h.summary),
    );
    const r4 = await search({ query: "낚시", kinds: ["PREFERENCE"] });
    check(
      "종류 필터: PREFERENCE 만",
      r4.hits.length > 0 && r4.hits.every((h) => h.kind === "PREFERENCE"),
      r4.hits.map((h) => h.kind),
    );

    const r5 = await search({ query: "다섯 가지 낚시 이야기" });
    check(
      "원본당 최대 3장(카드 5장인 원본)",
      r5.hits.filter((h) => h.sourceId === five.id).length === 3,
      r5.hits.filter((h) => h.sourceId === five.id).length,
    );

    const hinted = await searchWithQuestion(tmp, {
      query: "1970년에 낚시",
      useVector: false,
      limit: 20,
    });
    const h1970 = hinted.hits.find((h) => h.when.from === 1970);
    check(
      "질문 속 시기 → 가산점 힌트(필터 아님): 1970 카드 최종점 > RRF, 다른 해 카드도 남음",
      hinted.timeHint?.yearFrom === 1970 &&
        !!h1970 &&
        h1970.scores.final > h1970.scores.rrf &&
        hinted.hits.some((h) => h.when.from === 1985),
      {
        hint: hinted.timeHint,
        hits: hinted.hits.map((h) => [h.when.from, h.scores]),
      },
    );

    // 조회 시점 생존 확인 — 동기화 없이 원본 삭제.
    await prisma.userMemory.delete({ where: { id: fishing.id } });
    const r6 = await search({ query: "낚시" });
    check(
      "원본 삭제(동기화 전) → 그 카드 제외, 제외 수 기록",
      !r6.hits.some((h) => h.sourceId === fishing.id) &&
        r6.droppedDeadSource >= 1,
      { dropped: r6.droppedDeadSource },
    );

    // 인물 삭제(동기화 전) — 연결 인물 정리, 인물 필터로만 걸리던 카드는 제외(§12).
    await prisma.person.delete({ where: { id: chulsoo.id } });
    const r7 = await search({ query: "등산" });
    const hike = r7.hits.find((h) => h.summary.includes("등산"));
    check(
      "인물 삭제 → 카드는 남되 연결 인물 목록에서 빠짐",
      !!hike && hike.people.length === 0,
      hike?.people,
    );
    const r8 = await search({ query: "등산", personIds: [chulsoo.id] });
    check(
      "인물 삭제 → 그 인물로 필터한 검색에선 제외(인물 소멸 제외 수 기록)",
      r8.hits.length === 0 && r8.droppedDeadPerson >= 1,
      { hits: r8.hits.length, droppedDeadPerson: r8.droppedDeadPerson },
    );
    check(
      "인물 메모 원본(삭제된 인물) 카드 제외",
      !(await search({ query: "낚시 친구" })).hits.some(
        (h) => h.sourceType === "PERSON_MEMO",
      ),
    );
  } finally {
    await deleteAccountTx(tmp).catch(() =>
      prisma.user.deleteMany({ where: { id: tmp } }),
    );
  }
  check(
    "임시 사용자 lab 행 정리",
    (await prisma.memoryCard.count({ where: { userId: tmp } })) === 0,
  );

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
}

main()
  .catch((e) => {
    console.error(e);
    failed += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
