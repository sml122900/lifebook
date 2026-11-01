// My Life 마인드맵(2b-3a) — 화면 데이터. 읽기 전용, auth 없음(회귀가 같은 함수를 부른다).
// docs/phase/node-graph-self.md §6 2b.1 의 1 "포함 규칙".
//
// Prisma 호출 수는 기록 양과 무관하게 고정(6회 — 중심+이야기 1 · 중심↔인물 1 · NodeLink 1 · 인물·모임·장소 3).
// 중심 = 확정(CONFIRMED·CORRECTED) LifeEvent, sequenceOrder·id 순(/story-review·갭·인터뷰와 같은 기준).
//   왼쪽 가지 = 이야기(STORY)·그때의 나(SELF) — 주 소속 + NodeLink(LIFE_EVENT→EPISODE) 추가 소속.
//   이야기 안 작은 물방울 = 대상 인물 + NodeLink(EPISODE→PERSON·PERSON_GROUP) + 브릿지 MemoryPlace.
//   오른쪽 가지 = PersonLifeEvent 인물 + NodeLink(LIFE_EVENT→PERSON_GROUP·PLACE) 중 그 중심의 이야기 안에
//                 이미 보이는 것은 뺀다(Q38).

import { prisma } from "./db";
import type { EpisodeKind, LifeEventType } from "./generated/prisma/enums";

export type ChipKind = "person" | "group" | "place";

// 이야기 안 작은 물방울(누르는 곳 아님 — 이야기 노드 전체가 버튼).
export type MyLifeChip = {
  kind: ChipKind;
  id: string | null; // 장소 이름만 있는 옛 MemoryPlace(placeId 없음)는 null
  name: string;
  proposed: boolean; // 확인 대기(NodeLink PROPOSED)
};

export type MyLifeStory = {
  id: string;
  kind: EpisodeKind;
  content: string;
  primaryEventId: string;
  otherEventIds: string[]; // 이 이야기가 같이 보이는 다른 중심(추가 소속·주 소속)
  chips: MyLifeChip[];
  hasPending: boolean;
};

export type MyLifeBranch =
  | { kind: "person"; id: string; name: string; relation: string | null; metYear: number | null }
  | { kind: "group"; id: string; name: string; members: string[] }
  | { kind: "place"; id: string; name: string; address: string | null; source: string | null; lat: number | null; lng: number | null };

export type MyLifeEvent = {
  id: string;
  type: LifeEventType;
  label: string;
  year: number | null;
  endYear: number | null;
  stories: MyLifeStory[];
  branches: MyLifeBranch[];
};

export type MyLifeData = { events: MyLifeEvent[] };

type Db = typeof prisma;

export async function getMyLifeData(userId: string, db: Db = prisma): Promise<MyLifeData> {
  const [events, ples, links] = await Promise.all([
    db.lifeEvent.findMany({
      where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
      orderBy: [{ sequenceOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        type: true,
        label: true,
        correctedLabel: true,
        year: true,
        correctedYear: true,
        endYear: true,
        episodes: {
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            kind: true,
            personId: true,
            content: true,
            memory: {
              select: {
                places: {
                  orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
                  select: { placeId: true, placeName: true, place: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    }),
    db.personLifeEvent.findMany({ where: { userId }, orderBy: { createdAt: "asc" }, select: { personId: true, lifeEventId: true } }),
    db.nodeLink.findMany({
      where: { userId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { fromType: true, fromId: true, toType: true, toId: true, status: true },
    }),
  ]);

  const eventIds = new Set(events.map((e) => e.id));
  const episodeById = new Map(events.flatMap((e) => e.episodes.map((ep) => [ep.id, { ...ep, lifeEventId: e.id }] as const)));

  const personIds = new Set<string>();
  const groupIds = new Set<string>();
  const placeIds = new Set<string>();
  for (const ep of episodeById.values()) {
    if (ep.personId) personIds.add(ep.personId);
  }
  for (const r of ples) if (eventIds.has(r.lifeEventId)) personIds.add(r.personId);
  for (const l of links) {
    if (l.toType === "PERSON") personIds.add(l.toId);
    if (l.toType === "PERSON_GROUP") groupIds.add(l.toId);
    if (l.toType === "PLACE") placeIds.add(l.toId);
  }

  const [people, groups, places] = await Promise.all([
    db.person.findMany({
      where: { userId, id: { in: [...personIds] }, subjectType: "person" },
      select: { id: true, name: true, relation: true, metYear: true, isDraft: true },
    }),
    db.personGroup.findMany({
      where: { userId, id: { in: [...groupIds] } },
      select: { id: true, name: true, members: { orderBy: { createdAt: "asc" }, select: { person: { select: { name: true } } } } },
    }),
    db.place.findMany({
      where: { userId, id: { in: [...placeIds] } },
      select: { id: true, name: true, address: true, source: true, lat: true, lng: true },
    }),
  ]);
  const personById = new Map(people.map((p) => [p.id, p]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const placeById = new Map(places.map((p) => [p.id, p]));

  // 이야기별 연결(작은 물방울) · 중심별 추가 소속 이야기 · 중심별 직접 연결.
  const storyLinks = new Map<string, { kind: ChipKind; id: string; proposed: boolean }[]>();
  const extraStories = new Map<string, string[]>(); // 중심 id → 추가 소속 이야기 id
  const eventGroups = new Map<string, string[]>();
  const eventPlaces = new Map<string, string[]>();
  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  for (const l of links) {
    if (l.fromType === "EPISODE" && (l.toType === "PERSON" || l.toType === "PERSON_GROUP")) {
      push(storyLinks, l.fromId, { kind: l.toType === "PERSON" ? "person" : "group", id: l.toId, proposed: l.status === "PROPOSED" });
    } else if (l.fromType === "LIFE_EVENT" && l.status === "CONFIRMED") {
      if (l.toType === "EPISODE" && episodeById.has(l.toId)) push(extraStories, l.fromId, l.toId);
      else if (l.toType === "PERSON_GROUP") push(eventGroups, l.fromId, l.toId);
      else if (l.toType === "PLACE") push(eventPlaces, l.fromId, l.toId);
    }
  }
  // 이야기가 보이는 중심 목록(주 소속 + 추가 소속).
  const storyEvents = new Map<string, string[]>();
  for (const ep of episodeById.values()) push(storyEvents, ep.id, ep.lifeEventId);
  for (const [evId, epIds] of extraStories) for (const epId of epIds) if (eventIds.has(evId)) push(storyEvents, epId, evId);

  function buildStory(epId: string, shownUnder: string): MyLifeStory {
    const ep = episodeById.get(epId)!;
    const chips: MyLifeChip[] = [];
    const seen = new Set<string>();
    const add = (c: MyLifeChip) => {
      const key = `${c.kind}:${c.id ?? c.name}`;
      if (seen.has(key)) return;
      seen.add(key);
      chips.push(c);
    };
    if (ep.personId) {
      const p = personById.get(ep.personId);
      if (p) add({ kind: "person", id: p.id, name: p.name, proposed: false });
    }
    for (const l of storyLinks.get(epId) ?? []) {
      if (l.kind === "person") {
        const p = personById.get(l.id);
        if (p && (!p.isDraft || l.proposed)) add({ kind: "person", id: p.id, name: p.name, proposed: l.proposed });
      } else {
        const g = groupById.get(l.id);
        if (g && !l.proposed) add({ kind: "group", id: g.id, name: g.name, proposed: false });
      }
    }
    for (const mp of ep.memory.places) {
      add({ kind: "place", id: mp.placeId, name: mp.place?.name ?? mp.placeName, proposed: false });
    }
    return {
      id: ep.id,
      kind: ep.kind,
      content: ep.content,
      primaryEventId: ep.lifeEventId,
      otherEventIds: (storyEvents.get(epId) ?? []).filter((id) => id !== shownUnder),
      chips,
      hasPending: chips.some((c) => c.proposed),
    };
  }

  return {
    events: events.map((e) => {
      const stories = [
        ...e.episodes.map((ep) => buildStory(ep.id, e.id)),
        ...(extraStories.get(e.id) ?? []).filter((id) => episodeById.get(id)?.lifeEventId !== e.id).map((id) => buildStory(id, e.id)),
      ];
      // Q38 — 이 중심의 이야기 안에 이미 보이는 인물·모임·장소는 가지에서 뺀다.
      const inStories = new Set(stories.flatMap((s) => s.chips.filter((c) => c.id).map((c) => `${c.kind}:${c.id}`)));
      const branches: MyLifeBranch[] = [];
      const seen = new Set<string>();
      const take = (key: string) => {
        if (inStories.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      };
      for (const r of ples) {
        if (r.lifeEventId !== e.id) continue;
        const p = personById.get(r.personId);
        if (p && !p.isDraft && take(`person:${p.id}`)) {
          branches.push({ kind: "person", id: p.id, name: p.name, relation: p.relation, metYear: p.metYear });
        }
      }
      for (const gid of eventGroups.get(e.id) ?? []) {
        const g = groupById.get(gid);
        if (g && take(`group:${g.id}`)) branches.push({ kind: "group", id: g.id, name: g.name, members: g.members.map((m) => m.person.name) });
      }
      for (const pid of eventPlaces.get(e.id) ?? []) {
        const p = placeById.get(pid);
        if (p && take(`place:${p.id}`)) branches.push({ kind: "place", ...p });
      }
      return {
        id: e.id,
        type: e.type,
        label: e.correctedLabel ?? e.label,
        year: e.correctedYear ?? e.year,
        endYear: e.endYear,
        stories,
        branches,
      };
    }),
  };
}
