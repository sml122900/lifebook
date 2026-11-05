// 고른 상태 표시 — 밤 우주 2단계(docs/phase/ui-night.md §9)에서 한 가지로 통일.
// 채운 밝은 판(bg-action) 대신: brand 테두리 + 테두리 빛(옅은 brand 고리) + banner 바탕 + 진한 글자.
// 라이트 온리 결정 4(선택 칩 = banner + brand 테두리, 필 금지)와 같은 뜻. 화면 낭독은 aria-pressed·aria-current 로.
export const SELECTED = "border-2 border-brand bg-banner text-ink ring-2 ring-brand/40";
