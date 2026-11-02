// My Life 개편 3단계 — 지도에서 직접 만들기·넣기·빼기·되돌리기·지우기. docs/phase/my-life-restructure.md §4.
// 순수 모듈(auth 없음) — app/my-life/actions.ts 가 auth 뒤 부르고, 회귀(db/test-my-life-edit.ts)가 같은 함수를 부른다.
//
// 노드 7종 만들기: 시기(직접 추가 CUSTOM)·이야기·그때의 나·사람·장소·모임·장소 묶음 — 기존 저장 함수 재사용
//   (createCustomLifeEvent·createEpisodeBridge·createPerson), 연결은 전부 lib/node-graph saveNodeLink 입구(Q44).
// 넣기 = saveNodeLink. 이야기↔사람은 그 이야기의 주 소속 시기↔사람(PersonLifeEvent)도 같이(2b-2 [맞아요]와 같은 결과).
//   돌려주는 created = 이번에 새로 생긴 연결만 — 되돌리기(undoLinks)는 그것만 removeNodeLink 로 지운다(넣기 전 상태).
// 빼기 = removeNodeLink(연결만 — 노드는 그대로). 주 소속 시기·대상 인물은 빼기 대상이 아니다(옮기기·인물 고치기로).
//   돌려주는 undo = 지운 행의 되살림 값 — 빼기 되돌리기(undoRemove)가 restoreNodeLink 로 빼기 전 그대로 잇는다(Q50 보완).
// 지우기 = 장소·모임·장소 묶음은 여기, 이야기는 lib/episode deleteEpisode, 직접 추가 시기는 lib/life-event-delete,
//   사람은 /people 기존 삭제(지도는 안내만). 연결 정리는 DB 트리거·FK(마이그 20261030000000·20261102000000).

import { prisma } from "./db";
import { createEpisodeBridge } from "./episode";
import { MY_LIFE_COPY } from "./my-life-copy";
import { removeNodeLink, restoreNodeLink, saveNodeLink, type NodeRef, type RemovedLinkRow } from "./node-graph";
import { createCustomLifeEvent } from "./open-chat-promote";
import { createPerson } from "./people";
import { findSameNamePeople } from "./person-chat";
import { relationGroup } from "./person-relation";
import { validatePlace } from "./place-validate";

const E = MY_LIFE_COPY.edit;

export const EDIT_LIMITS = {
  periodLabel: 30,
  storyTitle: 40,
  storyBody: 3000,
  personName: 50,
  relation: 30,
  placeName: 50,
  groupName: 30,
  pick: 30, // 한 번에 넣는 사람·장소 수
} as const;

// 출생 시기에 만난 비가족은 만난 해를 비운다(Q33 — lib/node-proposal 과 같은 규칙).
const FAMILY_GROUPS = new Set(["parent", "grandparent", "sibling", "relative", "spouse", "child"]);

export type Fail = { ok: false; error: string };
export type CreatedLink = { a: NodeRef; b: NodeRef };
export type RemovedLink = { a: NodeRef; b: NodeRef; rows: RemovedLinkRow[] };
export type SameNamePerson = { id: string; name: string; relation: string | null };

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, "");
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, EDIT_LIMITS.pick);

async function birthYearOf(userId: string): Promise<number | null> {
  const p = await prisma.onboardingProfile.findUnique({ where: { userId }, select: { birthYear: true } });
  if (p?.birthYear) return p.birthYear;
  return (await prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } }))?.birthYear ?? null;
}

function yearOk(y: unknown, birthYear: number | null, now = new Date()): y is number {
  return typeof y === "number" && Number.isInteger(y) && y >= (birthYear ?? 1900) - 1 && y <= now.getFullYear();
}

// ── 넣기·빼기·되돌리기 ─────────────────────────────────────────────

async function isConfirmedPerson(userId: string, id: string): Promise<boolean> {
  return (await prisma.person.count({ where: { id, userId, subjectType: "person", isDraft: false } })) > 0;
}

// 노드 둘을 잇는다. 사람 쪽은 확정 인물만. 이야기↔사람이면 주 소속 시기↔사람도.
export async function addLink(userId: string, a: NodeRef, b: NodeRef): Promise<{ ok: true; created: CreatedLink[] } | Fail> {
  for (const n of [a, b]) if (n.type === "PERSON" && !(await isConfirmedPerson(userId, n.id))) return { ok: false, error: E.notFound };
  let pairs: CreatedLink[] = [{ a, b }];
  const ep = a.type === "EPISODE" ? a : b.type === "EPISODE" ? b : null;
  const person = a.type === "PERSON" ? a : b.type === "PERSON" ? b : null;
  if (ep && person) {
    const row = await prisma.episode.findFirst({ where: { id: ep.id, lifeEvent: { userId } }, select: { lifeEventId: true, personId: true } });
    if (!row) return { ok: false, error: E.notFound };
    // 대상 인물(Episode.personId)은 이미 이 이야기의 분 — NodeLink 를 또 두지 않는다(한 쌍 = 한 곳).
    if (row.personId === person.id) pairs = [];
    pairs.push({ a: { type: "LIFE_EVENT", id: row.lifeEventId }, b: person });
  }
  const created: CreatedLink[] = [];
  for (const [i, p] of pairs.entries()) {
    const r = await saveNodeLink(userId, p.a, p.b);
    if (!r.ok) {
      if (i === 0) return { ok: false, error: r.reason === "primary_membership" ? E.alreadyPrimary : r.reason === "not_found" ? E.notFound : E.cannotLink };
      console.error("[my-life-edit] companion link", r.reason);
      continue;
    }
    if (r.created) created.push(p);
  }
  return { ok: true, created };
}

// 되돌리기 — 넣기에서 새로 생긴 연결만 지운다(이미 있던 연결은 created 에 없음).
export async function undoLinks(userId: string, links: CreatedLink[]): Promise<{ ok: true } | Fail> {
  for (const l of links.slice(0, 10)) {
    const r = await removeNodeLink(userId, l.a, l.b);
    if (!r.ok && r.reason !== "not_found") return { ok: false, error: E.cannotUnlink };
  }
  return { ok: true };
}

// 빼기 — undo 는 실제로 지운 행이 있을 때만(없는 연결을 빼면 되돌릴 것도 없음).
export async function removeLink(userId: string, a: NodeRef, b: NodeRef): Promise<{ ok: true; removed: number; undo: RemovedLink | null } | Fail> {
  const r = await removeNodeLink(userId, a, b);
  if (r.ok) return { ok: true, removed: r.removed, undo: r.rows.length > 0 ? { a, b, rows: r.rows } : null };
  if (r.reason === "primary_membership") return { ok: false, error: E.cannotRemovePrimary };
  if (r.reason === "subject_person") return { ok: false, error: E.cannotRemoveSubject };
  if (r.reason === "not_found") return { ok: false, error: E.notFound };
  return { ok: false, error: E.cannotUnlink };
}

// 빼기 되돌리기(Q50 보완 2026-11-02) — 빼기 직후 [되돌리기]. 같은 쌍을 saveNodeLink 입구로 다시 잇고 순서 값을 되살린다.
export async function undoRemove(userId: string, u: RemovedLink): Promise<{ ok: true; restored: number } | Fail> {
  const r = await restoreNodeLink(userId, u.a, u.b, u.rows);
  return r.ok ? { ok: true, restored: r.restored } : { ok: false, error: r.reason === "not_found" ? E.notFound : E.cannotUndo };
}

// ── 만들기 ─────────────────────────────────────────────────────────

// 시기 — 이름(30) · 연도(선택) · 끝 연도(선택, 연도 있을 때만, 연도 이상).
export async function createPeriodNode(
  userId: string,
  input: { label: unknown; year: unknown; endYear: unknown },
): Promise<{ ok: true; eventId: string } | Fail> {
  const label = clean(input.label, EDIT_LIMITS.periodLabel + 1);
  if (!label) return { ok: false, error: E.needName };
  if (label.length > EDIT_LIMITS.periodLabel) return { ok: false, error: E.tooLong(EDIT_LIMITS.periodLabel) };
  const birthYear = await birthYearOf(userId);
  const year = input.year === null || input.year === undefined || input.year === "" ? null : input.year;
  const endYear = input.endYear === null || input.endYear === undefined || input.endYear === "" ? null : input.endYear;
  if (year !== null && !yearOk(year, birthYear)) return { ok: false, error: E.badYear };
  if (endYear !== null && (year === null || !yearOk(endYear, birthYear) || (endYear as number) < (year as number))) return { ok: false, error: E.badEndYear };
  const ev = await createCustomLifeEvent(userId, label, year as number | null);
  if (endYear !== null) await prisma.lifeEvent.update({ where: { id: ev.id }, data: { endYear: endYear as number } });
  return { ok: true, eventId: ev.id };
}

// 이야기·그때의 나 — 시기(확정) · 제목(선택 — 적으면 사용자가 정한 제목) · 본문 · 사람·모임·장소(선택).
export async function createStoryNode(
  userId: string,
  input: { lifeEventId: unknown; kind: unknown; title: unknown; content: unknown; personIds?: unknown; groupIds?: unknown; placeIds?: unknown },
): Promise<{ ok: true; episodeId: string; eventId: string } | Fail> {
  const lifeEventId = typeof input.lifeEventId === "string" ? input.lifeEventId : "";
  const kind = input.kind === "SELF" ? "SELF" : "STORY";
  const title = clean(input.title, EDIT_LIMITS.storyTitle + 1);
  const content = clean(input.content, EDIT_LIMITS.storyBody + 1);
  if (title.length > EDIT_LIMITS.storyTitle) return { ok: false, error: E.tooLong(EDIT_LIMITS.storyTitle) };
  if (!content) return { ok: false, error: E.needBody };
  if (content.length > EDIT_LIMITS.storyBody) return { ok: false, error: E.tooLong(EDIT_LIMITS.storyBody) };
  const ev = await prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, year: true, correctedYear: true },
  });
  if (!ev) return { ok: false, error: E.pickPeriod };
  const personIds = ids(input.personIds);
  const groupIds = ids(input.groupIds);
  const placeIds = ids(input.placeIds);
  for (const id of personIds) if (!(await isConfirmedPerson(userId, id))) return { ok: false, error: E.notFound };
  if ((await prisma.personGroup.count({ where: { id: { in: groupIds }, userId } })) !== groupIds.length) return { ok: false, error: E.notFound };
  if ((await prisma.place.count({ where: { id: { in: placeIds }, userId } })) !== placeIds.length) return { ok: false, error: E.notFound };

  // 직접 쓰기 = 대화 녹취 없음(rawTranscript 빈 문자열 — lab 원천도 빈 녹취는 건너뜀).
  const saved = await createEpisodeBridge(userId, ev.id, title, ev.correctedYear ?? ev.year, content, "", undefined, false, kind, title !== "");
  if (!saved) return { ok: false, error: E.pickPeriod };
  const epRef: NodeRef = { type: "EPISODE", id: saved.episodeId };
  for (const id of personIds) await addLink(userId, epRef, { type: "PERSON", id });
  for (const id of groupIds) await saveNodeLink(userId, epRef, { type: "PERSON_GROUP", id });
  for (const id of placeIds) await saveNodeLink(userId, epRef, { type: "PLACE", id });
  return { ok: true, episodeId: saved.episodeId, eventId: ev.id };
}

// 사람 — 이름(50)·관계(30)·모임(선택). 같은 이름 확정 인물이 있으면 되묻기(2b-2 후속 규칙):
//   답 없음 → ask(후보) · same → 그분(새로 안 만듦, reused) · different → 새로.
// contextEventId(시기·이야기 패널에서 [새로 만들기]) — 만난 해 = 그 시기 연도(출생 시기 + 비가족이면 비움 — Q33).
export async function createPersonNode(
  userId: string,
  input: { name: unknown; relation: unknown; groupIds?: unknown; decision?: unknown; samePersonId?: unknown; contextEventId?: unknown },
): Promise<{ ok: true; personId: string; reused: boolean } | { ok: false; ask: SameNamePerson[] } | Fail> {
  const name = clean(input.name, EDIT_LIMITS.personName + 1);
  const relation = clean(input.relation, EDIT_LIMITS.relation + 1) || null;
  if (!name) return { ok: false, error: E.needName };
  if (name.length > EDIT_LIMITS.personName || (relation?.length ?? 0) > EDIT_LIMITS.relation) return { ok: false, error: E.tooLong(name.length > EDIT_LIMITS.personName ? EDIT_LIMITS.personName : EDIT_LIMITS.relation) };
  const groupIds = ids(input.groupIds);
  if ((await prisma.personGroup.count({ where: { id: { in: groupIds }, userId } })) !== groupIds.length) return { ok: false, error: E.notFound };

  let personId: string | null = null;
  let reused = false;
  const same = await findSameNamePeople(prisma, userId, name);
  if (input.decision === "same") {
    const pick = same.find((s) => s.id === input.samePersonId);
    if (!pick) return { ok: false, error: E.repickSame };
    personId = pick.id;
    reused = true;
  } else if (input.decision !== "different" && same.length > 0) {
    return { ok: false, ask: same };
  }
  if (!personId) {
    let metYear: number | null = null;
    if (typeof input.contextEventId === "string") {
      const ev = await prisma.lifeEvent.findFirst({ where: { id: input.contextEventId, userId }, select: { type: true, year: true, correctedYear: true } });
      const family = FAMILY_GROUPS.has(relationGroup(relation) ?? "");
      if (ev) metYear = ev.type === "BIRTH" && !family ? null : (ev.correctedYear ?? ev.year);
    }
    try {
      personId = (await createPerson(userId, { subjectType: "person", name, relation, birthYear: null, category: null, metYear, memo: null })).id;
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : E.failed };
    }
  }
  for (const id of groupIds) await saveNodeLink(userId, { type: "PERSON_GROUP", id }, { type: "PERSON", id: personId });
  return { ok: true, personId, reused };
}

// 장소 — 장소 검색 결과(네이버/구글 — 주소·좌표) 또는 이름만. 같은 이름(공백 무시)·같은 주소인 내 장소가 있으면 그곳(reused).
export async function createPlaceNode(
  userId: string,
  input: { name: unknown; address?: unknown; lat?: unknown; lng?: unknown; source?: unknown },
): Promise<{ ok: true; placeId: string; reused: boolean } | Fail> {
  const name = clean(input.name, EDIT_LIMITS.placeName + 1);
  if (!name) return { ok: false, error: E.needName };
  if (name.length > EDIT_LIMITS.placeName) return { ok: false, error: E.tooLong(EDIT_LIMITS.placeName) };
  let address: string | null = null;
  let lat: number | null = null;
  let lng: number | null = null;
  let source: string | null = null;
  if (input.source === "naver" || input.source === "google") {
    const v = validatePlace({
      placeName: name,
      placeAddress: typeof input.address === "string" ? input.address : null,
      lat: typeof input.lat === "number" ? input.lat : null,
      lng: typeof input.lng === "number" ? input.lng : null,
      placeSource: input.source,
    });
    if (!v.ok) return { ok: false, error: v.error };
    ({ placeAddress: address, lat, lng, placeSource: source } = v.place);
  }
  const mine = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true, address: true } });
  const hit = mine.find((p) => norm(p.name) === norm(name) && (p.address ?? null) === address);
  if (hit) return { ok: true, placeId: hit.id, reused: true };
  const row = await prisma.place.create({ data: { userId, name, address, lat, lng, source }, select: { id: true } });
  return { ok: true, placeId: row.id, reused: false };
}

// 모임 — 이름 · 구성원(확정 인물). 구성원은 saveNodeLink(PERSON_GROUP, PERSON) → PersonGroupMember.
export async function createGroupNode(userId: string, input: { name: unknown; memberIds?: unknown }): Promise<{ ok: true; groupId: string } | Fail> {
  const name = clean(input.name, EDIT_LIMITS.groupName + 1);
  if (!name) return { ok: false, error: E.needName };
  if (name.length > EDIT_LIMITS.groupName) return { ok: false, error: E.tooLong(EDIT_LIMITS.groupName) };
  const memberIds = ids(input.memberIds);
  for (const id of memberIds) if (!(await isConfirmedPerson(userId, id))) return { ok: false, error: E.notFound };
  const g = await prisma.personGroup.create({ data: { userId, name }, select: { id: true } });
  for (const id of memberIds) await saveNodeLink(userId, { type: "PERSON_GROUP", id: g.id }, { type: "PERSON", id });
  return { ok: true, groupId: g.id };
}

// 장소 묶음 — 이름 · 장소. 구성원은 saveNodeLink(PLACE_GROUP, PLACE) → PlaceGroupMember.
export async function createPlaceGroupNode(userId: string, input: { name: unknown; placeIds?: unknown }): Promise<{ ok: true; groupId: string } | Fail> {
  const name = clean(input.name, EDIT_LIMITS.groupName + 1);
  if (!name) return { ok: false, error: E.needName };
  if (name.length > EDIT_LIMITS.groupName) return { ok: false, error: E.tooLong(EDIT_LIMITS.groupName) };
  const placeIds = ids(input.placeIds);
  if ((await prisma.place.count({ where: { id: { in: placeIds }, userId } })) !== placeIds.length) return { ok: false, error: E.notFound };
  const g = await prisma.placeGroup.create({ data: { userId, name }, select: { id: true } });
  for (const id of placeIds) await saveNodeLink(userId, { type: "PLACE_GROUP", id: g.id }, { type: "PLACE", id });
  return { ok: true, groupId: g.id };
}

// ── 지우기 ─────────────────────────────────────────────────────────

// 지우기 확인창에 보일 수 — 지울 노드에 이어진 이야기·사람·장소, 가족이 남긴 댓글·반응(이야기·시기만 — 함께 지워짐).
// 시기(직접 추가)는 그 안의 이야기가 함께 지워진다(lib/life-event-delete). 남의 노드·없는 노드 = null.
export type DeleteImpact = { stories: number; people: number; places: number; familyActivity: number; storiesDeleted: boolean };

async function familyActivityOf(memoryIds: string[]): Promise<number> {
  if (memoryIds.length === 0) return 0;
  const where = { targetType: "user_memory", targetId: { in: memoryIds } };
  const [c, r] = await Promise.all([prisma.comment.count({ where }), prisma.memoryReaction.count({ where })]);
  return c + r;
}

export async function deleteImpact(userId: string, ref: NodeRef): Promise<DeleteImpact | null> {
  const zero: DeleteImpact = { stories: 0, people: 0, places: 0, familyActivity: 0, storiesDeleted: false };
  if (ref.type === "LIFE_EVENT") {
    const ev = await prisma.lifeEvent.findFirst({ where: { id: ref.id, userId, type: "CUSTOM" }, select: { episodes: { select: { memoryId: true } } } });
    if (!ev) return null;
    const people = await prisma.personLifeEvent.count({ where: { lifeEventId: ref.id, userId } });
    return { ...zero, stories: ev.episodes.length, people, familyActivity: await familyActivityOf(ev.episodes.map((e) => e.memoryId)), storiesDeleted: true };
  }
  if (ref.type === "EPISODE") {
    const ep = await prisma.episode.findFirst({ where: { id: ref.id, lifeEvent: { userId } }, select: { memoryId: true, personId: true } });
    if (!ep) return null;
    const linked = await prisma.nodeLink.findMany({ where: { userId, fromType: "EPISODE", fromId: ref.id, toType: "PERSON" }, select: { toId: true } });
    const people = new Set([...(ep.personId ? [ep.personId] : []), ...linked.map((l) => l.toId)]).size;
    const places = await prisma.memoryPlace.count({ where: { memoryId: ep.memoryId } });
    return { ...zero, people, places, familyActivity: await familyActivityOf([ep.memoryId]) };
  }
  if (ref.type === "PLACE") {
    if ((await prisma.place.count({ where: { id: ref.id, userId } })) === 0) return null;
    const [mps, people] = await Promise.all([
      prisma.memoryPlace.findMany({ where: { placeId: ref.id, memory: { userId, createdVia: "episode" } }, select: { memoryId: true } }),
      prisma.nodeLink.count({ where: { userId, toType: "PLACE", toId: ref.id, fromType: "PERSON" } }),
    ]);
    return { ...zero, stories: new Set(mps.map((m) => m.memoryId)).size, people };
  }
  if (ref.type === "PERSON_GROUP") {
    if ((await prisma.personGroup.count({ where: { id: ref.id, userId } })) === 0) return null;
    const [people, stories] = await Promise.all([
      prisma.personGroupMember.count({ where: { groupId: ref.id } }),
      prisma.nodeLink.count({ where: { userId, fromType: "EPISODE", toType: "PERSON_GROUP", toId: ref.id } }),
    ]);
    return { ...zero, people, stories };
  }
  if (ref.type === "PLACE_GROUP") {
    if ((await prisma.placeGroup.count({ where: { id: ref.id, userId } })) === 0) return null;
    return { ...zero, places: await prisma.placeGroupMember.count({ where: { groupId: ref.id } }) };
  }
  return null;
}

// 장소·모임·장소 묶음 지우기.

// 장소 — 이야기 안의 그 장소 행(이야기 브릿지 MemoryPlace)도 같이 지운다(지도에서 지운 곳이 이야기 칩으로 남지 않게).
// 옛 연혁·사진 메모리의 장소 행은 FK SetNull 로 이름만 남는다(v2 화면 무수정). 연결(NodeLink)은 트리거, 묶음 구성원은 FK.
export async function deletePlaceNode(userId: string, placeId: string): Promise<{ ok: true } | Fail> {
  const owned = await prisma.place.count({ where: { id: placeId, userId } });
  if (owned === 0) return { ok: false, error: E.notFound };
  await prisma.$transaction([
    prisma.memoryPlace.deleteMany({ where: { placeId, memory: { userId, createdVia: "episode" } } }),
    prisma.place.deleteMany({ where: { id: placeId, userId } }),
  ]);
  return { ok: true };
}

export async function deleteGroupNode(userId: string, groupId: string): Promise<{ ok: true } | Fail> {
  const r = await prisma.personGroup.deleteMany({ where: { id: groupId, userId } });
  return r.count > 0 ? { ok: true } : { ok: false, error: E.notFound };
}

export async function deletePlaceGroupNode(userId: string, groupId: string): Promise<{ ok: true } | Fail> {
  const r = await prisma.placeGroup.deleteMany({ where: { id: groupId, userId } });
  return r.count > 0 ? { ok: true } : { ok: false, error: E.notFound };
}
