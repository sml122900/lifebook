// Phase T1 — 타임머신 월 화면 데이터 조회.
//
// 한 함수가 (targetYear, targetMonth) 를 받아 그달 화면에 표시할
// 모든 항목(사건 4섹션 + 국내음악 + 해외음악)을 가져온다.
//
// 노출 규칙 (phase/seed-timemachine.ts 주석에서):
//   - 일반(isPeriod=false): year/month 정확히 일치
//   - 기간(isPeriod=true):  start*12+startM ≤ target*12+targetM ≤ end*12+endM
// 두 규칙을 OR로 결합해 한 번에 가져온다.
//
// 음악은 origin(DOMESTIC/INTERNATIONAL) 으로 분리해 반환 — 화면에서
// 국내/해외 섹션을 분리 렌더하기 위함. 보통 국내=일반, 해외=기간이지만
// helper 는 둘 다 동일한 (일반 OR 기간) 규칙으로 매칭한다.
//
// 쿼리는 Prisma raw SQL 사용 — Prisma 의 type-safe API 로는 산술 비교
// (start*12+m ≤ target*12+m) 를 직접 표현하기 어려워서.

import { prisma } from "./db";

type MonthEventRow = Awaited<
  ReturnType<typeof prisma.monthEvent.findMany>
>[number];
type ChartSongRow = Awaited<
  ReturnType<typeof prisma.chartSong.findMany>
>[number];

export type MonthScreenData = {
  events: MonthEventRow[];
  domesticSongs: ChartSongRow[];
  internationalSongs: ChartSongRow[];
};

export async function getMonthScreen(
  targetYear: number,
  targetMonth: number,
): Promise<MonthScreenData> {
  if (!Number.isInteger(targetYear) || targetYear < 1900) {
    throw new Error("targetYear must be a year ≥ 1900");
  }
  if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12) {
    throw new Error("targetMonth must be 1..12");
  }
  const t = targetYear * 12 + targetMonth;

  const events = await prisma.$queryRaw<MonthEventRow[]>`
    SELECT * FROM "MonthEvent"
    WHERE (
      "isPeriod" = false
      AND "year" = ${targetYear}
      AND "month" = ${targetMonth}
    ) OR (
      "isPeriod" = true
      AND "startYear" IS NOT NULL AND "startMonth" IS NOT NULL
      AND "endYear" IS NOT NULL AND "endMonth" IS NOT NULL
      AND ("startYear" * 12 + "startMonth") <= ${t}
      AND ${t} <= ("endYear" * 12 + "endMonth")
    )
    ORDER BY "section" ASC, "id" ASC
  `;

  const domesticSongs = await prisma.$queryRaw<ChartSongRow[]>`
    SELECT * FROM "ChartSong"
    WHERE "origin" = 'DOMESTIC'::"SongOrigin" AND (
      (
        "isPeriod" = false
        AND "year" = ${targetYear}
        AND "month" = ${targetMonth}
      ) OR (
        "isPeriod" = true
        AND "startYear" IS NOT NULL AND "startMonth" IS NOT NULL
        AND "endYear" IS NOT NULL AND "endMonth" IS NOT NULL
        AND ("startYear" * 12 + "startMonth") <= ${t}
        AND ${t} <= ("endYear" * 12 + "endMonth")
      )
    )
    ORDER BY "rank" ASC NULLS LAST, "id" ASC
  `;

  const internationalSongs = await prisma.$queryRaw<ChartSongRow[]>`
    SELECT * FROM "ChartSong"
    WHERE "origin" = 'INTERNATIONAL'::"SongOrigin" AND (
      (
        "isPeriod" = false
        AND "year" = ${targetYear}
        AND "month" = ${targetMonth}
      ) OR (
        "isPeriod" = true
        AND "startYear" IS NOT NULL AND "startMonth" IS NOT NULL
        AND "endYear" IS NOT NULL AND "endMonth" IS NOT NULL
        AND ("startYear" * 12 + "startMonth") <= ${t}
        AND ${t} <= ("endYear" * 12 + "endMonth")
      )
    )
    ORDER BY "rank" ASC NULLS LAST, "id" ASC
  `;

  return { events, domesticSongs, internationalSongs };
}
