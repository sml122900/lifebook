// My Life 낙관적 연결(우주 개편 U3 후속 — 2026-11-05). 끌어 넣은 위성은 저장 응답 전에 지도에 보이고(나선이 끝나는 순간),
// [되돌리기]는 응답 전에 숨긴다. 화면 데이터(MyLifeData)에 얹는 순수 함수만 — 서버가 진실이다:
//   · 저장이 끝난(saved) 항목은 화면 데이터에 그 결과가 보이면(새로 받은 데이터 · 이미 반영된 데이터) 지운다(settleOptLinks).
//   · 저장이 실패한 항목은 화면이 바로 지운다(위성이 빠지고 그림이 튕겨 제자리).
//   · 같은 쌍(행성·위성)은 항목 하나 — 새 동작이 앞 항목을 대신한다(putOptLink). 되돌리는 중 다시 넣기·넣는 중 되돌리기에서
//     먼저 끝난 응답이 뒤 동작의 화면을 뒤집지 않게(회귀 test-my-life ⑬ 낙관적 반영 순서).

import type { ChipKind, MyLifeData, MyLifeEvent } from "./my-life";
import type { NodeRef } from "./node-graph";

export type OptLink = {
  id: number;
  op: "add" | "remove";
  planet: NodeRef; // 행성 — LIFE_EVENT(시기) | EPISODE(이야기)
  sat: NodeRef; // 위성 — PERSON | PLACE | PERSON_GROUP
  // 이야기에 사람 — 서버(addLink)처럼 그 이야기의 시기에도(넣기) / 시기에서도(되돌리기 — 그 넣기로 시기 연결이 새로 생긴 경우만)
  alsoPeriod: boolean;
  saved: boolean;
};

const chipKind = (t: NodeRef["type"]): ChipKind => (t === "PERSON" ? "person" : t === "PLACE" ? "place" : "group");
const samePair = (x: OptLink, y: OptLink) => x.planet.type === y.planet.type && x.planet.id === y.planet.id && x.sat.type === y.sat.type && x.sat.id === y.sat.id;

// 새 항목 — 같은 쌍의 앞 항목은 뺀다.
export function putOptLink(list: readonly OptLink[], o: OptLink): OptLink[] {
  return [...list.filter((x) => !samePair(x, o)), o];
}

const idsOf = (ev: MyLifeEvent, t: NodeRef["type"]) => (t === "PERSON" ? ev.personIds : t === "PLACE" ? ev.placeIds : ev.groupIds);

// 그 행성에 그 위성이 보이나(지도 linkedTo 와 같은 기준 — 이야기의 대상 인물 포함).
export function hasLink(data: MyLifeData, planet: NodeRef, sat: NodeRef): boolean {
  if (planet.type === "LIFE_EVENT") {
    const ev = data.events.find((e) => e.id === planet.id);
    return !!ev && idsOf(ev, sat.type).includes(sat.id);
  }
  const k = chipKind(sat.type);
  for (const ev of data.events) {
    const st = ev.stories.find((s) => s.id === planet.id);
    if (st) return st.chips.some((c) => c.kind === k && c.id === sat.id) || (sat.type === "PERSON" && st.subjectPersonId === sat.id);
  }
  return false;
}

function setEventId(ev: MyLifeEvent, t: NodeRef["type"], id: string, on: boolean): MyLifeEvent {
  const ids = idsOf(ev, t);
  if (ids.includes(id) === on) return ev;
  const next = on ? [...ids, id] : ids.filter((x) => x !== id);
  return t === "PERSON" ? { ...ev, personIds: next } : t === "PLACE" ? { ...ev, placeIds: next } : { ...ev, groupIds: next };
}

function nameOf(data: MyLifeData, sat: NodeRef): string {
  const list = sat.type === "PERSON" ? data.people : sat.type === "PLACE" ? data.places : data.groups;
  return list.find((x) => x.id === sat.id)?.name ?? "";
}

function applyOne(data: MyLifeData, events: MyLifeEvent[], o: OptLink): MyLifeEvent[] {
  const on = o.op === "add";
  if (o.planet.type === "LIFE_EVENT") return events.map((ev) => (ev.id === o.planet.id ? setEventId(ev, o.sat.type, o.sat.id, on) : ev));
  const k = chipKind(o.sat.type);
  // 같은 이야기가 여러 시기에 같이 보일 수 있다(otherEventIds) — 모든 자리에.
  const next = events.map((ev) => {
    let changed = false;
    const stories = ev.stories.map((st) => {
      if (st.id !== o.planet.id) return st;
      if (o.sat.type === "PERSON" && st.subjectPersonId === o.sat.id) return st; // 대상 인물 — 이미 그 이야기의 분
      const has = st.chips.some((c) => c.kind === k && c.id === o.sat.id);
      if (has === on) return st;
      changed = true;
      if (!on) return { ...st, chips: st.chips.filter((c) => !(c.kind === k && c.id === o.sat.id)) };
      // 서버 순서와 같은 자리(새로 받은 데이터에서 위성이 자리를 옮기지 않게) — 사람·모임은 장소 앞 끝, 장소는 맨 끝(lib/my-life buildStory).
      const chip = { kind: k, id: o.sat.id, name: nameOf(data, o.sat) };
      const at = k === "place" ? st.chips.length : st.chips.findIndex((c) => c.kind === "place");
      const i = at < 0 ? st.chips.length : at;
      return { ...st, chips: [...st.chips.slice(0, i), chip, ...st.chips.slice(i)] };
    });
    return changed ? { ...ev, stories } : ev;
  });
  const periodId = o.alsoPeriod ? events.flatMap((ev) => ev.stories).find((st) => st.id === o.planet.id)?.primaryEventId : undefined;
  if (!periodId) return next;
  return next.map((ev) => (ev.id === periodId ? setEventId(ev, o.sat.type, o.sat.id, on) : ev));
}

// 화면에 그릴 데이터 = 서버 데이터 + 항목(순서대로). 항목이 없으면 서버 데이터 그대로(같은 객체).
export function applyOptLinks(data: MyLifeData, list: readonly OptLink[]): MyLifeData {
  if (list.length === 0) return data;
  let events = data.events;
  for (const o of list) events = applyOne(data, events, o);
  return events === data.events ? data : { ...data, events };
}

// 저장이 끝났고 그 결과가 이미 데이터에 보이는 항목은 지운다. 바뀐 게 없으면 같은 배열.
export function settleOptLinks(data: MyLifeData, list: readonly OptLink[]): readonly OptLink[] {
  const next = list.filter((o) => !(o.saved && hasLink(data, o.planet, o.sat) === (o.op === "add")));
  return next.length === list.length ? list : next;
}

// ── 행성 꾸미기(U4) — 고르면 저장 응답 전에 바로 보이고, 실패면 원래대로. 노드 하나 = 항목 하나(새 고르기가 앞 항목을 대신). ──
export type OptDecor = {
  id: number;
  planet: NodeRef; // LIFE_EVENT | EPISODE
  shape: string | null; // null = 없앰
  saved: boolean;
};

const sameNode = (x: OptDecor, y: OptDecor) => x.planet.type === y.planet.type && x.planet.id === y.planet.id;
export function putOptDecor(list: readonly OptDecor[], o: OptDecor): OptDecor[] {
  return [...list.filter((x) => !sameNode(x, o)), o];
}

export function decorOf(data: MyLifeData, planet: NodeRef): string | null {
  if (planet.type === "LIFE_EVENT") return data.events.find((e) => e.id === planet.id)?.decor ?? null;
  for (const ev of data.events) {
    const st = ev.stories.find((s) => s.id === planet.id);
    if (st) return st.decor;
  }
  return null;
}

// 같은 이야기가 여러 시기에 같이 보이면 모든 자리에.
export function applyOptDecor(data: MyLifeData, list: readonly OptDecor[]): MyLifeData {
  if (list.length === 0) return data;
  let events = data.events;
  for (const o of list) {
    events = events.map((ev) => {
      if (o.planet.type === "LIFE_EVENT") return ev.id === o.planet.id && ev.decor !== o.shape ? { ...ev, decor: o.shape } : ev;
      if (!ev.stories.some((s) => s.id === o.planet.id && s.decor !== o.shape)) return ev;
      return { ...ev, stories: ev.stories.map((s) => (s.id === o.planet.id ? { ...s, decor: o.shape } : s)) };
    });
  }
  return events === data.events ? data : { ...data, events };
}

export function settleOptDecor(data: MyLifeData, list: readonly OptDecor[]): readonly OptDecor[] {
  const next = list.filter((o) => !(o.saved && decorOf(data, o.planet) === o.shape));
  return next.length === list.length ? list : next;
}
