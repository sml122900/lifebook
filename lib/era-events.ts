// 시대 연혁(/era) 데이터 조회 — 읽기 전용 server 헬퍼.
// E1 단계: 둘러보기만. 사용자/룸/추억 데이터 무관, 순수 카탈로그.
//
// 범위: year < 2024 (2025+ 는 사용자 본인 연혁 메인이라 회상 범위 밖).
// 데이터 적음(사건 88·음악 73) → 페이지네이션 X, 한 번에 전체 로드.

import { prisma } from "./db";

export type EraEvent = {
  id: string;
  year: number;
  month: number | null;
  section: "POLITICS_SOCIETY" | "CULTURE" | "SPORTS" | "TREND";
  title: string;
  description: string;
  confidence: "VERIFIED" | "APPROX";
  source: string | null;
};

export type EraSong = {
  id: string;
  year: number;
  month: number | null;
  title: string;
  artist: string;
  origin: "DOMESTIC" | "INTERNATIONAL";
  youtubeQuery: string;
  eraColor: string;
  confidence: "VERIFIED" | "APPROX";
};

// 사건 — year >= 1980 && year < 2024. year null 행은 제외(시대 회상엔
// 연도 없는 사건은 자리 없음). isPeriod true 행도 일단 단일 시점으로
// 표시(우리 시대 시드는 isPeriod=false 라 영향 0, 방어용 필터만).
export async function listEraEvents(): Promise<EraEvent[]> {
  const rows = await prisma.monthEvent.findMany({
    where: {
      year: { gte: 1980, lt: 2024 },
    },
    select: {
      id: true,
      year: true,
      month: true,
      section: true,
      title: true,
      description: true,
      confidence: true,
      source: true,
    },
    orderBy: [
      { year: "asc" },
      { month: { sort: "asc", nulls: "last" } },
      { title: "asc" },
    ],
  });
  // year null 은 select 단계에서 들어와도 표시 못 함 → 필터 + 타입 좁힘.
  return rows
    .filter((r): r is typeof r & { year: number } => r.year !== null)
    .map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      section: r.section,
      title: r.title,
      description: r.description,
      confidence: r.confidence,
      source: r.source,
    }));
}

// ── 온보딩 첫 사건 선택 ──────────────────────────────────────────────
// 가입 직후(BIRTH 외 이벤트 0건) 빈 타임라인 이탈을 줄이려, 출생연도로
// "그 시절 누구나 아는 큰 사건" 1개를 골라 첫 회상을 유도한다.
//
// 선택 로직:
//   target = birthYear + 20  (회상 융기 정점 = 청년기, 가장 생생)
//   POLITICS_SOCIETY + VERIFIED 중 target 에 연도가 가장 가까운 1건.
//   동률은 연도 asc → id asc 로 결정적(새로고침해도 같은 사건).
// POLITICS_SOCIETY VERIFIED 로 한정 — 100% 인지(앵커 정신) + 1980~2018
//   거의 매년 분포라 전 연령 자연 커버. closest-match 라 target 이 범위를
//   벗어나도(예: 1976→1980, 2024→2018) 자동 흡수, clamp 불필요.
//
// v2 후속: 2002 월드컵 같은 SPORTS 앵커도 강력 → sections 파라미터로 확장
//   여지를 열어둠(기본은 POLITICS_SOCIETY 만).
export type MonthEventSection =
  | "POLITICS_SOCIETY"
  | "CULTURE"
  | "SPORTS"
  | "TREND";

const ONBOARDING_AGE_OFFSET = 20;

export type OnboardingEraEvent = {
  id: string;
  year: number;
  month: number | null;
  section: MonthEventSection;
  title: string;
  description: string;
  source: string | null;
};

export async function pickOnboardingEraEvent(
  birthYear: number,
  sections: MonthEventSection[] = ["POLITICS_SOCIETY"],
): Promise<OnboardingEraEvent | null> {
  const candidates = await prisma.monthEvent.findMany({
    where: {
      year: { gte: 1980, lt: 2024 },
      section: { in: sections },
      confidence: "VERIFIED",
    },
    select: {
      id: true,
      year: true,
      month: true,
      section: true,
      title: true,
      description: true,
      source: true,
    },
    // 결정적 tie-break: 같은 거리면 이른 연도 → id asc.
    orderBy: [{ year: "asc" }, { id: "asc" }],
  });

  const valid = candidates.filter(
    (c): c is typeof c & { year: number } => c.year !== null,
  );
  if (valid.length === 0) return null;

  const target = birthYear + ONBOARDING_AGE_OFFSET;
  let best = valid[0];
  let bestDist = Math.abs(best.year - target);
  for (const c of valid) {
    const d = Math.abs(c.year - target);
    // strict < 라 동률은 먼저(이른 연도·작은 id) 것을 유지 — 결정적.
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return {
    id: best.id,
    year: best.year,
    month: best.month,
    section: best.section,
    title: best.title,
    description: best.description,
    source: best.source,
  };
}

// 음악 — 같은 범위. 시대 음악은 곡명/가수만 (가사·앨범커버·음원 X, 저작권).
export async function listEraSongs(): Promise<EraSong[]> {
  const rows = await prisma.chartSong.findMany({
    where: {
      year: { gte: 1980, lt: 2024 },
    },
    select: {
      id: true,
      year: true,
      month: true,
      title: true,
      artist: true,
      origin: true,
      youtubeQuery: true,
      eraColor: true,
      confidence: true,
    },
    orderBy: [
      { year: "asc" },
      { month: { sort: "asc", nulls: "last" } },
      { title: "asc" },
    ],
  });
  return rows
    .filter((r): r is typeof r & { year: number } => r.year !== null)
    .map((r) => ({
      id: r.id,
      year: r.year,
      month: r.month,
      title: r.title,
      artist: r.artist,
      origin: r.origin,
      youtubeQuery: r.youtubeQuery,
      eraColor: r.eraColor,
      confidence: r.confidence,
    }));
}
