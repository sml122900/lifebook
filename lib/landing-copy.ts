// 랜딩(/) 카피 — 디자이너 와이어 v0.2.
//
// 확정 슬롯(S1·S4 헤드라인/서브)은 이 문자열 그대로 둔다. 나머지(S2·S3·S5·S6
// 본문)는 와이어 더미 — 카피 확정 시 여기만 교체하면 page.tsx 는 무수정.
//
// 이미지 슬롯의 data-slot id 도 여기서 관리(steps/products) — 나중에 실화면
// 캡처를 끼울 때 어느 슬롯인지 식별용.

// 개인정보 처리방침 — 공개 정적 페이지(비로그인 접근, app/privacy). 현재 v0 초안.
export const PRIVACY_HREF = "/privacy";

export const S1 = {
  headline: "기억은 흐려져도, 기록은 흐려지지 않습니다",
  sub: "부모님의 이야기가 가장 선명한 지금, 라이프북이 한 권으로 남깁니다.",
  ctaPrimary: "무료로 시작하기",
  ctaSecondary: "3분 만에 둘러보기",
  // 히어로 캡처 = 세로 모바일 화면(인생 연혁 타임라인) → 9/16 슬롯.
  captionSlot: "실제 화면 · 인생 연혁 타임라인",
} as const;

// S2 작동 3단계 (더미 카피)
export const S2 = {
  headline: "이렇게 채워집니다",
  steps: [
    {
      slot: "step-1-era",
      title: "그 시절을 펼쳐요",
      body: "큰 사건이 흐릿한 기억을 깨웁니다.",
    },
    {
      slot: "step-2-record",
      title: "답하기만 하면 돼요",
      body: "AI가 묻고, 부모님은 떠오르는 대로 답합니다.",
    },
    {
      slot: "step-3-room",
      title: "가족과 함께 봐요",
      body: "완성된 이야기를 가족이 함께 읽고 반응합니다.",
    },
  ],
} as const;

// S3 결과물 (더미 카피) — 전부 준비 중
export const S3 = {
  headline: "이렇게 남습니다",
  badge: "준비 중",
  products: [
    {
      slot: "product-poster",
      title: "연대표 포스터",
      body: "한 장에 담은 인생의 큰 줄기.",
    },
    {
      slot: "product-book",
      title: "자서전 책",
      body: "이야기를 묶은, 세상에 하나뿐인 책.",
    },
    {
      slot: "product-keepsake",
      title: "기념 키프세이크",
      body: "곁에 두는 작은 기록물.",
    },
  ],
} as const;

// S4 기념일·선물 (확정 헤드라인/서브)
export const S4 = {
  headline: "이번 생신엔, 부모님의 인생을 선물하세요",
  sub: "세상에 하나뿐인 자서전. 부모님은 답하기만 하면 됩니다.",
  cta: "선물 준비 알아보기",
  // S3 '자서전 책' 과 시각 연결되는 인접 슬롯(별도 id — product-book 과 구분).
  bookSlot: "anniversary-book",
  bookCaption: "자서전 책 미리보기",
} as const;

// S5 신뢰 (더미 카피)
export const S5 = {
  headline: "안심하고 맡기세요",
  cards: [
    {
      title: "기록은 당신의 것",
      body: "모든 기록은 비공개가 기본입니다. 가족과 나눌 때만 공유됩니다.",
      linkLabel: "개인정보 처리방침 보기",
      linkHref: PRIVACY_HREF,
    },
    {
      title: "어르신을 위해 설계",
      body: "큰 글씨, 큰 버튼, 단순한 동선으로 만들었습니다.",
      linkLabel: null,
      linkHref: null,
    },
  ],
} as const;

// S6 마지막 CTA (더미 카피)
export const S6 = {
  headline: "오늘의 이야기가, 내일의 보물이 됩니다",
  cta: "지금 시작하기",
} as const;

export const FOOTER = {
  copyright: "© 2026 Lifebook",
  privacyLabel: "개인정보 처리방침",
} as const;
