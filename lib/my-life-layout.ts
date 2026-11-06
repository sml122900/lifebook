// My Life 마인드맵 배치 — 순수 함수(DB·DOM·LLM 0). docs/phase/my-life-restructure.md §1 ·
// node-graph-self.md §6 2b.1 의 1·4 · 2b-3a 수정(고정 좌표 캔버스) · 우주 개편 U1(docs/phase/ui-space.md §1).
//
// 지도 = 고정 좌표계의 한 장(배율 1 = CSS px). 노드 크기·간격은 화면 크기·접힘·배율과 무관하다.
//   시간 줄기(U1 — Q104): 세로 한 줄. 시기 행성 → 그 시기 이야기 행성 → 다음 시기. 그림 단위 = "계 상자"(행성 + 위성 + 이름표가
//   차지하는 고정 사각형, x 56~416 · 폭 360). 계 상자 왼쪽에 연대 색 세로 줄(RAIL_X). 이야기·시기 행성 = 지름 128 / 128·144·160(Q105).
//   위성(사람·모임·장소 바로가기) = 행성 둘레 궤도를 돈다(U2 — lib/space-orbit, 6개 넘으면 기울인 두 번째 궤도). 행성을 고르면
//   그 행성 위성만 멈추고 행성 아래 3칸 줄(펼침 자리 = U1 정지 자리, 이름표 2줄)로 펼친다. 13개부터 11개 + "+N"(Q108).
//   계 상자 = 궤도(위성 원 + 이름표)와 펼침 칸 줄이 다 들어가는 크기(ui-space §1.2·§7.2).
//   인물·장소 행성 모음(인물록·장소록): x 480~ (제목 → [+ 사람][+ 모임] → 모임 칩(4개 이상) → 모임 성운 1~3개 → 모임 없는 분),
//   장소록은 그 아래 — 같은 모양. 칸 = 작은 행성 64 + 이름(120×124, 3열 384). 키: 모임 gl/gc · 장소 묶음 pgl/pgc.
//   사용자 카테고리(custom-graph 2단계 — §3.1): 장소록 아래 카테고리마다 영역 하나(제목 → [+ 항목][+ 묶음][+ 넣기] → 묶음 칩(4개 이상) →
//   묶음 성운 1~3개 → 묶음에 없는 것). 칸 = 사용자 항목(진짜 노드 cn:) · 바로가기(넣어 둔 6종·다른 카테고리 항목·묶음 —
//   ref:<카테고리>:<종류>:<id>, 한 카테고리 안에서 한 번). 묶음에 없는 칸 9개 넘으면 9개 + [N개 더 보기](Q82 ①), 사용자 카테고리
//   6개 이상이면 펼치지 않은 카테고리는 제목 줄 하나(Q82 ②). 키: 영역 제목 cat:<id>(누르면 카테고리 패널) · 묶음 cgl/cgc.
// 겹침: 시간 줄기는 계 상자를 쌓기만 하고 배치 뒤 resolveOverlaps 로 한 번 더 검사·해소(위성·행성 중심도 같이 내림).
//   위성은 nodes 가 아니라 satellites 에 따로 둔다(자기 계 상자 안 — 회귀가 상자 안·서로 간격을 검사).
//   인물록·장소록은 x 480 오른쪽에만 놓여 시간 줄기와 가로로 만날 수 없고, 안쪽은 칸 격자(구성상 0). 모임 영역은 "각 칸이
//   자기 모임 영역 안·다른 모임 영역 밖"을 검사해 어긋나면 칸 사이를 넓혀 다시 배치한다(모양은 lib/my-life-group-shape.ts 한 곳).
// 글자 폭은 재지 않는다 — 노드 크기는 종류·위성 수로만, 글자는 CSS 줄 수 제한으로 맞춘다.
// 클라이언트에서도 쓰므로 prisma 를 import 하지 않는다(타입만).

import type { ChipKind, MyLifeData, MyLifeEvent, MyLifeStory } from "./my-life";
import { customOf, type MyLifeCategory, type MyLifeCustom, type MyLifeRef } from "./my-life-custom";
import { MY_LIFE_COPY } from "./my-life-copy";
import { GROUP_SHAPE, rectInsideShape, rectOutsideShape, shapeAround, SHAPE_PAD, type GroupShape, type GroupShapeKind, type Rect } from "./my-life-group-shape";
import { LABEL_GAP, LABEL_H, orbitAssign, orbitFrac, orbitHalfHeight, orbitShape, SAT_R } from "./space-orbit";

const PAD = 40;
const TIME_X = 56; // 계 상자 왼쪽(왼쪽 연대 줄 자리)
const SYS_W = 360; // 계 상자 폭 = 위성 칸 3 × 112 + 사이 12 × 2

export const L = {
  PAD,
  TIME_X,
  SYS_W,
  TRUNK_X: TIME_X + SYS_W / 2, // 236 — 계 상자 가운데(처음 화면·[시간 줄기] 이동이 이 x 를 화면 가운데에)
  RAIL_X: 30, // 연대 색 세로 줄
  TOP_PAD: 32,
  BOTTOM_PAD: 120, // 오른쪽 아래 떠 있는 비서 버튼(64px)에 마지막 노드가 가리지 않게
  // 행성(Q105) — 이야기 128 고정, 시기 = 이야기 0~1·2~3·4 이상
  PLANET_STORY: 128,
  PLANET_PERIOD: [128, 144, 160] as readonly number[],
  SYS_PAD_TOP: 8,
  SYS_PAD_BOTTOM: 8,
  // 위성(정지 = 펼침 자리) — 행성 아래 3칸 줄, 첫 줄 바깥 두 칸은 조금 올려 궤도 느낌(ARC_LIFT)
  SAT_D: 48,
  SAT_CELL_W: 112,
  SAT_CELL_H: 100, // 원 48 + 4 + 이름표 2줄 48
  SAT_COL_GAP: 12,
  SAT_ROW_GAP: 8,
  SAT_TOP_GAP: 12, // 행성 아래 ~ 첫 줄
  SAT_PER_ROW: 3,
  SAT_MAX: 12, // 넘으면 11 + "+N"(Q108)
  ARC_LIFT: 12,
  SYS_GAP: 16, // 같은 띠 안 계 사이
  BAND_GAP: 40, // 띠(시기 하나와 그 이야기들) 사이
  FOLD_W: 220,
  FOLD_H: 56,
  FOLD_GAP: 12,
  YEAR_GAP_H: 40,
  YEAR_GAP_MIN: 10,
  OVERLAP_GAP: 12, // 겹침 해소 때 띄우는 간격
  // 간선(선택했을 때 — U1 은 그리지 않음, 연결 계산·차례 보기만 씀 — lib/my-life-edges)
  EDGE_DY: 22,
  CORRIDOR_X: 448,
  // 인물·장소 행성 모음
  REGION_X: 480,
  ITEM_W: 120,
  ITEM_H: 124, // 작은 행성 64 + 6 + 이름 2줄 48 + 여백
  ITEM_PLANET: 64,
  ITEM_GAP: 12,
  GRID_COLS: 3,
  CELL_GAP: 2 * SHAPE_PAD + 8, // 56 — 한 영역의 안쪽 여백이 남의 칸에 닿지 않게(설계 g ≥ 2p + 8)
  TITLE_H: 48,
  SUBTITLE_H: 40,
  LABEL_H: 56, // 모임 이름 버튼
  LABEL_GAP: 8,
  GROUP_CHIP_H: 56,
  SECTION_GAP: 24,
  REGION_GAP: 64,
  ADD_GAP: 12, // 영역 제목 아래 [+ 사람][+ 모임] 줄까지
  ADD_W: 300,
  ADD_H: 56,
  EMPTY_GROUP_W: 200, // 아무도 없는 모임도 영역이 보이게
  EMPTY_GROUP_H: 80,
  MAX_SHOWN_GROUPS: 3,
  CHIP_ROW_MAX: 640,
  // 사용자 카테고리(custom-graph 2단계)
  CAT_W: 384, // 3열 칸 폭 = 제목·접힘 칸 폭
  CAT_ADD_W: 330, // 제목 줄([펼치기]·[접기] 포함)·[+ 항목][+ 묶음][+ 넣기] — 390 에서 영역을 왼쪽 24 에 맞췄을 때 셋째 버튼이 화면 안(384 는 잘림 — 실측)
  CAT_FOLD_AT: 9, // 묶음에 없는 칸이 이보다 많으면 9개 + [N개 더 보기](Q82 ①)
  CAT_COLLAPSE_FROM: 6, // 사용자 카테고리가 이 수 이상이면 펼치지 않은 카테고리는 제목 줄(Q82 ②)
  CAT_TITLE_H: 56, // 영역 제목(누르면 카테고리 패널) — 제목 줄로 접힐 때도 같은 높이
} as const;

type Box = { key: string; x: number; y: number; w: number; h: number };

// 행성 — 계 상자 안 원(가운데·지름). 누르는 곳 = 이 원.
export type Planet = { cx: number; cy: number; d: number };

export type LayoutNode =
  | (Box & { kind: "event"; eventId: string; planet: Planet })
  | (Box & { kind: "story"; eventId: string; storyId: string; planet: Planet })
  | (Box & { kind: "fold"; eventId: string; count: number })
  | (Box & { kind: "gap"; years: number })
  | (Box & { kind: "person"; personId: string; hiddenGroups: number }) // hiddenGroups = 영역에 안 보이는 모임 수
  | (Box & { kind: "place"; placeId: string })
  | (Box & { kind: "groupLabel"; groupId: string; region: "people" | "places" })
  | (Box & { kind: "groupChip"; groupId: string; shown: boolean; region: "people" | "places" })
  | (Box & { kind: "regionAdd"; region: "people" | "places" }) // 영역 제목 옆 [+ 사람][+ 모임] / [+ 장소][+ 묶음]
  | (Box & { kind: "title"; region: "people" | "places" })
  | (Box & { kind: "subtitle"; region: "people" | "places" })
  // 사용자 카테고리(custom-graph 2단계) — 제목(collapsed = 제목 줄만 · foldable = [펼치기]/[접기] 버튼 · count = 칸 수)
  | (Box & { kind: "catTitle"; categoryId: string; collapsed: boolean; foldable: boolean; count: number })
  | (Box & { kind: "catAdd"; categoryId: string })
  | (Box & { kind: "catGroupLabel"; groupId: string; categoryId: string })
  | (Box & { kind: "catGroupChip"; groupId: string; categoryId: string; shown: boolean })
  | (Box & { kind: "catItem"; itemId: string; categoryId: string; hiddenGroups: number })
  | (Box & { kind: "catRef"; ref: MyLifeRef; categoryId: string; hiddenGroups: number })
  | (Box & { kind: "catMore"; categoryId: string; count: number; open: boolean })
  | (Box & { kind: "catSub"; categoryId: string })
  | (Box & { kind: "catEmpty"; categoryId: string });

// 위성 — 행성의 사람·모임·장소 바로가기(진짜 노드는 인물·장소 행성 모음에 한 번 — Q99). ref null = "+N" 칸(more = 숨은 수).
// 칸 = 원(cx, cy, SAT_D) + 아래 이름표 = 펼침 자리(U2). key = sat:<행성 키>:<종류>:<id> · "+N" = sat:<행성 키>:more.
// 공전(U2) — orbit = 궤도(0 = 첫 궤도, 1 = 60° 기울인 두 번째) · frac = 궤도 안 자리(0~1, 지연·정지 자리 — lib/space-orbit).
export type SatRef = { kind: ChipKind; id: string };
export type LayoutSatellite = Box & { planetKey: string; ref: SatRef | null; more: number; cx: number; cy: number; orbit: 0 | 1; frac: number };

export type LayoutShape = GroupShape & { groupId: string; index: number; region: "people" | "places" | "custom" }; // index = 영역 안 순서(테두리 무늬 구분)
export type LayoutBand = { eventId: string; top: number; bottom: number; centerMidY: number };
export type TrunkSegment = { y1: number; y2: number; decade: number | null };
export type Edge = { x1: number; y1: number; x2: number; y2: number };

export type MyLifeLayout = {
  width: number;
  height: number;
  nodes: LayoutNode[];
  satellites: LayoutSatellite[];
  edges: Edge[]; // U1 — 비어 있음(이야기도 줄기 위 행성이라 이음선 없음). 선택 간선 계산은 lib/my-life-edges
  trunk: TrunkSegment[]; // 왼쪽 연대 색 세로 줄(RAIL_X)
  bands: LayoutBand[];
  shapes: LayoutShape[];
  shownGroupIds: string[];
  shownPlaceGroupIds: string[];
  regions: { timeline: Rect; people: Rect; places: Rect; categories: { id: string; rect: Rect }[] };
  shownCustomGroupIds: string[]; // 사용자 카테고리마다 영역에 보이는 묶음(최대 3개씩)
  cellGap: number; // 모임 영역 칸 사이(소속 검사로 넓혀졌으면 56 보다 큼)
  shifted: number; // 시간 줄기 겹침 해소로 내린 횟수(정상 배치 = 0)
};

// 지도 노드 수(중심 + 이야기 + 인물 + 장소, 위성 제외) — 접기 기본값(Q41)·성능 상한 기준.
export function countMapNodes(data: MyLifeData): number {
  return data.events.reduce((n, e) => n + 1 + e.stories.length, 0) + data.people.length + data.places.length;
}

// 이 수를 넘으면 처음부터 모든 띠를 접는다(Q41). 인물·장소는 접히지 않으므로 시간 줄기 노드만 센다.
export const FOLD_ALL_ABOVE = 60;
export function countTimelineNodes(data: MyLifeData): number {
  return data.events.reduce((n, e) => n + 1 + e.stories.length, 0);
}

const WIDE = /[ᄀ-ᇿ　-鿿가-힯豈-﫿＀-￯]/;

// 글자 폭 추정 — 한글·한자 등 18px, 그 밖 10px, + 좌우 여백 22 + 테두리 4(모임 이름 버튼 폭).
function estimateChipWidth(text: string): number {
  let w = 26;
  for (const ch of text) w += WIDE.test(ch) ? 18 : 10;
  return w;
}

// 시기 노드의 사람·장소 — 시기에 바로 이은 분·곳 + 이 시기 이야기에 나온 분·곳(확정만, 모임 제외), 같은 분·곳은 한 번.
// 값 = 노드 id(이야기 장소는 늘 장소 노드 — 2026-11-03 이름만 남은 장소 예외 제거). 이야기 하나는 { personIds: [], placeIds: [], stories: [그 이야기] }.
// 노드 버튼 이름("사람·장소 N")·패널("사람 N · 장소 N")의 수(eventPeoplePlaces)와 지도 선택의 연결 표시·[연결된 곳 차례로 보기]
// (lib/my-life-edges connected)가 같이 쓴다(2026-11-02 E2E — 버튼 이름이 바로 이은 것만 세어 1 적던 것 · 3단계 E2E — 차례로 보기 수).
export function eventPeoplePlaceRefs(ev: Pick<MyLifeEvent, "personIds" | "placeIds" | "stories">): { people: Set<string>; places: Set<string> } {
  const r = eventPeoplePlaceList(ev);
  return { people: new Set(r.people.map((x) => x.id)), places: new Set(r.places.map((x) => x.id)) };
}

// 위 수·연결과 같은 목록 — 시기 패널의 "함께 나온 분"·"나온 곳"이 이름으로 보여 준다(3단계 최종 E2E 2026-11-02).
// direct = 시기에 바로 이은 것(패널에서 [빼기]) · 아니면 이야기에서만 나온 것(storyId = 처음 나온 이야기).
export type PeriodRef = { id: string; direct: boolean; storyId: string | null };
export function eventPeoplePlaceList(ev: Pick<MyLifeEvent, "personIds" | "placeIds" | "stories">): { people: PeriodRef[]; places: PeriodRef[] } {
  const direct = (id: string): PeriodRef => ({ id, direct: true, storyId: null });
  const people = new Map(ev.personIds.map((id) => [id, direct(id)]));
  const places = new Map(ev.placeIds.map((id) => [id, direct(id)]));
  for (const s of ev.stories) {
    for (const c of s.chips) {
      if (c.kind === "group") continue;
      const m = c.kind === "place" ? places : people;
      if (!m.has(c.id)) m.set(c.id, { id: c.id, direct: false, storyId: s.id });
    }
  }
  return { people: [...people.values()], places: [...places.values()] };
}

export function eventPeoplePlaces(ev: Pick<MyLifeEvent, "personIds" | "placeIds" | "stories">): { people: number; places: number } {
  const r = eventPeoplePlaceRefs(ev);
  return { people: r.people.size, places: r.places.size };
}

// 시기 연도 글자 — "1971" · 기간이면 "1971~1974" · 모르면 "연도 모름". 지도·목록·패널·만들기·이야기 상세 공용(2026-11-04 — 3벌을 한 곳으로).
export function yearText(ev: Pick<MyLifeEvent, "year" | "endYear">): string {
  if (ev.year === null) return MY_LIFE_COPY.yearUnknown;
  return ev.endYear !== null && ev.endYear !== ev.year ? `${ev.year}~${ev.endYear}` : `${ev.year}`;
}

// 꼬리표 — 그때의 나 > 다른 시기에도 순으로 하나만(나머지는 패널·버튼 이름에).
export type StoryTag = "self" | "elsewhere" | null;
export function storyTag(s: MyLifeStory): StoryTag {
  if (s.kind === "SELF") return "self";
  if (s.otherEventIds.length > 0) return "elsewhere";
  return null;
}

// 연대 스트립 색 단계 — 토큰은 1940~2020 년대만 있다.
export function decadeOf(year: number | null): number | null {
  if (year === null) return null;
  return Math.min(2020, Math.max(1940, Math.floor(year / 10) * 10));
}

// ── 행성·위성(U1 — ui-space §1.2·§1.3) ─────────────────────────────────

// 시기 행성 지름 — 이야기 0~1 = 128 · 2~3 = 144 · 4 이상 = 160(Q105).
export function periodPlanetD(stories: number): number {
  return L.PLANET_PERIOD[stories >= 4 ? 2 : stories >= 2 ? 1 : 0];
}

// 위성 순서 — 이야기 = 작은 물방울 순서(대상 인물 → 사람·모임 → 장소), 시기 = 바로 이은 사람 → 모임 → 장소(시기 위성 = 직접 연결만 —
// 이야기에서 나온 분·곳은 이야기 위성에 이미 있다, ui-space §1.1).
export function storySatRefs(s: Pick<MyLifeStory, "chips">): SatRef[] {
  return s.chips.map((c) => ({ kind: c.kind, id: c.id }));
}
export function eventSatRefs(ev: Pick<MyLifeEvent, "personIds" | "groupIds" | "placeIds">): SatRef[] {
  return [
    ...ev.personIds.map((id) => ({ kind: "person" as const, id })),
    ...ev.groupIds.map((id) => ({ kind: "group" as const, id })),
    ...ev.placeIds.map((id) => ({ kind: "place" as const, id })),
  ];
}

// 보이는 위성 수·"+N"(Q108) — 12개까지 전부, 13개부터 11개 + "+N"(N = n − 11).
export function satelliteSlots(n: number): { shown: number; more: number } {
  return n <= L.SAT_MAX ? { shown: n, more: 0 } : { shown: L.SAT_MAX - 1, more: n - (L.SAT_MAX - 1) };
}

// 궤도 수(Q108): 0 · 1~6 = 1 · 7 이상 = 2(칸 수 기준 — 13개부터는 11 + "+N" = 12칸이라 2).
export function orbitCount(n: number): number {
  return n === 0 ? 0 : n <= 6 ? 1 : 2;
}

// 계 하나 — 행성(가운데) + 궤도(U2 — 행성 둘레, 위성 7개부터 기울인 두 번째 궤도) + 아래 위성 칸 줄(= 펼침 자리, 3칸씩, 줄 폭만큼
// 가운데 맞춤, 첫 줄이 3칸이면 바깥 두 칸을 ARC_LIFT 만큼 올림). 행성 가운데는 궤도 위쪽(위성 원까지)이 상자 안에 들어오게 내리고,
// 상자 아래 = 펼침 칸 줄과 궤도 아래(위성 원 + 이름표) 중 더 아래(ui-space §1.2 — 펼침 자리는 U1 칸 줄 그대로, §7.2 설계와 다른 점).
function placeSystem(planetKey: string, y0: number, d: number, refs: SatRef[]): { h: number; planet: Planet; sats: LayoutSatellite[] } {
  const cx = L.TIME_X + L.SYS_W / 2;
  const { shown, more } = satelliteSlots(refs.length);
  const cells = shown + (more > 0 ? 1 : 0);
  if (cells === 0) return { h: L.SYS_PAD_TOP + d + L.SYS_PAD_BOTTOM, planet: { cx, cy: y0 + L.SYS_PAD_TOP + d / 2, d }, sats: [] };
  const assign = orbitAssign(cells);
  const halfH = Math.max(...[...new Set(assign.map((a) => a.orbit))].map((t) => orbitHalfHeight(orbitShape(d, t))));
  const planet: Planet = { cx, cy: y0 + L.SYS_PAD_TOP + Math.max(d / 2, halfH + SAT_R), d };
  const orbitBottom = planet.cy + halfH + SAT_R + LABEL_GAP + LABEL_H;
  const gridTop = planet.cy + d / 2 + L.SAT_TOP_GAP;
  const rows = Math.ceil(cells / L.SAT_PER_ROW);
  const sats: LayoutSatellite[] = [];
  for (let i = 0; i < cells; i++) {
    const r = Math.floor(i / L.SAT_PER_ROW);
    const col = i % L.SAT_PER_ROW;
    const inRow = Math.min(L.SAT_PER_ROW, cells - r * L.SAT_PER_ROW);
    const rowW = inRow * L.SAT_CELL_W + (inRow - 1) * L.SAT_COL_GAP;
    const x = cx - rowW / 2 + col * (L.SAT_CELL_W + L.SAT_COL_GAP);
    const lift = r === 0 && inRow === L.SAT_PER_ROW && col !== 1 ? L.ARC_LIFT : 0;
    const y = gridTop + r * (L.SAT_CELL_H + L.SAT_ROW_GAP) - lift;
    const ref = i < shown ? refs[i] : null;
    sats.push({
      key: ref ? `sat:${planetKey}:${ref.kind}:${ref.id}` : `sat:${planetKey}:more`,
      planetKey,
      ref,
      more: ref ? 0 : more,
      x,
      y,
      w: L.SAT_CELL_W,
      h: L.SAT_CELL_H,
      cx: x + L.SAT_CELL_W / 2,
      cy: y + L.SAT_D / 2,
      orbit: assign[i].orbit,
      frac: orbitFrac(assign[i]),
    });
  }
  const gridBottom = gridTop + rows * L.SAT_CELL_H + (rows - 1) * L.SAT_ROW_GAP;
  const h = Math.max(gridBottom, orbitBottom) + L.SYS_PAD_BOTTOM - y0;
  return { h, planet, sats };
}

const intersects = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// 노드 사각형끼리 겹치는 쌍(검사 — 회귀와 resolveOverlaps 가 같이 쓴다).
export function findOverlaps(nodes: readonly Box[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (intersects(nodes[i], nodes[j])) out.push([nodes[i].key, nodes[j].key]);
    }
  }
  return out;
}

const bboxOf = (rs: readonly Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
};

// ── 시간 줄기 ─────────────────────────────────────────────────────────

type Timeline = Pick<MyLifeLayout, "nodes" | "satellites" | "edges" | "trunk" | "bands" | "height" | "shifted">;

// 배치 후 겹침 해소 — 겹치는 쌍이 있으면 아래쪽 노드의 윗변 이하에 있는 모든 것(노드·행성 중심·그 위성·이음선·줄·띠)을
// 위 노드 아랫변 + 간격까지 내린다. 위아래 순서·좌우 위치는 그대로라 구조가 깨지지 않는다(시간 줄기 안에서만).
export function resolveOverlaps<T extends Timeline>(layout: T): T {
  const out: T = {
    ...layout,
    nodes: layout.nodes.map((n) => ("planet" in n ? { ...n, planet: { ...n.planet } } : { ...n })),
    satellites: layout.satellites.map((s) => ({ ...s })),
    edges: layout.edges.map((e) => ({ ...e })),
    trunk: layout.trunk.map((t) => ({ ...t })),
    bands: layout.bands.map((b) => ({ ...b })),
  };
  for (let guard = 0; guard < 10_000; guard++) {
    let pair: [LayoutNode, LayoutNode] | null = null;
    for (let i = 0; i < out.nodes.length && !pair; i++) {
      for (let j = i + 1; j < out.nodes.length; j++) {
        if (intersects(out.nodes[i], out.nodes[j])) {
          pair = out.nodes[i].y <= out.nodes[j].y ? [out.nodes[i], out.nodes[j]] : [out.nodes[j], out.nodes[i]];
          break;
        }
      }
    }
    if (!pair) break;
    const [upper, lower] = pair;
    const from = lower.y;
    const dy = upper.y + upper.h + L.OVERLAP_GAP - lower.y;
    // 아래 노드 자신과 그보다 아래에 있는 것만 — 두 노드가 같은 높이면 위 노드까지 같이 내려가 끝없이 돌던 결함 방지.
    const moved = new Set<string>();
    for (const n of out.nodes) {
      if (n === lower || n.y > from) {
        n.y += dy;
        if ("planet" in n) n.planet.cy += dy;
        moved.add(n.key);
      }
    }
    for (const s of out.satellites) {
      if (moved.has(s.planetKey)) {
        s.y += dy;
        s.cy += dy;
      }
    }
    for (const e of out.edges) {
      if (e.y1 >= from) e.y1 += dy;
      if (e.y2 >= from) e.y2 += dy;
    }
    for (const t of out.trunk) {
      if (t.y1 >= from) t.y1 += dy;
      if (t.y2 >= from) t.y2 += dy;
    }
    for (const b of out.bands) {
      if (b.top >= from) {
        b.top += dy;
        b.centerMidY += dy;
      }
      if (b.bottom >= from) b.bottom += dy;
    }
    out.height += dy;
    out.shifted += 1;
  }
  return out;
}

function layoutTimeline(data: MyLifeData, folded: ReadonlySet<string>): Timeline {
  const nodes: LayoutNode[] = [];
  const satellites: LayoutSatellite[] = [];
  const trunk: TrunkSegment[] = [];
  const bands: LayoutBand[] = [];
  let y = L.TOP_PAD;
  let prevYear: number | null = null;

  data.events.forEach((ev, idx) => {
    const segStart = y; // 줄은 앞 띠 끝에서 이어진다(연도 간격 표지 뒤로도 끊기지 않게)
    if (idx > 0 && ev.year !== null && prevYear !== null && ev.year - prevYear >= L.YEAR_GAP_MIN) {
      nodes.push({ key: `gap:${ev.id}`, kind: "gap", years: ev.year - prevYear, x: L.TRUNK_X - L.FOLD_W / 2, y, w: L.FOLD_W, h: L.YEAR_GAP_H });
      y += L.YEAR_GAP_H + L.SYS_GAP;
    }
    if (ev.year !== null) prevYear = ev.year;

    const top = y;
    const evKey = `ev:${ev.id}`;
    const es = placeSystem(evKey, y, periodPlanetD(ev.stories.length), eventSatRefs(ev));
    nodes.push({ key: evKey, kind: "event", eventId: ev.id, planet: es.planet, x: L.TIME_X, y, w: L.SYS_W, h: es.h });
    satellites.push(...es.sats);
    let bottom = y + es.h;
    if (ev.stories.length > 0 && folded.has(ev.id)) {
      const fy = bottom + L.FOLD_GAP;
      nodes.push({ key: `fold:${ev.id}`, kind: "fold", eventId: ev.id, count: ev.stories.length, x: L.TRUNK_X - L.FOLD_W / 2, y: fy, w: L.FOLD_W, h: L.FOLD_H });
      bottom = fy + L.FOLD_H;
    } else {
      for (const s of ev.stories) {
        const sy = bottom + L.SYS_GAP;
        const stKey = `st:${ev.id}:${s.id}`;
        const ss = placeSystem(stKey, sy, L.PLANET_STORY, storySatRefs(s));
        nodes.push({ key: stKey, kind: "story", eventId: ev.id, storyId: s.id, planet: ss.planet, x: L.TIME_X, y: sy, w: L.SYS_W, h: ss.h });
        satellites.push(...ss.sats);
        bottom = sy + ss.h;
      }
    }
    bands.push({ eventId: ev.id, top, bottom, centerMidY: es.planet.cy });
    trunk.push({ y1: segStart, y2: bottom + L.BAND_GAP, decade: decadeOf(ev.year) });
    y = bottom + L.BAND_GAP;
  });
  if (trunk.length > 0) trunk[trunk.length - 1].y2 = bands[bands.length - 1].bottom;
  return resolveOverlaps({ nodes, satellites, edges: [], trunk, bands, height: Math.max(y - L.BAND_GAP, L.TOP_PAD), shifted: 0 });
}

// ── 인물록·장소록(모임 영역) ────────────────────────────────────────────

// 칸 틀 — 영역에 보이는 모임 k 개(1~3)에서 소속 비트(모임 i = 1<<i) → [열, 줄]. 설계 §1.3.
const TEMPLATES: Record<number, Record<number, [number, number]>> = {
  1: { 1: [0, 0] },
  2: { 1: [0, 0], 3: [1, 0], 2: [2, 0] },
  3: { 1: [0, 0], 3: [1, 0], 2: [2, 0], 5: [0, 1], 7: [1, 1], 6: [2, 1], 4: [1, 2] },
};

// 칸 안 노드 격자 — 4개 이하 1열, 그 이상 2열.
function cellGrid(n: number): { cols: number; w: number; h: number } {
  const cols = n <= 4 ? 1 : 2;
  const rows = Math.ceil(n / cols);
  return { cols, w: cols * L.ITEM_W + (cols - 1) * L.ITEM_GAP, h: rows * L.ITEM_H + (rows - 1) * L.ITEM_GAP };
}

function labelWidth(name: string): number {
  return Math.min(320, Math.max(96, estimateChipWidth(name) + 24));
}

type Item = { id: string; groupIds: string[] };
type VennShape = Omit<LayoutShape, "region">;
type VennOut = { pos: Map<string, Rect>; shapes: VennShape[]; gap: number };

// 모임 영역 배치(원점 0,0 기준 — 부르는 쪽이 옮긴다). 소속 검사가 어긋나면 칸 사이를 넓혀 다시.
function placeVenn(items: Item[], shown: string[], kind: GroupShapeKind): VennOut {
  const k = shown.length;
  const tpl = TEMPLATES[k];
  const bySig = new Map<number, string[]>();
  for (const it of items) {
    let sig = 0;
    shown.forEach((g, i) => {
      if (it.groupIds.includes(g)) sig |= 1 << i;
    });
    if (sig === 0) continue;
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig)!.push(it.id);
  }
  // 아무도 없는 모임은 자기 "만" 칸을 빈 상자로 잡아 영역이 보이게.
  const reserved = new Set<number>();
  shown.forEach((_, i) => {
    const bit = 1 << i;
    if (![...bySig.keys()].some((s) => s & bit)) reserved.add(bit);
  });

  for (let gap = L.CELL_GAP; gap <= L.CELL_GAP + 24 * 20; gap += 24) {
    const size = new Map<number, { w: number; h: number; cols: number }>();
    for (const [sig, ids] of bySig) size.set(sig, cellGrid(ids.length));
    for (const sig of reserved) size.set(sig, { w: L.EMPTY_GROUP_W, h: L.EMPTY_GROUP_H, cols: 1 });
    const colW = [0, 0, 0];
    const rowH = [0, 0, 0];
    for (const [sig, s] of size) {
      const [c, r] = tpl[sig];
      colW[c] = Math.max(colW[c], s.w);
      rowH[r] = Math.max(rowH[r], s.h);
    }
    const xs = [0, colW[0] + gap, colW[0] + colW[1] + 2 * gap];
    const ys = [0, rowH[0] + gap, rowH[0] + rowH[1] + 2 * gap];
    const cellRect = new Map<number, Rect>();
    for (const [sig, s] of size) {
      const [c, r] = tpl[sig];
      cellRect.set(sig, { x: xs[c] + (colW[c] - s.w) / 2, y: ys[r] + (rowH[r] - s.h) / 2, w: s.w, h: s.h });
    }
    const pos = new Map<string, Rect>();
    for (const [sig, ids] of bySig) {
      const cr = cellRect.get(sig)!;
      const { cols } = size.get(sig)!;
      ids.forEach((id, j) => {
        pos.set(id, { x: cr.x + (j % cols) * (L.ITEM_W + L.ITEM_GAP), y: cr.y + Math.floor(j / cols) * (L.ITEM_H + L.ITEM_GAP), w: L.ITEM_W, h: L.ITEM_H });
      });
    }
    const shapes: VennShape[] = shown.map((groupId, i) => {
      const bit = 1 << i;
      const cells = [...cellRect.entries()].filter(([sig]) => sig & bit).map(([, r]) => r);
      return { ...shapeAround(bboxOf(cells), kind), groupId, index: i };
    });
    // 소속 검사 — 칸의 노드(빈 모임 상자 포함)는 자기 모임 영역 안·다른 모임 영역 밖.
    let ok = true;
    for (const [sig, cr] of cellRect) {
      const rects = reserved.has(sig) ? [cr] : (bySig.get(sig) ?? []).map((id) => pos.get(id)!);
      for (const r of rects) {
        shapes.forEach((s, i) => {
          const member = (sig & (1 << i)) !== 0;
          if (member ? !rectInsideShape(s, r) : !rectOutsideShape(s, r)) ok = false;
        });
      }
    }
    if (!ok) continue;
    return { pos, shapes, gap };
  }
  throw new Error("모임 영역 배치 실패 — 칸 사이를 넓혀도 소속이 어긋남");
}

type RegionOut = { nodes: LayoutNode[]; shapes: LayoutShape[]; rect: Rect };

// 모임 이름 버튼 — 1번째 위 왼쪽, 2번째 위 오른쪽, 3번째 아래 가운데. 위 둘이 겹치면 2번째를 한 줄 위로.
function placeLabels(shapes: VennShape[], names: Map<string, string>): { groupId: string; rect: Rect }[] {
  const out: { groupId: string; rect: Rect }[] = [];
  shapes.forEach((s, i) => {
    const w = labelWidth(names.get(s.groupId) ?? "");
    if (i === 0) out.push({ groupId: s.groupId, rect: { x: s.x + 8, y: s.y - L.LABEL_H - L.LABEL_GAP, w, h: L.LABEL_H } });
    else if (i === 1) {
      let r: Rect = { x: s.x + s.w - 8 - w, y: s.y - L.LABEL_H - L.LABEL_GAP, w, h: L.LABEL_H };
      if (out.some((o) => intersects(o.rect, r))) r = { ...r, y: r.y - L.LABEL_H - L.LABEL_GAP };
      out.push({ groupId: s.groupId, rect: r });
    } else out.push({ groupId: s.groupId, rect: { x: s.x + s.w / 2 - w / 2, y: s.y + s.h + L.LABEL_GAP, w, h: L.LABEL_H } });
  });
  return out;
}

// 한 영역(인물록 또는 장소록) — 제목 → (모임 칩) → 모임 영역 → (소제목) 무소속 격자.
function layoutRegion(
  region: "people" | "places",
  items: (Item & { kind: "person" | "place"; extraKey?: number })[],
  groups: { id: string; name: string; memberIds: string[] }[],
  shownIn: readonly string[],
  top: number,
  kind: GroupShapeKind,
): RegionOut & { shownGroupIds: string[]; cellGap: number } {
  const x0 = L.REGION_X;
  const nodes: LayoutNode[] = [];
  const shapes: LayoutShape[] = [];
  let y = top;
  nodes.push({ key: `title:${region}`, kind: "title", region, x: x0, y, w: 240, h: L.TITLE_H });
  // [+ 사람][+ 모임] 은 제목 아래 줄 — 제목 오른쪽이면 390 화면에서 영역 왼쪽에 맞췄을 때 둘째 버튼이 화면 밖(실측).
  y += L.TITLE_H + L.ADD_GAP;
  nodes.push({ key: `add:${region}`, kind: "regionAdd", region, x: x0, y, w: L.ADD_W, h: L.ADD_H });
  y += L.ADD_H + L.SECTION_GAP;
  const gl = region === "people" ? "gl" : "pgl";
  const gc = region === "people" ? "gc" : "pgc";

  // 영역에 보일 모임 — 고른 것(있으면) 우선, 모자라면 인원 많은 순, 최대 3개(Q52).
  const valid = new Set(groups.map((g) => g.id));
  const bySize = [...groups].sort((a, b) => b.memberIds.length - a.memberIds.length || a.name.localeCompare(b.name, "ko"));
  const shown = [...new Set([...shownIn.filter((id) => valid.has(id)), ...bySize.map((g) => g.id)])].slice(0, L.MAX_SHOWN_GROUPS);

  // 모임 4개 이상 — 영역에 보일 모임을 고르는 칩 줄.
  if (groups.length > L.MAX_SHOWN_GROUPS) {
    let cx = x0;
    for (const g of groups) {
      const w = labelWidth(g.name) + 32; // "✓" 자리
      if (cx > x0 && cx + w > x0 + L.CHIP_ROW_MAX) {
        cx = x0;
        y += L.GROUP_CHIP_H + L.ITEM_GAP;
      }
      nodes.push({ key: `${gc}:${g.id}`, kind: "groupChip", groupId: g.id, shown: shown.includes(g.id), region, x: cx, y, w, h: L.GROUP_CHIP_H });
      cx += w + L.ITEM_GAP;
    }
    y += L.GROUP_CHIP_H + L.SECTION_GAP;
  }

  let cellGap: number = L.CELL_GAP;
  const placedIds = new Set<string>();
  if (shown.length > 0) {
    const v = placeVenn(items, shown, kind);
    cellGap = v.gap;
    const names = new Map(groups.map((g) => [g.id, g.name]));
    const labels = placeLabels(v.shapes, names);
    const all = [...v.shapes, ...labels.map((l) => l.rect)];
    const bb = bboxOf(all);
    const dx = x0 - bb.x;
    const dy = y - bb.y;
    for (const s of v.shapes) shapes.push({ ...s, region, x: s.x + dx, y: s.y + dy });
    for (const l of labels) nodes.push({ key: `${gl}:${l.groupId}`, kind: "groupLabel", groupId: l.groupId, region, x: l.rect.x + dx, y: l.rect.y + dy, w: l.rect.w, h: l.rect.h });
    for (const it of items) {
      const p = v.pos.get(it.id);
      if (!p) continue;
      placedIds.add(it.id);
      const hiddenGroups = it.groupIds.filter((g) => !shown.includes(g)).length;
      nodes.push(
        it.kind === "person"
          ? { key: `pe:${it.id}`, kind: "person", personId: it.id, hiddenGroups, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h }
          : { key: `pl:${it.id}`, kind: "place", placeId: it.id, x: p.x + dx, y: p.y + dy, w: p.w, h: p.h },
      );
    }
    y += bb.h + L.SECTION_GAP;
  }

  // 무소속(영역에 보이는 모임에 하나도 안 속한 것) 격자.
  const rest = items.filter((it) => !placedIds.has(it.id));
  if (rest.length > 0) {
    if (groups.length > 0) {
      nodes.push({ key: `sub:${region}`, kind: "subtitle", region, x: x0, y, w: 240, h: L.SUBTITLE_H });
      y += L.SUBTITLE_H + L.ITEM_GAP;
    }
    rest.forEach((it, j) => {
      const x = x0 + (j % L.GRID_COLS) * (L.ITEM_W + L.ITEM_GAP);
      const yy = y + Math.floor(j / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP);
      const hiddenGroups = it.groupIds.filter((g) => !shown.includes(g)).length;
      nodes.push(
        it.kind === "person"
          ? { key: `pe:${it.id}`, kind: "person", personId: it.id, hiddenGroups, x, y: yy, w: L.ITEM_W, h: L.ITEM_H }
          : { key: `pl:${it.id}`, kind: "place", placeId: it.id, x, y: yy, w: L.ITEM_W, h: L.ITEM_H },
      );
    });
    y += Math.ceil(rest.length / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP) - L.ITEM_GAP;
  }
  const rect = bboxOf([...nodes, ...shapes]);
  return { nodes, shapes, rect, shownGroupIds: shown, cellGap };
}

// ── 사용자 카테고리 영역(custom-graph 2단계 — docs/phase/custom-graph.md §3.1) ─────────────────────

// 카테고리 영역의 칸 — 사용자 항목(자리 = 이 카테고리) 먼저, 그다음 바로가기(카테고리에 바로 넣은 것 + 그 안 묶음에 넣은 것,
// 같은 노드는 한 번). groupIds = 이 카테고리 묶음 중 그 칸이 든 것.
export type CatEntry = { key: string; itemId: string | null; ref: MyLifeRef | null; groupIds: string[] };
export function categoryEntries(cat: Pick<MyLifeCategory, "id" | "refs">, custom: MyLifeCustom): CatEntry[] {
  const groups = custom.groups.filter((g) => g.categoryId === cat.id);
  const inGroups = (r: MyLifeRef) => groups.filter((g) => g.memberRefs.some((m) => m.type === r.type && m.id === r.id)).map((g) => g.id);
  const homeOf = new Map(custom.items.map((i) => [i.id, i.categoryId]));
  const out: CatEntry[] = [];
  const seen = new Set<string>();
  for (const it of custom.items) {
    if (it.categoryId !== cat.id) continue;
    seen.add(`CUSTOM:${it.id}`);
    out.push({ key: `cn:${it.id}`, itemId: it.id, ref: null, groupIds: inGroups({ type: "CUSTOM", id: it.id }) });
  }
  for (const r of [...cat.refs, ...groups.flatMap((g) => g.memberRefs)]) {
    const k = `${r.type}:${r.id}`;
    if (seen.has(k) || (r.type === "CUSTOM" && homeOf.get(r.id) === cat.id)) continue;
    seen.add(k);
    out.push({ key: `ref:${cat.id}:${r.type}:${r.id}`, itemId: null, ref: r, groupIds: inGroups(r) });
  }
  return out;
}

type CatOpts = { collapsed: boolean; foldable: boolean; moreOpen: boolean; shownIn: readonly string[]; kind: GroupShapeKind };

function layoutCategory(cat: MyLifeCategory, custom: MyLifeCustom, top: number, o: CatOpts): RegionOut & { shownGroupIds: string[] } {
  const x0 = L.REGION_X;
  const nodes: LayoutNode[] = [];
  const shapes: LayoutShape[] = [];
  const entries = categoryEntries(cat, custom);
  const groups = custom.groups.filter((g) => g.categoryId === cat.id);
  let y = top;
  nodes.push({ key: `cat:${cat.id}`, kind: "catTitle", categoryId: cat.id, collapsed: o.collapsed, foldable: o.foldable, count: entries.length, x: x0, y, w: L.CAT_ADD_W, h: L.CAT_TITLE_H });
  if (o.collapsed) return { nodes, shapes, rect: bboxOf(nodes), shownGroupIds: [] };
  y += L.CAT_TITLE_H + L.ADD_GAP;
  nodes.push({ key: `add:cat:${cat.id}`, kind: "catAdd", categoryId: cat.id, x: x0, y, w: L.CAT_ADD_W, h: L.ADD_H });
  y += L.ADD_H + L.SECTION_GAP;

  const valid = new Set(groups.map((g) => g.id));
  const size = (g: { id: string }) => entries.filter((e) => e.groupIds.includes(g.id)).length;
  const bySize = [...groups].sort((a, b) => size(b) - size(a) || a.name.localeCompare(b.name, "ko"));
  const shown = [...new Set([...o.shownIn.filter((id) => valid.has(id)), ...bySize.map((g) => g.id)])].slice(0, L.MAX_SHOWN_GROUPS);
  if (groups.length > L.MAX_SHOWN_GROUPS) {
    let cx = x0;
    for (const g of groups) {
      const w = labelWidth(g.name) + 32;
      if (cx > x0 && cx + w > x0 + L.CHIP_ROW_MAX) {
        cx = x0;
        y += L.GROUP_CHIP_H + L.ITEM_GAP;
      }
      nodes.push({ key: `cgc:${g.id}`, kind: "catGroupChip", groupId: g.id, categoryId: cat.id, shown: shown.includes(g.id), x: cx, y, w, h: L.GROUP_CHIP_H });
      cx += w + L.ITEM_GAP;
    }
    y += L.GROUP_CHIP_H + L.SECTION_GAP;
  }
  const cell = (e: CatEntry, x: number, yy: number): LayoutNode => {
    const hiddenGroups = e.groupIds.filter((g) => !shown.includes(g)).length;
    return e.itemId
      ? { key: e.key, kind: "catItem", itemId: e.itemId, categoryId: cat.id, hiddenGroups, x, y: yy, w: L.ITEM_W, h: L.ITEM_H }
      : { key: e.key, kind: "catRef", ref: e.ref!, categoryId: cat.id, hiddenGroups, x, y: yy, w: L.ITEM_W, h: L.ITEM_H };
  };
  const placed = new Set<string>();
  if (shown.length > 0) {
    const v = placeVenn(entries.map((e) => ({ id: e.key, groupIds: e.groupIds })), shown, o.kind);
    const labels = placeLabels(v.shapes, new Map(groups.map((g) => [g.id, g.name])));
    const bb = bboxOf([...v.shapes, ...labels.map((l) => l.rect)]);
    const dx = x0 - bb.x;
    const dy = y - bb.y;
    for (const s of v.shapes) shapes.push({ ...s, region: "custom", x: s.x + dx, y: s.y + dy });
    for (const l of labels) nodes.push({ key: `cgl:${l.groupId}`, kind: "catGroupLabel", groupId: l.groupId, categoryId: cat.id, x: l.rect.x + dx, y: l.rect.y + dy, w: l.rect.w, h: l.rect.h });
    for (const e of entries) {
      const p = v.pos.get(e.key);
      if (!p) continue;
      placed.add(e.key);
      nodes.push(cell(e, p.x + dx, p.y + dy));
    }
    y += bb.h + L.SECTION_GAP;
  }
  const rest = entries.filter((e) => !placed.has(e.key));
  if (rest.length > 0) {
    if (groups.length > 0) {
      nodes.push({ key: `sub:cat:${cat.id}`, kind: "catSub", categoryId: cat.id, x: x0, y, w: L.CAT_W, h: L.SUBTITLE_H });
      y += L.SUBTITLE_H + L.ITEM_GAP;
    }
    const folds = rest.length > L.CAT_FOLD_AT;
    const shownRest = folds && !o.moreOpen ? rest.slice(0, L.CAT_FOLD_AT) : rest;
    shownRest.forEach((e, j) => nodes.push(cell(e, x0 + (j % L.GRID_COLS) * (L.ITEM_W + L.ITEM_GAP), y + Math.floor(j / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP))));
    y += Math.ceil(shownRest.length / L.GRID_COLS) * (L.ITEM_H + L.ITEM_GAP);
    if (folds) {
      nodes.push({ key: `more:cat:${cat.id}`, kind: "catMore", categoryId: cat.id, count: rest.length - L.CAT_FOLD_AT, open: o.moreOpen, x: x0, y, w: L.CAT_W, h: L.FOLD_H });
      y += L.FOLD_H + L.ITEM_GAP;
    }
  } else if (groups.length === 0) {
    nodes.push({ key: `empty:cat:${cat.id}`, kind: "catEmpty", categoryId: cat.id, x: x0, y, w: L.CAT_W, h: L.SUBTITLE_H });
  }
  return { nodes, shapes, rect: bboxOf([...nodes, ...shapes]), shownGroupIds: shown };
}

export function layoutMyLife(
  data: MyLifeData,
  // shapeKind — 회귀가 원 모양으로도 소속 검사를 돌릴 때만. 화면은 결정 지점(GROUP_SHAPE) 그대로.
  // openCats — 사용자 카테고리 6개 이상일 때 펼친 카테고리(Q82 ②) · moreCats — [N개 더 보기]를 연 카테고리(Q82 ①) · shownCustomGroupIds — 묶음 칩으로 고른 묶음.
  opts: {
    folded?: ReadonlySet<string>;
    shownGroupIds?: readonly string[];
    shownPlaceGroupIds?: readonly string[];
    shapeKind?: GroupShapeKind;
    openCats?: ReadonlySet<string>;
    moreCats?: ReadonlySet<string>;
    shownCustomGroupIds?: readonly string[];
  } = {},
): MyLifeLayout {
  const kind = opts.shapeKind ?? GROUP_SHAPE;
  const t = layoutTimeline(data, opts.folded ?? new Set<string>());
  const people = layoutRegion(
    "people",
    data.people.map((p) => ({ id: p.id, groupIds: p.groupIds, kind: "person" as const })),
    data.groups,
    opts.shownGroupIds ?? [],
    L.TOP_PAD,
    kind,
  );
  const places = layoutRegion(
    "places",
    data.places.map((p) => ({ id: p.id, groupIds: p.groupIds ?? [], kind: "place" as const })),
    data.placeGroups ?? [],
    opts.shownPlaceGroupIds ?? [],
    people.rect.y + people.rect.h + L.REGION_GAP,
    kind,
  );
  const custom = customOf(data);
  const foldable = custom.categories.length >= L.CAT_COLLAPSE_FROM;
  let catTop = places.rect.y + places.rect.h + L.REGION_GAP;
  const cats = custom.categories.map((cat) => {
    const r = layoutCategory(cat, custom, catTop, {
      collapsed: foldable && !(opts.openCats?.has(cat.id) ?? false),
      foldable,
      moreOpen: opts.moreCats?.has(cat.id) ?? false,
      shownIn: opts.shownCustomGroupIds ?? [],
      kind,
    });
    catTop = r.rect.y + r.rect.h + (foldable ? L.ITEM_GAP : L.REGION_GAP);
    return { id: cat.id, ...r };
  });
  const timelineRect: Rect = { x: L.TIME_X, y: L.TOP_PAD, w: L.SYS_W, h: Math.max(t.height - L.TOP_PAD, L.PLANET_STORY) };
  const nodes = [...t.nodes, ...people.nodes, ...places.nodes, ...cats.flatMap((c) => c.nodes)];
  const shapes = [...people.shapes, ...places.shapes, ...cats.flatMap((c) => c.shapes)];
  const rightBottom = cats.length > 0 ? cats[cats.length - 1].rect.y + cats[cats.length - 1].rect.h : places.rect.y + places.rect.h;
  const right = bboxOf([...nodes, ...shapes, timelineRect]);
  return {
    width: right.x + right.w + L.PAD,
    height: Math.max(t.height, rightBottom) + L.BOTTOM_PAD,
    nodes,
    satellites: t.satellites,
    edges: t.edges,
    trunk: t.trunk,
    bands: t.bands,
    shapes,
    shownGroupIds: people.shownGroupIds,
    shownPlaceGroupIds: places.shownGroupIds,
    regions: { timeline: timelineRect, people: people.rect, places: places.rect, categories: cats.map((c) => ({ id: c.id, rect: c.rect })) },
    shownCustomGroupIds: cats.flatMap((c) => c.shownGroupIds),
    cellGap: people.cellGap,
    shifted: t.shifted,
  };
}

// 화면 가운데(세계 y)에 가장 가까운 띠 — "지금 보는 시기"(행성 고리·지도 상자 낭독 이름).
export function bandAt(layout: Pick<MyLifeLayout, "bands">, worldY: number): LayoutBand | null {
  let best: LayoutBand | null = null;
  let bestD = Infinity;
  for (const b of layout.bands) {
    const d = worldY < b.top ? b.top - worldY : worldY > b.bottom ? worldY - b.bottom : 0;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
