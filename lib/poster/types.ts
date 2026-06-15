// T1 — 인생 나무 포스터 엔진: 공용 타입 (순수, 의존성 0)
//
// 3계층 아키텍처의 "계약" 만 모은다. 어느 계층도 특정 템플릿(느티나무)을
// 알지 못한다 — 매핑은 placement 만 내고, 렌더러는 (매니페스트, placement)
// 으로만 동작한다.

// 비주얼 변형 4종. 의미는 디자인(잎=일반 / 꽃=기쁜·중요 / 열매=결실 /
// 새=소중한 인연)이지만, T1 에서는 데모 표현용 휴리스틱으로만 배정한다
// (실제 사용자 선택 + significance 필드는 T3-b).
export type Variant = "leaf" | "flower" | "fruit" | "bird";

// 매핑의 입력 — life_event 에서 추린 최소 정보. LifeEvent 타입에 직접
// 묶지 않아(어댑터가 변환) 매핑 로직을 순수하게 유지하고 노드 스크립트가
// 합성 데이터로 그대로 테스트할 수 있다.
export type MappingEvent = {
  title: string;
  year: number;
  month: number | null;
  // 기간 사건의 끝 연도(있으면). 변형/가중치 휴리스틱에서 "긴 사건" 판단.
  endYear: number | null;
  // 본문 길이 — 가중치(대표 사건 선정·초과 컷)에 사용. 본문 자체는 안 들고
  // 길이만(개인정보 최소화 + 매핑 순수성).
  textLength: number;
};

// 한 슬롯에 배치된 사건 (정규화 산출물 — 특정 SVG 비의존).
export type PlacedEvent = {
  title: string;
  // 라벨로 찍힐 연도 문자열. 보통 "1985", 기간이면 "1985–1988".
  yearLabel: string;
  variant: Variant;
};

// 한 챕터(브랜치 1개에 대응). slots 길이는 그 브랜치의 슬롯 용량 이하.
export type Chapter = {
  label: string;
  events: PlacedEvent[];
};

// 매핑의 최종 산출물. branchCount 로 렌더러가 어느 마스터를 쓸지 결정.
export type Placement = {
  branchCount: number; // 3 | 4 | 5
  chapters: Chapter[];
  // 뿌리(출생) 영역에 찍을 한 줄(있으면). 템플릿에 root-text 가 있을 때만 사용.
  rootLine: string | null;
  // 제목 줄 전체 텍스트(예: "박명자 님의 인생 나무"). 템플릿의 title-name
  // <text> 내용을 통째로 교체한다. 템플릿에 title-name 이 있을 때만 사용.
  ownerName: string | null;
  // 푸터 제작 크레딧(예: "박명자 · 2026년 제작"). footer-credit 가 있을 때만
  // 주입. null 이면 렌더러가 footer-credit 을 숨긴다(템플릿 예시 이름 방지).
  footerLine: string | null;
  // 데모 하드닝 보고용 통계 (렌더에는 안 쓰임).
  stats: {
    totalEvents: number;
    placed: number;
    cut: number; // 슬롯 부족으로 잘린 사건 수
    emptySlots: number; // 사건이 없어 숨긴 슬롯 수
    variantCounts: Record<Variant, number>;
  };
};

// 변형 1개가 슬롯 앵커(첫 use 의 x/y) 기준으로 찍을 심볼 use 정의.
export type VariantSymbol = {
  href: string; // "#leaf-s"
  w: number;
  h: number;
  dx: number; // 앵커로부터의 x 오프셋
  dy: number;
  rotate?: number; // 도 단위(심볼 중심 기준 회전)
};

export type VariantSpec = {
  color: string; // 그룹 color 속성 → currentColor
  symbols: VariantSymbol[];
};

// 템플릿(종) 매니페스트 — 종 1개 = 이 객체 1개. 7월 종 추가 = 새 svg +
// 매니페스트 1개. 렌더러·매핑은 무수정.
export type TemplateManifest = {
  id: string;
  name: string;
  branchOptions: number[]; // [3,4,5]
  viewBox: string; // "0 0 420 594"
  // 브랜치 수 → 그 마스터의 브랜치별 슬롯 용량 (불균등). 합이 총 슬롯.
  slotsPerBranch: Record<number, number[]>;
  // svg 파일을 찾는 함수 (브랜치 수 → 절대/상대 경로). fs 로더가 사용.
  fileFor: (branchCount: number) => string;
  // ID 패턴 — 렌더러가 삽입점을 찾는 유일한 규칙. 느티나무 지식은 여기에만.
  idMap: {
    slot: (c: number, e: number) => string; // 비주얼 그룹
    dateLabel: (c: number, e: number) => string; // 날짜(연도)
    titleLabel: (c: number, e: number) => string; // 제목
    chapter: (c: number) => string; // 챕터 라벨
    rootText: string; // 뿌리 텍스트 컨테이너 id
    ownerName: string; // 제목의 사람 이름 텍스트 id
    footerCredit: string; // 푸터 제작 크레딧 텍스트 id
  };
  // 데모에서 숨길 샘플/개발 전용 요소 — 계약 밖(슬롯 외) 요소들. 트리(동결
  // 디자인)는 손대지 않고, 가짜 데이터가 든 사건 색인·개발 주석·여백 가이드만
  // 억제한다. id 로 1개씩, class 로 묶음(사건 색인 줄 = idx-line) 숨김.
  demoHiddenIds: string[];
  demoHiddenClasses: string[];
  // significance → 비주얼. standout 이 bird 인데 마스터 defs 에 #bird-s 가
  // 없으면(4·5branch) 폴백할 변형.
  significanceVariants: Record<Variant, VariantSpec>;
  birdFallback: Variant; // "fruit"
};
