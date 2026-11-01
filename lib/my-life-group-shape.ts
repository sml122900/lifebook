// My Life 인물록·장소록 — 모임(묶음) 영역 모양의 결정 지점(한 곳). docs/phase/my-life-restructure.md §1.3.
//
// 성민이 1단계 화면을 보고 최종 결정 — 원으로 바꾸려면 GROUP_SHAPE 한 줄만 "ellipse" 로 바꾼다.
//   배치(lib/my-life-layout.ts)는 이 파일의 shapeAround·pointInShape 로 영역을 만들고, "각 칸은 자기 모임 영역
//   안에만, 다른 모임 영역 밖에" 를 검사해 어긋나면 칸 사이를 넓혀 다시 배치한다. 화면은 shapeRadiusCss 를 쓴다.
//   그래서 모양을 바꿔도 소속이 잘못 보이지 않는다(타원은 칸 묶음을 감싸려면 √2 배 커져 칸 사이가 자동으로 넓어짐).
// 순수 모듈(클라이언트도 씀).

export type GroupShapeKind = "roundRect" | "ellipse";

// ▼ 결정 지점 — "roundRect"(둥근 사각, 설계 추천) | "ellipse"(원·타원)
export const GROUP_SHAPE: GroupShapeKind = "roundRect";

export const SHAPE_PAD = 24; // 칸 묶음과 영역 테두리 사이 안쪽 여백 p
const MAX_RADIUS = SHAPE_PAD / 0.3; // 둥근 사각: 구석 칸 모서리가 둥근 곳 밖으로 안 나가려면 p ≥ 0.3r → r ≤ 80

export type Rect = { x: number; y: number; w: number; h: number };
export type GroupShape = Rect & { kind: GroupShapeKind };

// 칸 묶음(bbox)을 감싸는 영역.
export function shapeAround(cells: Rect, kind: GroupShapeKind = GROUP_SHAPE): GroupShape {
  const r = { x: cells.x - SHAPE_PAD, y: cells.y - SHAPE_PAD, w: cells.w + SHAPE_PAD * 2, h: cells.h + SHAPE_PAD * 2 };
  if (kind === "roundRect") return { ...r, kind };
  // 타원이 사각 r 의 네 구석을 지나려면 반지름이 각 축 절반의 √2 배.
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const a = (r.w / 2) * Math.SQRT2;
  const b = (r.h / 2) * Math.SQRT2;
  return { x: cx - a, y: cy - b, w: a * 2, h: b * 2, kind };
}

export function shapeRadius(s: Rect): number {
  return Math.min(0.4 * Math.min(s.w, s.h), MAX_RADIUS);
}

export function shapeRadiusCss(s: GroupShape): string {
  return s.kind === "ellipse" ? "50%" : `${shapeRadius(s)}px`;
}

export function pointInShape(s: GroupShape, x: number, y: number): boolean {
  if (s.kind === "ellipse") {
    const a = s.w / 2;
    const b = s.h / 2;
    const dx = (x - (s.x + a)) / a;
    const dy = (y - (s.y + b)) / b;
    return dx * dx + dy * dy <= 1;
  }
  if (x < s.x || x > s.x + s.w || y < s.y || y > s.y + s.h) return false;
  const r = shapeRadius(s);
  const cx = Math.min(Math.max(x, s.x + r), s.x + s.w - r);
  const cy = Math.min(Math.max(y, s.y + r), s.y + s.h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

// 사각형의 검사점 — 네 구석 + 네 변 가운데 + 가운데(타원이 변 가운데만 걸치는 경우까지).
export function probePoints(n: Rect): [number, number][] {
  const xs = [n.x, n.x + n.w / 2, n.x + n.w];
  const ys = [n.y, n.y + n.h / 2, n.y + n.h];
  return xs.flatMap((x) => ys.map((y) => [x, y] as [number, number]));
}

// 노드가 영역 안에 완전히(검사점 전부) / 밖에 완전히(검사점 하나도 안) 있는지.
export function rectInsideShape(s: GroupShape, n: Rect): boolean {
  return probePoints(n).every(([x, y]) => pointInShape(s, x, y));
}
export function rectOutsideShape(s: GroupShape, n: Rect): boolean {
  // 둥근 사각은 테두리 사각과 아예 안 겹쳐야 밖(엄격). 타원은 검사점 하나도 안 들어가면 밖.
  if (s.kind === "roundRect") return n.x >= s.x + s.w || n.x + n.w <= s.x || n.y >= s.y + s.h || n.y + n.h <= s.y;
  return probePoints(n).every(([x, y]) => !pointInShape(s, x, y));
}
