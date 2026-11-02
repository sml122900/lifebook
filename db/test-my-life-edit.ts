// My Life 개편 3단계 회귀 — 지도에서 직접 만들기·넣기·되돌리기·빼기·옮기기·지우기. docs/phase/my-life-restructure.md §4. LLM 0.
//
//   ① 만들기 7종 DB 상태 — 시기(CUSTOM·연도 순 자리·끝 연도·검증) · 이야기(제목 있으면 사용자 제목·직접 쓰기 녹취 빈 문자열·
//      사람 = 확정 연결 + 시기↔사람·장소 = 브릿지 MemoryPlace·hasEpisode) · 그때의 나(SELF·hasEpisode 무변·모임 연결) ·
//      사람(같은 이름 되묻기 — 답 없음 = 저장 0 / 같은 분 = 새로 안 만듦 / 다른 분 = 새로 · 만난 해 규칙) · 장소(이름만 /
//      검색 결과 · 같은 이름·주소 재사용) · 모임·장소 묶음(구성원 = 입구 → 구성원 테이블, NodeLink 0) · 남의 노드·초안 거부
//   ② 넣기 — 쌍마다 그 칸 · 이야기↔사람은 시기↔사람도 · 대상 인물은 NodeLink 안 만듦 · 다시 넣기 created 0 · 남의 노드 거부
//   ③ 되돌리기 — 넣기 전 상태 그대로(연결 4칸 스냅샷 비교) · 이미 있던 연결은 안 지움
//   ④ 빼기 — 쌍마다 그 칸 행만 · 주 소속 시기·대상 인물 거부(문구) · 노드는 그대로
//   ⑤ 옮기기 — 주 소속·추가 소속 정리·브릿지 연도·두 시기 hasEpisode·시기↔사람(옛 시기 연결 유지)·만난 해 규칙 3·확인 대기 따라감 ·
//      같은 시기 = 무변 · 남의 시기·미확정 시기 거부
//   ⑥ 지우기 — 확인창 수(deleteImpact: 이야기·사람·장소·가족 반응) · 장소(이야기 안 장소 행 삭제·옛 연혁 행 이름만 남음·
//      연결 트리거·묶음 구성원) · 모임 · 장소 묶음 · 직접 추가 시기(이야기 함께) · 처음 정한 시기 거부 · 남의 노드 거부
//   ⑧ 빼기 되돌리기(Q50 보완 2026-11-02) — 다섯 칸 모두 빼기 전 값 그대로(만든 때·정렬 순서·NodeLink 역할·상태·출처·확인 때) ·
//      두 번 눌러도 그대로 · 없는 연결은 되돌릴 것 없음 · 화면이 돌려준 값 다시 검사(남의 계정·남의 노드·이상한 값 거부) · 화면 [되돌리기]
//   ⑨ 3단계 E2E 후속 2(2026-11-02) — 옮기기 되돌리기(옮기기 전 그대로·값 다시 검사) · 장소 지우기 확인창 묶음 수 · 화면(옮긴 뒤 [되돌리기]·지운 뒤 알림)
//   ⑦ 정적 — 서버 액션 전부 첫 줄 auth · NodeLink 쓰기는 lib/node-graph 만 · proxy.ts 무접촉 · 문구 임시 표기
//
// 자체 픽스처 계정 2개만 만들고 지운다(test30·실고객 접촉 0). 실행: npx tsx db/test-my-life-edit.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge, deleteEpisode } from "../lib/episode";
import { moveEpisodeToLifeEvent, undoMoveEpisode } from "../lib/episode-move";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { deleteCustomLifeEvent } from "../lib/life-event-delete";
import { getMyLifeData } from "../lib/my-life";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import {
  addLink,
  createGroupNode,
  createPeriodNode,
  createPersonNode,
  createPlaceGroupNode,
  createPlaceNode,
  createStoryNode,
  deleteGroupNode,
  deleteImpact,
  deletePlaceGroupNode,
  deletePlaceNode,
  removeLink,
  undoLinks,
  undoRemove,
} from "../lib/my-life-edit";
import { saveNodeLink, type NodeRef } from "../lib/node-graph";

const EMAIL_A = "fixture-mylife-edit-a@lifebook.invalid";
const EMAIL_B = "fixture-mylife-edit-b@lifebook.invalid";
const ROOT = path.resolve(__dirname, "..");
const E = MY_LIFE_COPY.edit;

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function makeUser(email: string, name: string): Promise<string> {
  const now = new Date();
  const u = await prisma.user.create({
    data: { email, name, birthYear: 1955, onboardingTrack: "V3", termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: u.id, birthYear: 1955, region: "전주", skeletonGeneratedAt: now } });
  return u.id;
}

async function makeEvent(userId: string, type: LifeEventType, label: string, year: number | null, sequenceOrder: number, status: "CONFIRMED" | "UNCONFIRMED" = "CONFIRMED") {
  return (await prisma.lifeEvent.create({ data: { userId, type, label, year, status, confirmedAt: status === "CONFIRMED" ? new Date() : null, sequenceOrder, personAsked: true }, select: { id: true } })).id;
}

// 연결 4칸 — 되돌리기가 넣기 전 상태와 같은지 비교.
async function linkSnapshot(userId: string) {
  const [nl, ple, mp, pgm, plm] = await Promise.all([
    prisma.nodeLink.findMany({ where: { userId }, select: { fromType: true, fromId: true, toType: true, toId: true, status: true }, orderBy: [{ fromId: "asc" }, { toId: "asc" }] }),
    prisma.personLifeEvent.findMany({ where: { userId }, select: { personId: true, lifeEventId: true }, orderBy: [{ personId: "asc" }, { lifeEventId: "asc" }] }),
    prisma.memoryPlace.findMany({ where: { memory: { userId } }, select: { memoryId: true, placeId: true }, orderBy: [{ memoryId: "asc" }, { placeId: "asc" }] }),
    prisma.personGroupMember.findMany({ where: { userId }, select: { groupId: true, personId: true }, orderBy: [{ groupId: "asc" }, { personId: "asc" }] }),
    prisma.placeGroupMember.findMany({ where: { userId }, select: { groupId: true, placeId: true }, orderBy: [{ groupId: "asc" }, { placeId: "asc" }] }),
  ]);
  return JSON.stringify({ nl, ple, mp, pgm, plm });
}

async function main() {
  await removeFixtures();
  try {
    const a = await makeUser(EMAIL_A, "[fixture] My Life 편집 A");
    const b = await makeUser(EMAIL_B, "[fixture] My Life 편집 B");
    const birth = await makeEvent(a, "BIRTH", "출생", 1955, 0);
    const elem = await makeEvent(a, "ELEM_SCHOOL", "국민학교 입학", 1962, 1);
    const high = await makeEvent(a, "HIGH_SCHOOL", "고등학교 입학", 1971, 2);
    const job = await makeEvent(a, "FIRST_JOB", "첫 직장", 1978, 3);
    const pendingEv = await makeEvent(a, "MILITARY", "군 입대", 1975, 4, "UNCONFIRMED");
    const evB = await makeEvent(b, "BIRTH", "출생", 1960, 0);
    const placeB = (await prisma.place.create({ data: { userId: b, name: "[fixture] B 장소" }, select: { id: true } })).id;
    const draft = (await prisma.person.create({ data: { userId: a, name: "[fixture] 초안 분", isDraft: true }, select: { id: true } })).id;

    // ── ① 만들기 ─────────────────────────────────────────────────
    const p1 = await createPeriodNode(a, { label: "서울로 이사", year: 1966, endYear: 1970 });
    const p1Row = p1.ok ? await prisma.lifeEvent.findUnique({ where: { id: p1.eventId }, select: { type: true, status: true, label: true, year: true, endYear: true, sequenceOrder: true } }) : null;
    const order = await prisma.lifeEvent.findMany({ where: { userId: a }, orderBy: { sequenceOrder: "asc" }, select: { id: true } });
    check("① 시기 — CUSTOM·확정·이름·연도·끝 연도, 연도 순 자리(국민학교 1962 뒤·고등학교 1971 앞)",
      p1.ok && p1Row?.type === "CUSTOM" && p1Row.status === "CONFIRMED" && p1Row.label === "서울로 이사" && p1Row.year === 1966 && p1Row.endYear === 1970 &&
        order.findIndex((e) => e.id === p1.eventId) === order.findIndex((e) => e.id === elem) + 1 && order.findIndex((e) => e.id === high) === order.findIndex((e) => e.id === p1.eventId) + 1,
      { p1, p1Row });
    const p2 = await createPeriodNode(a, { label: "연도 모르는 시기", year: null, endYear: null });
    const bad = await Promise.all([
      createPeriodNode(a, { label: "", year: 1970, endYear: null }),
      createPeriodNode(a, { label: "가".repeat(31), year: null, endYear: null }),
      createPeriodNode(a, { label: "끝이 앞", year: 1980, endYear: 1979 }),
      createPeriodNode(a, { label: "끝만", year: null, endYear: 1980 }),
      createPeriodNode(a, { label: "미래", year: new Date().getFullYear() + 1, endYear: null }),
    ]);
    check("① 시기 — 연도 없으면 맨 뒤 · 이름 빔/31자·끝 연도 앞섬·끝만·미래 연도 거부(문구)",
      p2.ok && order.length > 0 && (await prisma.lifeEvent.findFirst({ where: { userId: a }, orderBy: { sequenceOrder: "desc" }, select: { id: true } }))?.id === p2.eventId &&
        bad.map((r) => (r.ok ? "ok" : r.error)).join("|") === [E.needName, E.tooLong(30), E.badEndYear, E.badEndYear, E.badYear].join("|"),
      bad);

    const mom = await createPersonNode(a, { name: "[fixture] 어머니", relation: "어머니" });
    const mate = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "고교 친구" });
    const momId = mom.ok ? mom.personId : "";
    const mateId = mate.ok ? mate.personId : "";
    const place1 = await createPlaceNode(a, { name: "[fixture] 시장 골목" });
    const place1Id = place1.ok ? place1.placeId : "";
    const st = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 학교 앞 분식집에서 떡볶이를 먹었다. 친구와 매일 갔다.", personIds: [mateId], placeIds: [place1Id] });
    const stEp = st.ok ? await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { kind: true, rawTranscript: true, personId: true, memory: { select: { title: true, year: true } } } }) : null;
    const stHas = (await prisma.lifeEvent.findUnique({ where: { id: high }, select: { hasEpisode: true } }))?.hasEpisode;
    check("① 이야기 — STORY·제목 없음(빈 문자열)·직접 쓰기 녹취 빈 문자열·브릿지 연도 = 시기 연도·hasEpisode",
      st.ok && stEp?.kind === "STORY" && stEp.memory.title === "" && stEp.rawTranscript === "" && stEp.memory.year === 1971 && stEp.personId === null && stHas === true, stEp);
    const stLinks = st.ok
      ? await Promise.all([
          prisma.nodeLink.count({ where: { userId: a, fromType: "EPISODE", fromId: st.episodeId, toType: "PERSON", toId: mateId, status: "CONFIRMED" } }),
          prisma.personLifeEvent.count({ where: { personId: mateId, lifeEventId: high } }),
          prisma.memoryPlace.count({ where: { placeId: place1Id, memory: { episode: { id: st.episodeId } } } }),
        ])
      : [];
    check("① 이야기 — 사람 = 확정 연결(EPISODE→PERSON) + 시기↔사람(PersonLifeEvent) · 장소 = 브릿지 MemoryPlace", JSON.stringify(stLinks) === "[1,1,1]", stLinks);
    const titled = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "고등학교 입학", content: "[fixture] 입학식 날 비가 왔다." });
    const titledRow = titled.ok ? await prisma.episode.findUnique({ where: { id: titled.episodeId }, select: { memory: { select: { title: true } } } }) : null;
    check("① 이야기 — 직접 적은 제목은 사용자 제목(시기 이름이어도 그대로 — userSetTitle)", titledRow?.memory.title === "고등학교 입학", titledRow);
    const stBad = await Promise.all([
      createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "  " }),
      createStoryNode(a, { lifeEventId: pendingEv, kind: "STORY", title: "", content: "[fixture] 미확정 시기" }),
      createStoryNode(a, { lifeEventId: evB, kind: "STORY", title: "", content: "[fixture] 남의 시기" }),
      createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 초안 분과", personIds: [draft] }),
      createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 남의 장소", placeIds: [placeB] }),
    ]);
    check("① 이야기 — 본문 빔·미확정 시기·남의 시기·초안 인물·남의 장소 거부",
      stBad.map((r) => (r.ok ? "ok" : r.error)).join("|") === [E.needBody, E.pickPeriod, E.pickPeriod, E.notFound, E.notFound].join("|"), stBad);

    const club = await createGroupNode(a, { name: "[fixture] 합창부", memberIds: [mateId] });
    const clubId = club.ok ? club.groupId : "";
    const self = await createStoryNode(a, { lifeEventId: job, kind: "SELF", title: "", content: "[fixture] 합창부에서는 늘 맨 뒷줄에서 조용히 따라 불렀다.", personIds: [], groupIds: [clubId] });
    const selfRow = self.ok ? await prisma.episode.findUnique({ where: { id: self.episodeId }, select: { kind: true } }) : null;
    check("① 그때의 나 — SELF·시기 hasEpisode 무변(false)·모임 연결(EPISODE→PERSON_GROUP)",
      selfRow?.kind === "SELF" && (await prisma.lifeEvent.findUnique({ where: { id: job }, select: { hasEpisode: true } }))?.hasEpisode === false &&
        (await prisma.nodeLink.count({ where: { userId: a, fromType: "EPISODE", fromId: self.ok ? self.episodeId : "", toType: "PERSON_GROUP", toId: clubId } })) === 1);
    check("① 모임 — 구성원은 PersonGroupMember(입구), NodeLink 0",
      club.ok && (await prisma.personGroupMember.count({ where: { groupId: clubId, personId: mateId, userId: a } })) === 1 &&
        (await prisma.nodeLink.count({ where: { OR: [{ fromId: clubId, toType: "PERSON" }, { toId: clubId, fromType: "PERSON" }] } })) === 0);

    const peopleBefore = await prisma.person.count({ where: { userId: a } });
    const ask = await createPersonNode(a, { name: "[fixture]  짝꿍", relation: "동네 친구" });
    check("① 사람 — 같은 이름 확정 인물 있음 → 되묻기(후보 = 짝꿍) · 저장 0",
      !ask.ok && "ask" in ask && ask.ask.length === 1 && ask.ask[0].id === mateId && (await prisma.person.count({ where: { userId: a } })) === peopleBefore, ask);
    const same = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "동네 친구", decision: "same", samePersonId: mateId, groupIds: [clubId] });
    const wrongSame = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "", decision: "same", samePersonId: momId });
    const diff = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "동네 친구", decision: "different" });
    check("① 사람 — 같은 분 = 그분(새로 안 만듦) · 후보 밖 = 거부 · 다른 분 = 새로 1",
      same.ok && same.reused && same.personId === mateId && !wrongSame.ok && "error" in wrongSame && wrongSame.error === E.repickSame &&
        diff.ok && !diff.reused && diff.personId !== mateId && (await prisma.person.count({ where: { userId: a } })) === peopleBefore + 1,
      { same, wrongSame, diff });
    const metFriend = await createPersonNode(a, { name: "[fixture] 출생 때 이웃", relation: "이웃", contextEventId: birth });
    const metAunt = await createPersonNode(a, { name: "[fixture] 이모", relation: "이모", contextEventId: birth });
    const metHigh = await createPersonNode(a, { name: "[fixture] 담임", relation: "담임 선생님", contextEventId: high });
    const metOf = async (r: typeof metFriend) => (r.ok ? (await prisma.person.findUnique({ where: { id: r.personId }, select: { metYear: true } }))?.metYear : "x");
    check("① 사람 — 만난 해 = 그 시기 연도(출생 시기 + 비가족이면 비움 — Q33)",
      (await metOf(metFriend)) === null && (await metOf(metAunt)) === 1955 && (await metOf(metHigh)) === 1971, [await metOf(metFriend), await metOf(metAunt), await metOf(metHigh)]);

    const placesBefore = await prisma.place.count({ where: { userId: a } });
    const reuse = await createPlaceNode(a, { name: "[fixture]  시장골목" });
    const searched = await createPlaceNode(a, { name: "[fixture] 시장 골목", address: "전주시 어딘가 1", lat: 35.8, lng: 127.1, source: "naver" });
    const searchedRow = searched.ok ? await prisma.place.findUnique({ where: { id: searched.placeId }, select: { address: true, lat: true, lng: true, source: true } }) : null;
    const reuse2 = await createPlaceNode(a, { name: "[fixture] 시장 골목", address: "전주시 어딘가 1", lat: 35.8, lng: 127.1, source: "naver" });
    check("① 장소 — 같은 이름(공백 무시)·같은 주소 = 재사용(장소 수 무변) · 주소 다르면 새로(검색 결과 주소·좌표·출처) · 같은 검색 결과 다시 = 재사용",
      reuse.ok && reuse.reused && reuse.placeId === place1Id && searched.ok && !searched.reused && searchedRow?.address === "전주시 어딘가 1" && searchedRow.source === "naver" &&
        reuse2.ok && reuse2.reused && reuse2.placeId === (searched.ok ? searched.placeId : "") && (await prisma.place.count({ where: { userId: a } })) === placesBefore + 1,
      { reuse, searched, searchedRow, reuse2 });
    const pg = await createPlaceGroupNode(a, { name: "[fixture] 전주 시절", placeIds: [place1Id] });
    const pgId = pg.ok ? pg.groupId : "";
    const pgBad = await createPlaceGroupNode(a, { name: "[fixture] 남의 장소 묶음", placeIds: [placeB] });
    check("① 장소 묶음 — 구성원은 PlaceGroupMember(입구), NodeLink 0 · 남의 장소 거부",
      pg.ok && (await prisma.placeGroupMember.count({ where: { groupId: pgId, placeId: place1Id, userId: a } })) === 1 && (await prisma.nodeLink.count({ where: { OR: [{ fromId: pgId }, { toId: pgId }] } })) === 0 &&
        !pgBad.ok && (await prisma.placeGroup.count({ where: { userId: a } })) === 1,
      { pg, pgBad });
    const groupBad = await createGroupNode(a, { name: "[fixture] 초안 모임", memberIds: [draft] });
    check("① 모임 — 초안 인물은 구성원 거부", !groupBad.ok, groupBad);

    // ── ② 넣기 · ③ 되돌리기 ────────────────────────────────────────
    const stRef = { type: "EPISODE" as const, id: st.ok ? st.episodeId : "" };
    const before2 = await linkSnapshot(a);
    const addMom = await addLink(a, stRef, { type: "PERSON", id: momId });
    check("② 넣기 — 이야기↔사람 = 확정 연결 + 주 소속 시기↔사람(새로 생긴 2개 = created)",
      addMom.ok && addMom.created.length === 2 &&
        (await prisma.nodeLink.count({ where: { fromType: "EPISODE", fromId: stRef.id, toType: "PERSON", toId: momId, status: "CONFIRMED" } })) === 1 &&
        (await prisma.personLifeEvent.count({ where: { personId: momId, lifeEventId: high } })) === 1,
      addMom);
    const again = await addLink(a, { type: "PERSON", id: momId }, stRef);
    check("② 넣기 — 같은 것 다시(역방향) = created 0(멱등)", again.ok && again.created.length === 0, again);
    const undo1 = addMom.ok ? await undoLinks(a, addMom.created) : null;
    check("③ 되돌리기 — 넣기 전 상태 그대로(연결 5칸 스냅샷 같음)", !!undo1?.ok && (await linkSnapshot(a)) === before2);

    const before3 = await linkSnapshot(a);
    const addMate = await addLink(a, stRef, { type: "PERSON", id: mateId }); // 이미 이어진 분
    const undo2 = addMate.ok ? await undoLinks(a, addMate.created) : null;
    check("③ 되돌리기 — 이미 있던 연결은 created 0 → 되돌려도 안 지움", addMate.ok && addMate.created.length === 0 && !!undo2?.ok && (await linkSnapshot(a)) === before3, addMate);

    const subjSt = await createEpisodeBridge(a, high, "", 1971, "[fixture] 짝꿍과의 이야기", "", mateId);
    const addSubj = subjSt ? await addLink(a, { type: "EPISODE", id: subjSt.episodeId }, { type: "PERSON", id: mateId }) : null;
    check("② 넣기 — 대상 인물은 NodeLink 를 또 만들지 않음(시기↔사람만)",
      !!addSubj?.ok && (await prisma.nodeLink.count({ where: { fromType: "EPISODE", fromId: subjSt?.episodeId ?? "", toType: "PERSON", toId: mateId } })) === 0, addSubj);
    const addPlaceEv = await addLink(a, { type: "LIFE_EVENT", id: job }, { type: "PLACE", id: place1Id });
    const addGroupMember = await addLink(a, { type: "PERSON_GROUP", id: clubId }, { type: "PERSON", id: momId });
    const addPgMember = await addLink(a, { type: "PLACE", id: searched.ok ? searched.placeId : "" }, { type: "PLACE_GROUP", id: pgId });
    const addCenterPerson = await addLink(a, { type: "LIFE_EVENT", id: job }, { type: "PERSON", id: momId });
    check("② 넣기 — 시기↔장소 NodeLink · 모임↔사람 PersonGroupMember · 묶음↔장소 PlaceGroupMember · 시기↔사람 PersonLifeEvent",
      addPlaceEv.ok && addPlaceEv.created.length === 1 && addGroupMember.ok && addGroupMember.created.length === 1 && addPgMember.ok && addPgMember.created.length === 1 &&
        addCenterPerson.ok && addCenterPerson.created.length === 1 &&
        (await prisma.nodeLink.count({ where: { fromType: "LIFE_EVENT", fromId: job, toType: "PLACE", toId: place1Id } })) === 1 &&
        (await prisma.personGroupMember.count({ where: { groupId: clubId, personId: momId } })) === 1 &&
        (await prisma.placeGroupMember.count({ where: { groupId: pgId } })) === 2 && (await prisma.personLifeEvent.count({ where: { personId: momId, lifeEventId: job } })) === 1);
    const addBad = await Promise.all([
      addLink(a, stRef, { type: "PLACE", id: placeB }),
      addLink(b, { type: "LIFE_EVENT", id: evB }, { type: "PERSON", id: momId }),
      addLink(a, stRef, { type: "PERSON", id: draft }),
      addLink(a, { type: "LIFE_EVENT", id: high }, stRef),
      addLink(a, { type: "PERSON", id: momId }, { type: "PERSON", id: mateId }),
    ]);
    check("② 넣기 — 남의 노드·남의 사람·초안·주 소속 시기·이을 수 없는 쌍 거부(문구)",
      addBad.map((r) => (r.ok ? "ok" : r.error)).join("|") === [E.notFound, E.notFound, E.notFound, E.alreadyPrimary, E.cannotLink].join("|"), addBad);

    // ── ④ 빼기 ───────────────────────────────────────────────────
    const rmPlace = await removeLink(a, stRef, { type: "PLACE", id: place1Id });
    const rmMate = await removeLink(a, { type: "PERSON", id: mateId }, stRef);
    const rmMember = await removeLink(a, { type: "PERSON", id: momId }, { type: "PERSON_GROUP", id: clubId });
    const rmPg = await removeLink(a, { type: "PLACE_GROUP", id: pgId }, { type: "PLACE", id: place1Id });
    check("④ 빼기 — 이야기 장소 행·이야기↔사람 연결·모임 구성원·묶음 구성원만 지움, 노드는 그대로",
      rmPlace.ok && rmPlace.removed === 1 && rmMate.ok && rmMate.removed === 1 && rmMember.ok && rmMember.removed === 1 && rmPg.ok && rmPg.removed === 1 &&
        (await prisma.memoryPlace.count({ where: { placeId: place1Id, memory: { episode: { id: stRef.id } } } })) === 0 &&
        (await prisma.person.count({ where: { id: { in: [mateId, momId] } } })) === 2 && (await prisma.place.count({ where: { id: place1Id } })) === 1 &&
        (await prisma.personLifeEvent.count({ where: { personId: mateId, lifeEventId: high } })) === 1,
      { rmPlace, rmMate, rmMember, rmPg });
    const rmBad = await Promise.all([
      removeLink(a, { type: "LIFE_EVENT", id: high }, stRef),
      removeLink(a, { type: "EPISODE", id: subjSt?.episodeId ?? "" }, { type: "PERSON", id: mateId }),
      removeLink(b, { type: "LIFE_EVENT", id: job }, { type: "PLACE", id: place1Id }),
    ]);
    check("④ 빼기 — 주 소속 시기·대상 인물·남의 노드 거부(문구)",
      rmBad.map((r) => (r.ok ? "ok" : r.error)).join("|") === [E.cannotRemovePrimary, E.cannotRemoveSubject, E.notFound].join("|"), rmBad);

    // ── ⑤ 옮기기 ─────────────────────────────────────────────────
    // 고등학교(1971) 이야기 → 첫 직장(1978). 사람: 대상 인물 없음, 확정 연결 = 새 분(이 이야기로만, 만난 해 1971)·짝꿍(다른 이야기에도 있음, 만난 해 1971).
    const mv = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 졸업 앨범을 찍던 날이었다." });
    const mvId = mv.ok ? mv.episodeId : "";
    const only = await createPersonNode(a, { name: "[fixture] 사진사 아저씨", relation: "동네 어른", contextEventId: high });
    const onlyId = only.ok ? only.personId : "";
    await addLink(a, { type: "EPISODE", id: mvId }, { type: "PERSON", id: onlyId });
    await prisma.person.update({ where: { id: mateId }, data: { metYear: 1971 } });
    await saveNodeLink(a, { type: "EPISODE", id: mvId }, { type: "PERSON", id: mateId });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: job }, { type: "EPISODE", id: mvId }); // 대상 시기와의 추가 소속 — 옮기면 지워져야
    await saveNodeLink(a, { type: "LIFE_EVENT", id: birth }, { type: "EPISODE", id: mvId }); // 다른 시기 추가 소속 — 그대로
    await saveNodeLink(a, { type: "EPISODE", id: mvId }, { type: "PERSON", id: draft }, { status: "PROPOSED", source: "AI" });
    const highHasBefore = (await prisma.lifeEvent.findUnique({ where: { id: high }, select: { hasEpisode: true } }))?.hasEpisode;
    const moved = await moveEpisodeToLifeEvent(a, mvId, job);
    const mvRow = await prisma.episode.findUnique({ where: { id: mvId }, select: { lifeEventId: true, memory: { select: { year: true } } } });
    check("⑤ 옮기기 — 주 소속 = 첫 직장 · 대상 시기 추가 소속 지움(한 쌍 = 한 곳) · 다른 시기 추가 소속은 그대로 · 브릿지 연도 1978",
      moved.ok && moved.moved && mvRow?.lifeEventId === job && mvRow.memory.year === 1978 &&
        (await prisma.nodeLink.count({ where: { fromType: "LIFE_EVENT", fromId: job, toType: "EPISODE", toId: mvId } })) === 0 &&
        (await prisma.nodeLink.count({ where: { fromType: "LIFE_EVENT", fromId: birth, toType: "EPISODE", toId: mvId } })) === 1,
      { moved, mvRow });
    check("⑤ 옮기기 — 두 시기 hasEpisode 다시 계산(고등학교 남은 이야기 있음 = true · 첫 직장 = true)",
      highHasBefore === true && (await prisma.lifeEvent.findUnique({ where: { id: high }, select: { hasEpisode: true } }))?.hasEpisode === true &&
        (await prisma.lifeEvent.findUnique({ where: { id: job }, select: { hasEpisode: true } }))?.hasEpisode === true);
    const ple = async (pid: string, ev: string) => prisma.personLifeEvent.count({ where: { personId: pid, lifeEventId: ev } });
    check("⑤ 옮기기 — 확정 인물은 새 시기에 시기↔사람 · 옛 시기 연결은 지우지 않음(Q48) · 확인 대기 분은 안 넣음",
      (await ple(onlyId, job)) === 1 && (await ple(mateId, job)) === 1 && (await ple(onlyId, high)) === 1 && (await ple(draft, job)) === 0);
    const met = async (pid: string) => (await prisma.person.findUnique({ where: { id: pid }, select: { metYear: true } }))?.metYear;
    check("⑤ 옮기기 — 만난 해 규칙 3: 이 이야기로만 이어진 분(1971 → 1978) · 다른 이야기에도 있는 분(짝꿍 1971 그대로)",
      (await met(onlyId)) === 1978 && (await met(mateId)) === 1971, { only: await met(onlyId), mate: await met(mateId) });
    check("⑤ 옮기기 — 확인 대기(PROPOSED) 연결은 이야기를 따라감", (await prisma.nodeLink.count({ where: { fromType: "EPISODE", fromId: mvId, toId: draft, status: "PROPOSED" } })) === 1);
    const noop = await moveEpisodeToLifeEvent(a, mvId, job);
    const mvBad = await Promise.all([moveEpisodeToLifeEvent(a, mvId, evB), moveEpisodeToLifeEvent(a, mvId, pendingEv), moveEpisodeToLifeEvent(b, mvId, evB)]);
    check("⑤ 옮기기 — 같은 시기 = 무변(moved false) · 남의 시기·미확정 시기·남의 이야기 거부",
      noop.ok && !noop.moved && mvBad.map((r) => (r.ok ? "ok" : r.reason)).join() === "target_not_found,target_not_found,not_found" &&
        (await prisma.episode.findUnique({ where: { id: mvId }, select: { lifeEventId: true } }))?.lifeEventId === job,
      { noop, mvBad });
    const md = await getMyLifeData(a);
    check("⑤ 옮기기 — 지도 데이터: 이야기는 첫 직장 아래, 고등학교 아래에 없음",
      md.events.find((e) => e.id === job)?.stories.some((s) => s.id === mvId && s.primaryEventId === job) === true &&
        md.events.find((e) => e.id === high)?.stories.some((s) => s.id === mvId) === false);

    // ── ⑥ 지우기 ─────────────────────────────────────────────────
    // 직접 추가 시기(이사) 안 이야기 1편 + 가족 반응 2 → 확인창 수.
    const inPeriod = await createStoryNode(a, { lifeEventId: p1.ok ? p1.eventId : "", kind: "STORY", title: "", content: "[fixture] 이사 간 집 마당에 감나무가 있었다.", personIds: [momId] });
    const inMem = inPeriod.ok ? (await prisma.episode.findUniqueOrThrow({ where: { id: inPeriod.episodeId }, select: { memoryId: true } })).memoryId : "";
    const room = await prisma.sharedRoom.create({ data: { name: "[fixture] 가족 방", ownerId: a }, select: { id: true } });
    await prisma.memoryReaction.create({ data: { roomId: room.id, targetType: "user_memory", targetId: inMem, authorId: b, stamp: "touched" } });
    await prisma.comment.create({ data: { roomId: room.id, targetType: "user_memory", targetId: inMem, authorId: b, content: "[fixture]" } });
    const fam = await prisma.memoryReaction.count({ where: { targetId: inMem } }) + (await prisma.comment.count({ where: { targetId: inMem } }));
    const imPeriod = await deleteImpact(a, { type: "LIFE_EVENT", id: p1.ok ? p1.eventId : "" });
    const imStory = await deleteImpact(a, { type: "EPISODE", id: inPeriod.ok ? inPeriod.episodeId : "" });
    const imSkeleton = await deleteImpact(a, { type: "LIFE_EVENT", id: high });
    check("⑥ 확인창 수 — 직접 추가 시기: 함께 지워질 이야기 1·사람 1(시기↔사람)·가족 반응 = 실제 수 / 이야기: 사람 1·가족 반응 / 처음 정한 시기 = 지울 수 없음(null)",
      fam === 2 && imPeriod?.storiesDeleted === true && imPeriod.stories === 1 && imPeriod.people === 1 && imPeriod.familyActivity === 2 &&
        imStory?.people === 1 && imStory.familyActivity === 2 && imSkeleton === null,
      { imPeriod, imStory, fam });
    const placeDel = (await prisma.place.create({ data: { userId: a, name: "[fixture] 지울 장소" }, select: { id: true } })).id;
    await addLink(a, stRef, { type: "PLACE", id: placeDel });
    await addLink(a, { type: "LIFE_EVENT", id: job }, { type: "PLACE", id: placeDel });
    await addLink(a, { type: "PLACE_GROUP", id: pgId }, { type: "PLACE", id: placeDel });
    const v2Mem = await prisma.userMemory.create({ data: { userId: a, year: 1971, title: "[fixture] 옛 연혁", createdVia: "life_event", places: { create: { placeName: "[fixture] 지울 장소", placeId: placeDel, sortOrder: 0 } } }, select: { id: true } });
    const imPlace = await deleteImpact(a, { type: "PLACE", id: placeDel });
    check("⑥ 확인창 수 — 장소: 이어진 이야기 1(옛 연혁 행은 이야기 아님)", imPlace?.stories === 1 && imPlace.people === 0, imPlace);
    const delPlace = await deletePlaceNode(a, placeDel);
    const v2After = await prisma.memoryPlace.findFirst({ where: { memoryId: v2Mem.id }, select: { placeId: true, placeName: true } });
    check("⑥ 장소 지우기 — 이야기 안 그 장소 행 삭제 · 옛 연혁 행은 이름만(placeId null) · 시기 연결(트리거)·묶음 구성원(FK) 정리",
      delPlace.ok && (await prisma.memoryPlace.count({ where: { memory: { episode: { id: stRef.id } }, placeName: "[fixture] 지울 장소" } })) === 0 &&
        v2After?.placeId === null && v2After.placeName === "[fixture] 지울 장소" &&
        (await prisma.nodeLink.count({ where: { toType: "PLACE", toId: placeDel } })) === 0 && (await prisma.placeGroupMember.count({ where: { placeId: placeDel } })) === 0,
      { delPlace, v2After });
    const imGroup = await deleteImpact(a, { type: "PERSON_GROUP", id: clubId });
    const imPg = await deleteImpact(a, { type: "PLACE_GROUP", id: pgId });
    check("⑥ 확인창 수 — 모임: 사람 1(짝꿍)·이야기 1(그때의 나) / 장소 묶음: 장소 1", imGroup?.people === 1 && imGroup.stories === 1 && imPg?.places === 1, { imGroup, imPg });
    const delGroup = await deleteGroupNode(a, clubId);
    const delPg = await deletePlaceGroupNode(a, pgId);
    check("⑥ 모임·장소 묶음 지우기 — 구성원·연결 정리, 사람·장소는 그대로",
      delGroup.ok && delPg.ok && (await prisma.personGroupMember.count({ where: { groupId: clubId } })) === 0 &&
        (await prisma.nodeLink.count({ where: { toType: "PERSON_GROUP", toId: clubId } })) === 0 && (await prisma.placeGroupMember.count({ where: { groupId: pgId } })) === 0 &&
        (await prisma.person.count({ where: { id: mateId } })) === 1 && (await prisma.place.count({ where: { id: place1Id } })) === 1);
    const delPeriod = await deleteCustomLifeEvent(a, p1.ok ? p1.eventId : "");
    const delSkeleton = await deleteCustomLifeEvent(a, high);
    const delOther = await Promise.all([deletePlaceNode(b, place1Id), deleteGroupNode(b, "no-such"), deletePlaceGroupNode(b, "no-such"), deleteEpisode(b, stRef.id)]);
    check("⑥ 직접 추가 시기 지우기 — 안의 이야기도 함께(가족 반응도 정리) · 처음 정한 시기 거부 · 남의 노드 거부",
      delPeriod.ok && (await prisma.episode.count({ where: { id: inPeriod.ok ? inPeriod.episodeId : "" } })) === 0 && (await prisma.memoryReaction.count({ where: { targetId: inMem } })) === 0 && (await prisma.comment.count({ where: { targetId: inMem } })) === 0 &&
        !delSkeleton.ok && delOther.every((r) => !r.ok) && (await prisma.place.count({ where: { id: place1Id } })) === 1 && (await prisma.episode.count({ where: { id: stRef.id } })) === 1,
      { delPeriod, delSkeleton, delOther });

    // ── ⑧ 빼기 되돌리기(Q50 보완 2026-11-02 — 3단계 E2E) ─────────────────
    // 쌍마다 그 칸 — 빼기 전 행과 같은 값(만든 때·정렬 순서·NodeLink 역할·상태·출처·확인 때)으로 다시 잇는다.
    const uP = await createPersonNode(a, { name: "[fixture] 되돌리기 분", relation: "친구" });
    const uPid = uP.ok ? uP.personId : "";
    const uPl1 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 되돌리기 첫 장소" }, select: { id: true } })).id;
    const uPl2 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 되돌리기 둘째 장소" }, select: { id: true } })).id;
    const uSt = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 되돌리기 확인용 이야기.", personIds: [uPid], placeIds: [uPl1, uPl2] });
    const uStRef: NodeRef = { type: "EPISODE", id: uSt.ok ? uSt.episodeId : "" };
    const uG = await createGroupNode(a, { name: "[fixture] 되돌리기 모임", memberIds: [uPid] });
    const uPg = await createPlaceGroupNode(a, { name: "[fixture] 되돌리기 묶음", placeIds: [uPl1] });
    const uGid = uG.ok ? uG.groupId : "";
    const uPgid = uPg.ok ? uPg.groupId : "";
    // 만든 때를 일부러 옛날로 — 되돌리기가 지금 시각으로 새로 만들지 않는지(순서가 바뀌지 않는지) 보려고.
    const OLD = new Date("2020-01-02T03:04:05.000Z");
    await prisma.nodeLink.updateMany({ where: { fromType: "EPISODE", fromId: uStRef.id, toType: "PERSON", toId: uPid }, data: { createdAt: OLD, confirmedAt: OLD, source: "AI" } });
    await prisma.personLifeEvent.updateMany({ where: { personId: uPid, lifeEventId: job }, data: { createdAt: OLD } });
    await prisma.memoryPlace.updateMany({ where: { placeId: uPl1, memory: { episode: { id: uStRef.id } } }, data: { createdAt: OLD } });
    await prisma.personGroupMember.updateMany({ where: { groupId: uGid, personId: uPid }, data: { createdAt: OLD } });
    await prisma.placeGroupMember.updateMany({ where: { groupId: uPgid, placeId: uPl1 }, data: { createdAt: OLD } });
    const rowsOf = async () =>
      JSON.stringify({
        nl: await prisma.nodeLink.findMany({ where: { fromType: "EPISODE", fromId: uStRef.id, toType: "PERSON", toId: uPid }, select: { role: true, status: true, source: true, createdAt: true, confirmedAt: true } }),
        ple: await prisma.personLifeEvent.findMany({ where: { personId: uPid, lifeEventId: job }, select: { createdAt: true } }),
        mp: await prisma.memoryPlace.findMany({ where: { memory: { episode: { id: uStRef.id } } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { placeId: true, sortOrder: true, createdAt: true, placeName: true } }),
        pgm: await prisma.personGroupMember.findMany({ where: { groupId: uGid, personId: uPid }, select: { createdAt: true } }),
        plm: await prisma.placeGroupMember.findMany({ where: { groupId: uPgid, placeId: uPl1 }, select: { createdAt: true } }),
      });
    const s0 = await rowsOf();
    const pairs: [string, NodeRef, NodeRef][] = [
      ["이야기↔사람(NodeLink — 출처 AI·옛 확인 때)", uStRef, { type: "PERSON", id: uPid }],
      ["시기↔사람(PersonLifeEvent)", { type: "LIFE_EVENT", id: job }, { type: "PERSON", id: uPid }],
      ["이야기↔첫 장소(MemoryPlace — 첫째 자리)", uStRef, { type: "PLACE", id: uPl1 }],
      ["모임↔사람(PersonGroupMember)", { type: "PERSON", id: uPid }, { type: "PERSON_GROUP", id: uGid }],
      ["묶음↔장소(PlaceGroupMember)", { type: "PLACE_GROUP", id: uPgid }, { type: "PLACE", id: uPl1 }],
    ];
    for (const [label, x, y] of pairs) {
      const was = await rowsOf();
      const rm = await removeLink(a, x, y);
      const gone = (await rowsOf()) !== was;
      const un = rm.ok && rm.undo ? await undoRemove(a, rm.undo) : null;
      check(`⑧ 빼기 되돌리기 — ${label}: 빼면 행 빠짐 → 되돌리면 빼기 전과 같은 값`,
        rm.ok && rm.removed === 1 && !!rm.undo && gone && !!un?.ok && un.restored === 1 && (await rowsOf()) === was, { rm, un });
    }
    check("⑧ 다섯 칸 다 되돌린 뒤 = 처음과 같음(첫 장소가 첫째 자리 그대로 — 정렬 순서·만든 때)", (await rowsOf()) === s0 && uSt.ok && uG.ok && uPg.ok, JSON.parse(s0));
    const rmAgain = await removeLink(a, uStRef, { type: "PERSON", id: uPid });
    const un1 = rmAgain.ok && rmAgain.undo ? await undoRemove(a, rmAgain.undo) : null;
    const un2 = rmAgain.ok && rmAgain.undo ? await undoRemove(a, rmAgain.undo) : null;
    const rmNone = await removeLink(a, { type: "LIFE_EVENT", id: elem }, { type: "PLACE", id: uPl2 });
    check("⑧ 같은 되돌리기 두 번 = 두 번째는 0행(그대로) · 없는 연결 빼기 = 되돌릴 것 없음(undo 없음)",
      !!un1?.ok && un1.restored === 1 && !!un2?.ok && un2.restored === 0 && (await rowsOf()) === s0 && rmNone.ok && rmNone.removed === 0 && rmNone.undo === null, { un1, un2, rmNone });
    // 화면이 돌려준 값은 다시 검사 — 남의 계정·남의 노드로 바꿔치기·이상한 값은 거부, 저장 0.
    const rmT = await removeLink(a, uStRef, { type: "PLACE", id: uPl2 });
    const tok = rmT.ok ? rmT.undo : null;
    const forged = tok
      ? [
          await undoRemove(b, tok),
          await undoRemove(a, { ...tok, b: { type: "PLACE", id: placeB } }),
          await undoRemove(a, { ...tok, rows: [{ createdAt: "어제" }] }),
          await undoRemove(a, { ...tok, rows: [{ ...tok.rows[0], sortOrder: -5 }] }),
          await undoRemove(a, { ...tok, rows: [] }),
        ]
      : [];
    check("⑧ 되돌리기 값 다시 검사 — 남의 계정·남의 장소 = 찾을 수 없음 · 날짜·정렬 순서 이상·빈 값 = 되돌리지 못함 · 저장 0",
      forged.map((r) => (r.ok ? "ok" : r.error)).join("|") === [E.notFound, E.notFound, E.cannotUndo, E.cannotUndo, E.cannotUndo].join("|") &&
        (await prisma.memoryPlace.count({ where: { placeId: { in: [uPl2, placeB] }, memory: { episode: { id: uStRef.id } } } })) === 0,
      forged);
    const unT = tok ? await undoRemove(a, tok) : null;
    check("⑧ … 그 뒤 제 값으로 되돌리기는 됨(처음과 같음)", !!unT?.ok && unT.restored === 1 && (await rowsOf()) === s0, unT);
    const editUi = read("app/my-life/EditUI.tsx");
    check("⑧ 화면 — 빼기 직후 알림에 [되돌리기](undoRemoveAction) · 확인 단계(뺄게요)는 그대로",
      /text: E\.removed,\n\s*undo: u\n\s*\? async \(\) => \{\n\s*const x = await undoRemoveAction\(u\);/.test(editUi) && editUi.includes("onClick={() => remove(mode.other)}"));

    // ── ⑨ 3단계 E2E 후속 2(2026-11-02) — 옮기기 되돌리기 · 장소 지우기 확인창 묶음 수 · 지운 뒤 알림 ─────────
    const u9P = (await prisma.person.create({ data: { userId: a, name: "[fixture] 옮기기 되돌리기 분", relation: "친구", metYear: 1971 }, select: { id: true } })).id;
    const u9Out = (await prisma.person.create({ data: { userId: a, name: "[fixture] 이 이야기 밖의 분", relation: "친구", metYear: 1965 }, select: { id: true } })).id;
    const u9S = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 운동장 끝 버드나무 아래서 도시락을 먹었다.", personIds: [u9P] });
    const u9Id = u9S.ok ? u9S.episodeId : "";
    await saveNodeLink(a, { type: "LIFE_EVENT", id: job }, { type: "EPISODE", id: u9Id }); // 첫 직장 추가 소속(옮기면 지워졌다가 되돌리면 그대로)
    await prisma.nodeLink.updateMany({ where: { fromType: "LIFE_EVENT", fromId: job, toType: "EPISODE", toId: u9Id }, data: { createdAt: OLD, confirmedAt: OLD } });
    const snap9 = async () =>
      JSON.stringify({
        ep: await prisma.episode.findUnique({ where: { id: u9Id }, select: { lifeEventId: true, memory: { select: { year: true } } } }),
        ple: await prisma.personLifeEvent.findMany({ where: { personId: u9P }, orderBy: { lifeEventId: "asc" }, select: { lifeEventId: true, createdAt: true } }),
        extra: await prisma.nodeLink.findMany({ where: { fromType: "LIFE_EVENT", toType: "EPISODE", toId: u9Id }, select: { fromId: true, role: true, status: true, source: true, createdAt: true, confirmedAt: true } }),
        met: await prisma.person.findMany({ where: { id: { in: [u9P, u9Out] } }, orderBy: { id: "asc" }, select: { metYear: true } }),
        has: await prisma.lifeEvent.findMany({ where: { id: { in: [high, job] } }, orderBy: { id: "asc" }, select: { hasEpisode: true } }),
      });
    const s9 = await snap9();
    const mv9 = await moveEpisodeToLifeEvent(a, u9Id, job);
    const after9 = {
      primary: (await prisma.episode.findUnique({ where: { id: u9Id }, select: { lifeEventId: true } }))?.lifeEventId === job,
      extra: await prisma.nodeLink.count({ where: { fromType: "LIFE_EVENT", fromId: job, toType: "EPISODE", toId: u9Id } }),
      ple: await prisma.personLifeEvent.count({ where: { personId: u9P, lifeEventId: job } }),
      met: (await prisma.person.findUnique({ where: { id: u9P }, select: { metYear: true } }))?.metYear,
    };
    check("⑨ 옮기기 — 대상 시기 추가 소속 지움·대상 시기↔사람 생김·만난 해 1978 · 되돌리기 값(옛 시기·새로 생긴 연결·지운 추가 소속·만난 해·브릿지 연도)",
      mv9.ok && mv9.moved && after9.primary && after9.extra === 0 && after9.ple === 1 && after9.met === 1978 && !!mv9.undo &&
        mv9.undo.fromEventId === high && JSON.stringify(mv9.undo.createdPersonIds) === JSON.stringify([u9P]) && mv9.undo.removed.length === 1 &&
        mv9.undo.metYears.some((m) => m.personId === u9P && m.before === 1971),
      { after9, undo: mv9.ok ? mv9.undo : mv9 });
    const un9 = mv9.ok && mv9.undo ? await undoMoveEpisode(a, mv9.undo) : null;
    check("⑨ 옮기기 되돌리기 = 옮기기 전 그대로(주 소속·브릿지 연도·시기↔사람·추가 소속 만든 때·만난 해·두 시기 hasEpisode)", !!un9?.ok && (await snap9()) === s9, { un9, s9: JSON.parse(s9), now: JSON.parse(await snap9()) });
    const mv9b = await moveEpisodeToLifeEvent(a, u9Id, job);
    const tok9 = mv9b.ok ? mv9b.undo : null;
    const forged9 = tok9
      ? [
          await undoMoveEpisode(b, tok9),
          await undoMoveEpisode(a, { ...tok9, memoryYear: 3000 }),
          await undoMoveEpisode(a, { ...tok9, metYears: [{ personId: u9P, before: "x" as never }] }),
          await undoMoveEpisode(a, { ...tok9, createdPersonIds: "x" as never }),
        ]
      : [];
    const stillMoved = (await prisma.episode.findUnique({ where: { id: u9Id }, select: { lifeEventId: true } }))?.lifeEventId === job;
    const un9b = tok9 ? await undoMoveEpisode(a, { ...tok9, metYears: [...tok9.metYears, { personId: u9Out, before: 1900 }] }) : null;
    check("⑨ 옮기기 되돌리기 값 다시 검사 — 남의 계정 = 찾을 수 없음 · 연도·만난 해·목록 이상 = 거부(옮긴 그대로) · 이 이야기 밖의 분 만난 해는 안 건드림",
      forged9.map((r) => (r.ok ? "ok" : r.reason)).join("|") === "not_found|bad_undo|bad_undo|bad_undo" && stillMoved && !!un9b?.ok && (await snap9()) === s9,
      { forged9, stillMoved, un9b });
    const pl9 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 묶음 둘에 든 곳" }, select: { id: true } })).id;
    const pg9a = await createPlaceGroupNode(a, { name: "[fixture] 묶음 가", placeIds: [pl9] });
    const pg9b = await createPlaceGroupNode(a, { name: "[fixture] 묶음 나", placeIds: [pl9] });
    const im9 = await deleteImpact(a, { type: "PLACE", id: pl9 });
    check("⑨ 장소 지우기 확인창 — 장소 묶음 2개에서도 빠짐(placeGroups 2) · 다른 종류는 0", pg9a.ok && pg9b.ok && im9?.placeGroups === 2 && (await deleteImpact(a, { type: "EPISODE", id: u9Id }))?.placeGroups === 0, im9);
    const editUi9 = read("app/my-life/EditUI.tsx");
    const view9 = read("app/my-life/MyLifeView.tsx");
    check("⑨ 화면 — 옮긴 뒤 알림에 [되돌리기](undoMoveAction → 원래 시기의 그 이야기 패널) · 지운 뒤 \"○○을 지웠어요\"(지도 머리 줄·목록 위·화면 낭독) · 확인창 묶음 수",
      editUi9.includes("undoMove: r.undo ?? undefined") && view9.includes("const r = await undoMoveAction(mv);") &&
        editUi9.includes("onDeleted(nodeName);") && view9.includes("setMapNotice(C.edit.deletedName(name));") &&
        editUi9.includes("{im.placeGroups > 0 && <p className=\"text-lg text-ink\">{E.deletePlaceGroups(im.placeGroups)}</p>}"));

    // ── ⑦ 정적 ───────────────────────────────────────────────────
    const actions = read("app/my-life/actions.ts");
    // 함수 머리 줄(한 줄) 바로 다음 줄이 auth 확인.
    const exported = [...actions.matchAll(/export async function (\w+)[^\n]*\{\n\s*const userId = await requireUserId\(\);/g)].map((m) => m[1]);
    const allExported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    check("⑦ 서버 액션 전부 첫 줄 auth(requireUserId)", allExported.length >= 8 && exported.length === allExported.length, { allExported, exported });
    const walkDir = (d: string): string[] =>
      fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((x) =>
        x.name === "generated" ? [] : x.isDirectory() ? walkDir(`${d}/${x.name}`) : /\.(ts|tsx)$/.test(x.name) ? [`${d}/${x.name}`] : [],
      );
    const libFiles = [...walkDir("lib"), ...walkDir("app")];
    const nlWriters = libFiles.filter((f) => /nodeLink\.(create|createMany|upsert)\(/.test(read(f)));
    check("⑦ NodeLink 쓰기는 lib/node-graph 하나(입구 — Q44)", JSON.stringify(nlWriters) === JSON.stringify(["lib/node-graph.ts"]), nlWriters);
    check("⑦ proxy.ts 무접촉(my-life 언급 없음)", !/my-life/.test(read("proxy.ts")));
    check("⑦ 문구 — 3단계 문구는 my-life-copy edit 블록(임시 표기 주석)", /전부 \[임시 — 성민 확정 필요\]\n\s*edit: \{/.test(read("lib/my-life-copy.ts")) && !/"[^"]*\[임시/.test(read("app/my-life/EditUI.tsx")));
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  process.exit(1);
});
