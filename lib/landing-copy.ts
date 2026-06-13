// 랜딩(/) 카피 — v1.0 확정(2026-06-13). 구조·컴포넌트 무수정, 값만 관리.
//
// S1·S2·S4·S5·S6 + S3 헤드라인·라벨·준비중 문구 확정. 카피 교체는 이 파일만.
// (S3 제품 카드 본문은 미제공 → 기존 문구 유지. 본문 확정 시 여기만 교체.)
//
// 이미지 슬롯의 data-slot id 도 여기서 관리(steps/products) — 실화면 캡처를
// 끼울 때 어느 슬롯인지 식별용.

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

// S2 작동 3단계
export const S2 = {
  headline: "쓰지 않아도 됩니다. 답하면 됩니다",
  steps: [
    {
      slot: "step-1-era",
      title: "그 시절이 말을 겁니다",
      body: "그 시절 노래와 사건이 기억을 깨워요",
    },
    {
      slot: "step-2-record",
      title: "답하면 연혁이 됩니다",
      body: "음성도 글도 좋아요. 말하면 정리됩니다",
    },
    {
      slot: "step-3-room",
      title: "가족이 읽고 반응합니다",
      body: "자녀의 반응이 다음 이야기를 부릅니다",
    },
  ],
} as const;

// S3 결과물 — /shop 상품 상세로 연결(배지 제거). title 은 products.ts name 과
// 통일됨(인생 연혁 포스터 / 자서전 책 / 인생 씨앗(가)). href 는 상품 id 매핑.
// ※ 제품 카드 본문(body)은 마케팅 미확정 → 기존 문구 유지.
export const S3 = {
  headline: "기록은 화면에서 끝나지 않습니다",
  products: [
    {
      slot: "product-poster",
      title: "인생 연혁 포스터",
      body: "한 장에 담은 인생의 큰 줄기.",
      href: "/shop/poster",
    },
    {
      slot: "product-book",
      title: "자서전 책",
      body: "이야기를 묶은, 세상에 하나뿐인 책.",
      href: "/shop/book",
    },
    {
      slot: "product-keepsake",
      // ⚠️ 미확정 — "인생 씨앗(가)" 는 키프리스 상표 확인 대기(6/20).
      //    확정 시 이 title 과 products.ts name 한 줄만 교체.
      title: "인생 씨앗(가)",
      body: "곁에 두는 작은 기록물.",
      href: "/shop/charm",
    },
  ],
} as const;

// S4 기념일·선물 — CTA 는 자서전 책 상세로(기념일=책 선물 맥락).
export const S4 = {
  headline: "이번 생신엔, 부모님의 인생을 선물하세요",
  sub: "세상에 하나뿐인 자서전. 부모님은 답하기만 하면 됩니다.",
  cta: "선물 준비 알아보기",
  href: "/shop/book",
  // S3 '자서전 책' 과 시각 연결되는 인접 슬롯(별도 id — product-book 과 구분).
  bookSlot: "anniversary-book",
  bookCaption: "자서전 책 미리보기",
} as const;

// S5 신뢰
export const S5 = {
  headline: "안심하고 맡기세요",
  cards: [
    {
      title: "인생 기록으로 광고하지 않습니다",
      body: "기록은 회고와 가족 공유에만 쓰입니다. 외부 제공도, 광고 타깃팅도 하지 않습니다.",
      linkLabel: "개인정보 처리방침 보기",
      linkHref: PRIVACY_HREF,
    },
    {
      title: "스마트폰이 어려워도 괜찮아요",
      body: "큰 글씨, 음성으로 답하기, 단순한 화면. 어르신 눈높이로 처음부터 설계했습니다.",
      linkLabel: null,
      linkHref: null,
    },
  ],
} as const;

// S6 마지막 CTA
export const S6 = {
  headline: "오늘의 한 마디가, 평생의 기록이 됩니다",
  cta: "무료로 시작하기",
} as const;

export const FOOTER = {
  copyright: "© 2026 Lifebook",
  privacyLabel: "개인정보 처리방침",
} as const;
