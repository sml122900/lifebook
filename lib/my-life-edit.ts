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
import { createEpisodeBridge, deleteEpisode } from "./episode";
import { deleteCustomLifeEvent } from "./life-event-delete";
import { MY_LIFE_COPY } from "./my-life-copy";
import {
  cleanupStoryPeriodPeople,
  periodPeoplePairsOfEpisode,
  removeNodeLink,
  restoreNodeLink,
  revertPeriodPersonUpgrade,
  saveNodeLink,
  type NodeRef,
  type PeriodPersonOrigin,
  type RemovedLink,
} from "./node-graph";
import { createCustomLifeEvent } from "./open-chat-promote";
import { createPerson, deletePerson, updatePerson } from "./people";
import {
  createCategory,
  createCustomNode,
  clearBuiltinName,
  CUSTOM_LIMITS,
  deleteCustomNode,
  moveCustomNode,
  renameCustomNode,
  sameNameNodes,
  setBuiltinName,
  type CustomNodeReject,
  type SameNameNode,
} from "./custom-node";
import { findSameNamePeople } from "./person-chat";
import { relationGroup } from "./person-relation";
import { validatePlace } from "./place-validate";
import { resolveBirthYear } from "./life-events";
import { isDecorShape } from "./space-decor";

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
// downgrade — 이 넣기가 시기↔사람을 STORY → DIRECT 로 올렸음(새로 생긴 행 아님) — 되돌리기는 지우지 않고 다시 STORY 로.
export type CreatedLink = { a: NodeRef; b: NodeRef; downgrade?: true };
export type { RemovedLink };
export type SameNamePerson = { id: string; name: string; relation: string | null };

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, "");
const clean = (s: unknown, max: number) => (typeof s === "string" ? s.trim().slice(0, max) : "");
const ids = (v: unknown) => [...new Set((Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.length > 0))].slice(0, EDIT_LIMITS.pick);

function yearOk(y: unknown, birthYear: number | null, now = new Date()): y is number {
  return typeof y === "number" && Number.isInteger(y) && y >= (birthYear ?? 1900) - 1 && y <= now.getFullYear();
}

// ── 넣기·빼기·되돌리기 ─────────────────────────────────────────────

async function isConfirmedPerson(userId: string, id: string): Promise<boolean> {
  return (await prisma.person.count({ where: { id, userId, subjectType: "person", isDraft: false } })) > 0;
}

// 노드 둘을 잇는다. 사람 쪽은 확정 인물만. 이야기↔사람이면 주 소속 시기↔사람도(출처 STORY — 이야기 따라).
// 시기↔사람을 직접 넣으면 DIRECT(같은 쌍이 STORY 였으면 DIRECT 로 올림 — §14.8).
export async function addLink(userId: string, a: NodeRef, b: NodeRef, opts: { source?: "AI" } = {}): Promise<{ ok: true; created: CreatedLink[] } | Fail> {
  for (const n of [a, b]) if (n.type === "PERSON" && !(await isConfirmedPerson(userId, n.id))) return { ok: false, error: E.notFound };
  let pairs: (CreatedLink & { origin?: PeriodPersonOrigin })[] = [{ a, b }];
  const ep = a.type === "EPISODE" ? a : b.type === "EPISODE" ? b : null;
  const person = a.type === "PERSON" ? a : b.type === "PERSON" ? b : null;
  if (ep && person) {
    const row = await prisma.episode.findFirst({ where: { id: ep.id, lifeEvent: { userId } }, select: { lifeEventId: true, personId: true } });
    if (!row) return { ok: false, error: E.notFound };
    // 대상 인물(Episode.personId)은 이미 이 이야기의 분 — NodeLink 를 또 두지 않는다(한 쌍 = 한 곳).
    if (row.personId === person.id) pairs = [];
    pairs.push({ a: { type: "LIFE_EVENT", id: row.lifeEventId }, b: person, origin: "STORY" });
  }
  const created: CreatedLink[] = [];
  for (const [i, p] of pairs.entries()) {
    const r = await saveNodeLink(userId, p.a, p.b, { ...(p.origin ? { origin: p.origin } : {}), ...(opts.source ? { source: opts.source } : {}) });
    if (!r.ok) {
      if (i === 0) return { ok: false, error: r.reason === "primary_membership" ? E.alreadyPrimary : r.reason === "not_found" ? E.notFound : E.cannotLink };
      console.error("[my-life-edit] companion link", r.reason);
      continue;
    }
    if (r.created) created.push({ a: p.a, b: p.b });
    else if (r.upgraded) created.push({ a: p.a, b: p.b, downgrade: true });
  }
  return { ok: true, created };
}

// 행성 꾸미기(U4 — docs/phase/ui-space.md §5·§7.5) — 시기·이야기 행성 하나에 모양 하나(NodeDecoration 유일). shape = null 이면 없앰.
// 내 노드만(시기 = LifeEvent.userId · 이야기 = 소속 시기의 주인 — 정합 점검의 ownerOf 와 같은 기준) · 모양 = lib/space-decor 목록만.
// previous = 바꾸기 전 모양(되돌리기가 이 값으로 다시 부름). source = USER(사용자가 고름 — AI 제안은 범위 제외, Q121).
export async function setNodeDecoration(userId: string, node: NodeRef, shape: string | null): Promise<{ ok: true; previous: string | null } | Fail> {
  if (shape !== null && !isDecorShape(shape)) return { ok: false, error: E.failed };
  if (node.type !== "LIFE_EVENT" && node.type !== "EPISODE") return { ok: false, error: E.notFound };
  const owned =
    node.type === "LIFE_EVENT"
      ? await prisma.lifeEvent.count({ where: { id: node.id, userId } })
      : await prisma.episode.count({ where: { id: node.id, lifeEvent: { userId } } });
  if (!owned) return { ok: false, error: E.notFound };
  const key = { nodeType_nodeId: { nodeType: node.type, nodeId: node.id } };
  const prev = await prisma.nodeDecoration.findUnique({ where: key, select: { shape: true, userId: true } });
  if (prev && prev.userId !== userId) return { ok: false, error: E.notFound }; // 주인 다른 행(점검 15 보고 대상) — 건드리지 않음
  if (shape === null) await prisma.nodeDecoration.deleteMany({ where: { nodeType: node.type, nodeId: node.id, userId } });
  else
    await prisma.nodeDecoration.upsert({
      where: key,
      create: { userId, nodeType: node.type, nodeId: node.id, shape, source: "USER" },
      update: { shape, source: "USER" },
    });
  return { ok: true, previous: prev?.shape ?? null };
}

// 되돌리기 — 넣기에서 새로 생긴 연결만 지운다(이미 있던 연결은 created 에 없음). DIRECT 로 올린 것은 다시 STORY 로.
export async function undoLinks(userId: string, links: CreatedLink[]): Promise<{ ok: true } | Fail> {
  for (const l of links.slice(0, 10)) {
    if (l.downgrade) {
      const ev = l.a.type === "LIFE_EVENT" ? l.a : l.b;
      const p = l.a.type === "PERSON" ? l.a : l.b;
      if (ev.type === "LIFE_EVENT" && p.type === "PERSON") await revertPeriodPersonUpgrade(userId, ev.id, p.id);
      continue;
    }
    const r = await removeNodeLink(userId, l.a, l.b);
    if (!r.ok && r.reason !== "not_found") return { ok: false, error: E.cannotUnlink };
  }
  return { ok: true };
}

// 빼기 — undo 는 실제로 지운 행이 있을 때만(없는 연결을 빼면 되돌릴 것도 없음).
// 이야기↔사람·이야기의 추가 소속을 빼면, 그 이야기에 걸린 (시기, 사람)의 이야기 따라 생긴 연결(STORY)을 다시 본다 —
// 그 시기 이야기에 그 분이 하나도 안 나오면 지우고(§14.8), 그 행도 undo 에 담아 되돌리기로 같이 되살린다.
export async function removeLink(userId: string, a: NodeRef, b: NodeRef): Promise<{ ok: true; removed: number; undo: RemovedLink[] | null } | Fail> {
  const ep = a.type === "EPISODE" ? a : b.type === "EPISODE" ? b : null;
  const other = ep === a ? b : a;
  // 빼기 전에 고른다(빼고 나면 그 이야기에서 그 분이 이미 빠져 있음).
  const pairs =
    ep && (other.type === "PERSON" || other.type === "LIFE_EVENT")
      ? (await periodPeoplePairsOfEpisode(prisma, userId, ep.id)).filter((p) => (other.type === "PERSON" ? p.personId === other.id : p.lifeEventId === other.id))
      : [];
  const r = await removeNodeLink(userId, a, b);
  if (r.ok) {
    const cleaned = r.removed > 0 ? await cleanupStoryPeriodPeople(userId, pairs) : [];
    const undo: RemovedLink[] = [...(r.rows.length > 0 ? [{ a, b, rows: r.rows }] : []), ...cleaned];
    return { ok: true, removed: r.removed, undo: undo.length > 0 ? undo : null };
  }
  if (r.reason === "primary_membership") return { ok: false, error: E.cannotRemovePrimary };
  if (r.reason === "subject_person") return { ok: false, error: E.cannotRemoveSubject };
  if (r.reason === "not_found") return { ok: false, error: E.notFound };
  return { ok: false, error: E.cannotUnlink };
}

// 빼기 되돌리기(Q50 보완 2026-11-02) — 빼기 직후 [되돌리기]. 같은 쌍을 saveNodeLink 입구로 다시 잇고 순서 값을 되살린다.
// 빼면서 같이 정리한 시기↔사람도 함께(목록 순서대로).
export async function undoRemove(userId: string, links: RemovedLink[]): Promise<{ ok: true; restored: number } | Fail> {
  const list = Array.isArray(links) ? links.slice(0, 10) : [];
  if (list.length === 0) return { ok: false, error: E.cannotUndo };
  let restored = 0;
  for (const u of list) {
    const r = await restoreNodeLink(userId, u.a, u.b, u.rows);
    if (!r.ok) return { ok: false, error: r.reason === "not_found" ? E.notFound : E.cannotUndo };
    restored += r.restored;
  }
  return { ok: true, restored };
}

// ── 만들기 ─────────────────────────────────────────────────────────

// 만든 것을 되돌릴 때 지울 대상(이미 있던 것을 다시 쓴 경우 = null — 되돌릴 게 없음).
export type CreatedNode = { kind: "period" | "story" | "person" | "place" | "group" | "placeGroup" | "custom"; id: string };

// 방금 만든 노드 되돌리기 — 만든 직후 패널의 [되돌리기] · AI 지도 편집 결과 카드. 사람도 여기서는 지운다(방금 만든 분 — 본인 것만).
export async function undoCreatedNode(userId: string, node: CreatedNode): Promise<{ ok: true } | Fail> {
  if (!node || typeof node.id !== "string") return { ok: false, error: E.notFound };
  switch (node.kind) {
    case "period": {
      const r = await deleteCustomLifeEvent(userId, node.id);
      return r.ok ? r : { ok: false, error: E.notFound };
    }
    case "story": {
      const r = await deleteEpisode(userId, node.id);
      return r.ok ? r : { ok: false, error: E.notFound };
    }
    case "person":
      return (await deletePerson(userId, node.id)) ? { ok: true } : { ok: false, error: E.notFound };
    case "place":
      return deletePlaceNode(userId, node.id);
    case "group":
      return deleteGroupNode(userId, node.id);
    case "placeGroup":
      return deletePlaceGroupNode(userId, node.id);
    case "custom":
      return deleteCustom(userId, node.id);
    default:
      return { ok: false, error: E.notFound };
  }
}

// 시기 — 이름(30) · 연도(선택) · 끝 연도(선택, 연도 있을 때만, 연도 이상).
export async function createPeriodNode(
  userId: string,
  input: { label: unknown; year: unknown; endYear: unknown },
): Promise<{ ok: true; eventId: string } | Fail> {
  const label = clean(input.label, EDIT_LIMITS.periodLabel + 1);
  if (!label) return { ok: false, error: E.needName };
  if (label.length > EDIT_LIMITS.periodLabel) return { ok: false, error: E.tooLong(EDIT_LIMITS.periodLabel) };
  const birthYear = await resolveBirthYear(userId);
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
// placeGroups — 장소를 지우면 함께 빠지는 장소 묶음 수(확인창 "묶음 N개에서도 빠져요" — 3단계 E2E 2026-11-02).
// periods·groups·personBody = 사람 지우기(인물록 통합 2026-11-06) — 그 분이 있는 시기·모임 수 · 이 분에 대해 적은 글이 있는지.
// custom* = 사용자 카테고리(custom-graph 2단계): customKind 종류 · customDeleted 같이 지워지는 묶음·항목(카테고리) · customOut 빠지기만 하는 것
// (카테고리·묶음에 넣어 둔 것 — 원래 노드는 남음) · customLinks 항목의 이어진 것·넣어 둔 곳 수.
export type DeleteImpact = {
  stories: number;
  people: number;
  places: number;
  familyActivity: number;
  storiesDeleted: boolean;
  placeGroups: number;
  periods: number;
  groups: number;
  personBody: boolean;
  customKind: "CATEGORY" | "GROUP" | "ITEM" | null;
  customDeleted: number;
  customOut: number;
  customLinks: number;
};

async function familyActivityOf(memoryIds: string[]): Promise<number> {
  if (memoryIds.length === 0) return 0;
  const where = { targetType: "user_memory", targetId: { in: memoryIds } };
  const [c, r] = await Promise.all([prisma.comment.count({ where }), prisma.memoryReaction.count({ where })]);
  return c + r;
}

export async function deleteImpact(userId: string, ref: NodeRef): Promise<DeleteImpact | null> {
  const zero: DeleteImpact = { stories: 0, people: 0, places: 0, familyActivity: 0, storiesDeleted: false, placeGroups: 0, periods: 0, groups: 0, personBody: false, customKind: null, customDeleted: 0, customOut: 0, customLinks: 0 };
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
    const [mps, people, placeGroups] = await Promise.all([
      prisma.memoryPlace.findMany({ where: { placeId: ref.id, memory: { userId, createdVia: "episode" } }, select: { memoryId: true } }),
      prisma.nodeLink.count({ where: { userId, toType: "PLACE", toId: ref.id, fromType: "PERSON" } }),
      prisma.placeGroupMember.count({ where: { placeId: ref.id, group: { userId } } }),
    ]);
    return { ...zero, stories: new Set(mps.map((m) => m.memoryId)).size, people, placeGroups };
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
  if (ref.type === "CUSTOM") {
    const node = await prisma.customNode.findFirst({ where: { id: ref.id, userId }, select: { kind: true, builtin: true } });
    if (!node || node.builtin !== null || (node.kind !== "CATEGORY" && node.kind !== "GROUP" && node.kind !== "ITEM")) return null;
    const kind = node.kind as "CATEGORY" | "GROUP" | "ITEM";
    const touching = (ids: string[]) => prisma.nodeLink.count({ where: { userId, OR: [{ fromType: "CUSTOM", fromId: { in: ids } }, { toType: "CUSTOM", toId: { in: ids } }] } });
    if (kind === "CATEGORY") {
      const kids = await prisma.customNode.findMany({ where: { parentId: ref.id, userId }, select: { id: true, kind: true } });
      const groupIds = kids.filter((k) => k.kind === "GROUP").map((k) => k.id);
      // 빠지기만 하는 것 = 이 카테고리·그 묶음에 넣어 둔 것 중 이 카테고리 자기 항목이 아닌 것
      const own = new Set(kids.map((k) => k.id));
      const rows = await prisma.nodeLink.findMany({
        where: { userId, role: "MEMBER", OR: [{ toType: "CUSTOM", toId: { in: [ref.id, ...groupIds] } }, { fromType: "CUSTOM", fromId: { in: [ref.id, ...groupIds] } }] },
        select: { fromType: true, fromId: true, toType: true, toId: true },
      });
      const containers = new Set([ref.id, ...groupIds]);
      const out = new Set(rows.map((r) => (containers.has(r.toId) && r.toType === "CUSTOM" ? `${r.fromType}:${r.fromId}` : `${r.toType}:${r.toId}`)).filter((k) => !own.has(k.split(":")[1])));
      return { ...zero, customKind: kind, customDeleted: kids.length, customOut: out.size };
    }
    if (kind === "GROUP") {
      const members = await prisma.nodeLink.count({ where: { userId, role: "MEMBER", OR: [{ toType: "CUSTOM", toId: ref.id }, { fromType: "CUSTOM", fromId: ref.id }] } });
      return { ...zero, customKind: kind, customOut: members };
    }
    return { ...zero, customKind: kind, customLinks: await touching([ref.id]), personBody: (await prisma.nodeBody.count({ where: { userId, nodeType: "CUSTOM", nodeId: ref.id } })) > 0 };
  }
  if (ref.type === "PERSON") {
    if ((await prisma.person.count({ where: { id: ref.id, userId } })) === 0) return null;
    const [subject, linked, periods, groups, places, body] = await Promise.all([
      prisma.episode.findMany({ where: { personId: ref.id, lifeEvent: { userId } }, select: { id: true } }),
      prisma.nodeLink.findMany({ where: { userId, fromType: "EPISODE", toType: "PERSON", toId: ref.id }, select: { fromId: true } }),
      prisma.personLifeEvent.count({ where: { personId: ref.id, userId } }),
      prisma.personGroupMember.count({ where: { personId: ref.id, group: { userId } } }),
      prisma.nodeLink.count({ where: { userId, fromType: "PERSON", fromId: ref.id, toType: "PLACE" } }),
      prisma.nodeBody.count({ where: { userId, nodeType: "PERSON", nodeId: ref.id } }),
    ]);
    return { ...zero, stories: new Set([...subject.map((e) => e.id), ...linked.map((l) => l.fromId)]).size, periods, groups, places, personBody: body > 0 };
  }
  return null;
}

// 장소·모임·장소 묶음·사람 지우기.

// 사람 — 기존 /people 지우기와 같은 함수(lib/people deletePerson — 내 사람만 · 인물 글 사진 파일까지). 연결(NodeLink)·인물 글·이전 판은
// 트리거, 시기↔사람·모임 구성원·옛 연혁 연결은 FK Cascade, 이야기의 대상 인물(Episode.personId)은 SetNull(이야기는 남음).
export async function deletePersonNode(userId: string, personId: string): Promise<{ ok: true } | Fail> {
  return (await deletePerson(userId, personId)) ? { ok: true } : { ok: false, error: E.notFound };
}

// 인물록 통합(2026-11-06) — 사람 패널 [이름·정보 고치기]. 저장 = 기존 /people 고치기와 같은 함수(lib/people updatePerson — 같은 검사·문구).
// 확정 인물(종류 사람)만. 분류(category)는 V3 화면에서 안 쓰지만 데이터는 그대로 — 지금 값을 그대로 넘긴다.
export async function updatePersonInfo(
  userId: string,
  personId: string,
  input: { name?: unknown; relation?: unknown; birthYear?: unknown; metYear?: unknown; memo?: unknown },
): Promise<{ ok: true } | Fail> {
  const cur = await prisma.person.findFirst({ where: { id: personId, userId, isDraft: false, subjectType: "person" }, select: { category: true } });
  if (!cur) return { ok: false, error: E.notFound };
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const year = (v: unknown): number | null | undefined => {
    const s = typeof v === "number" ? String(v) : text(v).trim();
    if (s === "") return null;
    return /^\d{4}$/.test(s) ? Number(s) : undefined;
  };
  const birthYear = year(input.birthYear);
  const metYear = year(input.metYear);
  if (birthYear === undefined || metYear === undefined) return { ok: false, error: E.badYear };
  const relation = text(input.relation).trim();
  const memo = text(input.memo).trim();
  try {
    const r = await updatePerson(userId, personId, {
      subjectType: "person",
      name: text(input.name),
      relation: relation === "" ? null : relation,
      birthYear,
      category: cur.category,
      metYear,
      memo: memo === "" ? null : memo,
    });
    return r ? { ok: true } : { ok: false, error: E.notFound };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : E.failed }; // lib/people 검사 문구(이름 비었음·너무 김·연도 범위)
  }
}

// ── 사용자 카테고리(custom-graph 2단계 — docs/phase/custom-graph.md §3) ─────────────────────
// 본체는 lib/custom-node(규칙·상한·고리·깊이). 여기는 화면 문구로 바꾸고, 같은 이름 안내(Q98)·카테고리에서 빼기를 더한다.
const X = MY_LIFE_COPY.custom;
function customError(reason: CustomNodeReject): string {
  if (reason === "need_name") return E.needName;
  if (reason === "too_long") return E.tooLong(CUSTOM_LIMITS.name);
  if (reason === "limit") return X.limit;
  if (reason === "not_found" || reason === "builtin") return E.notFound;
  return E.failed;
}

export async function createCategoryNode(userId: string, name: unknown): Promise<{ ok: true; id: string } | Fail> {
  const r = await createCategory(userId, { name });
  return r.ok ? r : { ok: false, error: customError(r.reason) };
}

// 항목·묶음 — 자리 = 사용자 카테고리. decision 없이 6종과 같은 이름이면(공백 무시 — sameNameNodes) 만들지 않고 되묻는다(Q98):
// 화면이 [이것 넣기](= 그 노드를 이 카테고리에 넣기 연결, 새 항목 0) / [새로 만들기](decision "new")를 보인다.
export async function createCustomChild(
  userId: string,
  input: { kind: unknown; name: unknown; categoryId: unknown; decision?: unknown },
): Promise<{ ok: true; id: string } | Fail | { ok: false; askSame: SameNameNode[] }> {
  if (input.kind !== "ITEM" && input.kind !== "GROUP") return { ok: false, error: E.failed };
  if (input.decision !== "new" && typeof input.name === "string") {
    const same = await sameNameNodes(userId, input.name);
    if (same.length > 0) return { ok: false, askSame: same.slice(0, 10) };
  }
  const r = await createCustomNode(userId, { kind: input.kind, name: input.name, parentId: input.categoryId });
  return r.ok ? r : { ok: false, error: customError(r.reason) };
}

// 기본 카테고리(인물록·장소록) 표시 이름 — 영역 제목만 바뀐다(Q76, "록" 자동으로 안 붙임).
export async function renameBuiltin(userId: string, builtin: unknown, name: unknown): Promise<{ ok: true; prev: string | null } | Fail> {
  const r = await setBuiltinName(userId, builtin, name);
  return r.ok ? { ok: true, prev: r.prevName } : { ok: false, error: customError(r.reason) };
}

// 기본 카테고리 이름 되돌리기 — 처음 바꾼 것이면 행을 지워 기본 이름으로.
export async function undoBuiltinName(userId: string, builtin: "PEOPLE" | "PLACES", prev: string | null): Promise<{ ok: true } | Fail> {
  if (prev !== null) return renameBuiltin(userId, builtin, prev);
  await clearBuiltinName(userId, builtin);
  return { ok: true };
}

// 자리 옮기기(묶음·항목 → 다른 사용자 카테고리). undo = 원래 카테고리(새 카테고리로의 넣기 연결을 지웠으면 되돌리지 않음 — null).
export async function moveCustom(userId: string, nodeId: string, categoryId: unknown): Promise<{ ok: true; undo: { nodeId: string; categoryId: string } | null } | Fail> {
  const r = await moveCustomNode(userId, nodeId, categoryId);
  if (!r.ok) return { ok: false, error: customError(r.reason) };
  return { ok: true, undo: r.prevParentId && r.removedLinks === 0 && r.prevParentId !== categoryId ? { nodeId, categoryId: r.prevParentId } : null };
}

export async function deleteCustom(userId: string, nodeId: string): Promise<{ ok: true } | Fail> {
  const r = await deleteCustomNode(userId, nodeId);
  return r.ok ? r : { ok: false, error: customError(r.reason) };
}

// 바로가기 [이 카테고리에서 빼기] — 그 노드를 이 카테고리와 그 안 묶음에서 모두 뺀다(넣기 연결만 — 원래 노드는 그대로). undo = 빼기 되돌리기 값.
export async function takeOutOfCategory(userId: string, categoryId: string, node: NodeRef): Promise<{ ok: true; removed: number; undo: RemovedLink[] } | Fail> {
  const cat = await prisma.customNode.findFirst({ where: { id: categoryId, userId, kind: "CATEGORY", builtin: null }, select: { id: true } });
  if (!cat) return { ok: false, error: E.notFound };
  const groups = await prisma.customNode.findMany({ where: { parentId: categoryId, userId, kind: "GROUP" }, select: { id: true } });
  let removed = 0;
  const undo: RemovedLink[] = [];
  for (const c of [cat.id, ...groups.map((g) => g.id)]) {
    const r = await removeLink(userId, node, { type: "CUSTOM", id: c });
    if (!r.ok) continue; // 그 묶음에는 없던 것
    removed += r.removed;
    if (r.undo) undo.push(...r.undo);
  }
  return removed > 0 ? { ok: true, removed, undo } : { ok: false, error: E.notFound };
}

// 장소·모임 이름 고치기(인물록 통합 2026-11-06) — 만들기와 같은 길이 검사. 장소는 이야기 장소 행(MemoryPlace.placeName — 옛 화면·포스터가
// 읽는 이름 사본)도 같이 바꾼다(내 기록의 그 장소 행만).
export async function renameNode(userId: string, node: NodeRef, rawName: unknown): Promise<{ ok: true } | Fail> {
  if (node.type === "PLACE") {
    const name = clean(rawName, EDIT_LIMITS.placeName + 1);
    if (!name) return { ok: false, error: E.needName };
    if (name.length > EDIT_LIMITS.placeName) return { ok: false, error: E.tooLong(EDIT_LIMITS.placeName) };
    const [r] = await prisma.$transaction([
      prisma.place.updateMany({ where: { id: node.id, userId }, data: { name } }),
      prisma.memoryPlace.updateMany({ where: { placeId: node.id, place: { userId }, memory: { userId } }, data: { placeName: name } }),
    ]);
    return r.count > 0 ? { ok: true } : { ok: false, error: E.notFound };
  }
  if (node.type === "PERSON_GROUP") {
    const name = clean(rawName, EDIT_LIMITS.groupName + 1);
    if (!name) return { ok: false, error: E.needName };
    if (name.length > EDIT_LIMITS.groupName) return { ok: false, error: E.tooLong(EDIT_LIMITS.groupName) };
    const r = await prisma.personGroup.updateMany({ where: { id: node.id, userId }, data: { name } });
    return r.count > 0 ? { ok: true } : { ok: false, error: E.notFound };
  }
  if (node.type === "CUSTOM") {
    // 사용자 카테고리·묶음·항목(custom-graph 2단계) — 기본 카테고리 행은 renameBuiltin
    const r = await renameCustomNode(userId, node.id, rawName);
    return r.ok ? { ok: true } : { ok: false, error: customError(r.reason) };
  }
  return { ok: false, error: E.notFound };
}


// 모든 종류 이름 바꾸기(AI 지도 편집 — 이전 이름을 돌려줌). 장소·모임·사용자 노드는 위 renameNode, 사람은 updatePersonInfo(다른 칸은 그대로),
// 장소 묶음·시기·이야기 제목은 여기서. 시기 = 직접 만든 시기는 label, 처음 정한 시기는 correctedLabel(prev null = 고친 이름 없었음).
export async function renameAny(userId: string, node: NodeRef, rawName: unknown): Promise<{ ok: true; prev: string | null } | Fail> {
  const notFound = { ok: false as const, error: E.notFound };
  const named = (max: number): { name: string } | Fail => {
    const name = clean(rawName, max + 1);
    if (!name) return { ok: false, error: E.needName };
    return name.length > max ? { ok: false, error: E.tooLong(max) } : { name };
  };
  switch (node.type) {
    case "PERSON": {
      const p = await prisma.person.findFirst({ where: { id: node.id, userId, isDraft: false, subjectType: "person" }, select: { name: true, relation: true, birthYear: true, metYear: true, memo: true } });
      if (!p) return notFound;
      const r = await updatePersonInfo(userId, node.id, { name: rawName, relation: p.relation ?? "", birthYear: p.birthYear, metYear: p.metYear, memo: p.memo ?? "" });
      return r.ok ? { ok: true, prev: p.name } : r;
    }
    case "PLACE":
    case "PERSON_GROUP":
    case "CUSTOM": {
      const row =
        node.type === "PLACE"
          ? await prisma.place.findFirst({ where: { id: node.id, userId }, select: { name: true } })
          : node.type === "PERSON_GROUP"
            ? await prisma.personGroup.findFirst({ where: { id: node.id, userId }, select: { name: true } })
            : await prisma.customNode.findFirst({ where: { id: node.id, userId }, select: { name: true } });
      if (!row) return notFound;
      const r = await renameNode(userId, node, rawName);
      return r.ok ? { ok: true, prev: row.name } : r;
    }
    case "PLACE_GROUP": {
      const n = named(EDIT_LIMITS.groupName);
      if ("ok" in n) return n;
      const row = await prisma.placeGroup.findFirst({ where: { id: node.id, userId }, select: { name: true } });
      if (!row) return notFound;
      await prisma.placeGroup.updateMany({ where: { id: node.id, userId }, data: { name: n.name } });
      return { ok: true, prev: row.name };
    }
    case "LIFE_EVENT": {
      const n = named(EDIT_LIMITS.periodLabel);
      if ("ok" in n) return n;
      const row = await prisma.lifeEvent.findFirst({ where: { id: node.id, userId }, select: { type: true, label: true, correctedLabel: true } });
      if (!row) return notFound;
      const own = row.type === "CUSTOM";
      await prisma.lifeEvent.updateMany({ where: { id: node.id, userId }, data: own ? { label: n.name } : { correctedLabel: n.name } });
      return { ok: true, prev: own ? row.label : row.correctedLabel };
    }
    case "EPISODE": {
      const n = named(EDIT_LIMITS.storyTitle);
      if ("ok" in n) return n;
      const ep = await prisma.episode.findFirst({ where: { id: node.id, lifeEvent: { userId } }, select: { memoryId: true, memory: { select: { title: true } } } });
      if (!ep) return notFound;
      await prisma.userMemory.updateMany({ where: { id: ep.memoryId, userId }, data: { title: n.name } });
      return { ok: true, prev: ep.memory.title };
    }
    default:
      return notFound;
  }
}

// 이름 되돌리기 — 시기의 고친 이름·이야기 제목은 원래 비어 있었을 수 있어 그대로 되돌린다.
export async function undoRename(userId: string, node: NodeRef, prev: string | null): Promise<{ ok: true } | Fail> {
  if (node?.type === "LIFE_EVENT") {
    const row = await prisma.lifeEvent.findFirst({ where: { id: node.id, userId }, select: { type: true } });
    if (!row) return { ok: false, error: E.notFound };
    await prisma.lifeEvent.updateMany({ where: { id: node.id, userId }, data: row.type === "CUSTOM" ? { label: prev ?? "" } : { correctedLabel: prev } });
    return { ok: true };
  }
  if (node?.type === "EPISODE") {
    const ep = await prisma.episode.findFirst({ where: { id: node.id, lifeEvent: { userId } }, select: { memoryId: true } });
    if (!ep) return { ok: false, error: E.notFound };
    await prisma.userMemory.updateMany({ where: { id: ep.memoryId, userId }, data: { title: prev ?? "" } });
    return { ok: true };
  }
  const r = await renameAny(userId, node, prev ?? "");
  return r.ok ? { ok: true } : r;
}

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
