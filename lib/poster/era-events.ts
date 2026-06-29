// 기능2a — 포스터 노드 사이에 얹을 "시대 대사건"(객관적 역사) 데이터 + 필터.
//
// 어르신 개인 연도는 부정확할 수 있어 노드 연도는 기본 숨김(기능1). 대신 누구나
// 아는 객관적 역사 대사건을 강물 옆에 얹어 시간 흐름의 닻으로 쓴다(배치 렌더=2b,
// 토글·제거 UI=2c). 이 모듈은 순수 — DB·API·키 불필요, 단독 테스트 가능.
//
// 티어: 1=기본 표시(누구나 아는 핵심), 2=보조, 3=세부. 사용자가 단계로 조절.

export type EraTier = 1 | 2 | 3;

export type EraEvent = {
  id: string; // 안정적 키(year+slug) — 사용자 제거목록(removedIds) 추적용. 절대 변경 X.
  year: number;
  title: string;
  tier: EraTier;
};

// ── 한국 시대 대사건 ───────────────────────────────────────────────────
// ★ id 는 영구 안정 키. title·tier 는 바꿔도 id 는 고정(제거목록 호환).
export const ERA_EVENTS: EraEvent[] = [
  // 1티어 — 기본 표시
  { id: "1950-korean-war", year: 1950, title: "6·25 전쟁", tier: 1 },
  { id: "1960-419", year: 1960, title: "4·19 혁명", tier: 1 },
  { id: "1980-518", year: 1980, title: "5·18 민주화운동", tier: 1 },
  { id: "1988-seoul-olympics", year: 1988, title: "서울올림픽", tier: 1 },
  { id: "1997-imf", year: 1997, title: "IMF 외환위기", tier: 1 },
  { id: "2002-worldcup", year: 2002, title: "한일월드컵", tier: 1 },
  { id: "2008-financial-crisis", year: 2008, title: "글로벌 금융위기", tier: 1 },
  { id: "2020-covid19", year: 2020, title: "코로나19", tier: 1 },

  // 2티어 — 보조
  { id: "1953-armistice", year: 1953, title: "휴전협정", tier: 2 },
  { id: "1970-gyeongbu-expressway", year: 1970, title: "경부고속도로 개통", tier: 2 },
  { id: "1979-1026", year: 1979, title: "10·26 사건", tier: 2 },
  { id: "1987-june-democracy", year: 1987, title: "6월 민주항쟁", tier: 2 },
  { id: "1993-real-name-finance", year: 1993, title: "금융실명제", tier: 2 },
  { id: "2001-911", year: 2001, title: "9·11 테러", tier: 2 },
  { id: "2010-g20-seoul", year: 2010, title: "G20 서울 정상회의", tier: 2 },
  { id: "2014-sewol", year: 2014, title: "세월호 참사", tier: 2 },
  { id: "2018-pyeongchang", year: 2018, title: "평창올림픽", tier: 2 },

  // 3티어 — 세부
  { id: "1962-five-year-plan", year: 1962, title: "경제개발 5개년계획", tier: 3 },
  { id: "1977-export-10b", year: 1977, title: "수출 100억 불 달성", tier: 3 },
  { id: "1986-asian-games", year: 1986, title: "서울 아시안게임", tier: 3 },
  { id: "1995-sampoong", year: 1995, title: "삼풍백화점 붕괴", tier: 3 },
  { id: "2000-inter-korea-summit", year: 2000, title: "남북정상회담", tier: 3 },
  { id: "2005-hwang-woo-suk", year: 2005, title: "황우석 사태", tier: 3 },
  { id: "2009-yuna-roh", year: 2009, title: "김연아 금메달·노무현 서거", tier: 3 },
  { id: "2016-candlelight", year: 2016, title: "촛불집회", tier: 3 },
  { id: "2022-itaewon", year: 2022, title: "이태원 참사", tier: 3 },
];

export type EraFilterOptions = {
  // 사용자 출생연도. 출생 이전 사건은 제외(생애범위). null/undefined 면 범위 필터 X.
  // ★ 호출자(2b)가 User.birthYear ?? 가장 이른 노드 연도로 해석해 넘긴다.
  birthYear?: number | null;
  // 0=끄기 / 1=1티어 / 2=1+2 / 3=1+2+3. 정수 외 값은 클램프.
  tier: number;
  // 사용자가 뺀 사건 id 들(제거).
  removedIds?: string[];
};

// 포스터에 표시할 시대 대사건을 필터링해 연도순으로 반환.
//   - tier 0 이하 → 빈 배열(끄기)
//   - tier 1~3 → 해당 티어 이하만
//   - birthYear 있으면 그 해 이후(>=) 사건만(출생 전 제외)
//   - removedIds 제외
export function getEraEventsForPoster({
  birthYear,
  tier,
  removedIds,
}: EraFilterOptions): EraEvent[] {
  if (!(tier >= 1)) return []; // 0·음수·NaN → 끄기
  const maxTier = Math.min(3, Math.floor(tier));
  const removed = new Set(removedIds ?? []);
  const hasBirth = typeof birthYear === "number" && Number.isFinite(birthYear);

  return ERA_EVENTS.filter(
    (e) =>
      e.tier <= maxTier &&
      (!hasBirth || e.year >= (birthYear as number)) &&
      !removed.has(e.id),
  ).sort((a, b) => a.year - b.year || a.tier - b.tier);
}
