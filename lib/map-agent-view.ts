// 지도 질문 답하기(custom-graph 3a) — 모델로 보내는 칸을 만드는 유일한 곳(Q137 — docs/phase/privacy-v1.4.md §1.2·§1.3). 순수(DB·모델 0).
//
// 지도 데이터(getMyLifeData)에서 §1.2 표의 칸만 골라 새 모양(SentNode)으로 옮긴 뒤로는 원본을 넘기지 않는다 — 만난 해·태어난 해·메모(사람),
// 주소·좌표·출처(장소), 꾸미기, 그때의 나 구분은 여기서 빠져서 뒤의 어떤 코드도 보낼 수 없다.
// 칸을 늘리려면 처리방침 개정이 먼저다(작업 규칙 11). 회귀 test-map-agent ① 이 칸 이름 집합과 빠진 값을 확인한다.
//
// 실제 id 는 모델에게 보이지 않는다 — 요청마다 이 사용자 지도로 만든 별칭(n1·n2 …)만(연구실 AliasTable 과 같은 방식, custom-graph §4.6).
// 화면용 값(screen — 지도 노드 키)은 별칭 → 노드로 코드가 찾아 쓰고 모델로 가지 않는다.

import type { MyLifeData } from "./my-life";
import { customOf, type MyLifeRef } from "./my-life-custom";
import { normalizeForSearch, type SearchKind } from "./my-life-search";
import { displayTitle, shortTitle } from "./story-title";

// ── 계약 — 모델로 가는 칸 이름 전부(privacy-v1.4 §1.2 와 같아야 한다) ──────────────────────
export const SENT_FIELDS = ["alias", "kind", "name", "years", "relation", "excerpt", "links"] as const;
export const SENT_KINDS = ["시기", "이야기", "사람", "모임", "장소", "장소 묶음", "카테고리", "묶음", "항목"] as const;
export const SENT_LINKS = ["시기", "이야기", "사람", "모임", "장소", "장소 묶음", "구성원", "안에 든 것", "자리", "넣어 둔 곳", "이어진 것"] as const;

export type SentKind = (typeof SENT_KINDS)[number];
export type SentLink = (typeof SENT_LINKS)[number];

export type SentNode = {
  alias: string;
  kind: SentKind;
  name: string;
  years?: string; // 시기 — 연도·끝 연도
  relation?: string; // 사람 — 관계
  excerpt?: string; // 이야기 본문·인물 글·항목 글 발췌 — read_node 에서만
  links: Partial<Record<SentLink, string[]>>; // 다른 노드 별칭끼리
};

// 화면 칩용 — 모델로 안 감(FindSheet 결과와 같은 노드 키).
export type ScreenRef = { key: string; eventId: string | null; title: string; kind: SearchKind };

export type MapView = {
  nodes: SentNode[];
  byAlias: Map<string, SentNode>;
  screen: Map<string, ScreenRef>;
  regionNames: { people: string | null; places: string | null }; // 인물록·장소록 표시 이름을 바꾼 것만
};

export const EXCERPT_MAX = 600;
export const LIST_NODE_LIMIT = 400; // Q94 — 넘으면 통째로 안 보내고 개수 요약 + find_nodes
export const FIND_LIMIT = 30;
export const MAP_QUESTION_MAX = 300; // 질문 글자 수(시트 입력칸·서버 같이)

// 목록 줄은 "|" 로 칸을 나눈다 — 이름에 든 "|"·줄바꿈이 칸이나 줄을 만들지 않게.
const cleanName = (s: string) => s.replace(/[|\r\n]+/g, " ").replace(/\s+/g, " ").trim();
const excerptOf = (s: string) => {
  const t = s.trim();
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX)}…` : t;
};

export function buildMapView(data: MyLifeData): MapView {
  const custom = customOf(data);
  const nodes: SentNode[] = [];
  const screen = new Map<string, ScreenRef>();
  const aliasOf = new Map<string, string>(); // "종류:id" → 별칭

  const add = (refKey: string, n: Omit<SentNode, "alias" | "links">, s: Omit<ScreenRef, "title">): SentNode => {
    const alias = `n${nodes.length + 1}`;
    const node: SentNode = { alias, ...n, name: cleanName(n.name), links: {} };
    nodes.push(node);
    aliasOf.set(refKey, alias);
    screen.set(alias, { ...s, title: node.name });
    return node;
  };
  const link = (a: string | undefined, name: SentLink, b: string | undefined) => {
    if (!a || !b) return;
    const node = nodes[Number(a.slice(1)) - 1];
    const arr = node.links[name] ?? (node.links[name] = []);
    if (!arr.includes(b)) arr.push(b);
  };

  // 노드 — 순서가 곧 별칭(같은 지도 = 같은 별칭 → 앞부분 캐시가 그대로 맞음).
  for (const ev of data.events) {
    const years = ev.year === null ? undefined : ev.endYear && ev.endYear !== ev.year ? `${ev.year}~${ev.endYear}` : String(ev.year);
    add(`LIFE_EVENT:${ev.id}`, { kind: "시기", name: ev.label, ...(years ? { years } : {}) }, { key: `ev:${ev.id}`, eventId: ev.id, kind: "event" });
  }
  for (const ev of data.events) {
    for (const st of ev.stories) {
      if (aliasOf.has(`EPISODE:${st.id}`)) continue; // 두 시기에 걸친 이야기는 한 번
      add(
        `EPISODE:${st.id}`,
        { kind: "이야기", name: shortTitle(displayTitle(st)), excerpt: excerptOf(st.content) },
        { key: `st:${st.primaryEventId}:${st.id}`, eventId: st.primaryEventId, kind: "story" },
      );
    }
  }
  for (const p of data.people) {
    add(
      `PERSON:${p.id}`,
      { kind: "사람", name: p.name, ...(p.relation ? { relation: cleanName(p.relation) } : {}), ...(p.body.trim() ? { excerpt: excerptOf(p.body) } : {}) },
      { key: `pe:${p.id}`, eventId: null, kind: "person" },
    );
  }
  for (const g of data.groups) add(`PERSON_GROUP:${g.id}`, { kind: "모임", name: g.name }, { key: `gl:${g.id}`, eventId: null, kind: "group" });
  for (const pl of data.places) add(`PLACE:${pl.id}`, { kind: "장소", name: pl.name }, { key: `pl:${pl.id}`, eventId: null, kind: "place" });
  for (const g of data.placeGroups ?? []) add(`PLACE_GROUP:${g.id}`, { kind: "장소 묶음", name: g.name }, { key: `pgl:${g.id}`, eventId: null, kind: "placeGroup" });
  for (const c of custom.categories) add(`CUSTOM:${c.id}`, { kind: "카테고리", name: c.name }, { key: `cat:${c.id}`, eventId: null, kind: "category" });
  for (const g of custom.groups) add(`CUSTOM:${g.id}`, { kind: "묶음", name: g.name }, { key: `cgl:${g.id}`, eventId: null, kind: "customGroup" });
  for (const it of custom.items) {
    add(`CUSTOM:${it.id}`, { kind: "항목", name: it.name, ...(it.body.trim() ? { excerpt: excerptOf(it.body) } : {}) }, { key: `cn:${it.id}`, eventId: null, kind: "item" });
  }

  // 연결 — 양쪽에 적는다(목록 줄에는 LIST_LINKS 만, read_node 에는 전부).
  const a = (type: string, id: string) => aliasOf.get(`${type}:${id}`);
  const refAlias = (r: MyLifeRef) => aliasOf.get(`${r.type}:${r.id}`);
  for (const ev of data.events) {
    const e = a("LIFE_EVENT", ev.id);
    for (const st of ev.stories) {
      const s = a("EPISODE", st.id);
      link(e, "이야기", s);
      link(s, "시기", e);
      for (const c of st.chips) {
        const [type, name]: [string, SentLink] = c.kind === "person" ? ["PERSON", "사람"] : c.kind === "group" ? ["PERSON_GROUP", "모임"] : ["PLACE", "장소"];
        link(s, name, a(type, c.id));
        link(a(type, c.id), "이야기", s);
      }
    }
    for (const [ids, type, name] of [[ev.personIds, "PERSON", "사람"], [ev.placeIds, "PLACE", "장소"], [ev.groupIds, "PERSON_GROUP", "모임"]] as [string[], string, SentLink][]) {
      for (const id of ids) {
        link(e, name, a(type, id));
        link(a(type, id), "시기", e);
      }
    }
  }
  for (const g of data.groups) {
    for (const m of g.memberIds) {
      link(a("PERSON_GROUP", g.id), "구성원", a("PERSON", m));
      link(a("PERSON", m), "모임", a("PERSON_GROUP", g.id));
    }
  }
  for (const g of data.placeGroups ?? []) {
    for (const m of g.memberIds) {
      link(a("PLACE_GROUP", g.id), "구성원", a("PLACE", m));
      link(a("PLACE", m), "장소 묶음", a("PLACE_GROUP", g.id));
    }
  }
  for (const c of custom.categories) {
    for (const r of c.refs) {
      link(a("CUSTOM", c.id), "안에 든 것", refAlias(r));
      link(refAlias(r), "넣어 둔 곳", a("CUSTOM", c.id));
    }
  }
  for (const g of custom.groups) {
    link(a("CUSTOM", g.id), "자리", a("CUSTOM", g.categoryId));
    link(a("CUSTOM", g.categoryId), "안에 든 것", a("CUSTOM", g.id));
    for (const r of g.memberRefs) {
      link(a("CUSTOM", g.id), "안에 든 것", refAlias(r));
      link(refAlias(r), "넣어 둔 곳", a("CUSTOM", g.id));
    }
  }
  for (const it of custom.items) {
    link(a("CUSTOM", it.id), "자리", a("CUSTOM", it.categoryId));
    link(a("CUSTOM", it.categoryId), "안에 든 것", a("CUSTOM", it.id));
    for (const r of it.related) {
      link(a("CUSTOM", it.id), "이어진 것", refAlias(r));
      link(refAlias(r), "이어진 것", a("CUSTOM", it.id));
    }
  }

  const names = custom.builtinNames;
  return {
    nodes,
    byAlias: new Map(nodes.map((n) => [n.alias, n])),
    screen,
    regionNames: { people: names.PEOPLE ? cleanName(names.PEOPLE) : null, places: names.PLACES ? cleanName(names.PLACES) : null },
  };
}

// 목록 줄에 적는 연결(나머지는 read_node 에서) — 한쪽에만 적어 길이를 줄인다.
const LIST_LINKS: Record<SentKind, SentLink[]> = {
  시기: ["사람", "장소", "모임"],
  이야기: ["시기", "사람", "모임", "장소"],
  사람: [],
  모임: ["구성원"],
  장소: [],
  "장소 묶음": ["구성원"],
  카테고리: ["안에 든 것"],
  묶음: ["자리", "안에 든 것"],
  항목: ["자리", "이어진 것"],
};

// 한 줄 — n12|사람|김민수|친구 · n3|이야기|제목|시기:n1|사람:n12(본문·발췌 없음).
export function nodeLine(n: SentNode): string {
  const cols: string[] = [n.alias, n.kind, n.name];
  if (n.years) cols.push(n.years);
  if (n.relation) cols.push(n.relation);
  for (const l of LIST_LINKS[n.kind]) {
    const v = n.links[l];
    if (v?.length) cols.push(`${l}:${v.join(",")}`);
  }
  return cols.join("|");
}

// 첫 메시지 지도 목록 + 이번 실행에서 모델이 본 별칭(근거로 인정되는 범위). 노드 400개 넘으면 개수 요약 + 카테고리 줄만(Q94).
export function mapListText(view: MapView): { text: string; shown: string[] } {
  const region = [view.regionNames.people ? `인물록 표시 이름: ${view.regionNames.people}` : "", view.regionNames.places ? `장소록 표시 이름: ${view.regionNames.places}` : ""].filter(Boolean);
  if (view.nodes.length <= LIST_NODE_LIMIT) {
    return { text: ["[지도 목록]", ...region, ...view.nodes.map(nodeLine)].join("\n"), shown: view.nodes.map((n) => n.alias) };
  }
  const counts = SENT_KINDS.map((k) => [k, view.nodes.filter((n) => n.kind === k).length] as const).filter(([, c]) => c > 0);
  const cats = view.nodes.filter((n) => n.kind === "카테고리");
  return {
    text: [
      "[지도 요약] 노드가 많아 전체 목록 대신 개수만 보냅니다. find_nodes 로 찾으세요.",
      ...region,
      counts.map(([k, c]) => `${k} ${c}개`).join(" · "),
      ...cats.map((n) => `${n.alias}|${n.kind}|${n.name}|${n.links["안에 든 것"]?.length ?? 0}개`),
    ].join("\n"),
    shown: cats.map((n) => n.alias),
  };
}

// read_node 결과 — 칸 이름은 SENT_FIELDS 안에서만.
export function readNodeData(n: SentNode): Record<string, unknown> {
  return {
    alias: n.alias,
    kind: n.kind,
    name: n.name,
    ...(n.years ? { years: n.years } : {}),
    ...(n.relation ? { relation: n.relation } : {}),
    ...(n.excerpt ? { excerpt: n.excerpt } : {}),
    links: n.links,
  };
}

// find_nodes — 이름(사람은 관계도)·종류·카테고리로 찾기. 본문으로 찾기는 3d. 결과 = 목록과 같은 줄.
export function findNodes(view: MapView, input: { query?: string; kind?: string; categoryAlias?: string }): SentNode[] {
  const q = normalizeForSearch(input.query ?? "");
  const hit = (s: string | undefined) => !!s && normalizeForSearch(s).includes(q);
  return view.nodes
    .filter(
      (n) =>
        (!input.kind || n.kind === input.kind) &&
        (!input.categoryAlias || !!n.links["자리"]?.includes(input.categoryAlias) || !!n.links["넣어 둔 곳"]?.includes(input.categoryAlias)) &&
        (!q || hit(n.name) || hit(n.relation)),
    )
    .slice(0, FIND_LIMIT);
}
