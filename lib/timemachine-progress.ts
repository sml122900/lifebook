// 동기부여 ① 쌓이는 재미 — 기존 T6 저장(UserMemory)을 집계해 "내가 쌓은
// 흔적"을 계산한다. 새 모델/데이터 없음, 읽기 전용 집계만.
//
// 집계 대상: createdVia in (timemachine_event, timemachine_month) 행.
//   - timemachine_event : 사용자가 비서 답에서 "내 타임라인 추가" 한 사건 1행
//   - timemachine_month : 그 달 회고 본문 1행
// Phase 7 의 "ai_chat" / "manual" 행은 제외 (타임머신 진척과 무관).

import { prisma } from "./db";

const CREATED_VIA_EVENT = "timemachine_event";
const CREATED_VIA_MONTH = "timemachine_month";

// 검증 단계 시드 범위 (2025.6 ~ 2026.5) — 12개월.
// LATEST/EARLIEST 하드코드는 page.tsx / layout.tsx / [month]/page.tsx 와
// 동일 정책 (CLAUDE.md L8 후속에서 new Date() 기반으로 함께 통합 예정).
const RANGE_START_YEAR = 2025;
const RANGE_START_MONTH = 6;
const RANGE_END_YEAR = 2026;
const RANGE_END_MONTH = 5;

export type MonthCell = {
  year: number;
  month: number;
  filled: boolean; // 이 달에 타임머신 기록이 하나라도 있는지
  eventCount: number; // 이 달에 남긴 사건 수
  hasStory: boolean; // 이 달 회고 글 유무
};

export type TimemachineProgress = {
  totalMonths: number; // 시드 범위 달 수 (12)
  filledMonths: number; // 기록을 남긴 달 수
  totalEvents: number; // 남긴 사건 총합
  totalChars: number; // 직접 쓴 글자 수 (사건 메모 + 회고)
  cells: MonthCell[]; // 최신 → 과거 순 (거꾸로 여행 방향)
};

// 시드 범위의 달 목록을 최신 → 과거 순으로.
function seedMonthList(): { year: number; month: number }[] {
  const out: { year: number; month: number }[] = [];
  const startKey = RANGE_START_YEAR * 12 + RANGE_START_MONTH;
  let y = RANGE_END_YEAR;
  let m = RANGE_END_MONTH;
  while (y * 12 + m >= startKey) {
    out.push({ year: y, month: m });
    if (m === 1) {
      y -= 1;
      m = 12;
    } else {
      m -= 1;
    }
  }
  return out;
}

// 메인 화면 "내 기록 현황" 카드용 — 채운 달/양/12개월 셀.
//
// 글자 수는 DB 에서 SUM(LENGTH(...)) 로 집계 — 회고 본문을 메모리로
// 끌어오지 않는다(긴 회고 사용자도 가벼움). 달·종류별로 GROUP BY 해
// 행 수(사건/회고)도 한 번에 가져온다. (chr(9/10/13)=탭·줄바꿈·CR 까지
// 양끝 trim 해 JS .trim().length 와 근사.)
type ProgressRow = {
  year: number;
  month: number | null;
  createdVia: string;
  cnt: number;
  chars: number;
};

export async function getTimemachineProgress(
  userId: string,
): Promise<TimemachineProgress> {
  const rows = await prisma.$queryRaw<ProgressRow[]>`
    SELECT "year", "month", "createdVia",
           COUNT(*)::int AS cnt,
           COALESCE(SUM(
             LENGTH(BTRIM(COALESCE("content", ''), ' ' || chr(9) || chr(10) || chr(13)))
           )::int, 0) AS chars
    FROM "UserMemory"
    WHERE "userId" = ${userId}
      AND "createdVia" IN ('timemachine_event', 'timemachine_month')
    GROUP BY "year", "month", "createdVia"
  `;

  const byKey = new Map<string, { eventCount: number; hasStory: boolean }>();
  let totalEvents = 0;
  let totalChars = 0;

  for (const r of rows) {
    if (r.month === null) continue; // 타임머신 행은 month 가 항상 있음 (방어)
    const key = `${r.year}-${r.month}`;
    const cur = byKey.get(key) ?? { eventCount: 0, hasStory: false };
    if (r.createdVia === CREATED_VIA_EVENT) {
      cur.eventCount += r.cnt;
      totalEvents += r.cnt;
    } else {
      cur.hasStory = true;
    }
    totalChars += r.chars;
    byKey.set(key, cur);
  }

  const cells: MonthCell[] = seedMonthList().map(({ year, month }) => {
    const agg = byKey.get(`${year}-${month}`);
    return {
      year,
      month,
      filled: agg !== undefined,
      eventCount: agg?.eventCount ?? 0,
      hasStory: agg?.hasStory ?? false,
    };
  });

  return {
    totalMonths: cells.length,
    filledMonths: cells.filter((c) => c.filled).length,
    totalEvents,
    totalChars,
    cells,
  };
}

// 월 화면 prev/next 배지용 — 기록이 있는 (year, month) 키 집합.
// distinct 한 번이라 가볍다.
export async function getFilledMonthKeys(
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: { in: [CREATED_VIA_EVENT, CREATED_VIA_MONTH] },
    },
    select: { year: true, month: true },
    distinct: ["year", "month"],
  });
  return new Set(
    rows
      .filter((r) => r.month !== null)
      .map((r) => `${r.year}-${r.month}`),
  );
}

// (year, month) → 키 문자열. 호출부가 같은 규칙을 쓰도록 export.
export function monthKey(year: number, month: number): string {
  return `${year}-${month}`;
}
