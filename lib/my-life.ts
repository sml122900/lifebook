// My Life 마인드맵 — 화면 데이터. 읽기 전용, auth 없음(회귀가 같은 함수를 부른다).
// docs/phase/my-life-restructure.md §1(1단계 지도 개편) · node-graph-self.md §6 2b.1 의 1(포함 규칙).
//
// Prisma 호출 수는 기록 양과 무관하게 고정 7회(중심+이야기 1 · 중심↔인물 1 · NodeLink 1 · 인물·모임·장소·장소 묶음 4).
// 중심 = 확정(CONFIRMED·CORRECTED) LifeEvent, sequenceOrder·id 순(/story-review·갭·인터뷰와 같은 기준).
//   왼쪽 가지 = 이야기(STORY)·그때의 나(SELF) — 주 소속 + NodeLink(LIFE_EVENT→EPISODE) 추가 소속.
//   이야기 안 작은 물방울 = 대상 인물 + NodeLink(EPISODE→PERSON·PERSON_GROUP) + 브릿지 MemoryPlace.
// 오른쪽 = 인물록(확정 인물 전부 + 확인 대기 초안 · 모임과 구성원)·장소록(사용자 Place 전부 · 장소 묶음과 구성원 — 3단계) — 한 번씩만.
//   중심마다 붙던 오른쪽 가지(2b-3a)는 없앴다. 중심의 직접 연결(PersonLifeEvent·LIFE_EVENT→PLACE·
//   LIFE_EVENT→PERSON_GROUP)은 중심을 선택했을 때의 간선으로만 쓴다(Q55).

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
  // 이야기 제목 = 브릿지 메모리 제목 칸 그대로. 비었으면(빈 문자열 = 제목 없음) 화면은 본문 첫 문장 — 판정은
  // lib/story-title displayTitle 한 곳(2026-11-02 "시기 이름이면 제목으로 안 봄" 조건 제거 — 옛 제목은 정리 스크립트가 비움).
  title: string | null;
  content: string;
  primaryEventId: string;
  otherEventIds: string[]; // 이 이야기가 같이 보이는 다른 중심(추가 소속·주 소속)
  subjectPersonId: string | null; // 대상 인물(Episode.personId) — 빼기 대상 아님(3단계 패널)
  chips: MyLifeChip[];
  hasPending: boolean;
};

export type MyLifeEvent = {
  id: string;
  type: LifeEventType;
  label: string;
  year: number | null;
  endYear: number | null;
  stories: MyLifeStory[];
  // 중심 직접 연결(간선용 — 중심을 선택했을 때만 그림)
  personIds: string[];
  placeIds: string[];
  groupIds: string[];
};

export type MyLifePerson = {
  id: string;
  name: string;
  relation: string | null;
  metYear: number | null;
  groupIds: string[];
  draft: boolean; // 확인 대기 초안(2b-2 잔여) — 인물록 맨 끝 점선
};

// 모임(memberIds = 사람 id)·장소 묶음(memberIds = 장소 id) 같은 모양.
export type MyLifeGroup = { id: string; name: string; memberIds: string[] };

export type MyLifePlace = {
  id: string;
  name: string;
  address: string | null;
  source: string | null;
  lat: number | null;
  lng: number | null;
  groupIds: string[]; // 장소 묶음
};

export type MyLifeData = {
  events: MyLifeEvent[];
  people: MyLifePerson[];
  groups: MyLifeGroup[];
  places: MyLifePlace[];
  placeGroups: MyLifeGroup[];
};

type Db = typeof prisma;

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "ko");

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
                title: true,
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

  // 확인 대기 초안 = 이야기→인물 PROPOSED 연결의 대상(그 밖의 초안 — 말동무 초안 검토 대기 — 은 안 보임).
  const proposedPersonIds = [...new Set(links.filter((l) => l.status === "PROPOSED" && l.toType === "PERSON").map((l) => l.toId))];
  const [peopleRows, groupRows, placeRows, placeGroupRows] = await Promise.all([
    db.person.findMany({
      where: { userId, subjectType: "person", OR: [{ isDraft: false }, { id: { in: proposedPersonIds } }] },
      select: { id: true, name: true, relation: true, metYear: true, isDraft: true },
    }),
    db.personGroup.findMany({
      where: { userId },
      select: { id: true, name: true, members: { select: { personId: true } } },
    }),
    db.place.findMany({ where: { userId }, select: { id: true, name: true, address: true, source: true, lat: true, lng: true } }),
    db.placeGroup.findMany({ where: { userId }, select: { id: true, name: true, members: { select: { placeId: true } } } }),
  ]);

  const personById = new Map(peopleRows.map((p) => [p.id, p]));
  const groupById = new Map(groupRows.map((g) => [g.id, g]));
  const placeById = new Map(placeRows.map((p) => [p.id, p]));
  const eventIds = new Set(events.map((e) => e.id));
  const episodeById = new Map(events.flatMap((e) => e.episodes.map((ep) => [ep.id, { ...ep, lifeEventId: e.id }] as const)));

  const push = <T>(m: Map<string, T[]>, k: string, v: T) => {
    const arr = m.get(k);
    if (arr) arr.push(v);
    else m.set(k, [v]);
  };
  const storyLinks = new Map<string, { kind: ChipKind; id: string; proposed: boolean }[]>();
  const extraStories = new Map<string, string[]>(); // 중심 id → 추가 소속 이야기 id
  const eventGroups = new Map<string, string[]>();
  const eventPlaces = new Map<string, string[]>();
  for (const l of links) {
    if (l.fromType === "EPISODE" && (l.toType === "PERSON" || l.toType === "PERSON_GROUP")) {
      push(storyLinks, l.fromId, { kind: l.toType === "PERSON" ? "person" : "group", id: l.toId, proposed: l.status === "PROPOSED" });
    } else if (l.fromType === "LIFE_EVENT" && l.status === "CONFIRMED") {
      if (l.toType === "EPISODE" && episodeById.has(l.toId)) push(extraStories, l.fromId, l.toId);
      else if (l.toType === "PERSON_GROUP" && groupById.has(l.toId)) push(eventGroups, l.fromId, l.toId);
      else if (l.toType === "PLACE" && placeById.has(l.toId)) push(eventPlaces, l.fromId, l.toId);
    }
  }
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
      const id = mp.placeId && placeById.has(mp.placeId) ? mp.placeId : null;
      add({ kind: "place", id, name: mp.place?.name ?? mp.placeName, proposed: false });
    }
    return {
      id: ep.id,
      kind: ep.kind,
      title: ep.memory.title,
      content: ep.content,
      primaryEventId: ep.lifeEventId,
      otherEventIds: (storyEvents.get(epId) ?? []).filter((id) => id !== shownUnder),
      subjectPersonId: ep.personId && personById.has(ep.personId) ? ep.personId : null,
      chips,
      hasPending: chips.some((c) => c.proposed),
    };
  }

  const memberGroups = new Map<string, string[]>();
  for (const g of groupRows) for (const m of g.members) if (personById.has(m.personId)) push(memberGroups, m.personId, g.id);
  const placeGroupsOf = new Map<string, string[]>();
  for (const g of placeGroupRows) for (const m of g.members) if (placeById.has(m.placeId)) push(placeGroupsOf, m.placeId, g.id);

  return {
    events: events.map((e) => ({
      id: e.id,
      type: e.type,
      label: e.correctedLabel ?? e.label,
      year: e.correctedYear ?? e.year,
      endYear: e.endYear,
      stories: [
        ...e.episodes.map((ep) => buildStory(ep.id, e.id)),
        ...(extraStories.get(e.id) ?? []).filter((id) => episodeById.get(id)?.lifeEventId !== e.id).map((id) => buildStory(id, e.id)),
      ],
      personIds: [...new Set(ples.filter((r) => r.lifeEventId === e.id && personById.get(r.personId)?.isDraft === false).map((r) => r.personId))],
      placeIds: [...new Set(eventPlaces.get(e.id) ?? [])],
      groupIds: [...new Set(eventGroups.get(e.id) ?? [])],
    })),
    people: peopleRows
      .map((p) => ({ id: p.id, name: p.name, relation: p.relation, metYear: p.metYear, groupIds: memberGroups.get(p.id) ?? [], draft: p.isDraft }))
      .sort(byName),
    groups: groupRows.map((g) => ({ id: g.id, name: g.name, memberIds: g.members.map((m) => m.personId).filter((id) => personById.has(id)) })).sort(byName),
    places: placeRows.map((p) => ({ ...p, groupIds: placeGroupsOf.get(p.id) ?? [] })).sort(byName),
    placeGroups: placeGroupRows
      .map((g) => ({ id: g.id, name: g.name, memberIds: g.members.map((m) => m.placeId).filter((id) => placeById.has(id)) }))
      .sort(byName),
  };
}
