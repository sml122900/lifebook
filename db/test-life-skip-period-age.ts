// Phase L2(+) 검증 — 통합 테스트 1단계 개선 3종.
//
// (1) 건너뛰기 상태 기록 + nextUnansweredCategory 누락 케이스
// (2) 기간 카테고리 endYear (시작·끝 두 점 — 헬퍼 단에서 같은 행 보존)
// (3) 나이 계산 (lib/age.ts)
//
// 실행: npx tsx db/test-life-skip-period-age.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  calcAge,
  calcSchoolYears,
  formatAge,
  schoolYearsForCategory,
} from "../lib/age";
import {
  CREATED_VIA_LIFE_EVENT,
  getBirthYear,
  getSkippedCategories,
  isPeriodCategory,
  markCategorySkipped,
  unmarkCategorySkipped,
  upsertLifeEvent,
} from "../lib/life-events";
import { nextUnansweredCategory } from "../lib/life-record/questions";
import type { LifeCategory } from "../lib/generated/prisma/enums";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `l2plus-${Date.now()}@test`, name: "alice" },
    select: { id: true },
  });

  const failures: string[] = [];
  const check = (label: string, ok: boolean) => {
    console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
    if (!ok) failures.push(label);
  };

  try {
    // ──────────────────────────────────────────────────────────────
    // (1) 건너뛰기 + nextUnansweredCategory
    // ──────────────────────────────────────────────────────────────
    console.log("\n[1) 건너뛰기 상태 기록]");

    // 빈 상태 — skipped = ∅
    let skipped = await getSkippedCategories(alice.id);
    check("초기 건너뜀 셋 빈 셋", skipped.size === 0);

    // 사용자가 ELEMENTARY 을 건너뜀
    await markCategorySkipped(alice.id, "ELEMENTARY");
    skipped = await getSkippedCategories(alice.id);
    check("ELEMENTARY 건너뜀 반영", skipped.has("ELEMENTARY"));

    // idempotent — 같은 카테고리 두 번 markSkipped 해도 1번만
    await markCategorySkipped(alice.id, "ELEMENTARY");
    skipped = await getSkippedCategories(alice.id);
    check("같은 카테고리 두 번 markSkipped 해도 size=1", skipped.size === 1);

    // 시나리오: ELEMENTARY 건너뛰고 → MILITARY, WORK 답 → RELATIONSHIP 건너뛰고
    // 다음 미답이 BIRTH(첫 카테고리)면 정상. ELEMENTARY 이 다시 잡히면 버그.
    await markCategorySkipped(alice.id, "RELATIONSHIP");
    const answered = new Set<LifeCategory>(["MILITARY", "WORK"]);
    skipped = await getSkippedCategories(alice.id);
    const next1 = nextUnansweredCategory(answered, skipped);
    check("미답 첫 카테고리는 BIRTH (ELEMENTARY 건너뜀 무시 X)", next1 === "BIRTH");

    // 인위적으로 BIRTH, KINDERGARTEN 도 답한 셋
    const answered2 = new Set<LifeCategory>([
      "BIRTH",
      "KINDERGARTEN",
      "MILITARY",
      "WORK",
    ]);
    const next2 = nextUnansweredCategory(answered2, skipped);
    check(
      "BIRTH/KINDERGARTEN 답, ELEMENTARY·RELATIONSHIP 건너뜀 → MIDDLE",
      next2 === "MIDDLE",
    );

    // RELATIONSHIP 답을 저장하면 자동으로 건너뜀 해제 (upsertLifeEvent 내부)
    await upsertLifeEvent(alice.id, "RELATIONSHIP", {
      title: "OO",
      year: 1990,
      month: null,
      endYear: null,
      content: null,
    });
    skipped = await getSkippedCategories(alice.id);
    check(
      "답을 저장하면 건너뜀 셋에서 자동 제거",
      !skipped.has("RELATIONSHIP") && skipped.has("ELEMENTARY"),
    );

    // 직접 해제
    await unmarkCategorySkipped(alice.id, "ELEMENTARY");
    skipped = await getSkippedCategories(alice.id);
    check("unmarkCategorySkipped 동작", skipped.size === 0);

    // ──────────────────────────────────────────────────────────────
    // (2) 기간 카테고리 endYear
    // ──────────────────────────────────────────────────────────────
    console.log("\n[2) 기간 endYear 저장·정규화]");

    check("KINDERGARTEN 은 기간 카테고리", isPeriodCategory("KINDERGARTEN") === true);
    check("ELEMENTARY 는 기간 카테고리", isPeriodCategory("ELEMENTARY") === true);
    check("MIDDLE 은 기간 카테고리", isPeriodCategory("MIDDLE") === true);
    check("HIGH 는 기간 카테고리", isPeriodCategory("HIGH") === true);
    check("UNIVERSITY 는 기간 카테고리", isPeriodCategory("UNIVERSITY") === true);
    check("MILITARY 는 기간 카테고리", isPeriodCategory("MILITARY") === true);
    check("WORK 는 기간 카테고리", isPeriodCategory("WORK") === true);
    check("BIRTH 는 비기간", isPeriodCategory("BIRTH") === false);
    check("RELATIONSHIP 은 비기간 (민감)", isPeriodCategory("RELATIONSHIP") === false);
    check("FAMILY 는 비기간", isPeriodCategory("FAMILY") === false);

    // 기간 카테고리에 endYear 저장 → DB 에 반영
    const school = await upsertLifeEvent(alice.id, "ELEMENTARY", {
      title: "OO초등학교",
      year: 1972,
      month: 3,
      endYear: 1978,
      content: null,
    });
    const schoolRow = await prisma.userMemory.findUnique({
      where: { id: school.id },
      select: { eventYear: true, endYear: true },
    });
    check(
      "ELEMENTARY eventYear=1972, endYear=1978 저장",
      schoolRow?.eventYear === 1972 && schoolRow?.endYear === 1978,
    );

    // 비기간 카테고리에 endYear 를 보내도 null 로 정규화 (FAMILY 단일 시점)
    const family = await upsertLifeEvent(alice.id, "FAMILY", {
      title: "첫째",
      year: 1995,
      month: null,
      endYear: 2000, // 무시되어야 함
      content: null,
    });
    const familyRow = await prisma.userMemory.findUnique({
      where: { id: family.id },
      select: { endYear: true },
    });
    check(
      "비기간 카테고리는 endYear=null 강제 정규화",
      familyRow?.endYear === null,
    );

    // endYear 비우기 (수정으로) — null 로 갱신
    await upsertLifeEvent(alice.id, "ELEMENTARY", {
      title: "OO초등학교 (수정)",
      year: 1972,
      month: 3,
      endYear: null,
      content: null,
    });
    const schoolRow2 = await prisma.userMemory.findUnique({
      where: { id: school.id },
      select: { endYear: true },
    });
    check("endYear 비워 저장하면 DB null", schoolRow2?.endYear === null);

    // ──────────────────────────────────────────────────────────────
    // (3) 나이 계산
    // ──────────────────────────────────────────────────────────────
    console.log("\n[3) 나이 계산 (lib/age.ts)]");

    // BIRTH 가 없으면 getBirthYear → null
    // (앞에서 RELATIONSHIP·ELEMENTARY·KINDERGARTEN 만 저장 — BIRTH 안 함)
    let bYear = await getBirthYear(alice.id);
    check("BIRTH 없으면 getBirthYear=null", bYear === null);

    // BIRTH 저장
    await upsertLifeEvent(alice.id, "BIRTH", {
      title: "서울",
      year: 1965,
      month: 3,
      endYear: null,
      content: null,
    });
    bYear = await getBirthYear(alice.id);
    check("BIRTH 저장 후 getBirthYear=1965", bYear === 1965);

    // calcAge 동작
    const ageAt1985 = calcAge(1965, 1985);
    check(
      "1965년생, 1985년 → 만 20, 한국 21",
      ageAt1985?.manAge === 20 && ageAt1985?.koreanAge === 21,
    );

    const ageAt1965 = calcAge(1965, 1965);
    check(
      "1965년생, 1965년 → 만 0, 한국 1",
      ageAt1965?.manAge === 0 && ageAt1965?.koreanAge === 1,
    );

    const ageBeforeBirth = calcAge(1965, 1960);
    check("출생 이전 연도 → null", ageBeforeBirth === null);

    const formatted = formatAge({ manAge: 13, koreanAge: 14 });
    check(
      "formatAge: '만 13세 (한국 14세)'",
      formatted === "만 13세 (한국 14세)",
    );

    // calcSchoolYears 통합 (참고용 — 기존 헬퍼 유지)
    const sy = calcSchoolYears(1965);
    check(
      "1965년생 → 초등 1972~1977, 중학 1978~1980, 고교 1981~1983",
      sy.length === 3 &&
        sy[0].label === "초등학교" &&
        sy[0].startYear === 1972 &&
        sy[0].endYear === 1977 &&
        sy[1].label === "중학교" &&
        sy[1].startYear === 1978 &&
        sy[1].endYear === 1980 &&
        sy[2].label === "고등학교" &&
        sy[2].startYear === 1981 &&
        sy[2].endYear === 1983,
    );

    // schoolYearsForCategory — 학령별 단일 범위 (v3.1 신규)
    const kinder = schoolYearsForCategory("KINDERGARTEN", 1965);
    check(
      "1965년생 KINDERGARTEN → 1969~1971 (만 4~6)",
      kinder?.label === "어린이집·유치원" &&
        kinder?.startYear === 1969 &&
        kinder?.endYear === 1971,
    );
    const elem = schoolYearsForCategory("ELEMENTARY", 1965);
    check(
      "1965년생 ELEMENTARY → 1972~1977 (만 7~12)",
      elem?.label === "초등학교" &&
        elem?.startYear === 1972 &&
        elem?.endYear === 1977,
    );
    const univ = schoolYearsForCategory("UNIVERSITY", 1965);
    check(
      "1965년생 UNIVERSITY → 1984~1987 (만 19~22)",
      univ?.label === "대학교" &&
        univ?.startYear === 1984 &&
        univ?.endYear === 1987,
    );
    check(
      "비학령 카테고리(BIRTH) → null",
      schoolYearsForCategory("BIRTH", 1965) === null,
    );
    check(
      "비학령 카테고리(WORK) → null",
      schoolYearsForCategory("WORK", 1965) === null,
    );

    // ──────────────────────────────────────────────────────────────
    // 결과
    // ──────────────────────────────────────────────────────────────
    if (failures.length === 0) {
      console.log("\n전체 통과");
    } else {
      console.error(`\n실패 ${failures.length}건:`);
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
    }
  } finally {
    // 정리 — alice 의 데이터 cascade 로 같이 삭제
    await prisma.user.delete({ where: { id: alice.id } });
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
