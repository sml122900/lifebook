// 시대 연혁 둘러보기 — section enum 한글 매핑 + 연대(decade) 헬퍼.
// 서버/클라 공용. prisma import 0 (place-types 패턴과 동일).

import {
  Film,
  Landmark,
  ShoppingBag,
  Trophy,
  type LucideIcon,
} from "lucide-react";

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
// 저작권 안전 + 사용자가 직접 클릭해서 듣기. 음악 카드 전용.
export function youtubeSearchHref(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

// 구글 검색 URL — 사건 상세에서 "더 알아보기" 진입로. 위키백과·뉴스·백과
// 같은 정보 중심 결과가 우선이라 참사·테러 같은 민감 사건도 안전한 진입.
// (유튜브는 검색 결과가 자극적·날조 영상으로 빠질 위험이 있어 분리.)
export function googleSearchHref(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

// 카테고리 아이콘 — lucide-react SVG (이모지 사용 X: 기기별 tofu 방지 + 일관된 stroke).
// 시각 앵커 역할. 제목 옆 작게(h-5 w-5) 배치.
export const SECTION_ICON: Record<EventSection, LucideIcon> = {
  POLITICS_SOCIETY: Landmark,
  CULTURE: Film,
  SPORTS: Trophy,
  TREND: ShoppingBag,
};

// 아이콘 stroke 색 — SECTION_BADGE_CLASS 의 톤과 어울리되 한 단계 진하게
// (border-300/bg-50 의 한 단계 진한 text-600). 뱃지 옆에 배치되더라도 시각
// 충돌 0.
export const SECTION_ICON_CLASS: Record<EventSection, string> = {
  POLITICS_SOCIETY: "text-slate-600",
  CULTURE: "text-rose-600",
  SPORTS: "text-blue-600",
  TREND: "text-emerald-600",
};

// 연대별 은은한 배경 — 사건/음악 섹션 컨테이너에 적용. /60 opacity 로 텍스트
// 가독성 그대로 보존. 카드(흰색/emerald-50)가 위로 떠 보이며 색 분리.
// 80s 따뜻한 amber, 90s 푸근한 emerald, 00s 산뜻한 sky, 10s 시원한 violet.
export const DECADE_BG_CLASS: Record<Decade, string> = {
  1980: "bg-amber-50/60",
  1990: "bg-emerald-50/60",
  2000: "bg-sky-50/60",
  2010: "bg-violet-50/60",
};

