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
//   ⑩ 시기↔사람 출처(2026-11-02) — 재현(넣기→옮기기→지우기 후 시기 연결 0) · 직접 넣은 연결 유지 · STORY→DIRECT 올림과 그 되돌리기 ·
//      이야기 둘·추가 소속 · 카드(인물 질문·대상 인물 DIRECT, 같이 나온 분 STORY) · 시기↔사람 쓰기 = 입구 하나
//   ⑫ 행성 꾸미기(U4 — 2026-11-05) — 고르기·바꾸기·빼기(바꾸기 전 모양 = 되돌리기 값 · source USER · 행 하나) · 화면 데이터(시기·이야기 모든 자리) ·
//      남의 시기·이야기·목록 밖 모양·사람 노드 거부 · 화면 입구(액션 → setNodeDecoration · 패널 낙관적 반영)
//   ⑪ 출생연도 원본(2026-11-03 — my-life-restructure §16.1) — V3 = 출생 시기(고친 연도 포함)가 신상·User 보다 먼저 ·
//      setBirthYear = 세 곳 같이 · V2 = 예전 규칙 그대로(getBirthYear = V2 출생 기록, resolveBirthYear = User 먼저) ·
//      V3 화면 읽는 곳 = resolveBirthYear 하나 · 회원정보·V3 신상 저장 = setBirthYear
//   ⑦ 정적 — 서버 액션 전부 첫 줄 auth · NodeLink 쓰기는 lib/node-graph 만 · proxy.ts 무접촉 · 문구 확정 주석
//   ⑭ 사용자 카테고리 지도(custom-graph 2단계 2026-11-06) — 만들기(같은 이름 안내)·넣기·잇기·빼기(되돌리기)·옮기기(되돌리기)·이름·기본 카테고리 이름·
//      항목 글·지우기 확인 수·남의 노드 거부·정합 점검 14·카테고리 지우기(자기 항목만) · 정적(액션·고르기·항목 글 화면)
//   ⑬ 인물록 통합(2026-11-06) — 사람 [이름·정보 고치기](저장·비우기·거부·분류 그대로) · 장소·모임 [이름 고치기](장소 = 이야기 장소 행 사본도) ·
//      사람 지우기(확인창 수·연결 정리·이야기 남음·남의 사람 거부) · 옛 /people 진입(V3 = My Life 자리, V2 = 그대로) · 정적(입구·화면·문구·무효화)
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
import { getBirthYear, getV3BirthYear, resolveBirthYear, setBirthYear } from "../lib/life-events";
import { getMyLifeData } from "../lib/my-life";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import {
  addLink,
  createCategoryNode,
  createCustomChild,
  createGroupNode,
  createPeriodNode,
  createPersonNode,
  createPlaceGroupNode,
  createPlaceNode,
  createStoryNode,
  deleteCustom,
  deleteGroupNode,
  deleteImpact,
  deletePlaceGroupNode,
  deletePersonNode,
  deletePlaceNode,
  moveCustom,
  removeLink,
  renameBuiltin,
  renameNode,
  setNodeDecoration,
  takeOutOfCategory,
  undoLinks,
  undoRemove,
  updatePersonInfo,
} from "../lib/my-life-edit";
import { getItemBody, saveEpisodeBody, saveItemBody, savePersonBody } from "../lib/node-body";
import { categoryEntries } from "../lib/my-life-layout";
import { countNodeGraphIssues } from "../lib/node-graph-reconcile";
import { MY_LIFE_PEOPLE, MY_LIFE_PLACES, peopleEntryRedirect } from "../lib/people-entry";
import { saveNodeLink, type NodeRef } from "../lib/node-graph";
import { cardToEdit, createFromCard, type CardPerson, type ProposalCard } from "../lib/node-proposal";

const EMAIL_A = "fixture-mylife-edit-a@lifebook.invalid";
const EMAIL_B = "fixture-mylife-edit-b@lifebook.invalid";
const EMAIL_C = "fixture-mylife-edit-c@lifebook.invalid"; // ⑪ V3 출생연도
const EMAIL_D = "fixture-mylife-edit-d@lifebook.invalid"; // ⑪ V2 출생연도
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
const walkLib = (d: string): string[] =>
  fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((x) =>
    x.name === "generated" ? [] : x.isDirectory() ? walkLib(`${d}/${x.name}`) : /.(ts|tsx)$/.test(x.name) ? [`${d}/${x.name}`] : [],
  );

async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B, EMAIL_C, EMAIL_D]) {
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
// ⑬ — 이야기에 소제목·문단 글을 남긴다(옛 장소 이름이 든 글).
async function saveStoryBodyWithPlace(userId: string, episodeId: string) {
  const r = await saveEpisodeBody(userId, episodeId, { v: 1, blocks: [{ type: "heading", text: "[fixture] 옛 이름 장소 앞 골목" }, { type: "paragraph", text: "[fixture] 옛 이름 장소에서 점심마다 밥을 먹었다." }] }, 0);
  if (!r.ok) throw new Error("⑬ 이야기 글 저장 실패: " + JSON.stringify(r));
}

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
    check("⑤ 옮기기 — 확정 인물은 새 시기에 시기↔사람(이야기 따라) · 옛 시기: 이 이야기로만 생긴 연결은 정리, 다른 이야기에도 나오거나 직접 넣은 분은 그대로(§14.8 — Q48 대체) · 확인 대기 분은 안 넣음",
      (await ple(onlyId, job)) === 1 && (await ple(mateId, job)) === 1 && (await ple(onlyId, high)) === 0 && (await ple(mateId, high)) === 1 && (await ple(draft, job)) === 0,
      { onlyJob: await ple(onlyId, job), mateJob: await ple(mateId, job), onlyHigh: await ple(onlyId, high), mateHigh: await ple(mateId, high) });
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
        ple: await prisma.personLifeEvent.findMany({ where: { personId: uPid, lifeEventId: job }, select: { createdAt: true, origin: true } }),
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
      const rows = rm.ok && rm.undo ? rm.undo.reduce((n, l) => n + l.rows.length, 0) : 0;
      check(`⑧ 빼기 되돌리기 — ${label}: 빼면 행 빠짐(이야기 따라 생긴 시기↔사람도 같이 정리) → 되돌리면 빼기 전과 같은 값(출처까지)`,
        rm.ok && rm.removed === 1 && !!rm.undo && gone && !!un?.ok && un.restored === rows && (await rowsOf()) === was, { rm, un });
    }
    check("⑧ 다섯 칸 다 되돌린 뒤 = 처음과 같음(첫 장소가 첫째 자리 그대로 — 정렬 순서·만든 때)", (await rowsOf()) === s0 && uSt.ok && uG.ok && uPg.ok, JSON.parse(s0));
    const rmAgain = await removeLink(a, uStRef, { type: "PERSON", id: uPid });
    const un1 = rmAgain.ok && rmAgain.undo ? await undoRemove(a, rmAgain.undo) : null;
    const un2 = rmAgain.ok && rmAgain.undo ? await undoRemove(a, rmAgain.undo) : null;
    const rmNone = await removeLink(a, { type: "LIFE_EVENT", id: elem }, { type: "PLACE", id: uPl2 });
    check("⑧ 같은 되돌리기 두 번 = 두 번째는 0행(그대로) · 없는 연결 빼기 = 되돌릴 것 없음(undo 없음)",
      !!un1?.ok && un1.restored === 2 && !!un2?.ok && un2.restored === 0 && (await rowsOf()) === s0 && rmNone.ok && rmNone.removed === 0 && rmNone.undo === null, { un1, un2, rmNone });
    // 화면이 돌려준 값은 다시 검사 — 남의 계정·남의 노드로 바꿔치기·이상한 값은 거부, 저장 0.
    const rmT = await removeLink(a, uStRef, { type: "PLACE", id: uPl2 });
    const tok = rmT.ok ? rmT.undo : null;
    const forged = tok
      ? [
          await undoRemove(b, tok),
          await undoRemove(a, [{ ...tok[0], b: { type: "PLACE", id: placeB } }]),
          await undoRemove(a, [{ ...tok[0], rows: [{ createdAt: "어제" }] }]),
          await undoRemove(a, [{ ...tok[0], rows: [{ ...tok[0].rows[0], sortOrder: -5 }] }]),
          await undoRemove(a, [{ ...tok[0], rows: [] }]),
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

    // ── ⑩ 시기↔사람 출처(2026-11-02 마이그 20261102200000 — §14.8) ─────────────────
    const pleOf = (pid: string) => prisma.personLifeEvent.findMany({ where: { personId: pid }, orderBy: { lifeEventId: "asc" }, select: { lifeEventId: true, origin: true, createdAt: true } });
    const newP = async (name: string) => (await prisma.person.create({ data: { userId: a, name, relation: "친구" }, select: { id: true } })).id;
    // (가) 운영 재현 — 이야기에 넣기(고등학교) → 다른 시절로 옮기기(첫 직장) → 이야기 지우기 → 시기 연결 0
    const r10 = await newP("[fixture] 재현 친구");
    const s10 = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 놀이터에서 그네를 오래 탔다.", personIds: [r10] });
    const s10Id = s10.ok ? s10.episodeId : "";
    const afterAdd = await pleOf(r10);
    const mv10 = await moveEpisodeToLifeEvent(a, s10Id, job);
    const afterMove = await pleOf(r10);
    await deleteEpisode(a, s10Id);
    const afterDel = await pleOf(r10);
    check("⑩ 재현 — 넣기: 고등학교↔사람 STORY · 옮기기: 첫 직장 STORY 생기고 고등학교는 정리 · 이야기 지우기: 시기 연결 0",
      afterAdd.length === 1 && afterAdd[0].lifeEventId === high && afterAdd[0].origin === "STORY" && mv10.ok &&
        afterMove.length === 1 && afterMove[0].lifeEventId === job && afterMove[0].origin === "STORY" && afterDel.length === 0,
      { afterAdd, afterMove, afterDel });
    // (나) 직접 넣은 연결은 이야기가 생겼다 지워져도 그대로(이야기 넣기가 내리지도 않음)
    const d10 = await newP("[fixture] 직접 넣은 분");
    await addLink(a, { type: "LIFE_EVENT", id: job }, { type: "PERSON", id: d10 });
    const s10b = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 점심마다 같이 국수를 먹었다.", personIds: [d10] });
    const midD = await pleOf(d10);
    if (s10b.ok) await deleteEpisode(a, s10b.episodeId);
    const endD = await pleOf(d10);
    check("⑩ 직접 넣은 연결(DIRECT) — 같은 시기 이야기에 넣어도 DIRECT 그대로 · 그 이야기를 지워도 유지",
      midD.length === 1 && midD[0].origin === "DIRECT" && endD.length === 1 && endD[0].origin === "DIRECT", { midD, endD });
    // (다) 이야기 따라 있던 쌍을 직접 넣으면 DIRECT 로 올림 · 그 넣기 되돌리기 = 다시 STORY(지우지 않음)
    const u10 = await newP("[fixture] 올림 확인 분");
    await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 퇴근길에 붕어빵을 나눠 먹었다.", personIds: [u10] });
    const up = await addLink(a, { type: "LIFE_EVENT", id: job }, { type: "PERSON", id: u10 });
    const upRow = await pleOf(u10);
    const upUndo = up.ok ? await undoLinks(a, up.created) : null;
    const downRow = await pleOf(u10);
    check("⑩ STORY 쌍을 직접 넣기 = DIRECT 로 올림(새 행 아님 — 되돌리기 표시) · 되돌리기 = 다시 STORY(행·만든 때 그대로)",
      up.ok && up.created.length === 1 && up.created[0].downgrade === true && upRow[0]?.origin === "DIRECT" && !!upUndo?.ok &&
        downRow.length === 1 && downRow[0].origin === "STORY" && +downRow[0].createdAt === +upRow[0].createdAt,
      { up, upRow, downRow });
    // (라) 같은 시기 이야기 둘에 나온 분 — 하나에서 빼도 유지, 둘 다 빼면 정리, 되돌리기 = 연결·시기 연결 둘 다 그대로
    const t10 = await newP("[fixture] 두 이야기 분");
    const s10c = await createStoryNode(a, { lifeEventId: elem, kind: "STORY", title: "", content: "[fixture] 운동회 날 줄다리기를 했다.", personIds: [t10] });
    const s10d = await createStoryNode(a, { lifeEventId: elem, kind: "STORY", title: "", content: "[fixture] 소풍 가서 보물찾기를 했다.", personIds: [t10] });
    const before10 = JSON.stringify(await pleOf(t10));
    const rmC = s10c.ok ? await removeLink(a, { type: "EPISODE", id: s10c.episodeId }, { type: "PERSON", id: t10 }) : null;
    const keep10 = await pleOf(t10);
    const rmD = s10d.ok ? await removeLink(a, { type: "EPISODE", id: s10d.episodeId }, { type: "PERSON", id: t10 }) : null;
    const gone10 = await pleOf(t10);
    const unD = rmD?.ok && rmD.undo ? await undoRemove(a, rmD.undo) : null;
    check("⑩ 이야기 둘에 나온 분 — 하나에서 빼면 시기 연결 유지 · 둘 다 빼면 정리 · 되돌리기 = 이야기 연결 + 시기 연결(출처·만든 때 그대로)",
      !!rmC?.ok && rmC.undo?.length === 1 && keep10.length === 1 && !!rmD?.ok && rmD.undo?.length === 2 && gone10.length === 0 &&
        !!unD?.ok && JSON.stringify(await pleOf(t10)) === before10 &&
        (await prisma.nodeLink.count({ where: { fromType: "EPISODE", fromId: s10d.ok ? s10d.episodeId : "", toType: "PERSON", toId: t10 } })) === 1,
      { rmC, keep10, rmD, gone10, unD });
    // (마) 추가 소속 이야기에 나오는 동안은 유지 · 추가 소속을 빼면 정리
    const x10 = await newP("[fixture] 추가 소속 분");
    const s10e = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 첫 월급으로 구두를 샀다.", personIds: [x10] });
    const s10f = await createStoryNode(a, { lifeEventId: elem, kind: "STORY", title: "", content: "[fixture] 어릴 적 친구가 회사 근처로 이사 왔다.", personIds: [x10] });
    if (s10f.ok) await saveNodeLink(a, { type: "LIFE_EVENT", id: job }, { type: "EPISODE", id: s10f.episodeId });
    if (s10e.ok) await deleteEpisode(a, s10e.episodeId);
    const xJob1 = (await pleOf(x10)).filter((r) => r.lifeEventId === job).length;
    const rmX = s10f.ok ? await removeLink(a, { type: "LIFE_EVENT", id: job }, { type: "EPISODE", id: s10f.episodeId }) : null;
    const xJob2 = (await pleOf(x10)).filter((r) => r.lifeEventId === job).length;
    check("⑩ 추가 소속 — 그 시기에 추가 소속으로 걸린 이야기에 나오면 유지 · 그 추가 소속을 빼면 이야기 따라 생긴 시기 연결도 정리",
      xJob1 === 1 && !!rmX?.ok && xJob2 === 0 && (rmX.undo?.length ?? 0) === 2, { xJob1, xJob2, rmX });
    // (바) 인물 질문으로 시작한 카드 = DIRECT · 대상 인물 = DIRECT · 그 밖 = STORY
    const hsEv10 = await prisma.lifeEvent.findUniqueOrThrow({ where: { id: high }, select: { label: true, year: true } });
    const card10 = (people: CardPerson[], extra: Partial<ProposalCard>): ProposalCard => ({
      v: 1, title: "", summary: "[fixture] 그 시절 함께 다닌 분들 이야기.", center: { id: high, label: hsEv10.label, year: hsEv10.year }, centerFixed: false,
      people, places: [], kind: "STORY", transcript: "[본인] [fixture] 그 시절 함께 다닌 분들 이야기.", until: null, targetPersonId: null, isPeriod: false, ...extra,
    });
    const pq = card10([{ name: "[fixture] 인물 질문 답 분", relation: "친구", personId: null, sameName: [] }], { personQuestion: true });
    const pqRes = await createFromCard(a, pq, cardToEdit(pq));
    const pqPerson = await prisma.person.findFirst({ where: { userId: a, name: "[fixture] 인물 질문 답 분" }, select: { id: true } });
    const pqRows = pqPerson ? await pleOf(pqPerson.id) : [];
    const tgt10 = await newP("[fixture] 대상 인물 분");
    const tc = card10(
      [{ name: "[fixture] 대상 인물 분", relation: "친구", personId: tgt10, sameName: [] }, { name: "[fixture] 같이 나온 분", relation: "친구", personId: null, sameName: [] }],
      { targetPersonId: tgt10 },
    );
    const tcRes = await createFromCard(a, tc, cardToEdit(tc));
    const along = await prisma.person.findFirst({ where: { userId: a, name: "[fixture] 같이 나온 분" }, select: { id: true } });
    const tgtRows = await pleOf(tgt10);
    const alongRows = along ? await pleOf(along.id) : [];
    if (pqRes.ok) await deleteEpisode(a, pqRes.episodeId);
    const pqAfterDel = pqPerson ? await pleOf(pqPerson.id) : [];
    check("⑩ 카드 — 인물 질문으로 시작 = DIRECT(이야기를 지워도 유지) · 대상 인물 = DIRECT · 같이 나온 분 = STORY",
      pqRes.ok && pqRows.length === 1 && pqRows[0].origin === "DIRECT" && pqAfterDel.length === 1 &&
        tcRes.ok && tgtRows.length === 1 && tgtRows[0].origin === "DIRECT" && alongRows.length === 1 && alongRows[0].origin === "STORY",
      { pqRes, pqRows, pqAfterDel, tgtRows, alongRows });
    const libAll = [...walkLib("lib"), ...walkLib("app")];
    const pleWriters = libAll.filter((f) => /personLifeEvent\.(create|createMany|upsert)\(/.test(read(f)));
    check("⑩ 시기↔사람 쓰기는 lib/node-graph 하나(인물 확인 [맞아요]의 직접 upsert 없앰 — 입구로)", JSON.stringify(pleWriters) === JSON.stringify(["lib/node-graph.ts"]), pleWriters);

    // ── ⑦ 정적 ───────────────────────────────────────────────────
    const actions = read("app/my-life/actions.ts");
    // 함수 머리 줄(한 줄) 바로 다음 줄이 auth 확인.
    const exported = [...actions.matchAll(/export async function (\w+)[^\n]*\{\n\s*const userId = await requireUserId\(\);/g)].map((m) => m[1]);
    const allExported = [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    check("⑦ 서버 액션 전부 첫 줄 auth(requireUserId)(개수는 안 봄)", allExported.length >= 1 && exported.length === allExported.length, { allExported, exported });
    const walkDir = (d: string): string[] =>
      fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((x) =>
        x.name === "generated" ? [] : x.isDirectory() ? walkDir(`${d}/${x.name}`) : /\.(ts|tsx)$/.test(x.name) ? [`${d}/${x.name}`] : [],
      );
    const libFiles = [...walkDir("lib"), ...walkDir("app")];
    const nlWriters = libFiles.filter((f) => /nodeLink\.(create|createMany|upsert)\(/.test(read(f)));
    check("⑦ NodeLink 쓰기는 lib/node-graph 하나(입구 — Q44)", JSON.stringify(nlWriters) === JSON.stringify(["lib/node-graph.ts"]), nlWriters);
    check("⑦ proxy.ts 무접촉(my-life 언급 없음)", !/my-life/.test(read("proxy.ts")));
    check("⑦ 문구 — 3단계 문구는 my-life-copy edit 블록(확정 주석 — 2026-11-10)", /2026-11-10 확정\n\s*edit: \{/.test(read("lib/my-life-copy.ts")) && !/"[^"]*\[임시/.test(read("app/my-life/EditUI.tsx")));

    // ── ⑫ 행성 꾸미기(U4 — 2026-11-05, docs/phase/ui-space.md §7.5) ─────────────────────
    {
      const dA = await getMyLifeData(a);
      const evD = dA.events.find((e) => e.stories.length > 0)!;
      const stD = evD.stories[0];
      const EV: NodeRef = { type: "LIFE_EVENT", id: elem };
      const ST: NodeRef = { type: "EPISODE", id: stD.id };
      const row = (n: NodeRef) =>
        prisma.nodeDecoration.findUnique({ where: { nodeType_nodeId: { nodeType: n.type, nodeId: n.id } }, select: { shape: true, source: true, userId: true } });
      const rows = (n: NodeRef) => prisma.nodeDecoration.count({ where: { nodeType: n.type, nodeId: n.id } });
      const s1 = await setNodeDecoration(a, EV, "ring");
      const r1 = await row(EV);
      const s2 = await setNodeDecoration(a, EV, "comet");
      const r2 = await row(EV);
      const n2 = await rows(EV);
      const s3 = await setNodeDecoration(a, EV, null);
      const n3 = await rows(EV);
      const s4 = await setNodeDecoration(a, EV, null);
      check("⑫ 꾸미기 고르기·바꾸기·빼기 — 고름(바꾸기 전 없음 · source USER) · 바꿈(바꾸기 전 = 고리 · 행 하나 그대로) · 뺌(행 없음) · 없는데 빼기 = 그대로(바꾸기 전 없음)",
        s1.ok && s1.previous === null && r1?.shape === "ring" && r1.source === "USER" && r1.userId === a &&
          s2.ok && s2.previous === "ring" && r2?.shape === "comet" && n2 === 1 &&
          s3.ok && s3.previous === "comet" && n3 === 0 && s4.ok && s4.previous === null,
        { s1, r1, s2, r2, n2, s3, n3, s4 });
      // 화면 데이터 — 시기 행성 · 이야기 행성(같은 이야기가 여러 시기에 보이면 모든 자리)
      await setNodeDecoration(a, EV, "aurora");
      await setNodeDecoration(a, ST, "blackhole");
      const dA2 = await getMyLifeData(a);
      const copies = dA2.events.flatMap((e) => e.stories.filter((s) => s.id === stD.id));
      check("⑫ 화면 데이터 — 시기 decor = 오로라 · 이야기의 모든 자리 decor = 블랙홀 · 안 꾸민 행성 = null",
        dA2.events.find((e) => e.id === elem)?.decor === "aurora" && copies.length >= 1 && copies.every((s) => s.decor === "blackhole") &&
          dA2.events.find((e) => e.id === high)?.decor === null,
        { copies: copies.length });
      // 거부 — 남의 노드(시기·이야기) · 목록 밖 모양 · 꾸밀 수 없는 종류 — 행은 그대로
      const x1 = await setNodeDecoration(b, EV, "ring");
      const x2 = await setNodeDecoration(b, ST, null);
      const x3 = await setNodeDecoration(a, { type: "LIFE_EVENT", id: evB }, "ring");
      const x4 = await setNodeDecoration(a, EV, "sparkle");
      const x5 = await setNodeDecoration(a, { type: "PERSON", id: draft }, "ring");
      check("⑫ 거부 — 남의 시기에 꾸미기 · 남의 이야기 꾸미기 빼기 · 내 꾸미기를 남의 시기에 · 목록 밖 모양 · 사람 노드 = 전부 실패, 행 그대로",
        !x1.ok && x1.error === E.notFound && !x2.ok && x2.error === E.notFound && !x3.ok && x3.error === E.notFound && !x4.ok && !x5.ok &&
          (await row(EV))?.shape === "aurora" && (await row(ST))?.shape === "blackhole" && (await rows({ type: "LIFE_EVENT", id: evB })) === 0,
        { x1, x2, x3, x4, x5 });
      // 화면 입구 — 패널 고르기(EditUI → links.decorate → setDecorationAction → setNodeDecoration)
      check("⑫ 화면 입구 — 액션 = 로그인 확인 + 노드 값 검사 뒤 setNodeDecoration · 패널 [꾸미기] → 고르기(./Decor) · 고르면 낙관적 반영(links.decorate)·[되돌리기]는 저장 뒤",
        read("app/my-life/actions.ts").includes("export async function setDecorationAction(node: NodeRef, shape: string | null)") &&
          read("app/my-life/actions.ts").includes(`return setNodeDecoration(userId, r, typeof shape === "string" ? shape : null);`) &&
          read("app/my-life/EditUI.tsx").includes("onPick={decorate}") && read("app/my-life/EditUI.tsx").includes("void links.decorate(self!, shape).then((r) => {") &&
          read("app/my-life/EditUI.tsx").includes("setNotice({ key: nodeKey, text, saving: true });"));
    }

    // ── ⑪ 출생연도 원본(2026-11-03 — §16.1) ─────────────────────────────────────
    const v3u = await makeUser(EMAIL_C, "[fixture] 출생연도 V3"); // 신상·User 1955
    await prisma.user.update({ where: { id: v3u }, data: { birthYear: null } }); // V3 채팅 온보딩은 User 칸을 비워 뒀다(운영 V3 14명)
    const birthEv = await makeEvent(v3u, "BIRTH", "출생", 1956, 0); // 원본 — 신상(1955)과 일부러 다르게(운영 1명 재현)
    check("⑪ V3 — 출생 시기가 원본: resolveBirthYear·getBirthYear·getV3BirthYear = 1956(신상 1955·User 빈칸보다 먼저)",
      (await resolveBirthYear(v3u)) === 1956 && (await getBirthYear(v3u)) === 1956 && (await getV3BirthYear(v3u)) === 1956);
    await prisma.lifeEvent.update({ where: { id: birthEv }, data: { status: "CORRECTED", correctedYear: 1957 } });
    check("⑪ V3 — 고친 연도(correctedYear)가 원본", (await resolveBirthYear(v3u)) === 1957 && (await getBirthYear(v3u)) === 1957);
    await setBirthYear(v3u, 1960);
    const ev11 = await prisma.lifeEvent.findUniqueOrThrow({ where: { id: birthEv }, select: { year: true, correctedYear: true } });
    const prof11 = await prisma.onboardingProfile.findUniqueOrThrow({ where: { userId: v3u }, select: { birthYear: true } });
    const user11 = await prisma.user.findUniqueOrThrow({ where: { id: v3u }, select: { birthYear: true } });
    check("⑪ setBirthYear(V3) — 출생 시기(고친 칸)·신상·User 같이 1960 · 처음 year 칸은 그대로",
      ev11.correctedYear === 1960 && ev11.year === 1956 && prof11.birthYear === 1960 && user11.birthYear === 1960 && (await resolveBirthYear(v3u)) === 1960,
      { ev11, prof11, user11 });
    const yearPick = await createPeriodNode(v3u, { label: "[fixture] 출생 전 시기", year: 1958, endYear: null });
    check("⑪ 지도 시기 만들기 연도 범위 = 원본 출생연도 기준(1958 < 1960 − 1 → 거부)", !yearPick.ok, yearPick);
    const v2u = (await prisma.user.create({ data: { email: EMAIL_D, name: "[fixture] 출생연도 V2", birthYear: 1950 }, select: { id: true } })).id;
    await prisma.userMemory.create({ data: { userId: v2u, createdVia: "life_event", category: "BIRTH", year: 1951, eventYear: 1951, title: "출생" } });
    check("⑪ V2 — 예전 규칙 그대로: getBirthYear = V2 출생 기록(1951) · resolveBirthYear = User(1950) · V3 원본 없음",
      (await getBirthYear(v2u)) === 1951 && (await resolveBirthYear(v2u)) === 1950 && (await getV3BirthYear(v2u)) === null);
    await setBirthYear(v2u, 1949);
    check("⑪ setBirthYear(V2) — User 만 1949(V2 출생 기록 1951 그대로 · 신상·출생 시기 없음)",
      (await prisma.user.findUniqueOrThrow({ where: { id: v2u }, select: { birthYear: true } })).birthYear === 1949 && (await getBirthYear(v2u)) === 1951 &&
        (await prisma.onboardingProfile.count({ where: { userId: v2u } })) === 0 && (await prisma.lifeEvent.count({ where: { userId: v2u } })) === 0);
    const v3Readers = ["lib/free-chat.ts", "lib/node-proposal.ts", "lib/interview/session.ts", "lib/my-life-edit.ts"];
    check("⑪ V3 화면 읽는 곳(자유 대화·제안 카드·인터뷰·지도 만들기) = resolveBirthYear — 따로 신상·User 를 읽던 출생연도 함수 없음",
      v3Readers.every((f) => read(f).includes("resolveBirthYear(") && !read(f).includes("birthYearOf")), v3Readers.filter((f) => read(f).includes("birthYearOf")));
    const prof = read("app/account/profile/actions.ts");
    check("⑪ 회원정보 — 화면 = 출생 시기 먼저(getV3BirthYear) · 저장 = setBirthYear(V3 는 비우기 안 함) · V3 신상 저장 두 갈래 모두 setBirthYear",
      read("app/account/profile/page.tsx").includes("birthYear: v3BirthYear ?? user?.birthYear ?? null") && prof.includes("if (birthYear !== null) await setBirthYear(userId, birthYear);") &&
        prof.includes("else if ((await getV3BirthYear(userId)) === null)") && /await setBirthYear\(userId, input\.birthYear\);\s*return \{ status: "ALREADY_DONE" \};/.test(read("app/actions/onboarding.ts")) &&
        /await setBirthYear\(userId, input\.birthYear\);\s*return \{ status: "CREATED"/.test(read("app/actions/onboarding.ts")));
    // ── ⑬ 인물록 통합(2026-11-06 — V3 = My Life 인물록·장소록, V2 = /people 그대로) ─────────────────────
    {
      const C13 = MY_LIFE_COPY;
      // 사람 [이름·정보 고치기] — 저장 = lib/people updatePerson(같은 검사·문구) · 분류(category)는 V3 화면에서 안 쓰지만 그대로
      const P = await createPersonNode(a, { name: "[fixture] 고칠 분", relation: "이웃" });
      const pid = P.ok ? P.personId : "";
      await prisma.person.update({ where: { id: pid }, data: { category: "[fixture] 옛 분류" } });
      const sel = { name: true, relation: true, birthYear: true, metYear: true, memo: true, category: true, isDraft: true, subjectType: true } as const;
      const u1 = await updatePersonInfo(a, pid, { name: " [fixture] 고친 분 ", relation: " 옆집 이웃 ", birthYear: "1950", metYear: "1970", memo: " [fixture] 웃음이 많은 분 " });
      const r1 = await prisma.person.findUnique({ where: { id: pid }, select: sel });
      check("⑬ 사람 고치기 — 이름·관계·태어난 해·만난 해·메모 저장(앞뒤 공백 정리) · 분류 그대로 · 확정 사람 그대로",
        u1.ok && r1?.name === "[fixture] 고친 분" && r1.relation === "옆집 이웃" && r1.birthYear === 1950 && r1.metYear === 1970 && r1.memo === "[fixture] 웃음이 많은 분" &&
          r1.category === "[fixture] 옛 분류" && r1.isDraft === false && r1.subjectType === "person",
        { u1, r1 });
      const shown = (await getMyLifeData(a)).people.find((p) => p.id === pid);
      check("⑬ 화면 데이터 — 사람 패널에 태어난 해·메모(값이 있을 때만 보임)", shown?.birthYear === 1950 && shown.memo === "[fixture] 웃음이 많은 분", shown);
      const u2 = await updatePersonInfo(a, pid, { name: "[fixture] 고친 분", relation: "", birthYear: "", metYear: "", memo: "" });
      const r2 = await prisma.person.findUnique({ where: { id: pid }, select: sel });
      check("⑬ 사람 고치기 — 칸을 비우면 비움(관계·연도·메모 = 없음) · 분류는 그대로",
        u2.ok && r2?.relation === null && r2.birthYear === null && r2.metYear === null && r2.memo === null && r2.category === "[fixture] 옛 분류", { u2, r2 });
      const bads = [
        await updatePersonInfo(a, pid, { name: "  ", relation: "", birthYear: "", metYear: "", memo: "" }),
        await updatePersonInfo(a, pid, { name: "[fixture] x", relation: "", birthYear: "19x5", metYear: "", memo: "" }),
        await updatePersonInfo(a, pid, { name: "[fixture] x", relation: "", birthYear: "", metYear: "1800", memo: "" }),
        await updatePersonInfo(a, pid, { name: "[fixture] x", relation: "가".repeat(31), birthYear: "", metYear: "", memo: "" }),
        await updatePersonInfo(b, pid, { name: "[fixture] 남이 고침", relation: "", birthYear: "", metYear: "", memo: "" }),
        await updatePersonInfo(a, draft, { name: "[fixture] 초안 고침", relation: "", birthYear: "", metYear: "", memo: "" }),
      ];
      const errs = bads.map((r) => (r.ok ? "ok" : r.error));
      check("⑬ 사람 고치기 거부 — 이름 빔·연도 꼴·연도 범위·관계 31자(lib/people 문구) · 남의 사람·초안 = 찾을 수 없음 · 행 그대로",
        errs[0] === "이름을 입력해주세요." && errs[1] === E.badYear && errs[2].startsWith("처음 만난 연도는") && errs[3] === "관계는 30자 이하로 적어주세요." &&
          errs[4] === E.notFound && errs[5] === E.notFound &&
          (await prisma.person.findUnique({ where: { id: pid }, select: { name: true } }))?.name === "[fixture] 고친 분" &&
          (await prisma.person.findUnique({ where: { id: draft }, select: { name: true } }))?.name === "[fixture] 초안 분",
        errs);

      // 장소·모임 [이름 고치기] — 장소는 이야기 장소 행 이름 사본(MemoryPlace.placeName)도 같이
      const PL = await createPlaceNode(a, { name: "[fixture] 옛 이름 장소" });
      const plId = PL.ok ? PL.placeId : "";
      // 본문·제목에 옛 장소 이름을 일부러 넣는다 — 이름 고치기는 장소 칸만 바꾸고 이야기 글자는 안 건드려야 한다(2026-11-06 성민 확인 요청).
      const st13 = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "[fixture] 옛 이름 장소 점심", content: "[fixture] 옛 이름 장소에서 점심마다 밥을 먹었다.", placeIds: [plId] });
      if (st13.ok) await saveStoryBodyWithPlace(a, st13.episodeId);
      const textOf = async () =>
        st13.ok
          ? JSON.stringify([
              await prisma.episode.findUnique({ where: { id: st13.episodeId }, select: { content: true, rawTranscript: true, memory: { select: { title: true, content: true, refinedText: true } } } }),
              await prisma.nodeBody.findMany({ where: { nodeType: "EPISODE", nodeId: st13.episodeId }, select: { doc: true, plainText: true, version: true } }),
              await prisma.nodeBodyRevision.count({ where: { nodeType: "EPISODE", nodeId: st13.episodeId } }),
            ])
          : "";
      const textBefore = await textOf();
      const rn1 = await renameNode(a, { type: "PLACE", id: plId }, " [fixture] 새 이름 장소 ");
      const textAfter = await textOf();
      check("⑬ 장소 이름을 바꿔도 이야기 본문은 그대로 — 이야기 글·녹취·제목·다듬은 글·블로그식 글(소제목·문단)·이전 판 수 전부 같음(옛 이름 글자 남음)",
        rn1.ok && textBefore !== "" && textAfter === textBefore && textAfter.includes("옛 이름 장소에서 점심마다") && textAfter.includes("옛 이름 장소 앞 골목") && !textAfter.includes("새 이름 장소"),
        { textBefore: textBefore.slice(0, 200), textAfter: textAfter.slice(0, 200) });
      const mpNames = await prisma.memoryPlace.findMany({ where: { placeId: plId }, select: { placeName: true } });
      check("⑬ 장소 이름 고치기 — 장소 이름 + 이야기 장소 행 이름 사본 같이",
        st13.ok && rn1.ok && (await prisma.place.findUnique({ where: { id: plId }, select: { name: true } }))?.name === "[fixture] 새 이름 장소" &&
          mpNames.length === 1 && mpNames[0].placeName === "[fixture] 새 이름 장소",
        { rn1, mpNames });
      const G = await createGroupNode(a, { name: "[fixture] 옛 모임", memberIds: [] });
      const gId = G.ok ? G.groupId : "";
      const rn2 = await renameNode(a, { type: "PERSON_GROUP", id: gId }, "[fixture] 새 모임");
      const rnBad = [
        await renameNode(a, { type: "PLACE", id: plId }, ""),
        await renameNode(a, { type: "PLACE", id: plId }, "가".repeat(51)),
        await renameNode(a, { type: "PERSON_GROUP", id: gId }, "가".repeat(31)),
        await renameNode(b, { type: "PLACE", id: plId }, "[fixture] 남이 고침"),
        await renameNode(b, { type: "PERSON_GROUP", id: gId }, "[fixture] 남이 고침"),
        await renameNode(a, { type: "PLACE", id: placeB }, "[fixture] 남의 장소 고침"),
        await renameNode(a, { type: "PERSON", id: pid }, "[fixture] 종류 밖"),
      ].map((r) => (r.ok ? "ok" : r.error));
      check("⑬ 모임 이름 고치기 · 거부 — 빈 이름·장소 51자·모임 31자 · 남의 장소·모임·내가 남의 장소 · 종류 밖 = 거부, 이름 그대로",
        rn2.ok && (await prisma.personGroup.findUnique({ where: { id: gId }, select: { name: true } }))?.name === "[fixture] 새 모임" &&
          rnBad.join("|") === [E.needName, E.tooLong(50), E.tooLong(30), E.notFound, E.notFound, E.notFound, E.notFound].join("|") &&
          (await prisma.place.findUnique({ where: { id: plId }, select: { name: true } }))?.name === "[fixture] 새 이름 장소" &&
          (await prisma.place.findUnique({ where: { id: placeB }, select: { name: true } }))?.name === "[fixture] B 장소",
        rnBad);

      // 사람 지우기 — [이 노드 지우기] 확인창 수 · 연결 정리 · 이야기는 남음
      const X = await createPersonNode(a, { name: "[fixture] 지울 분", relation: "친구" });
      const xId = X.ok ? X.personId : "";
      const sx1 = await createStoryNode(a, { lifeEventId: high, kind: "STORY", title: "", content: "[fixture] 둘이 자전거를 탔다.", personIds: [xId] });
      const sx2 = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 그 친구가 회사에 찾아왔다." });
      if (sx2.ok) await prisma.episode.update({ where: { id: sx2.episodeId }, data: { personId: xId } }); // 대상 인물(이야기의 주인공)
      const GX = await createGroupNode(a, { name: "[fixture] 자전거 모임", memberIds: [xId] });
      await saveNodeLink(a, { type: "PERSON", id: xId }, { type: "PLACE", id: plId });
      const body = await savePersonBody(a, xId, { v: 1, blocks: [{ type: "paragraph", text: "[fixture] 늘 먼저 연락하던 친구." }] }, 0);
      const im = await deleteImpact(a, { type: "PERSON", id: xId });
      check("⑬ 사람 지우기 확인창 수 — 이야기 2(함께 나온 1 + 주인공 1) · 시기 1 · 모임 1 · 장소 1 · 인물 글 있음 · 남의 사람 = 없음",
        sx1.ok && sx2.ok && GX.ok && body.ok && im?.stories === 2 && im.periods === 1 && im.groups === 1 && im.places === 1 && im.personBody === true && im.storiesDeleted === false &&
          (await deleteImpact(b, { type: "PERSON", id: xId })) === null,
        im);
      const dB = await deletePersonNode(b, xId);
      const stillThere = await prisma.person.count({ where: { id: xId } });
      const dA = await deletePersonNode(a, xId);
      const left = await Promise.all([
        prisma.person.count({ where: { id: xId } }),
        prisma.nodeLink.count({ where: { OR: [{ fromId: xId }, { toId: xId }] } }),
        prisma.personLifeEvent.count({ where: { personId: xId } }),
        prisma.personGroupMember.count({ where: { personId: xId } }),
        prisma.nodeBody.count({ where: { nodeType: "PERSON", nodeId: xId } }),
        prisma.nodeBodyRevision.count({ where: { nodeType: "PERSON", nodeId: xId } }),
      ]);
      const sx2Row = sx2.ok ? await prisma.episode.findUnique({ where: { id: sx2.episodeId }, select: { personId: true } }) : null;
      const sx1Row = sx1.ok ? await prisma.episode.count({ where: { id: sx1.episodeId } }) : 0;
      check("⑬ 사람 지우기 — 남이 지우기 = 찾을 수 없음(그대로) · 내가 지우기 = 사람·연결·시기↔사람·모임 구성원·인물 글·이전 판 0 · 이야기 둘 다 남음(주인공 칸 비움) · 모임 남음",
        !dB.ok && dB.error === E.notFound && stillThere === 1 && dA.ok && JSON.stringify(left) === "[0,0,0,0,0,0]" &&
          sx2Row !== null && sx2Row.personId === null && sx1Row === 1 && (await prisma.personGroup.count({ where: { id: GX.ok ? GX.groupId : "" } })) === 1,
        { dB, dA, left, sx2Row, sx1Row });

      // 옛 /people 진입 — V3 = My Life 자리, V2 = null(그대로)
      const loc = (await prisma.person.create({ data: { userId: a, name: "[fixture] 옛 장소형", subjectType: "location", isDraft: false }, select: { id: true } })).id;
      const pBid = (await prisma.person.create({ data: { userId: b, name: "[fixture] B 의 분", isDraft: false }, select: { id: true } })).id;
      const focus = (id: string) => "/my-life?focus=" + encodeURIComponent("pe:" + id);
      const got = [
        await peopleEntryRedirect(a, { page: "list" }),
        await peopleEntryRedirect(a, { page: "list", tab: "location" }),
        await peopleEntryRedirect(a, { page: "new" }),
        await peopleEntryRedirect(a, { page: "new", tab: "location" }),
        await peopleEntryRedirect(a, { page: "detail", personId: pid }),
        await peopleEntryRedirect(a, { page: "edit", personId: pid }),
        await peopleEntryRedirect(a, { page: "link", personId: pid }),
        await peopleEntryRedirect(a, { page: "detail", personId: pBid }),
        await peopleEntryRedirect(a, { page: "edit", personId: draft }),
        await peopleEntryRedirect(a, { page: "detail", personId: loc }),
        await peopleEntryRedirect(a, { page: "detail", personId: "no-such-person" }),
      ];
      const want = [MY_LIFE_PEOPLE, MY_LIFE_PLACES, MY_LIFE_PEOPLE, MY_LIFE_PLACES, focus(pid), focus(pid) + "&edit=1", focus(pid), MY_LIFE_PEOPLE, MY_LIFE_PEOPLE, MY_LIFE_PLACES, MY_LIFE_PEOPLE];
      check("⑬ V3 /people 진입 — 목록·새로 = 인물록 영역(장소 탭 = 장소록) · 상세·연결 = 그 사람 · 고치기 = 그 사람 + edit=1 · 남의 사람·초안·없는 사람 = 인물록 · 옛 장소형 = 장소록",
        JSON.stringify(got) === JSON.stringify(want), { got, want });
      const v2got = [
        await peopleEntryRedirect(v2u, { page: "list" }),
        await peopleEntryRedirect(v2u, { page: "detail", personId: pid }),
        await peopleEntryRedirect(v2u, { page: "edit", personId: pid }),
      ];
      check("⑬ V2 /people 진입 — 보내지 않음(지금 그대로)", v2got.every((x) => x === null), v2got);

      // 정적 — 입구·화면·문구
      const pages = ["app/people/page.tsx", "app/people/new/page.tsx", "app/people/[personId]/page.tsx", "app/people/[personId]/edit/page.tsx", "app/people/[personId]/link/page.tsx"];
      check("⑬ /people 화면 5개 — 로그인 확인 바로 뒤 peopleEntryRedirect → redirect(V3 만)",
        pages.every((f) => /const toMyLife = await peopleEntryRedirect\([^\n]+\);\n\s*if \(toMyLife\) redirect\(toMyLife\);/.test(read(f).replace(/\r\n/g, "\n"))),
        pages.filter((f) => !read(f).includes("peopleEntryRedirect(")));
      const side = read("app/timemachine/SidePanel.tsx");
      check("⑬ 사이드 패널 인물록 — V3 = /my-life?area=people · V2 = /people",
        side.includes('href={data.onboardingTrack === "V3" ? MY_LIFE_PEOPLE : "/people"}') && MY_LIFE_PEOPLE === "/my-life?area=people" && MY_LIFE_PLACES === "/my-life?area=places");
      const myLifeFiles = walkLib("app/my-life");
      check("⑬ My Life 화면에 /people 링크·이동 없음(자세히 보기·인물록에서 지우기 삭제)",
        myLifeFiles.every((f) => !/(href=\{?[\x60"]\/people|redirect\([\x60"]\/people|push\([\x60"]\/people)/.test(read(f))) &&
          !("openPerson" in C13) && !("personDeleteNote" in E) && !("personDeleteLink" in E),
        myLifeFiles.filter((f) => /[\x60"]\/people/.test(read(f))));
      const view13 = read("app/my-life/MyLifeView.tsx");
      const edit13 = read("app/my-life/EditUI.tsx");
      const act13 = read("app/my-life/actions.ts");
      check("⑬ 지우기 버튼 = 노드 종류별 이름(2026-11-10 — [이 시기/이야기/분/장소/모임/항목 지우기] · \"노드\" 없음) · 버튼 이름을 안내하는 문구 3곳 = 실제 버튼 · 차례 보기 끝 낭독 = \"처음 자리로\"",
        E.deleteNode.period === "이 시기 지우기" && E.deleteNode.story === "이 이야기 지우기" && E.deleteNode.person === "이 분 지우기" &&
          E.deleteNode.place === "이 장소 지우기" && E.deleteNode.group === "이 모임 지우기" && E.deleteNode.item === "이 항목 지우기" &&
          Object.values(E.deleteNode).every((t) => !t.includes("노드")) && !MY_LIFE_COPY.tourBackLabel("가").includes("노드") &&
          edit13.includes('{E.deleteNode[story ? "story" : person ? "person" : place ? "place" : group ? "group" : placeGroup ? "placeGroup" : category ? "category" : cgroup ? "customGroup" : item ? "item" : "period"]}') &&
          MY_LIFE_COPY.body.errEmpty.includes(`[${E.deleteNode.story}]`) && MY_LIFE_COPY.ask.plan.personDelete("가").includes(`[${E.deleteNode.person}]`) &&
          read("app/help/HelpFaq.tsx").includes("[${MY_LIFE_COPY.edit.deleteNode.story}]") &&
          walkLib("app").concat(walkLib("lib")).every((f) => !read(f).includes("이 노드 지우기")),
        walkLib("app").concat(walkLib("lib")).filter((f) => read(f).includes("이 노드 지우기")));
      check("⑬ 화면 — ?area= 처음 한 번 그 영역 · ?edit=1 사람 패널 고치기로 시작 · 사람 [이름·정보 고치기]·장소·모임 [이름 고치기] · 사람도 [이 분 지우기] · 지우기 = deletePersonNode",
        view13.includes('const a = searchParams.get("area");') && view13.includes('searchParams.get("edit") === "1"') && view13.includes("startEdit={panel === editKey}") &&
          edit13.includes('useState<Mode>(startEdit ? { t: "editInfo" } : startPick ? { t: "pick", what: "putIn" } : { t: "view" })') && edit13.includes("{person ? E.editInfo : place || group ? E.editName : X.rename}") &&
          edit13.includes("!!story || !!person || !!place") && edit13.includes("im.personBody && <p className=\"text-lg text-ink\">{E.deletePersonBody}") &&
          act13.includes("return deleteNode(userId, r);") && read("lib/my-life-edit.ts").includes('if (r.type === "PERSON") return deletePersonNode(userId, r.id);') && act13.includes("export async function updatePersonInfoAction(") && act13.includes("export async function renameNodeAction("));
      const revalidated = ["app/actions/episode.ts", "app/actions/free-chat.ts", "app/actions/node-body.ts", "app/interview/actions.ts"].filter((f) => read(f).includes('revalidatePath("/people/[personId]"'));
      check("⑬ V3 액션의 /people 상세 무효화 삭제(V2 경로 draft-actions·/people 액션은 그대로)",
        revalidated.length === 0 && read("app/life-timeline/manage/draft-actions.ts").includes('revalidatePath("/people")'), revalidated);
      const copy13 = read("lib/my-life-copy.ts");
      check("⑬ 문구 12키 확정(2026-11-06) — 값 그대로 · linkPeriods = \"시기 N개\" · 두 묶음 주석 = 확정(임시 표시 없음)",
        C13.panelBirthYear === "태어난 해" && C13.panelMemo === "메모" && E.linkPeriods(2) === "시기 2개" && E.linkGroups(1) === "모임 1개" &&
          E.deletePersonBody === "이 분에 대해 적은 글도 함께 지워져요." && E.editInfo === "이름·정보 고치기" && E.editName === "이름 고치기" &&
          E.fieldBirthYear === "태어난 해 (선택)" && E.fieldMetYear === "처음 만난 해 (선택)" && E.fieldMemo === "메모 (선택)" && E.saveInfo === "저장" && E.infoSaved === "고쳤어요." &&
          copy13.includes("// 인물록 통합(2026-11-06) — 사람 패널, 값이 있을 때만 — 확정(성민 2026-11-06)") && copy13.includes("// — 아래 10키 확정(성민 2026-11-06") &&
          !/인물록 통합[^\n]*\[임시/.test(copy13));
      check("⑬ 사용법 챗 — 인물록·장소록 = My Life 지도 안", read("app/api/tutorial-chat/route.ts").includes("- 인물록·장소록: My Life 지도 안에 있음."));
    }
    // ── ⑭ 사용자 카테고리 지도(custom-graph 2단계 — docs/phase/custom-graph.md §3·§6.6) — 만들기·넣기·빼기·잇기·옮기기·이름·지우기·글 · 남의 노드 거부 · 정합 점검 ─────
    {
      const okId = <T extends { ok: boolean }>(r: T, k: "id" | "personId"): string => (r.ok ? ((r as unknown as Record<string, string>)[k] ?? "") : "");
      const momC = okId(await createPersonNode(a, { name: "[fixture] 카테고리 어머니", relation: "어머니" }), "personId");
      const mateC = okId(await createPersonNode(a, { name: "[fixture] 산책 짝꿍", relation: "친구" }), "personId");
      const stC = await createStoryNode(a, { lifeEventId: job, kind: "STORY", title: "", content: "[fixture] 강아지와 뒷산을 걸었다.", personIds: [] });
      const stCId = stC.ok ? stC.episodeId : "";
      const cat = await createCategoryNode(a, " [fixture]  반려동물 ");
      const hob = await createCategoryNode(a, "[fixture] 취미");
      const catId = cat.ok ? cat.id : "";
      const hobId = hob.ok ? hob.id : "";
      check("⑭ 카테고리 만들기 — 이름 공백 정리 · 빈 이름·31자 거부(문구)",
        cat.ok && (await prisma.customNode.findUnique({ where: { id: catId }, select: { name: true, kind: true } }))?.name === "[fixture] 반려동물" &&
          JSON.stringify([await createCategoryNode(a, " "), await createCategoryNode(a, "가".repeat(31))].map((r) => (r.ok ? "ok" : r.error))) === JSON.stringify([E.needName, E.tooLong(30)]));
      // 같은 이름 안내(Q98) — 6종과 같은 이름이면 만들지 않고 되묻기 · decision "new" 면 만듦
      const ask = await createCustomChild(a, { kind: "ITEM", name: "[fixture] 산책  짝꿍", categoryId: catId });
      const askNodes = !ask.ok && "askSame" in ask ? ask.askSame : [];
      const before = await prisma.customNode.count({ where: { userId: a, parentId: catId } });
      const forced = await createCustomChild(a, { kind: "ITEM", name: "[fixture] 산책 짝꿍", categoryId: catId, decision: "new" });
      check("⑭ 같은 이름 안내 — 사람과 같은 이름(공백 무시) = 되묻기(그 사람) · 만든 것 0 · [새 항목으로 만들기] = 만듦",
        askNodes.some((n) => n.type === "PERSON" && n.id === mateC) && before === 0 && forced.ok, { askNodes, forced });
      const dog = await createCustomChild(a, { kind: "ITEM", name: "[fixture] 초롱이", categoryId: catId });
      const grp = await createCustomChild(a, { kind: "GROUP", name: "[fixture] 산책 친구", categoryId: catId });
      const fish = await createCustomChild(a, { kind: "ITEM", name: "[fixture] 낚시", categoryId: hobId });
      const dogId = dog.ok ? dog.id : "";
      const grpId = grp.ok ? grp.id : "";
      const fishId = fish.ok ? fish.id : "";
      const C_ = (id: string): NodeRef => ({ type: "CUSTOM", id });
      // 넣기·잇기 — 입구 addLink(saveNodeLink): 6종·다른 카테고리 항목 → 카테고리 MEMBER · 항목·사람 → 묶음 MEMBER · 항목 ↔ 이야기 = 관련("")
      const puts = [
        await addLink(a, { type: "PERSON", id: momC }, C_(catId)),
        await addLink(a, C_(fishId), C_(catId)),
        await addLink(a, C_(dogId), C_(grpId)),
        await addLink(a, { type: "PERSON", id: mateC }, C_(grpId)),
        await addLink(a, { type: "EPISODE", id: stCId }, C_(dogId)),
      ];
      const role = async (x: NodeRef, y: NodeRef) =>
        (await prisma.nodeLink.findFirst({ where: { userId: a, OR: [{ fromType: x.type, fromId: x.id, toType: y.type, toId: y.id }, { fromType: y.type, fromId: y.id, toType: x.type, toId: x.id }] }, select: { role: true } }))?.role ?? null;
      check("⑭ 넣기 MEMBER 4 · 잇기 관련 1(역할은 saveNodeLink 가 종류로) · 다시 넣기 = 새로 0 · 자기 카테고리에 넣기·묶음끼리 거부",
        puts.every((r) => r.ok && r.created.length === 1) &&
          (await role({ type: "PERSON", id: momC }, C_(catId))) === "MEMBER" && (await role(C_(fishId), C_(catId))) === "MEMBER" && (await role(C_(dogId), C_(grpId))) === "MEMBER" &&
          (await role({ type: "EPISODE", id: stCId }, C_(dogId))) === "" &&
          (await addLink(a, { type: "PERSON", id: momC }, C_(catId))).ok && ((await addLink(a, { type: "PERSON", id: momC }, C_(catId))) as { created: unknown[] }).created.length === 0 &&
          !(await addLink(a, C_(dogId), C_(catId))).ok && !(await addLink(a, C_(grpId), C_(grpId))).ok,
        puts.map((r) => (r.ok ? r.created.length : r.error)));
      // 화면 데이터
      const d14 = await getMyLifeData(a);
      const cu = d14.custom!;
      const catD = cu.categories.find((c) => c.id === catId)!;
      const grpD = cu.groups.find((g) => g.id === grpId)!;
      const dogD = cu.items.find((i) => i.id === dogId)!;
      const entries = categoryEntries(catD, cu);
      check("⑭ 화면 데이터 — 카테고리 refs(어머니·낚시) · 묶음 memberRefs(초롱이·짝꿍) · 초롱이 related(이야기) · 칸 = 항목 2(초롱이·새 항목) + 바로가기 3(어머니·낚시·짝꿍)",
        catD.refs.some((r) => r.type === "PERSON" && r.id === momC) && catD.refs.some((r) => r.type === "CUSTOM" && r.id === fishId) &&
          grpD.memberRefs.length === 2 && dogD.related.some((r) => r.type === "EPISODE" && r.id === stCId) &&
          entries.filter((e) => e.itemId).length === 2 && entries.filter((e) => e.ref).length === 3 && entries.find((e) => e.itemId === dogId)?.groupIds[0] === grpId,
        entries.map((e) => e.key));
      // 바로가기 빼기 — 카테고리와 그 안 묶음 모두 · 되돌리기
      await addLink(a, { type: "PERSON", id: momC }, C_(grpId));
      const out = await takeOutOfCategory(a, catId, { type: "PERSON", id: momC });
      const momLinks = () => prisma.nodeLink.count({ where: { userId: a, fromType: "PERSON", fromId: momC, toType: "CUSTOM" } });
      const left = await momLinks();
      const und = out.ok ? await undoRemove(a, out.undo) : null;
      check("⑭ [이 카테고리에서 빼기] — 카테고리·묶음 넣기 2행 지움(사람은 그대로) · [되돌리기] 2행 다시 · 없는 것 빼기 = 찾을 수 없음",
        out.ok && out.removed === 2 && left === 0 && (await prisma.person.count({ where: { id: momC } })) === 1 && !!und?.ok && (await momLinks()) === 2 &&
          !(await takeOutOfCategory(a, catId, { type: "PLACE", id: placeB })).ok, { out, left });
      // 옮기기 + 되돌리기(묶음 소속은 그대로 — 다른 카테고리 묶음에도 들 수 있음)
      const mv = await moveCustom(a, dogId, hobId);
      const parentAfter = (await prisma.customNode.findUnique({ where: { id: dogId }, select: { parentId: true } }))?.parentId;
      const back = mv.ok && mv.undo ? await moveCustom(a, mv.undo.nodeId, mv.undo.categoryId) : null;
      check("⑭ 다른 카테고리로 옮기기 — 자리 바뀜 · 묶음 넣기 그대로 · [되돌리기] = 원래 카테고리 · 기본 카테고리·묶음으로는 거부",
        mv.ok && parentAfter === hobId && (await role(C_(dogId), C_(grpId))) === "MEMBER" && !!back?.ok &&
          (await prisma.customNode.findUnique({ where: { id: dogId }, select: { parentId: true } }))?.parentId === catId && !(await moveCustom(a, dogId, grpId)).ok);
      // 이름 — 카테고리·묶음·항목 · 기본 카테고리 표시 이름
      const rn = [await renameNode(a, C_(dogId), "[fixture] 초롱이(진돗개)"), await renameNode(a, C_(grpId), "[fixture] 산책 모임"), await renameNode(a, C_(catId), "[fixture] 우리 강아지")];
      const bn = await renameBuiltin(a, "PEOPLE", "[fixture] 우리 가족");
      const d14b = await getMyLifeData(a);
      check("⑭ 이름 바꾸기 — 항목·묶음·카테고리 · 기본 카테고리(인물록 → 표시 이름, 화면 데이터 builtinNames) · 31자 거부",
        rn.every((r) => r.ok) && bn.ok && d14b.custom!.builtinNames.PEOPLE === "[fixture] 우리 가족" && d14b.custom!.items.find((i) => i.id === dogId)?.name === "[fixture] 초롱이(진돗개)" &&
          !(await renameNode(a, C_(dogId), "가".repeat(31))).ok && !(await renameBuiltin(a, "PEOPLE", " ")).ok);
      // 항목 글(Q78 — NodeBody CUSTOM, 인물 글과 같은 길)
      const ib = await saveItemBody(a, dogId, { v: 1, blocks: [{ type: "paragraph", text: "[fixture] 진돗개, 2010년에 데려왔다." }] }, 0);
      const ibView = await getItemBody(a, dogId);
      check("⑭ 항목 글 — 저장(버전 1) · 화면 데이터 첫 줄 · 카테고리·묶음에는 글 없음 · 남의 항목 = 찾을 수 없음",
        ib.ok && ibView?.version === 1 && (await getMyLifeData(a)).custom!.items.find((i) => i.id === dogId)?.body.includes("진돗개") === true &&
          (await getItemBody(a, catId)) === null && !(await saveItemBody(a, grpId, { v: 1, blocks: [] }, 0)).ok && (await getItemBody(b, dogId)) === null);
      // 지우기 확인 수
      const imCat = await deleteImpact(a, C_(catId));
      const imGrp = await deleteImpact(a, C_(grpId));
      const imDog = await deleteImpact(a, C_(dogId));
      check("⑭ 지우기 확인 — 카테고리(함께 지워지는 항목·묶음 3 · 빠지기만 하는 것: 어머니·낚시·짝꿍 3) · 묶음(안의 3) · 항목(이어진 2 · 글 있음)",
        imCat?.customKind === "CATEGORY" && imCat.customDeleted === 3 && imCat.customOut === 3 && imGrp?.customKind === "GROUP" && imGrp.customOut === 3 &&
          imDog?.customKind === "ITEM" && imDog.customLinks === 2 && imDog.personBody === true,
        { imCat, imGrp, imDog });
      // 남의 노드 거부 — b 는 a 의 카테고리·묶음·항목을 고치거나 지우거나 넣거나 뺄 수 없음
      const foreign = [
        await renameNode(b, C_(catId), "[fixture] 남이 고침"),
        await moveCustom(b, dogId, hobId),
        await deleteCustom(b, catId),
        await takeOutOfCategory(b, catId, { type: "PERSON", id: momC }),
        await addLink(b, { type: "PLACE", id: placeB }, C_(catId)),
        await createCustomChild(b, { kind: "ITEM", name: "[fixture] 남의 항목", categoryId: catId, decision: "new" }),
      ];
      const bOwnBuiltin = await renameBuiltin(b, "PEOPLE", "[fixture] B 의 이름");
      check("⑭ 남의 노드 거부 — 이름·옮기기·지우기·빼기·넣기·그 카테고리에 만들기 = 실패(찾을 수 없음) · 확인창 수 = 없음 · 기본 카테고리 이름은 자기 것만",
        foreign.every((r) => !r.ok) && (await deleteImpact(b, C_(catId))) === null && bOwnBuiltin.ok &&
          (await getMyLifeData(a)).custom!.builtinNames.PEOPLE === "[fixture] 우리 가족" && (await prisma.customNode.count({ where: { id: catId } })) === 1 &&
          (await prisma.customNode.findUnique({ where: { id: catId }, select: { name: true } }))?.name === "[fixture] 우리 강아지",
        foreign.map((r) => (r.ok ? "ok" : "error" in r ? r.error : "ask")));
      // 정합 점검 — 사용자 노드 연결·본문이 끝 없음·노드 없음에 안 잡히고 점검 14 = 0
      const iss = await countNodeGraphIssues({ userId: a });
      check("⑭ 정합 점검 — 점검 14(사용자 노드) 전부 0 · 끝 없는 연결 0 · 노드 없는 본문 0", Object.values(iss.custom).every((v) => v === 0) && iss.danglingLinks === 0 && iss.bodyMissingNode === 0, iss);
      // 카테고리 지우기 — 자기 항목·묶음만(Cascade), 넣어 둔 사람·다른 카테고리 항목은 남고 연결만 정리
      const del = await deleteCustom(a, catId);
      const touching = await prisma.nodeLink.count({ where: { userId: a, OR: [{ toId: { in: [catId, grpId, dogId] } }, { fromId: { in: [catId, grpId, dogId] } }] } });
      check("⑭ 카테고리 지우기 — 자기 항목·묶음 지워짐 · 어머니·짝꿍·낚시(취미)·이야기 남음 · 연결·항목 글 정리 · 기본 카테고리는 못 지움",
        del.ok && (await prisma.customNode.count({ where: { id: { in: [catId, grpId, dogId] } } })) === 0 && touching === 0 &&
          (await prisma.person.count({ where: { id: { in: [momC, mateC] } } })) === 2 && (await prisma.customNode.count({ where: { id: fishId } })) === 1 &&
          (await prisma.episode.count({ where: { id: stCId } })) === 1 && (await prisma.nodeBody.count({ where: { nodeType: "CUSTOM", nodeId: dogId } })) === 0 &&
          !(await deleteCustom(a, (await prisma.customNode.findFirstOrThrow({ where: { userId: a, builtin: "PEOPLE" }, select: { id: true } })).id)).ok);
      const iss2 = await countNodeGraphIssues({ userId: a });
      check("⑭ 지운 뒤 정합 점검 14 = 0", Object.values(iss2.custom).every((v) => v === 0) && iss2.danglingLinks === 0, iss2.custom);
      // 정적 — 화면 입구
      const act14 = read("app/my-life/actions.ts");
      const edit14 = read("app/my-life/EditUI.tsx");
      check("⑭ 화면 입구 — 만들기 3종(카테고리·항목·묶음)·기본 카테고리 이름·옮기기·카테고리에서 빼기 액션(첫 줄 auth) · 패널 넣기·잇기·묶음에·다른 카테고리에 고르기 · 항목 글 화면",
        act14.includes('case "category": {') && act14.includes('case "customGroup": {') && act14.includes("export async function renameBuiltinAction(") && act14.includes("export async function moveCustomAction(") &&
          act14.includes("export async function takeOutAction(") && edit14.includes("function customCandidates(") && edit14.includes('{ what: "putIn", label: X.putIn }') &&
          fs.existsSync(path.join(ROOT, "app/my-life/item/[id]/edit/page.tsx")) && read("app/my-life/item/[id]/edit/page.tsx").includes("getItemBody(userId, id)"));
    }
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_C, EMAIL_D] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  process.exit(1);
});
