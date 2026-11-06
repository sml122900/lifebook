// 행성 꾸미기 목록(우주 개편 U4 — docs/phase/ui-space.md §5·§7.5). 2026-11-05 성민 확정 8종 — 키와 표시 이름, 이 순서.
// 목록은 코드에만 둔다(DB NodeDecoration.shape = 문자열, CHECK 없음 — 정합 점검 15 가 목록 밖 값을 보고). 이름은 뜻이 아니라 모양.
// 행성(시기·이야기) 하나에 하나(NodeDecoration 유일). 꾸미기 없음 = 행 없음.

export const DECOR_SHAPES = [
  { key: "ring", name: "고리" },
  { key: "comet", name: "혜성 꼬리" },
  { key: "aurora", name: "오로라" },
  { key: "stardust", name: "별빛 가루" },
  { key: "flare", name: "태양 플레어" },
  { key: "vortex", name: "소용돌이" },
  { key: "binary", name: "쌍둥이 별" },
  { key: "blackhole", name: "블랙홀" },
] as const;

export type DecorShape = (typeof DECOR_SHAPES)[number]["key"];

const KEYS = new Set<string>(DECOR_SHAPES.map((s) => s.key));
export const isDecorShape = (v: unknown): v is DecorShape => typeof v === "string" && KEYS.has(v);
export const decorName = (key: string): string => DECOR_SHAPES.find((s) => s.key === key)?.name ?? "";
