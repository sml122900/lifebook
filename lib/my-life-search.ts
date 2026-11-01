// My Life 글자 검색 — 브라우저 안(서버·인덱스 0). docs/phase/my-life-restructure.md §5. 순수(클라이언트도 씀).
//
// 대상: 중심 이름 · 이야기 본문 · 인물 이름·관계 · 장소 이름·주소 · 모임 이름.
// 맞추기: 양쪽 NFC + 소문자 + 공백 제거 후 부분 일치("김 민수" = "김민수"). 초성 검색은 1차 제외(Q61).
// 순서: 이름 일치(0) > 본문·관계·주소 일치(1), 같은 순위는 시간 줄기 순서 → 인물록 → 장소록. 최대 30개.

import type { MyLifeData } from "./my-life";
import { displayTitle } from "./story-title";

export type SearchKind = "event" | "story" | "person" | "place" | "group";

export type SearchResult = {
  kind: SearchKind;
  key: string; // 지도 노드 키(st:<중심>:<이야기> 는 주 소속 중심 쪽)
  eventId: string | null; // 이야기·중심 — 접힌 띠 펼칠 때
  title: string;
  // 일치 부분을 굵게 보이게 앞·일치·뒤로 나눈 한 줄(본문은 일치 앞뒤 20자)
  snippet: { before: string; match: string; after: string } | null;
  rank: number;
};

export const SEARCH_LIMIT = 30;

export function normalizeForSearch(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/\s+/g, "");
}

// 원문에서 정규화 기준 일치 위치를 찾아 원문 조각으로 돌려준다.
export function findMatch(text: string, q: string): { start: number; end: number } | null {
  const nq = normalizeForSearch(q);
  if (!nq) return null;
  // 원문 글자마다 정규화 결과를 이어 붙이며 원문 위치를 기억(공백은 건너뜀).
  const map: number[] = [];
  let norm = "";
  const chars = [...text.normalize("NFC")];
  let offset = 0;
  for (const ch of chars) {
    const n = ch.toLowerCase().replace(/\s+/g, "");
    for (let k = 0; k < n.length; k++) {
      map.push(offset);
      norm += n[k];
    }
    offset += ch.length;
  }
  const i = norm.indexOf(nq);
  if (i < 0) return null;
  const start = map[i];
  const last = map[i + nq.length - 1];
  return { start, end: last + (text.normalize("NFC").codePointAt(last)! > 0xffff ? 2 : 1) };
}

function snippetOf(text: string, m: { start: number; end: number }, around = 20) {
  const t = text.normalize("NFC");
  const a = Math.max(0, m.start - around);
  const b = Math.min(t.length, m.end + around);
  return { before: (a > 0 ? "…" : "") + t.slice(a, m.start), match: t.slice(m.start, m.end), after: t.slice(m.end, b) + (b < t.length ? "…" : "") };
}

export function searchMyLife(data: MyLifeData, query: string): SearchResult[] {
  if (!normalizeForSearch(query)) return [];
  const out: (SearchResult & { order: number })[] = [];
  let order = 0;
  const hit = (r: Omit<SearchResult, "rank" | "snippet">, fields: { text: string | null; rank: number; snip: boolean }[]) => {
    for (const f of fields) {
      if (!f.text) continue;
      const m = findMatch(f.text, query);
      if (m) {
        out.push({ ...r, rank: f.rank, snippet: f.snip ? snippetOf(f.text, m) : null, order });
        return;
      }
    }
  };
  for (const ev of data.events) {
    order++;
    hit({ kind: "event", key: `ev:${ev.id}`, eventId: ev.id, title: ev.label }, [{ text: ev.label, rank: 0, snip: false }]);
    for (const s of ev.stories) {
      if (s.primaryEventId !== ev.id) continue; // 걸친 이야기는 주 소속 쪽 한 번만
      order++;
      // 제목(있으면) 일치 = 이름 일치와 같은 순위, 본문 일치는 그다음.
      hit({ kind: "story", key: `st:${ev.id}:${s.id}`, eventId: ev.id, title: displayTitle(s) }, [
        { text: s.title, rank: 0, snip: false },
        { text: s.content, rank: 1, snip: true },
      ]);
    }
  }
  for (const p of data.people) {
    order++;
    hit({ kind: "person", key: `pe:${p.id}`, eventId: null, title: p.name }, [
      { text: p.name, rank: 0, snip: false },
      { text: p.relation, rank: 1, snip: true },
    ]);
  }
  for (const g of data.groups) {
    order++;
    hit({ kind: "group", key: `gl:${g.id}`, eventId: null, title: g.name }, [{ text: g.name, rank: 0, snip: false }]);
  }
  for (const p of data.places) {
    order++;
    hit({ kind: "place", key: `pl:${p.id}`, eventId: null, title: p.name }, [
      { text: p.name, rank: 0, snip: false },
      { text: p.address, rank: 1, snip: true },
    ]);
  }
  return out
    .sort((a, b) => a.rank - b.rank || a.order - b.order)
    .slice(0, SEARCH_LIMIT)
    .map((r) => ({ kind: r.kind, key: r.key, eventId: r.eventId, title: r.title, snippet: r.snippet, rank: r.rank }));
}
