// My Life 인쇄본 배치(2026-11-08 — docs/phase/print-mylife.md 확정안: 시기별 장 나누기 · A4 세로 · 속지 밝은 판 + 표지 밤 판 ·
// 간선 = 위성 + 같은 장 오른쪽 목록 점선 · 위성 전부 · 이야기 제목만 · 다른 분 이름 첫 글자 선택).
// 순수 함수(DB·화면 의존 0) — 출력 편집 화면 미리보기·주문 스냅샷(ProductOrder.printSnapshot)·발주 PDF 가 같은 결과를 쓴다.
// 실제 지도는 안 바뀐다(빼기·간선·이니셜은 이 결과에만).
//
// 좌표 = 인쇄 px(1px = 0.25mm). A4 세로 = 840 × 1188. 여백 40(10mm) · 머리말·꼬리말 띠 40씩 → 본문 760 × 1028(x 40, y 80).
// 본문: 왼쪽 시간 줄기 열 360(지도 계 상자 폭 그대로) · 사이 48 · 오른쪽 "이 장에 나온 분·곳" 목록 252.

import type { MyLifeData, MyLifeEvent } from "./my-life";
import { displayTitle } from "./story-title";

export const PRINT = {
  PAGE_W: 840,
  PAGE_H: 1188,
  BLEED: 12, // 표지(밤 판)만 사방 도련 3mm
  BODY_X: 40,
  BODY_Y: 80,
  BODY_W: 760,
  BODY_H: 1028,
  COL_W: 360, // 시간 줄기 열 = 지도 계 상자 폭(위성 칸 3 × 112 + 사이 12 × 2)
  LIST_X: 408, // 본문 안 x — 360 + 48
  LIST_W: 252,
  LIST_ROW: 40,
  CONT_H: 48, // 장 첫머리 "(이어서) 시기 이름" 줄
  BAND_GAP: 24, // 같은 장 안 시기 사이(계 사이 16 에 더함)
  // 지도와 같은 크기(lib/my-life-layout L — 행성·위성 모양은 화면과 같게)
  PLANET_STORY: 128,
  PLANET_PERIOD: [128, 144, 160] as readonly number[],
  SYS_PAD: 8,
  SAT_D: 48,
  SAT_CELL_W: 112,
  SAT_CELL_H: 100,
  SAT_COL_GAP: 12,
  SAT_ROW_GAP: 8,
  SAT_TOP_GAP: 12,
  SAT_PER_ROW: 3,
  SYS_GAP: 16,
  MAX_PAGES: 20, // 장수 상한(표지 포함 — 2026-11-09 성민: 20장 × 8,000원 = 토스 신고 최고가 160,000원, lib/commerce/print-price)
  LIST_PAGE_ROWS: 20, // 인물록·장소록 장 한 장 줄 수(제목 64 + 줄 48 × 20 ≤ 1028)
} as const;

export type PrintOptions = {
  excluded: string[]; // 출력에서 뺀 노드 키(아래 printKey) — 없는 노드 키는 무시
  showPeopleEdges: boolean;
  showPlaceEdges: boolean;
  initials: boolean; // 다른 분 이름을 첫 글자로(Q9 — 기본 끔)
};

export const DEFAULT_PRINT_OPTIONS: PrintOptions = { excluded: [], showPeopleEdges: true, showPlaceEdges: true, initials: false };

// 인쇄용 노드 키 — 지도 키와 같은 머리(이야기는 시기 없이 st:<이야기>)
export const printKey = {
  event: (id: string) => `ev:${id}`,
  story: (id: string) => `st:${id}`,
  person: (id: string) => `pe:${id}`,
  place: (id: string) => `pl:${id}`,
  group: (id: string) => `gl:${id}`,
  placeGroup: (id: string) => `pgl:${id}`,
  category: (id: string) => `cat:${id}`,
  item: (id: string) => `cn:${id}`,
};

// 지금 지도에 있는 노드 키 — 저장된 빼기 목록에서 지워진 노드 키를 거른다(§2.2).
export function liveKeys(data: MyLifeData): Set<string> {
  const keys = new Set<string>();
  for (const e of data.events) {
    keys.add(printKey.event(e.id));
    for (const s of e.stories) keys.add(printKey.story(s.id));
  }
  for (const p of data.people) keys.add(printKey.person(p.id));
  for (const p of data.places) keys.add(printKey.place(p.id));
  for (const g of data.groups) keys.add(printKey.group(g.id));
  for (const g of data.placeGroups) keys.add(printKey.placeGroup(g.id));
  for (const c of data.custom?.categories ?? []) keys.add(printKey.category(c.id));
  for (const it of data.custom?.items ?? []) keys.add(printKey.item(it.id));
  return keys;
}

export type SatKind = "person" | "group" | "place";
export type PrintSat = { kind: SatKind; key: string; name: string; x: number; y: number }; // x·y = 원 가운데(본문 좌표)
export type PrintSystem = {
  kind: "period" | "story";
  key: string;
  self: boolean; // 그때의 나(SELF) — 지도처럼 다른 테두리
  label: string; // 시기 이름 / 이야기 제목(제목만 — Q8)
  year: string | null; // "1979" · "1979~1983"(시기만)
  startYear: number | null; // 연대 색 줄
  decor: string | null; // 꾸미기 모양 키(lib/space-decor) — 정지 그림
  x: number; // 행성 가운데(본문 좌표)
  y: number; // 행성 위 끝(본문 좌표)
  d: number; // 행성 지름
  sats: PrintSat[];
  h: number; // 계 상자 높이
};
// lines = 그 종류 간선을 켰을 때 위성 → 목록 점선. (§2.3 "한 분이 6번 넘게 나오면 점선 없이" 는 한 장 계 상자가 최대 6개라 생기지 않아 두지 않음 — 회귀 ③)
export type PrintListEntry = { key: string; kind: SatKind; name: string; y: number; lines: boolean };
export type PrintEdge = { from: { x: number; y: number }; to: { x: number; y: number }; kind: SatKind };
export type PrintRow = { name: string; sub: string | null; pages: number[]; indent: boolean };

export type PrintPage =
  | { kind: "cover"; owner: string; toc: { label: string; page: number }[] }
  | {
      kind: "period";
      periods: { label: string; years: string | null }[]; // 이 장에 담긴 시기(묶기면 여럿)
      continued: boolean; // 앞 장에서 이어진 시기로 시작
      continues: boolean; // 다음 장으로 이어짐
      nextLabel: string | null; // 다음 장 첫 시기
      prevLabel: string | null; // 앞 장 마지막 시기
      systems: PrintSystem[];
      list: PrintListEntry[];
      listMore: number; // 목록에 못 담은 수
      edges: PrintEdge[];
    }
  | { kind: "people" | "places" | "custom"; title: string | null; rows: PrintRow[] };

export type PrintLayout = { pages: PrintPage[]; pageCount: number; overLimit: boolean };

const yearText = (e: Pick<MyLifeEvent, "year" | "endYear">): string | null =>
  e.year == null ? null : e.endYear != null && e.endYear !== e.year ? `${e.year}~${e.endYear}` : String(e.year);

// 다른 분 이름 → 첫 글자 + ○(Q9). "김영희" → "김○○", 한 글자면 "○".
export function initialName(name: string): string {
  const chars = [...name.trim()];
  if (chars.length <= 1) return chars.length ? "○" : name;
  return `${chars[0]}${"○".repeat(Math.min(chars.length - 1, 2))}`;
}

// 계 상자 높이 — 위성이 없으면 8 + 행성 + 8, 있으면 + 12 + 줄 수 × (100 + 8) − 8.
export function systemHeight(d: number, nSats: number): number {
  const rows = Math.ceil(nSats / PRINT.SAT_PER_ROW);
  return PRINT.SYS_PAD + d + (rows ? PRINT.SAT_TOP_GAP + rows * (PRINT.SAT_CELL_H + PRINT.SAT_ROW_GAP) - PRINT.SAT_ROW_GAP : 0) + PRINT.SYS_PAD;
}

type SatSeed = Omit<PrintSat, "x" | "y">;

function placeSats(cx: number, top: number, d: number, list: SatSeed[]): PrintSat[] {
  const rowW = PRINT.SAT_PER_ROW * PRINT.SAT_CELL_W + (PRINT.SAT_PER_ROW - 1) * PRINT.SAT_COL_GAP;
  const left = cx - rowW / 2;
  return list.map((s, i) => ({
    ...s,
    x: left + (i % PRINT.SAT_PER_ROW) * (PRINT.SAT_CELL_W + PRINT.SAT_COL_GAP) + PRINT.SAT_CELL_W / 2,
    y: top + d + PRINT.SAT_TOP_GAP + Math.floor(i / PRINT.SAT_PER_ROW) * (PRINT.SAT_CELL_H + PRINT.SAT_ROW_GAP) + PRINT.SAT_D / 2,
  }));
}

type Draft = Omit<PrintSystem, "y" | "sats" | "h"> & { shown: SatSeed[]; all: SatSeed[] };

// 한 계가 한 장보다 크면(위성 24개 넘게 — 드묾) 위성을 장에 맞게 줄임. 줄인 분·곳도 오른쪽 목록·인물록에는 남는다.
const SAT_CAP =
  Math.floor(
    (PRINT.BODY_H - PRINT.CONT_H - 2 * PRINT.SYS_PAD - PRINT.PLANET_PERIOD[2] - PRINT.SAT_TOP_GAP + PRINT.SAT_ROW_GAP) /
      (PRINT.SAT_CELL_H + PRINT.SAT_ROW_GAP),
  ) * PRINT.SAT_PER_ROW;

export function layoutPrint(data: MyLifeData, owner: string, opts: PrintOptions): PrintLayout {
  const ex = new Set(opts.excluded);
  const people = new Map(data.people.map((p) => [p.id, p]));
  const places = new Map(data.places.map((p) => [p.id, p]));
  const groups = new Map(data.groups.map((g) => [g.id, g]));
  const personName = (id: string) => {
    const n = people.get(id)?.name ?? "";
    return opts.initials ? initialName(n) : n;
  };
  const satOf = (kind: SatKind, id: string): SatSeed | null => {
    if (kind === "person") return people.has(id) && !ex.has(printKey.person(id)) ? { kind, key: printKey.person(id), name: personName(id) } : null;
    if (kind === "place") return places.has(id) && !ex.has(printKey.place(id)) ? { kind, key: printKey.place(id), name: places.get(id)!.name } : null;
    return groups.has(id) && !ex.has(printKey.group(id)) ? { kind, key: printKey.group(id), name: groups.get(id)!.name } : null;
  };
  const edgeOn = (k: SatKind) => (k === "place" ? opts.showPlaceEdges : opts.showPeopleEdges);
  const uniq = (xs: (SatSeed | null)[]) => {
    const seen = new Set<string>();
    return xs.filter((x): x is SatSeed => !!x && !seen.has(x.key) && !!seen.add(x.key));
  };
  const draft = (base: Omit<Draft, "shown" | "all">, all: SatSeed[]): Draft => ({ ...base, all, shown: all.filter((s) => edgeOn(s.kind)).slice(0, SAT_CAP) });

  // 시기별 계 목록(시간 순 — 지도 데이터 순서 그대로). 이야기는 주 소속 시기에서 한 번만.
  const bands: { e: MyLifeEvent; drafts: Draft[] }[] = [];
  for (const e of data.events) {
    if (ex.has(printKey.event(e.id))) continue;
    const stories = e.stories.filter((s) => s.primaryEventId === e.id && !ex.has(printKey.story(s.id)));
    const n = stories.length;
    const drafts: Draft[] = [
      draft(
        { kind: "period", key: printKey.event(e.id), self: false, label: e.label, year: yearText(e), startYear: e.year, decor: e.decor, x: PRINT.COL_W / 2, d: PRINT.PLANET_PERIOD[n >= 4 ? 2 : n >= 2 ? 1 : 0] },
        uniq([...e.personIds.map((id) => satOf("person", id)), ...e.groupIds.map((id) => satOf("group", id)), ...e.placeIds.map((id) => satOf("place", id))]),
      ),
    ];
    for (const s of stories) {
      drafts.push(
        draft(
          { kind: "story", key: printKey.story(s.id), self: s.kind === "SELF", label: displayTitle(s), year: null, startYear: e.year, decor: s.decor, x: PRINT.COL_W / 2, d: PRINT.PLANET_STORY },
          uniq(s.chips.map((c) => satOf(c.kind, c.id))),
        ),
      );
    }
    bands.push({ e, drafts });
  }

  // 장 나누기 — 시기를 차례로 담고(묶기), 넘치면 계 상자 경계에서 나눔(나누기 — 다음 장 첫머리 "(이어서)").
  // 시기 행성만 장 끝에 남지 않게: 시기 행성 + 첫 이야기(위성 없는 높이)가 안 들어가면 새 장에서 시작.
  type Acc = { first: MyLifeEvent; events: MyLifeEvent[]; continued: boolean; systems: PrintSystem[]; drafts: Draft[] };
  const acc: Acc[] = [];
  let cur: Acc | null = null;
  let y = 0;
  for (const { e, drafts } of bands) {
    drafts.forEach((dft, i) => {
      const h = systemHeight(dft.d, dft.shown.length);
      const lead = i === 0 && cur && cur.systems.length ? PRINT.BAND_GAP : 0; // 같은 장에 다음 시기를 묶을 때 사이
      const need = i === 0 && drafts[1] ? h + PRINT.SYS_GAP + systemHeight(drafts[1].d, 0) : h;
      if (!cur || y + lead + need > PRINT.BODY_H) {
        cur = { first: e, events: [e], continued: i > 0, systems: [], drafts: [] };
        acc.push(cur);
        y = i > 0 ? PRINT.CONT_H : 0;
      } else {
        y += lead;
        if (!cur.events.includes(e)) cur.events.push(e);
      }
      cur.systems.push({ ...dft, y: y + PRINT.SYS_PAD, sats: placeSats(dft.x, y + PRINT.SYS_PAD, dft.d, dft.shown), h });
      cur.drafts.push(dft);
      y += h + PRINT.SYS_GAP;
    });
  }

  // 쪽 번호 — 표지 1 · 시기 장 2.. · 인물록 · 장소록 · 사용자 카테고리
  const FIRST = 2;
  const pagesOf = new Map<string, number[]>(); // 사람·모임·곳 키 → 나온 장(장 사이 연결 — §3.3)
  acc.forEach((p, i) => {
    for (const d of p.drafts)
      for (const s of d.all) {
        const arr = pagesOf.get(s.key) ?? [];
        if (!arr.includes(FIRST + i)) arr.push(FIRST + i);
        pagesOf.set(s.key, arr);
      }
  });
  const pagesFor = (key: string) => pagesOf.get(key) ?? [];

  const toc: { label: string; page: number }[] = [];
  acc.forEach((p, i) => {
    for (const e of p.events) if (!toc.some((t) => t.label === e.label)) toc.push({ label: e.label, page: FIRST + i });
  });
  const pages: PrintPage[] = [{ kind: "cover", owner, toc }];

  const KIND_ORDER: SatKind[] = ["person", "group", "place"];
  acc.forEach((p, i) => {
    // 오른쪽 목록 — 이 장에 나온 분·곳(간선을 꺼도 목록은 남음 — §2.3)
    const seen = new Map<string, SatSeed>();
    for (const d of p.drafts) for (const s of d.all) if (!seen.has(s.key)) seen.set(s.key, s);
    const all = [...seen.values()].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
    const fitted = all.slice(0, Math.floor(PRINT.BODY_H / PRINT.LIST_ROW) - 1); // 첫 줄 = 목록 제목
    const list: PrintListEntry[] = fitted.map((s, k) => ({ key: s.key, kind: s.kind, name: s.name, y: (k + 1) * PRINT.LIST_ROW + PRINT.LIST_ROW / 2, lines: edgeOn(s.kind) }));
    const entryOf = new Map(list.map((l) => [l.key, l]));
    const edges: PrintEdge[] = [];
    for (const sys of p.systems)
      for (const s of sys.sats) {
        const l = entryOf.get(s.key);
        if (l?.lines) edges.push({ from: { x: s.x + PRINT.SAT_D / 2, y: s.y }, to: { x: PRINT.LIST_X - 8, y: l.y }, kind: s.kind });
      }
    const next = acc[i + 1];
    const prev = acc[i - 1];
    pages.push({
      kind: "period",
      periods: p.events.map((e) => ({ label: e.label, years: yearText(e) })),
      continued: p.continued,
      continues: !!next?.continued,
      nextLabel: next ? next.first.label : null,
      prevLabel: prev ? prev.events[prev.events.length - 1].label : null,
      systems: p.systems,
      list,
      listMore: all.length - fitted.length,
      edges,
    });
  });

  const paginate = (kind: "people" | "places" | "custom", title: string | null, rows: PrintRow[]) => {
    for (let i = 0; i < rows.length; i += PRINT.LIST_PAGE_ROWS) pages.push({ kind, title, rows: rows.slice(i, i + PRINT.LIST_PAGE_ROWS) });
  };
  const custom = data.custom;

  // 인물록 장 — 모임별 묶음 → 모임 없는 분. 사람마다 "나온 장"
  const ppl = data.people.filter((p) => !ex.has(printKey.person(p.id)));
  if (ppl.length) {
    const rows: PrintRow[] = [];
    const inGroup = new Set<string>();
    for (const g of data.groups) {
      if (ex.has(printKey.group(g.id))) continue;
      const members = g.memberIds.filter((id) => ppl.some((p) => p.id === id));
      if (!members.length) continue;
      rows.push({ name: g.name, sub: null, pages: pagesFor(printKey.group(g.id)), indent: false });
      for (const id of members) {
        inGroup.add(id);
        rows.push({ name: personName(id), sub: people.get(id)!.relation, pages: pagesFor(printKey.person(id)), indent: true });
      }
    }
    for (const p of ppl) if (!inGroup.has(p.id)) rows.push({ name: personName(p.id), sub: p.relation, pages: pagesFor(printKey.person(p.id)), indent: false });
    paginate("people", custom?.builtinNames.PEOPLE ?? null, rows);
  }
  // 장소록 장 — 장소 묶음별 → 묶음 없는 곳
  const pls = data.places.filter((p) => !ex.has(printKey.place(p.id)));
  if (pls.length) {
    const rows: PrintRow[] = [];
    const inGroup = new Set<string>();
    for (const g of data.placeGroups) {
      if (ex.has(printKey.placeGroup(g.id))) continue;
      const members = g.memberIds.filter((id) => pls.some((p) => p.id === id));
      if (!members.length) continue;
      rows.push({ name: g.name, sub: null, pages: [], indent: false });
      for (const id of members) {
        inGroup.add(id);
        rows.push({ name: places.get(id)!.name, sub: null, pages: pagesFor(printKey.place(id)), indent: true });
      }
    }
    for (const p of pls) if (!inGroup.has(p.id)) rows.push({ name: p.name, sub: null, pages: pagesFor(printKey.place(p.id)), indent: false });
    paginate("places", custom?.builtinNames.PLACES ?? null, rows);
  }
  // 사용자 카테고리 장 — 카테고리 이름 → 항목(들여 씀)
  if (custom?.categories.length) {
    const rows: PrintRow[] = [];
    for (const c of custom.categories) {
      if (ex.has(printKey.category(c.id))) continue;
      rows.push({ name: c.name, sub: null, pages: [], indent: false });
      for (const it of custom.items) if (it.categoryId === c.id && !ex.has(printKey.item(it.id))) rows.push({ name: it.name, sub: null, pages: [], indent: true });
    }
    if (rows.length) paginate("custom", null, rows);
  }

  return { pages, pageCount: pages.length, overLimit: pages.length > PRINT.MAX_PAGES };
}
