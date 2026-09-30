// 기억 에이전트 R1-6 — 원본 어댑터 7종 + 해시 비교 + 시기 컨텍스트 검증 (LLM 0).
//
// 원본은 읽기만 한다(검사 전후 원본 행 수·해시 불변 확인). 색인 원장(MemorySourceUnit,
// lab 테이블)에만 비교 시나리오용 행을 잠깐 쓰고 끝에 지운다.
// 전제: 페르소나 A 가 적재돼 있어야 한다 — 없으면 `npx tsx db/lab-seed-persona.ts`.
// (R1-7 추출이 붙으면 삭제 즉시 카드 제외·재추출·탈퇴 캐스케이드 검사를 이 파일에 더한다.)
//
// 실행: npx tsx db/test-lab-sync.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { loadPeriodContext } from "../lib/lab/context";
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
  const { ctx, contextHash } = await loadPeriodContext(USER);
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

  // ── DB: 원장 비교(원장 행은 잠깐 쓰고 지움) ────────────────────
  await prisma.memorySourceUnit.deleteMany({ where: { userId: USER } });
  try {
    const d0 = await diffSources(USER);
    check(
      "원장 비어 있음 → 26건 전부 신규, 컨텍스트 변화 없음",
      d0.new.length === 26 &&
        d0.changed.length + d0.unchanged.length + d0.gone.length === 0 &&
        !d0.contextChanged,
    );

    const now = new Date();
    await prisma.memorySourceUnit.createMany({
      data: units.map((x) => ({
        userId: USER,
        sourceType: x.sourceType,
        sourceId: x.sourceId,
        sourceHash: x.hash,
        contextHash,
        status: "ACTIVE",
        extractorVersion: "test",
        lastSyncedAt: now,
      })),
    });
    const d1 = await diffSources(USER);
    check(
      "원장 = 현재 해시 → 26건 그대로",
      d1.unchanged.length === 26 &&
        d1.new.length + d1.changed.length + d1.gone.length === 0,
    );

    const target = units.find((x) => x.sourceType === "EPISODE")!;
    await prisma.memorySourceUnit.updateMany({
      where: { userId: USER, sourceId: target.sourceId },
      data: { sourceHash: "stale" },
    });
    await prisma.memorySourceUnit.create({
      data: {
        userId: USER,
        sourceType: "LIFE_EVENT_MEMORY",
        sourceId: "lab-test-gone",
        sourceHash: "x",
        status: "ACTIVE",
        extractorVersion: "test",
        lastSyncedAt: now,
      },
    });
    const d2 = await diffSources(USER);
    check(
      "해시 다른 원장 1건 → 변경 1",
      d2.changed.length === 1 && d2.changed[0].sourceId === target.sourceId,
    );
    check(
      "원본 없는 원장 1건 → 소멸 1",
      d2.gone.length === 1 && d2.gone[0].sourceId === "lab-test-gone",
    );
    const sum = summarizeDiff(d2);
    const epRow = sum.byType.find((r) => r.sourceType === "EPISODE");
    check(
      "요약: 유형별 집계(에피소드 변경 1·그대로 6)",
      sum.total === 26 && epRow?.changed === 1 && epRow.unchanged === 6,
      epRow,
    );

    await prisma.memorySourceUnit.updateMany({
      where: { userId: USER, sourceId: "lab-test-gone" },
      data: { status: "GONE" },
    });
    check(
      "이미 GONE 표시된 원장은 다시 소멸로 안 셈",
      (await diffSources(USER)).gone.length === 0,
    );

    await prisma.memorySourceUnit.updateMany({
      where: { userId: USER, sourceId: units[0].sourceId },
      data: { contextHash: "old-context" },
    });
    check(
      "원장 contextHash 가 현재와 다르면 컨텍스트 변화 감지",
      (await diffSources(USER)).contextChanged,
    );
  } finally {
    await prisma.memorySourceUnit.deleteMany({ where: { userId: USER } });
  }
  check(
    "원장 테스트 행 정리",
    (await prisma.memorySourceUnit.count({ where: { userId: USER } })) === 0,
  );

  // ── 원본 읽기 전용 ─────────────────────────────────────────────
  check(
    "원본 불변: 검사 전후 원본 행·본문 동일",
    (await sourceSnapshot()) === before,
  );
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
