// 랜딩(/) 카피 — v3.0(2026-11-08 — 강물 포스터 → My Life 인쇄본 교체, docs/phase/print-mylife.md §9). 구조: ①히어로 ②작동 3단계
// ③인쇄본 견본 ④제품 ⑤안심 ⑥마무리 CTA. 카피 교체는 이 파일만. 바뀐 문구는 전부 [임시 — 성민 확정 필요] 2026-11-08.
//
// 견본 그림(public/landing/print-*.webp) = 가상 인물(김순자 — 실명 아님)의 My Life 를 인쇄본 그리기(lib/print-render)로 그린 렌더 그림.
// 실제 인쇄물 사진(Q19)은 시험 인쇄 뒤 교체.

// 개인정보 처리방침 — 공개 정적 페이지(비로그인 접근, app/privacy).
export const PRIVACY_HREF = "/privacy";

// ── S1 히어로 ──────────────────────────────────────────────────────────
export const S1 = {
  headline: "말씀만 하세요.\n인생이 한 편의 작품이 됩니다",
  sub: "말로 이야기하면 AI가 알아서 정리해 My Life 지도로 그려 드려요. 시기마다 한 장씩, 인쇄본으로도 받아 보실 수 있어요.", // [임시 — 성민 확정 필요] 2026-11-08
  ctaPrimary: "무료로 시작하기",
  ctaSecondary: "3분 만에 둘러보기",
  heroSrc: "/landing/print-page.webp",
  heroAlt: "김순자 님의 My Life 인쇄본 한 장 — 국민학교 시절과 함께한 분·곳", // [임시 — 성민 확정 필요] 2026-11-08
} as const;

// ── S2 작동 3단계 (말 → AI → 지도·인쇄본) ─────────────────────────────
export const S2 = {
  headline: "말 한마디면, 나머지는 Lifebook이 합니다",
  steps: [
    {
      icon: "mic",
      title: "말로 이야기하세요",
      body: "버튼을 누르고 옛날 이야기를 들려주세요. 쓸 필요 없어요.",
    },
    {
      icon: "sparkles",
      title: "AI가 알아서 정리해요",
      body: "AI가 대화하며 My Life 지도로 정리해 드려요.", // [임시 — 성민 확정 필요] 2026-11-08 (옛 "인생 연혁으로")
    },
    {
      icon: "image",
      title: "한 장씩 넘겨 보는 인쇄본", // [임시 — 성민 확정 필요] 2026-11-08
      body: "시기마다 한 장씩 담아, 가족과 함께 넘겨 보며 이야기해요.", // [임시 — 성민 확정 필요] 2026-11-08
    },
  ],
} as const;

// ── S3 인쇄본 견본(렌더 그림 — 시험 인쇄 사진은 Q19 뒤) ─────────────────────
export const GALLERY = {
  headline: "한 장에 한 시절", // [임시 — 성민 확정 필요] 2026-11-08
  sub: "시기마다 한 장 — 그때 함께한 분과 곳이 같이 담겨요.", // [임시 — 성민 확정 필요] 2026-11-08
  pages: [
    { src: "/landing/print-cover.webp", alt: "My Life 인쇄본 표지와 차례", label: "표지와 차례" },
    { src: "/landing/print-page.webp", alt: "시기 한 장 — 이야기와 함께한 분·곳", label: "시기 한 장" },
    { src: "/landing/print-people.webp", alt: "인물록 — 나온 장 번호", label: "인물록" },
  ],
} as const;

// ── S4 제품 (My Life 인쇄본 — 금액 정하기 전에는 링크 없이 "곧 선보여요") ────────
export const PRODUCT = {
  headline: "화면에서 끝나지 않아요",
  main: {
    title: "My Life 인쇄본", // [임시 — 성민 확정 필요] 2026-11-08
    body: "My Life 지도를 시기마다 A4 한 장씩 담아 보내 드려요. 빼고 싶은 이야기는 인쇄본에서만 뺄 수 있어요.", // [임시 — 성민 확정 필요] 2026-11-08
    cta: "인쇄본 보러 가기", // [임시 — 성민 확정 필요] 2026-11-08
    soonLabel: "곧 선보여요", // [임시 — 성민 확정 필요] 2026-11-08 — 금액 정하기 전(상품 비공개)
    href: "/shop/mylife-print",
    productId: "mylife-print",
    src: "/landing/print-cover.webp",
    alt: "My Life 인쇄본 표지 견본",
  },
  // 보조 = 준비 중. id 는 lib/commerce/products.ts 의 ProductId — 호출부(app/page.tsx)가 orderable:false 인 상품을 걸러낸다.
  soon: [
    { id: "book", title: "자서전 책", body: "이야기를 묶은, 세상에 하나뿐인 책." },
    { id: "charm", title: "인생 씨앗", body: "곁에 두는 작은 기록물." },
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
