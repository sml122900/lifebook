// 기억 에이전트 R1-6·R1-7 — 원본 어댑터 7종 + 해시 비교 + 시기 컨텍스트 + 추출·동기화 검증.
//
// LLM 0 — 추출은 가짜 추출기를 끼워 동기화 흐름만 검사한다(실제 추출은 db/lab-sync.ts).
// 페르소나 A 원본은 읽기만 한다(검사 전후 원본 불변 확인). 색인 원장(MemorySourceUnit,
// lab 테이블)에는 비교 시나리오용 행을 잠깐 쓰고 지운다. R1-7 흐름(재추출·삭제·실패
// 재시도·탈퇴 캐스케이드)은 이 스크립트가 만들고 지우는 임시 사용자(wtest_labsync_*)로만.
// 전제: 페르소나 A 가 적재돼 있어야 한다 — 없으면 `npx tsx db/lab-seed-persona.ts`.
//
// 실행: npx tsx db/test-lab-sync.ts

import "dotenv/config";

import { deleteAccountTx } from "../lib/account-deletion";
import { prisma } from "../lib/db";
import { loadPeriodContext } from "../lib/lab/context";
import { locateQuote, type Extractor } from "../lib/lab/extract";
import { syncSubject, verifyStoredQuotes } from "../lib/lab/sync";
import {
  diffSources,
  diffUnits,
  summarizeDiff,
  type StoredUnit,
} from "../lib/lab/diff";
import { resolvePeriod } from "../lib/lab/period";
import {
  finalizeUnit,
  kstDate,
  loadSourceUnits,
  type SourceUnit,
} from "../lib/lab/sources";
import { PERSONA_A } from "./lab/personas/persona-a";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

const USER = PERSONA_A.userId;

function baseDraft(): Parameters<typeof finalizeUnit>[0] {
  return {
    sourceType: "LIFE_EVENT_MEMORY",
    sourceId: "x1",
    fields: { content: "첫째 딸이 태어났다." },
    title: "첫째 딸",
    yearFrom: 1983,
    yearTo: 1983,
    month: null,
    timeBasis: "SOURCE_FIELD",
    lifeStage: null,
    personIds: ["p1", "p2"],
    placeNames: ["대구"],
    extra: { category: "FAMILY" },
    createdAt: new Date("2026-08-01T01:00:00Z"),
  };
}

// 테스트 격리(2026-10-01): 페르소나 원장·카드는 읽기만 — 실행 전후 동일해야 한다.
async function personaLabSnapshot() {
  const [units, cards] = await Promise.all([
    prisma.memorySourceUnit.findMany({
      where: { userId: USER },
      select: { id: true, sourceHash: true, status: true, lastSyncedAt: true },
      orderBy: { id: "asc" },
    }),
    prisma.memoryCard.findMany({
      where: { userId: USER },
      select: { id: true, summary: true, yearFrom: true, yearTo: true },
      orderBy: { id: "asc" },
    }),
  ]);
  return JSON.stringify([units, cards]);
}

async function sourceSnapshot() {
  const [um, ep, le, ps, lp] = await Promise.all([
    prisma.userMemory.findMany({
      where: { userId: USER },
      select: { id: true, content: true, isDraft: true },
    }),
    prisma.episode.findMany({
      where: { lifeEvent: { userId: USER } },
      select: { id: true, content: true },
    }),
    prisma.lifeEvent.findMany({
      where: { userId: USER },
      select: { id: true, status: true, year: true },
    }),
    prisma.person.findMany({
      where: { userId: USER },
      select: { id: true, memo: true },
    }),
    prisma.lifeProfile.findUnique({
      where: { userId: USER },
      select: { hobbies: true },
    }),
  ]);
  const sortById = <T extends { id: string }>(xs: T[]) =>
    [...xs].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify([
    sortById(um),
    sortById(ep),
    sortById(le),
    sortById(ps),
    lp,
  ]);
}

async function main() {
  // ── 순수: 해시 ─────────────────────────────────────────────────
  const a = finalizeUnit(baseDraft());
  check(
    "해시: 같은 입력 → 같은 해시",
    finalizeUnit(baseDraft()).hash === a.hash,
  );
  check(
    "해시: 공백만 바뀐 수정은 같은 해시(정규화)",
    finalizeUnit({
      ...baseDraft(),
      fields: { content: "  첫째 딸이   태어났다. " },
    }).hash === a.hash,
  );
  check(
    "해시: 인물 순서만 바뀌면 같은 해시",
    finalizeUnit({ ...baseDraft(), personIds: ["p2", "p1"] }).hash === a.hash,
  );
  check(
    "해시: 본문이 바뀌면 다른 해시",
    finalizeUnit({ ...baseDraft(), fields: { content: "둘째 딸이 태어났다." } })
      .hash !== a.hash,
  );
  check(
    "해시: 인물 연결이 바뀌면 다른 해시",
    finalizeUnit({ ...baseDraft(), personIds: ["p1"] }).hash !== a.hash,
  );
  check(
    "해시: 연도가 바뀌면 다른 해시",
    finalizeUnit({ ...baseDraft(), yearFrom: 1984 }).hash !== a.hash,
  );
  check(
    "빈 필드는 버림",
    !(
      "memo" in
      finalizeUnit({ ...baseDraft(), fields: { content: "a", memo: "  " } })
        .fields
    ),
  );
  check(
    "sessionKey = KST 날짜(UTC 08-01 15:30 → 08-02)",
    kstDate(new Date("2026-08-01T15:30:00Z")) === "2026-08-02",
  );

  // ── 순수: 비교 ─────────────────────────────────────────────────
  const u = (id: string, hash: string): SourceUnit => ({
    ...finalizeUnit({ ...baseDraft(), sourceId: id }),
    hash,
  });
  const s = (id: string, hash: string, status = "ACTIVE"): StoredUnit => ({
    sourceType: "LIFE_EVENT_MEMORY",
    sourceId: id,
    sourceHash: hash,
    status,
    contextHash: null,
  });
  const d = diffUnits(
    [
      u("new", "h"),
      u("same", "h1"),
      u("chg", "h2"),
      u("revive", "h3"),
      u("empty", "h4"),
    ],
    [
      s("same", "h1"),
      s("chg", "old"),
      s("revive", "h3", "GONE"),
      s("empty", "h4", "EMPTY"),
      s("gone", "h5"),
      s("wasgone", "h6", "GONE"),
    ],
  );
  const ids = (xs: { sourceId: string }[]) =>
    xs
      .map((x) => x.sourceId)
      .sort()
      .join(",");
  check(
    "비교: 신규 = 원장에 없음 + GONE 이었다 되살아남",
    ids(d.new) === "new,revive",
    ids(d.new),
  );
  check("비교: 변경 = 해시 다름", ids(d.changed) === "chg", ids(d.changed));
  check(
    "비교: 그대로 = 해시 같음(EMPTY 포함)",
    ids(d.unchanged) === "empty,same",
    ids(d.unchanged),
  );
  check(
    "비교: 소멸 = 원본 사라짐(이미 GONE 은 다시 안 셈)",
    ids(d.gone) === "gone",
    ids(d.gone),
  );

  // ── DB: 페르소나 A 원본 어댑터 ─────────────────────────────────
  const persona = await prisma.user.findUnique({
    where: { id: USER },
    select: { id: true },
  });
  if (!persona) {
    check("페르소나 A 적재됨(없으면 db/lab-seed-persona.ts 먼저)", false);
    return;
  }
  const before = await sourceSnapshot();
  const labBefore = await personaLabSnapshot();
  const units = await loadSourceUnits(USER);
  const byType = (t: string) => units.filter((x) => x.sourceType === t);
  const counts = Object.fromEntries(
    [
      "SKELETON_EVENT",
      "EPISODE",
      "LIFE_EVENT_MEMORY",
      "ERA_MEMORY",
      "PHOTO_MEMORY",
      "PERSON_MEMO",
      "PROFILE",
    ].map((t) => [t, byType(t).length]),
  );
  check(
    "원본 26건: 골격 8(대학 SKIPPED 제외)·에피소드 7·사건 5(초안 제외)·시대 1·사진 0·인물 4(메모·만난 해 없는 미영 제외)·프로필 1",
    JSON.stringify(counts) ===
      JSON.stringify({
        SKELETON_EVENT: 8,
        EPISODE: 7,
        LIFE_EVENT_MEMORY: 5,
        ERA_MEMORY: 1,
        PHOTO_MEMORY: 0,
        PERSON_MEMO: 4,
        PROFILE: 1,
      }),
    counts,
  );

  const draft = await prisma.userMemory.findFirst({
    where: { userId: USER, isDraft: true },
    select: { id: true },
  });
  const bridges = await prisma.userMemory.findMany({
    where: { userId: USER, createdVia: "episode" },
    select: { id: true },
  });
  const skipped = await prisma.lifeEvent.findFirst({
    where: { userId: USER, status: "SKIPPED" },
    select: { id: true },
  });
  const unitIds = new Set(units.map((x) => x.sourceId));
  check("제외: 미승인 초안(탈영병)", !!draft && !unitIds.has(draft.id));
  check(
    "제외: 에피소드 브릿지 UserMemory 7건(연도 placeholder)",
    bridges.length === 7 && bridges.every((b) => !unitIds.has(b.id)),
  );
  check("제외: SKIPPED 골격(대학)", !!skipped && !unitIds.has(skipped.id));

  const people = await prisma.person.findMany({
    where: { userId: USER },
    select: { id: true, name: true },
  });
  const pid = (name: string) => people.find((p) => p.name === name)?.id;
  const ep = (needle: string) =>
    byType("EPISODE").find((x) => (x.fields.content ?? "").includes(needle));
  const high = ep("경운기");
  check(
    "에피소드 고교: 연도 = 정정 입학 1972 ~ 1974(재학 기간), 단계 HIGH",
    high?.yearFrom === 1972 &&
      high.yearTo === 1974 &&
      high.lifeStage === "HIGH",
    high && { f: high.yearFrom, t: high.yearTo, s: high.lifeStage },
  );
  const newly = ep("비산동");
  check(
    "에피소드 신혼(isPeriod): 1981 ~ 다음 골격(1998) 직전 1997",
    newly?.yearFrom === 1981 && newly.yearTo === 1997,
    newly && { f: newly.yearFrom, t: newly.yearTo },
  );
  const mil = ep("화천");
  check(
    "에피소드 군대: 인물 = 용철, 장소 = 강원도 화천, 1976~1978",
    !!mil &&
      JSON.stringify(mil.personIds) === JSON.stringify([pid("용철")]) &&
      mil.placeNames[0] === "강원도 화천" &&
      mil.yearFrom === 1976 &&
      mil.yearTo === 1978,
    mil && { p: mil.personIds, pl: mil.placeNames },
  );
  const elem = ep("낙동강");
  check(
    "에피소드 국민학교: 원문 인용 필드(rawTranscript)에 인물 머리줄·[본인] 발화",
    !!elem &&
      elem.fields.rawTranscript?.startsWith("[이 이야기의 인물] 봉구") ===
        true &&
      (elem.fields.rawTranscript ?? "").includes("[본인]"),
  );
  check(
    "에피소드 국민학교: sessionKey = 2일차(2026-08-02)",
    elem?.sessionKey === "2026-08-02",
    elem?.sessionKey,
  );
  const skHigh = byType("SKELETON_EVENT").find((x) => x.lifeStage === "HIGH");
  check(
    "골격 고교: 정정 라벨·연도(농업고등학교 입학, 1972)",
    skHigh?.fields.label === "농업고등학교 입학" && skHigh.yearFrom === 1972,
    skHigh?.fields,
  );
  const skMar = byType("SKELETON_EVENT").find(
    (x) => x.lifeStage === "MARRIAGE",
  );
  check(
    "골격 결혼: 인물 연결(PersonLifeEvent) = 정숙",
    !!skMar && skMar.personIds.includes(pid("정숙") ?? "?"),
  );
  const hike = byType("LIFE_EVENT_MEMORY").find((x) =>
    (x.fields.content ?? "").includes("허리"),
  );
  check(
    "사건 허리 수술: 카테고리 없음 → 단계 없음, 인물 = 봉구, 8일차",
    hike?.lifeStage === null &&
      JSON.stringify(hike.personIds) === JSON.stringify([pid("봉구")]) &&
      hike.sessionKey === "2026-08-08",
    hike && { s: hike.lifeStage, p: hike.personIds, k: hike.sessionKey },
  );
  const era = byType("ERA_MEMORY")[0];
  check(
    "시대 사건 회상: 서울올림픽 1988년 9월, 본문 = 본인 회상",
    era?.title === "서울올림픽" &&
      era.yearFrom === 1988 &&
      era.month === 9 &&
      (era.fields.content ?? "").includes("전파사"),
    era && { t: era.title, y: era.yearFrom, m: era.month },
  );
  const donghui = byType("PERSON_MEMO").find((x) => x.title === "동희");
  check(
    "인물 메모 동희: 원문 그대로(민감정보 거르기는 추출 단계 몫)",
    !!donghui && (donghui.fields.memo ?? "").includes("수성구"),
  );
  const profile = byType("PROFILE")[0];
  check(
    "프로필: 취미·좋아하는 음악·사용자 취향, 1일차",
    profile?.fields.hobbies === "등산, 화투" &&
      profile.fields.favMusic === "나훈아" &&
      profile.fields.userPreferences === "산, 트로트" &&
      profile.sessionKey === "2026-08-01",
    profile?.fields,
  );
  const again = await loadSourceUnits(USER);
  check(
    "결정적: 두 번 읽어도 해시 동일",
    JSON.stringify(units.map((x) => x.hash).sort()) ===
      JSON.stringify(again.map((x) => x.hash).sort()),
  );

  // ── DB: 시기 컨텍스트 ─────────────────────────────────────────
  const { ctx } = await loadPeriodContext(USER);
  check(
    "컨텍스트: 출생연도 1955(OnboardingProfile)",
    ctx.birthYear === 1955,
    ctx.birthYear,
  );
  check(
    "컨텍스트: 앵커 = 확정 골격(정정 반영)",
    JSON.stringify(Object.entries(ctx.anchors).sort()) ===
      JSON.stringify(
        Object.entries({
          ELEMENTARY: { start: 1962 },
          MIDDLE: { start: 1968 },
          HIGH: { start: 1972 },
          MILITARY: { start: 1976 },
          FIRST_JOB: { start: 1979 },
          MARRIAGE: { start: 1981 },
        }).sort(),
      ),
    ctx.anchors,
  );
  check(
    "컨텍스트: 건너뜀 = 대학",
    JSON.stringify(ctx.skipped) === JSON.stringify(["UNIVERSITY"]),
    ctx.skipped,
  );
  check(
    "컨텍스트: 시대 사건 목록에 서울올림픽·IMF",
    (ctx.eras ?? []).some((e) => e.title === "서울올림픽") &&
      (ctx.eras ?? []).some((e) => e.title.includes("IMF")),
  );
  const militaryRange = resolvePeriod("군대 있을 때", ctx);
  check(
    "실제 컨텍스트로 해석: 군대 있을 때 → 1976~1978",
    militaryRange.ok &&
      militaryRange.yearFrom === 1976 &&
      militaryRange.yearTo === 1978,
    militaryRange,
  );
  const imf = resolvePeriod("IMF 때", ctx);
  check(
    "실제 컨텍스트로 해석: IMF 때 → 1997~1998",
    imf.ok && imf.yearFrom === 1997 && imf.yearTo === 1998,
    imf,
  );

  // ── DB: 페르소나 원장 비교 — 읽기만(실제 색인을 건드리지 않는다) ──
  // 원장 조작 시나리오(변경·소멸·GONE·컨텍스트 변화)는 임시 사용자 흐름(r17SyncFlow)에서.
  const dp = await diffSources(USER);
  check(
    "페르소나 비교: 원본 26건 = 신규 + 변경 + 그대로(동기화 상태와 무관)",
    dp.new.length + dp.changed.length + dp.unchanged.length === 26 &&
      summarizeDiff(dp).total === 26,
    summarizeDiff(dp),
  );

  // ── 원본 읽기 전용 ─────────────────────────────────────────────
  check(
    "원본 불변: 검사 전후 원본 행·본문 동일",
    (await sourceSnapshot()) === before,
  );

  await r17QuoteLocation();
  await r17SyncFlow();

  check(
    "테스트 격리: 실행 전후 페르소나 원장·카드 불변(임시 사용자 흐름 포함)",
    (await personaLabSnapshot()) === labBefore,
  );
}

// ── R1-7: 인용 위치 검증(순수) ──────────────────────────────────
async function r17QuoteLocation() {
  const unit = finalizeUnit({
    ...baseDraft(),
    sourceType: "EPISODE",
    fields: {
      content: "봉구와 멱을 감았다.",
      rawTranscript:
        "[이 이야기의 인물] 봉구\n[동반자] 어디서 노셨어요?\n[본인] 낙동강 가서 멱 감았지.\n[동반자] 재밌으셨겠어요.",
    },
  });
  const ok = locateQuote(unit, "rawTranscript", "낙동강 가서 멱 감았지");
  check(
    "인용: [본인] 발화 안 → 위치 반환, 구간 = 인용",
    !!ok && unit.fields.rawTranscript.slice(ok.start, ok.end) === ok.quote,
    ok,
  );
  check(
    "인용: [동반자] 발화 → 거부",
    locateQuote(unit, "rawTranscript", "어디서 노셨어요?") === null,
  );
  check(
    "인용: 인물 머리줄 → 거부",
    locateQuote(unit, "rawTranscript", "봉구") === null,
  );
  check(
    "인용: 화자 표시를 넘나드는 구간 → 거부",
    locateQuote(unit, "rawTranscript", "감았지. [동반자] 재밌") === null,
  );
  check(
    "인용: 원문에 없는 글 → 거부",
    locateQuote(unit, "content", "봉구와 수영했다") === null,
  );
  check("인용: 없는 필드 → 거부", locateQuote(unit, "memo", "봉구") === null);
  check(
    "인용: 공백 차이는 정규화로 허용",
    locateQuote(unit, "content", "봉구와  멱을\n감았다") !== null,
  );
}

// ── R1-7: 동기화 흐름(가짜 추출기, 임시 사용자) ────────────────────
async function r17SyncFlow() {
  const ts = Date.now();
  const tmp = `wtest_labsync_${ts}`;
  let calls = 0;
  let failNext = false;
  // 원문 앞 5글자를 인용하는 카드 1장 — 동기화 흐름만 보려는 가짜 추출기.
  const fake: Extractor = async (unit) => {
    calls += 1;
    if (failNext) throw new Error("가짜 추출 실패");
    const field = unit.fields.content ? "content" : "memo";
    const text = unit.fields[field];
    return {
      cards: [
        {
          kind: "FACT",
          summary: "화자 테스트 카드.",
          quote: text.slice(0, 5),
          quoteField: field,
          quoteStart: 0,
          quoteEnd: 5,
          yearFrom: unit.yearFrom,
          yearTo: unit.yearTo,
          month: null,
          timePrecision: "YEAR",
          timeBasis: "SOURCE_FIELD",
          timeExpression: null,
          lifeStage: null,
          personIds: [],
          personMentions: [],
          placeNames: [],
          keywords: [],
          extractorModel: "fake",
        },
      ],
      llm: true,
      droppedQuote: 0,
      droppedSensitive: 0,
    };
  };
  const run = () => syncSubject(tmp, { extractor: fake, embed: false });
  const cardsOf = (sourceId: string) =>
    prisma.memoryCard.findMany({ where: { userId: tmp, sourceId } });

  await prisma.user.create({
    data: {
      id: tmp,
      email: `withdrawal-test-labsync-${ts}@test`,
      name: "labsync",
    },
  });
  try {
    await prisma.onboardingProfile.create({
      data: { userId: tmp, birthYear: 1950, region: "서울" },
    });
    await prisma.lifeEvent.create({
      data: {
        userId: tmp,
        type: "ELEM_SCHOOL",
        label: "국민학교 입학",
        year: 1957,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        sequenceOrder: 1,
      },
    });
    const mem = await prisma.userMemory.create({
      data: {
        userId: tmp,
        createdVia: "life_event",
        year: 1970,
        title: "첫 월급",
        eventTitle: "첫 월급",
        eventYear: 1970,
        content: "첫 월급으로 라디오를 샀다.",
        precision: "APPROXIMATE",
        category: "WORK",
      },
    });
    await prisma.person.create({
      data: {
        userId: tmp,
        name: "철수",
        relation: "친구",
        metYear: 1957,
        memo: "같은 동네 살던 친구.",
      },
    });

    const r1 = await run();
    check(
      "1회차: 원본 3건 신규 — LLM 2(사건·인물 메모)·규칙 1(골격), 카드 4(인물 만난 해 규칙 카드 포함)",
      calls === 2 &&
        r1.units.new === 3 &&
        r1.llmUnits === 2 &&
        r1.deterministicUnits === 1 &&
        r1.cardsCreated === 4,
      { calls, r1 },
    );

    calls = 0;
    const r2 = await run();
    check(
      "2회차(원본 그대로): 추출 호출 0, 카드 변화 0",
      calls === 0 &&
        r2.units.unchanged === 3 &&
        r2.cardsCreated === 0 &&
        r2.cardsDeleted === 0,
      { calls, r2 },
    );

    await prisma.userMemory.update({
      where: { id: mem.id },
      data: { content: "어머니 신발을 첫 월급으로 샀다." },
    });
    calls = 0;
    const r3 = await run();
    const replaced = await cardsOf(mem.id);
    check(
      "본문 수정 → 그 원본만 재추출(호출 1), 옛 카드 교체",
      calls === 1 &&
        r3.units.changed === 1 &&
        r3.cardsDeleted === 1 &&
        r3.cardsCreated === 1,
      { calls, r3 },
    );
    check(
      "교체된 카드의 인용 = 새 본문",
      replaced.length === 1 && replaced[0].quote === "어머니 신",
      replaced[0]?.quote,
    );

    const q = await verifyStoredQuotes(tmp);
    check(
      "인용 검증: 저장된 카드 전부 원문 구간과 글자 그대로 일치",
      q.llmCards === 2 &&
        q.llmVerbatim === 2 &&
        q.deterministicVerbatim === q.deterministicCards,
      q,
    );

    // 삭제 전파(2026-10-01): mem 카드를 인용한 run A 는 비워지고, 다른 원본만 인용한 run B 는 그대로.
    const memCard = (await cardsOf(mem.id))[0];
    const otherCard = await prisma.memoryCard.findFirst({
      where: { userId: tmp, sourceType: "PERSON_MEMO" },
    });
    const runA = await prisma.labAgentRun.create({
      data: {
        userId: tmp,
        source: "EVAL",
        question: "첫 월급으로 뭘 샀지?",
        answer: { text: "어머니 신발을 사셨어요 [1]" },
        citedCardIds: [memCard.id, otherCard!.id],
        model: "fake",
        costMicroUsd: 123,
      },
    });
    const runB = await prisma.labAgentRun.create({
      data: {
        userId: tmp,
        source: "EVAL",
        question: "철수는 누구지?",
        answer: { text: "같은 동네 친구예요 [1]" },
        citedCardIds: [otherCard!.id],
        model: "fake",
        costMicroUsd: 45,
      },
    });

    await prisma.userMemory.delete({ where: { id: mem.id } });
    const r4 = await run();
    const [ra, rb] = await Promise.all([
      prisma.labAgentRun.findUnique({ where: { id: runA.id } }),
      prisma.labAgentRun.findUnique({ where: { id: runB.id } }),
    ]);
    check(
      "삭제 전파: 지운 원본 카드를 인용한 run → 답변 비움·인용 id 제거, 질문·원가 유지",
      r4.runsRedacted === 1 &&
        (ra?.answer as { redacted?: boolean } | null)?.redacted === true &&
        !ra!.citedCardIds.includes(memCard.id) &&
        ra!.citedCardIds.includes(otherCard!.id) &&
        ra!.question === "첫 월급으로 뭘 샀지?" &&
        ra!.costMicroUsd === 123,
      { runsRedacted: r4.runsRedacted, ra },
    );
    check(
      "삭제 전파: 다른 원본만 인용한 run 은 그대로",
      JSON.stringify(rb?.answer) ===
        JSON.stringify({ text: "같은 동네 친구예요 [1]" }) &&
        rb!.citedCardIds.length === 1,
      rb,
    );
    const goneUnit = await prisma.memorySourceUnit.findFirst({
      where: { userId: tmp, sourceId: mem.id },
    });
    check(
      "원본 삭제 → 원장 GONE + 그 원본 카드 삭제",
      r4.units.gone === 1 &&
        r4.cardsDeleted === 1 &&
        goneUnit?.status === "GONE" &&
        (await cardsOf(mem.id)).length === 0,
      { r4, status: goneUnit?.status },
    );

    const mem2 = await prisma.userMemory.create({
      data: {
        userId: tmp,
        createdVia: "life_event",
        year: 1975,
        title: "이사",
        eventTitle: "이사",
        eventYear: 1975,
        content: "서울로 이사를 왔다.",
        precision: "APPROXIMATE",
        category: "FAMILY",
      },
    });
    failNext = true;
    const r5 = await run();
    const errUnit = await prisma.memorySourceUnit.findFirst({
      where: { userId: tmp, sourceId: mem2.id },
    });
    check(
      "추출 실패 → 오류 기록, 원장 ERROR·해시 비움(다음에 재시도), 카드 0",
      r5.errors.length === 1 &&
        errUnit?.status === "ERROR" &&
        errUnit.sourceHash === "" &&
        (await cardsOf(mem2.id)).length === 0,
      { errors: r5.errors, status: errUnit?.status },
    );
    check(
      "이미 GONE 표시된 원장은 다시 소멸로 안 셈",
      r5.units.gone === 0,
      r5.units,
    );
    const sum = summarizeDiff(await diffSources(tmp));
    const lifeRow = sum.byType.find(
      (r) => r.sourceType === "LIFE_EVENT_MEMORY",
    );
    check(
      "요약: 유형별 집계(사건 변경 1 = ERROR 원장 재시도 대기)",
      sum.total === 3 && lifeRow?.changed === 1 && lifeRow.gone === 0,
      lifeRow,
    );
    failNext = false;
    const r6 = await run();
    const recovered = await prisma.memorySourceUnit.findFirst({
      where: { userId: tmp, sourceId: mem2.id },
    });
    check(
      "다음 동기화에서 재시도 → 정상(ACTIVE, 카드 1)",
      r6.units.changed === 1 &&
        recovered?.status === "ACTIVE" &&
        (await cardsOf(mem2.id)).length === 1,
      { r6: r6.units, status: recovered?.status },
    );

    // 출생연도 정정 → 시기 컨텍스트 변화 감지 → 동기화가 원장 contextHash 갱신(LLM 0).
    await prisma.onboardingProfile.update({
      where: { userId: tmp },
      data: { birthYear: 1951 },
    });
    check(
      "시기 컨텍스트 변화 감지(출생연도 정정)",
      (await diffSources(tmp)).contextChanged,
    );
    calls = 0;
    await run();
    check(
      "동기화 후 컨텍스트 변화 해소, 추출 호출 0",
      calls === 0 && !(await diffSources(tmp)).contextChanged,
      { calls },
    );

    await deleteAccountTx(tmp);
    const [unitsLeft, cardsLeft] = await Promise.all([
      prisma.memorySourceUnit.count({ where: { userId: tmp } }),
      prisma.memoryCard.count({ where: { userId: tmp } }),
    ]);
    check(
      "탈퇴(deleteAccountTx) → lab 원장·카드 0(FK Cascade)",
      unitsLeft === 0 && cardsLeft === 0,
      { unitsLeft, cardsLeft },
    );
  } finally {
    await prisma.user.deleteMany({ where: { id: tmp } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    failed += 1;
  })
  .finally(async () => {
    console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
