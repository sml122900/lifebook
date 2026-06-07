// 시대 연혁 둘러보기 — section enum 한글 매핑 + 연대(decade) 헬퍼.
// 서버/클라 공용. prisma import 0 (place-types 패턴과 동일).

import type { EventSection } from "./generated/prisma/enums";

export const SECTION_LABEL: Record<EventSection, string> = {
  POLITICS_SOCIETY: "정치·사회",
  CULTURE: "문화·연예",
  SPORTS: "스포츠",
  TREND: "생활·경제",
};

// 카테고리 뱃지 색 — 시니어 친화 위해 부드러운 톤(쨍한 색·다홍 금지).
// EventCard 와 음악 카드 모두 같은 팔레트 사용.
export const SECTION_BADGE_CLASS: Record<EventSection, string> = {
  POLITICS_SOCIETY:
    "border-slate-400 bg-slate-50 text-slate-800",
  CULTURE:
    "border-rose-300 bg-rose-50 text-rose-800",
  SPORTS:
    "border-blue-300 bg-blue-50 text-blue-800",
  TREND:
    "border-emerald-300 bg-emerald-50 text-emerald-800",
};

// 연대(decade) — 1980/1990/2000/2010 4단계. 2020+ 는 시대 둘러보기 범위
// 밖(메인 연혁은 사용자 자기 인생, 시대 회상은 1980~2019).
export type Decade = 1980 | 1990 | 2000 | 2010;

export const DECADES: { key: Decade; label: string }[] = [
  { key: 1980, label: "1980년대" },
  { key: 1990, label: "1990년대" },
  { key: 2000, label: "2000년대" },
  { key: 2010, label: "2010년대" },
];

// year → decade. 1985 → 1980. null 또는 범위 밖이면 null.
export function decadeOf(year: number | null): Decade | null {
  if (year === null) return null;
  if (year >= 1980 && year < 1990) return 1980;
  if (year >= 1990 && year < 2000) return 1990;
  if (year >= 2000 && year < 2010) return 2000;
  if (year >= 2010 && year < 2020) return 2010;
  return null;
}

// 유튜브 검색 URL — 임베드/음원 X, 검색 결과 페이지로 새 탭.
// 저작권 안전 + 사용자가 직접 클릭해서 듣기.
export function youtubeSearchHref(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}
