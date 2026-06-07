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
