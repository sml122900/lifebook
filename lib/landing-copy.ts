// 랜딩(/) 카피 — v2.0(2026-06). "말로 이야기하면 AI가 멋진 포스터를 만든다"를
// 3초 안에 보이게 리뉴얼. 구조: ①히어로 ②작동 3단계(녹음 강조) ③결과물 갤러리
// ④제품(포스터 중심) ⑤안심 ⑥마무리 CTA. 카피 교체는 이 파일만.
//
// 샘플 포스터(public/): premium(이정순)·sample-poster(김순자)·-2(박성호)·-3(이지은).

// 개인정보 처리방침 — 공개 정적 페이지(비로그인 접근, app/privacy).
export const PRIVACY_HREF = "/privacy";

// ── S1 히어로 ──────────────────────────────────────────────────────────
export const S1 = {
  headline: "말씀만 하세요.\n인생이 한 편의 작품이 됩니다",
  sub: "말로 이야기하면 AI가 알아서 정리하고, 멋진 인생 포스터로 만들어드려요.",
  ctaPrimary: "무료로 시작하기",
  ctaSecondary: "3분 만에 둘러보기",
  posterSrc: "/sample-poster-premium.webp",
  posterAlt: "이정순 님의 인생 포스터 — AI가 만든 인생 연혁",
} as const;

// ── S2 작동 3단계 (녹음 → AI → 포스터) ─────────────────────────────────
export const S2 = {
  headline: "말 한마디면, 나머지는 라이프북이 합니다",
  steps: [
    {
      icon: "mic",
      title: "말로 이야기하세요",
      body: "버튼을 누르고 옛날 이야기를 들려주세요. 쓸 필요 없어요.",
    },
    {
      icon: "sparkles",
      title: "AI가 알아서 정리해요",
      body: "AI가 대화하며 인생 연혁으로 만들어드려요.",
    },
    {
      icon: "image",
      title: "멋진 포스터가 완성돼요",
      body: "한 장의 인생 포스터로 남겨요.",
    },
  ],
} as const;

// ── S3 결과물 갤러리 (시제품 — 다양성 강조) ─────────────────────────────
export const GALLERY = {
  headline: "한 분 한 분, 다른 이야기",
  sub: "AI가 취향대로 배경까지 그려드려요 — 사람마다 다른, 단 하나의 포스터.",
  posters: [
    { src: "/sample-poster-premium.webp", alt: "이정순 님의 인생 포스터", tone: "강물" },
    { src: "/sample-poster.webp", alt: "김순자 님의 인생 포스터", tone: "따뜻한 노랑" },
    { src: "/sample-poster-2.webp", alt: "박성호 님의 인생 포스터", tone: "차분한 블루" },
    { src: "/sample-poster-3.webp", alt: "이지은 님의 인생 포스터", tone: "파스텔 핑크" },
  ],
} as const;

// ── S4 제품 (포스터 중심 — 책·씨앗은 준비 중) ──────────────────────────
export const PRODUCT = {
  headline: "화면에서 끝나지 않아요",
  // 메인 = 포스터(실배송 상품). 큰 비주얼 + 주문 동선.
  main: {
    title: "인생 연혁 포스터",
    body: "한 장에 담은 인생의 큰 줄기. 고른 이야기로 AI가 배경까지 그려, 액자에 넣어 배송해 드려요.",
    cta: "포스터 보러 가기",
    href: "/shop/poster",
    src: "/sample-poster.webp",
    alt: "인생 연혁 포스터 실물 예시",
  },
  // 보조 = 준비 중(과한 강조 제거).
  soon: [
    { title: "자서전 책", body: "이야기를 묶은, 세상에 하나뿐인 책." },
    { title: "인생 씨앗", body: "곁에 두는 작은 기록물." },
  ],
} as const;

// ── S5 안심 ────────────────────────────────────────────────────────────
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

// ── S6 마지막 CTA ──────────────────────────────────────────────────────
export const S6 = {
  headline: "오늘의 한 마디가, 평생의 기록이 됩니다",
  cta: "무료로 시작하기",
} as const;

export const FOOTER = {
  copyright: "© 2026 Lifebook",
  privacyLabel: "개인정보 처리방침",
} as const;
