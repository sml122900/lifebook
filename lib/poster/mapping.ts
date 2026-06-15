import type {
  Chapter,
  MappingEvent,
  PlacedEvent,
  Placement,
  TemplateManifest,
  Variant,
} from "./types";

// T1 STEP1 — 매핑 (template-agnostic).
//
// life_event → 정규화 placement. 어떤 템플릿이 와도 동일 산출 (느티나무 지식
// 0). 특정 SVG·슬롯 좌표를 모른다 — 챕터/슬롯 "개수" 만 매니페스트에서 받는다.
//
// 클러스터링(#4 정정 디폴트): 3종 다 14슬롯이라 사건 수로 N 을 고르지 않는다.
//   - N(브랜치 수) = "인생이 갈리는 시기(챕터) 수" 를 나이대 군집으로 추정해
//     3~5 로 clamp.
//   - 챕터→브랜치 시간순 매핑. 각 브랜치의 (불균등) 슬롯 수만큼 그 시기 사건을
//     날짜순 배치. 초과하면 가중치 낮은 것 컷, 미달하면 빈 슬롯 숨김.
//
// 중요도(#5 불변): 스키마에 significance 없음 → 전부 잎(leaf)이 디폴트지만,
// 데모가 밋밋해지지 않게 가중치 휴리스틱으로 대표 1~2(꽃·열매) + standout 1(새)
// 만 표현용으로 올린다. 실제 S/M/L 사용자 선택은 T3-b.

// 나이대 → 시기 라벨. 시간순 사건의 나이는 단조 증가하므로 같은 밴드가
// 연속 구간이 된다(중년기가 자연히 가운데 큰 브랜치로 떨어진다).
const AGE_BANDS: { maxAgeExclusive: number; label: string }[] = [
  { maxAgeExclusive: 20, label: "어린 시절" },
  { maxAgeExclusive: 35, label: "청년기" },
  { maxAgeExclusive: 55, label: "중년기" },
  { maxAgeExclusive: 70, label: "장년기" },
  { maxAgeExclusive: Infinity, label: "노년기" },
];

function bandIndex(age: number): number {
  for (let i = 0; i < AGE_BANDS.length; i++) {
    if (age < AGE_BANDS[i].maxAgeExclusive) return i;
  }
  return AGE_BANDS.length - 1;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// 원하는 챕터 수를 브랜치 옵션(3/4/5) 안의 실제 값으로 보정.
function pickBranchCount(desired: number, options: number[]): number {
  const sorted = [...options].sort((a, b) => a - b);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const c = clamp(desired, lo, hi);
  if (sorted.includes(c)) return c;
  return sorted.reduce(
    (best, x) => (Math.abs(x - c) < Math.abs(best - c) ? x : best),
    sorted[0],
  );
}

// 사건 가중치 — 대표 사건 선정 + 슬롯 초과 컷에 공통. 본문이 길거나(정성껏
// 쓴 회상) 기간 사건이거나 제목이 길수록 "큰 줄기". 결정적(타이브레이크 포함).
function weight(e: MappingEvent): number {
  return e.textLength + (e.endYear ? 50 : 0) + e.title.length * 0.5;
}

function byTime(a: MappingEvent, b: MappingEvent): number {
  if (a.year !== b.year) return a.year - b.year;
  const am = a.month ?? 13; // 사이 이벤트(month null)는 같은 해 뒤
  const bm = b.month ?? 13;
  return am - bm;
}

function yearLabel(e: MappingEvent): string {
  return e.endYear && e.endYear !== e.year
    ? `${e.year}–${e.endYear}` // en dash
    : `${e.year}`;
}

function rangeLabel(events: MappingEvent[]): string {
  if (events.length === 0) return "";
  const ys = events.map((e) => e.year);
  const a = Math.min(...ys);
  const b = Math.max(...ys);
  return a === b ? `${a}` : `${a}~${b}`;
}

type ChapterRaw = { label: string; events: MappingEvent[] };

// 나이대 밴드로 연속 구간을 묶는다 (birthYear 있을 때).
function groupByBand(events: MappingEvent[], birthYear: number): ChapterRaw[] {
  const groups: ChapterRaw[] = [];
  let curBand = -1;
  for (const e of events) {
    const b = bandIndex(e.year - birthYear);
    if (b !== curBand) {
      groups.push({ label: AGE_BANDS[b].label, events: [] });
      curBand = b;
    }
    groups[groups.length - 1].events.push(e);
  }
  return groups;
}

// birthYear 없을 때 — 시간순 사건을 N 개 연속 덩어리로 균등 분할(연도범위 라벨).
function evenSplit(events: MappingEvent[], n: number): ChapterRaw[] {
  const base = Math.floor(events.length / n);
  const rem = events.length % n;
  const out: ChapterRaw[] = [];
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const size = base + (i < rem ? 1 : 0);
    const slice = events.slice(idx, idx + size);
    idx += size;
    out.push({ label: rangeLabel(slice), events: slice });
  }
  return out;
}

function largestSplittable(chapters: ChapterRaw[]): number {
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].events.length > bestLen) {
      bestLen = chapters[i].events.length;
      best = i;
    }
  }
  return best;
}

function splitAt(chapters: ChapterRaw[], idx: number): ChapterRaw[] {
  const c = chapters[idx];
  const mid = Math.ceil(c.events.length / 2);
  const left = c.events.slice(0, mid);
  const right = c.events.slice(mid);
  const next = [...chapters];
  next.splice(
    idx,
    1,
    { label: rangeLabel(left), events: left },
    { label: rangeLabel(right), events: right },
  );
  return next;
}

// 챕터가 N 보다 많을 때(방어적 — 밴드 경로에선 사실상 안 일어남): 가장 작은
// 인접 쌍을 합친다.
function mergeToN(chapters: ChapterRaw[], n: number): ChapterRaw[] {
  let cur = [...chapters];
  while (cur.length > n) {
    let bestPair = 0;
    let bestSum = Infinity;
    for (let i = 0; i < cur.length - 1; i++) {
      const s = cur[i].events.length + cur[i + 1].events.length;
      if (s < bestSum) {
        bestSum = s;
        bestPair = i;
      }
    }
    const merged: ChapterRaw = {
      events: [...cur[bestPair].events, ...cur[bestPair + 1].events],
      label: "",
    };
    merged.label = rangeLabel(merged.events);
    cur.splice(bestPair, 2, merged);
  }
  return cur;
}

function buildChapters(
  events: MappingEvent[],
  birthYear: number | null,
  branchOptions: number[],
): { branchCount: number; chapters: ChapterRaw[] } {
  if (events.length === 0) {
    const n = Math.min(...branchOptions);
    return {
      branchCount: n,
      chapters: Array.from({ length: n }, () => ({ label: "", events: [] })),
    };
  }

  let groups: ChapterRaw[];
  let n: number;
  if (birthYear != null) {
    groups = groupByBand(events, birthYear);
    n = pickBranchCount(clamp(groups.length, 3, 5), branchOptions);
  } else {
    const desired = events.length <= 8 ? 3 : events.length <= 14 ? 4 : 5;
    n = pickBranchCount(desired, branchOptions);
    groups = evenSplit(events, n);
  }

  let chapters = groups;
  if (chapters.length > n) chapters = mergeToN(chapters, n);
  while (chapters.length < n) {
    const idx = largestSplittable(chapters);
    if (idx < 0) break; // 더 쪼갤 수 없음(사건이 너무 적음)
    chapters = splitAt(chapters, idx);
  }
  while (chapters.length < n) chapters.push({ label: "", events: [] }); // 패딩

  return { branchCount: n, chapters };
}

export type MapOptions = {
  birthYear?: number | null;
  ownerName?: string | null;
  rootLine?: string | null;
  footerLine?: string | null;
};

export function mapToPlacement(
  events: MappingEvent[],
  manifest: TemplateManifest,
  opts: MapOptions = {},
): Placement {
  const sorted = [...events].sort(byTime);

  const { branchCount, chapters: rawChapters } = buildChapters(
    sorted,
    opts.birthYear ?? null,
    manifest.branchOptions,
  );

  const caps = manifest.slotsPerBranch[branchCount];

  // 각 챕터를 그 브랜치 용량에 맞춘다 — 초과는 가중치 컷, 미달은 빈 슬롯.
  let cut = 0;
  let emptySlots = 0;
  const fitted: MappingEvent[][] = rawChapters.map((ch, i) => {
    const cap = caps[i] ?? 0;
    if (ch.events.length <= cap) {
      emptySlots += cap - ch.events.length;
      return [...ch.events].sort(byTime);
    }
    const kept = [...ch.events]
      .sort((a, b) => weight(b) - weight(a) || byTime(a, b))
      .slice(0, cap)
      .sort(byTime);
    cut += ch.events.length - cap;
    return kept;
  });

  // 변형 배정 (데모 휴리스틱) — 배치된 사건 전체에서 가중치 순위로.
  // standout 1 = 새(bird), 대표 2 = 열매(fruit)·꽃(flower), 나머지 잎(leaf).
  // ⚠️ bird → 마스터에 #bird-s 없으면(4·5branch) 렌더러가 fruit 로 폴백.
  const placedAll = fitted.flat();
  const ranked = [...placedAll].sort(
    (a, b) =>
      weight(b) - weight(a) ||
      byTime(a, b) ||
      a.title.localeCompare(b.title),
  );
  const variantOf = new Map<MappingEvent, Variant>();
  ranked.forEach((e, i) => {
    variantOf.set(e, i === 0 ? "bird" : i === 1 ? "fruit" : i === 2 ? "flower" : "leaf");
  });

  const variantCounts: Record<Variant, number> = {
    leaf: 0,
    flower: 0,
    fruit: 0,
    bird: 0,
  };

  const chapters: Chapter[] = fitted.map((events, i) => {
    const placed: PlacedEvent[] = events.map((e) => {
      const v = variantOf.get(e) ?? "leaf";
      variantCounts[v]++;
      return { title: e.title, yearLabel: yearLabel(e), variant: v };
    });
    return { label: rawChapters[i].label, events: placed };
  });

  return {
    branchCount,
    chapters,
    rootLine: opts.rootLine ?? null,
    ownerName: opts.ownerName ?? null,
    footerLine: opts.footerLine ?? null,
    stats: {
      totalEvents: events.length,
      placed: placedAll.length,
      cut,
      emptySlots,
      variantCounts,
    },
  };
}
