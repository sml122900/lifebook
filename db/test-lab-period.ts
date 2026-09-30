// 기억 에이전트 R1-4 — 시기 해석기 resolvePeriod 검증 (LLM·DB 0).
//
// 컨텍스트는 동결된 페르소나 A(db/lab/personas/persona-a.ts) 골격에서 그대로 조립한다
// — 골든셋 PERIOD 문항이 기대는 연도와 해석기가 같은 사실을 보도록.
// 시대 사건은 MonthEvent 실제 제목·연도(2026-09-30 조회값)를 고정 목록으로 쓴다.
//
// 실행: npx tsx db/test-lab-period.ts

import { PERSONA_A } from "./lab/personas/persona-a";
import {
  LIFE_EVENT_TYPE_STAGE,
  resolvePeriod,
  type LifeStage,
  type PeriodContext,
  type PeriodResult,
} from "../lib/lab/period";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

// 골격 → 앵커/건너뜀 (실제 조립기는 R1-6 원본 어댑터에서, 같은 규칙).
const anchors: PeriodContext["anchors"] = {};
const skipped: LifeStage[] = [];
for (const ev of PERSONA_A.skeleton) {
  const stage = LIFE_EVENT_TYPE_STAGE[ev.type];
  if (!stage) continue;
  if (ev.status === "SKIPPED") skipped.push(stage);
  else {
    const start =
      ("correctedYear" in ev ? ev.correctedYear : undefined) ?? ev.year;
    if (start != null) anchors[stage] = { start };
  }
}
const ERAS = [
  { title: "서울올림픽", year: 1988 },
  { title: "IMF 외환위기", year: 1997 },
  { title: "IMF 실직·명예퇴직", year: 1998 },
  { title: "베이징 올림픽", year: 2008 },
  { title: "평창 동계올림픽", year: 2018 },
  { title: "올림픽 '코리아하우스' 화제", year: 2026 },
];
const CTX: PeriodContext = {
  birthYear: PERSONA_A.onboardingProfile.birthYear,
  anchors,
  skipped,
  eras: ERAS,
  currentYear: 2026,
};

function expectRange(
  expr: string,
  from: number,
  to: number,
  basis: string,
  ctx: PeriodContext = CTX,
): void {
  const r: PeriodResult = resolvePeriod(expr, ctx);
  check(
    `"${expr}" → ${from}${from === to ? "" : `~${to}`} (${basis})`,
    r.ok && r.yearFrom === from && r.yearTo === to && r.basis === basis,
    r,
  );
}
function expectFail(expr: string, why: RegExp, ctx: PeriodContext = CTX): void {
  const r = resolvePeriod(expr, ctx);
  check(`"${expr}" → 해석 불가(${why.source})`, !r.ok && why.test(r.reason), r);
}

function main() {
  // 컨텍스트 조립이 페르소나 사실과 맞는지(정정 연도 반영, 대학 건너뜀).
  check(
    "페르소나 A 앵커: 국민 1962·중 1968·고 1972(정정)·군 1976(정정)·첫 직장 1979·결혼 1981",
    JSON.stringify(anchors) ===
      JSON.stringify({
        ELEMENTARY: { start: 1962 },
        MIDDLE: { start: 1968 },
        HIGH: { start: 1972 },
        MILITARY: { start: 1976 },
        FIRST_JOB: { start: 1979 },
        MARRIAGE: { start: 1981 },
      }),
    anchors,
  );
  check(
    "페르소나 A 건너뜀: 대학",
    JSON.stringify(skipped) === JSON.stringify(["UNIVERSITY"]),
    skipped,
  );

  // ── 인생 단계(본인 기록) — 골든셋 A-T1·T2·T3·T5 가 기대는 범위 ──
  expectRange("국민학교 때", 1962, 1967, "SKELETON");
  expectRange("초등학교 다닐 때", 1962, 1967, "SKELETON");
  expectRange("초등 때", 1962, 1967, "SKELETON");
  expectRange("국민학교 3학년 때", 1964, 1964, "SKELETON");
  expectRange("국민학교 삼학년", 1964, 1964, "SKELETON");
  expectFail("국민학교 7학년", /재학 기간 밖/);
  expectRange("국민학교 입학할 때", 1962, 1962, "SKELETON");
  expectRange("국민학교 졸업할 때", 1967, 1967, "SKELETON");
  expectRange("중학교 때", 1968, 1970, "SKELETON");
  expectRange("중학 때", 1968, 1970, "SKELETON");
  expectRange("고등학교 때", 1972, 1974, "SKELETON");
  expectRange("농고 다닐 때", 1972, 1974, "SKELETON");
  expectRange("군대 있을 때", 1976, 1978, "SKELETON");
  expectRange("군 생활 할 때", 1976, 1978, "SKELETON");
  expectRange("입대할 때", 1976, 1976, "SKELETON");
  expectRange("제대하고 나서", 1978, 1978, "SKELETON");
  expectFail("대학 다닐 때", /건너뛴/);
  expectRange("첫 직장 다닐 때", 1979, 1982, "SKELETON");
  expectRange("입사할 때", 1979, 1979, "SKELETON");
  expectRange("결혼할 때", 1981, 1981, "SKELETON");
  expectRange("결혼하고 나서", 1981, 1986, "SKELETON");
  expectRange("신혼 때", 1981, 1983, "SKELETON");
  expectRange("결혼 전", 1976, 1980, "SKELETON");
  expectRange("장가가기 전에", 1976, 1980, "SKELETON");
  const stage = resolvePeriod("군대 있을 때", CTX);
  check(
    "단계 결과에 lifeStage 표시",
    stage.ok && stage.lifeStage === "MILITARY",
    stage,
  );
  expectFail("국민학교 동창이랑 군대 갔을 때", /여러 시기/);
  // "제대로"(부사)는 군대가 아니다.
  expectFail("제대로 기억은 안 나는데", /해석할 수 있는 표현이 없음/);

  // ── 나이 표현 — A-T3 "스무 살 무렵" ──
  expectRange("스무 살 무렵", 1973, 1975, "AGE_EXPR");
  expectRange("20살 때", 1973, 1975, "AGE_EXPR");
  expectRange("스무살", 1973, 1975, "AGE_EXPR");
  expectRange("만 스무 살", 1975, 1976, "AGE_EXPR");
  expectRange("열일곱 살", 1970, 1972, "AGE_EXPR");
  expectRange("스물다섯 살 때", 1978, 1980, "AGE_EXPR");
  expectRange("세 살 때", 1956, 1958, "AGE_EXPR");
  expectRange("서른 무렵", 1983, 1985, "AGE_EXPR");
  expectRange("쉰 즈음", 2003, 2005, "AGE_EXPR");
  expectRange("20대", 1973, 1984, "AGE_EXPR");
  expectFail("쉬는 날에", /해석할 수 있는 표현이 없음/);
  expectFail("3세대 가족", /해석할 수 있는 표현이 없음/);

  // ── 명시 연도·연대·범위(가장 우선) — A-T4 "1979년" ──
  expectRange("1979년에", 1979, 1979, "NUMERIC");
  expectRange("79년에", 1979, 1979, "NUMERIC");
  expectRange("85년쯤", 1984, 1986, "NUMERIC");
  expectRange("1985년 전후", 1984, 1986, "NUMERIC");
  expectRange("02년", 2002, 2002, "NUMERIC");
  expectRange("80년대", 1980, 1989, "NUMERIC");
  expectRange("1980년대 초반", 1980, 1983, "NUMERIC");
  expectRange("80년대 중반", 1984, 1986, "NUMERIC");
  expectRange("80년대 말", 1987, 1989, "NUMERIC");
  expectRange("1979년부터 1982년까지", 1979, 1982, "NUMERIC");
  expectRange("79~82년", 1979, 1982, "NUMERIC");
  expectRange("1985년 결혼하고", 1985, 1985, "NUMERIC");
  expectFail("10년 전에", /해석할 수 있는 표현이 없음/);
  expectFail("2년 동안", /해석할 수 있는 표현이 없음/);
  expectFail("20세기", /해석할 수 있는 표현이 없음/);

  // ── 어릴 때 ──
  expectRange("어릴 때", 1955, 1967, "DEFAULT_AGE");

  // ── 현재(요즘·지금도) — 올해(2026) 기준 최근 3년 ──
  expectRange("요즘", 2024, 2026, "PRESENT");
  expectRange("지금도 매주", 2024, 2026, "PRESENT");
  expectRange("1985년 요즘 노래", 1985, 1985, "NUMERIC");

  // ── 시대 사건 — A-F5 "IMF 때" ──
  expectRange("IMF 때", 1997, 1998, "ERA");
  expectRange("imf 터졌을 때", 1997, 1998, "ERA");
  expectRange("서울올림픽 때", 1988, 1988, "ERA");
  expectFail("올림픽 때", /여러 시대 사건/);

  // ── 기록 없음 → 출생연도 기본값(추정 표기) ──
  const noAnchors: PeriodContext = {
    birthYear: 1955,
    anchors: {},
    currentYear: 2026,
  };
  expectRange("국민학교 때", 1962, 1967, "DEFAULT_AGE", noAnchors);
  expectRange("군대 있을 때", 1975, 1977, "DEFAULT_AGE", noAnchors);
  const est = resolvePeriod("군대 있을 때", noAnchors);
  check(
    "기본값 추정은 note 로 '추정' 표기",
    est.ok && /추정/.test(est.note ?? ""),
    est,
  );
  expectFail("결혼하고 나서", /결혼 기록이 없어/, noAnchors);
  expectFail("첫 직장 다닐 때", /첫 직장 기록이 없어/, noAnchors);

  // ── 출생연도도 모름 ──
  const nothing: PeriodContext = {
    birthYear: null,
    anchors: {},
    currentYear: 2026,
  };
  expectFail("스무 살 때", /출생연도를 몰라/, nothing);
  expectFail("국민학교 때", /기록이 없어/, nothing);
  expectFail("어릴 때", /출생연도를 몰라/, nothing);
  expectRange("1979년", 1979, 1979, "NUMERIC", nothing);

  // ── 기간 끝(end) 앵커 우선 ──
  const withEnd: PeriodContext = {
    birthYear: 1955,
    anchors: { MILITARY: { start: 1976, end: 1979 } },
  };
  expectRange("군대 있을 때", 1976, 1979, "SKELETON", withEnd);
  expectRange("제대할 때", 1979, 1979, "SKELETON", withEnd);

  // ── 해석 불가 ──
  expectFail("", /빈 표현/);
  expectFail("그냥 옛날에", /해석할 수 있는 표현이 없음/);

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
