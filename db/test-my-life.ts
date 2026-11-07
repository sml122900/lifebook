// My Life 지도 회귀 — 데이터·배치·간선·검색. docs/phase/my-life-restructure.md §1·§5(개편 1단계) ·
// node-graph-self.md §6 2b.1·2b-3a 수정. LLM 0.
//
//   ① 포함 규칙(getMyLifeData) — 확정 중심만·sequenceOrder 순·연도 없는 중심 · 이야기 주 소속 + 추가 소속 · 작은 물방울
//      (대상 인물·확정 연결·입구로 넣은 장소 — 확인 대기 연결·장소 노드 없는 장소 행은 안 보임) · 인물록 = 확정 인물 전부(연결 없는 분 포함,
//      초안은 빠짐) · 모임과 구성원 · 장소록 = 사용자 장소 전부 · 중심 직접 연결(간선용) · 남의 데이터 0
//   ② Prisma 호출 수 고정 — 기록을 크게 늘려도 같은 수
//   ③ 배치 — 오른쪽 가지 없음 · 시간 줄기(x ≤ 420)와 인물록·장소록(x ≥ 520) 분리 · 노드 교차 0 · 중심 노드 전부 같은 크기 ·
//      모임 영역 소속(각 노드가 자기 모임 영역 안·다른 모임 영역 밖, 빈 모임 영역) · 합성 데이터 모임 0~5 × 둥근 사각·원 ·
//      4개 이상이면 3개만 영역 + 칩 · 같은 입력 같은 출력 · 접힘 · 10년 표지 · 정상 배치 해소 0회 · 일부러 겹친 배치 해소
//   ④ 간선 — 이야기·중심·인물·장소·모임 선택별 간선과 연결 노드 · 종류 끄기 · 접힌 띠 이야기 빠짐 · 곡선이 중심 노드를 안 지남
//   ⑤ 검색 — 띄어쓰기 무시·이름 > 본문 순서·본문 앞뒤 조각·걸친 이야기 한 번·빈 질의
//   ⑥ 순수 함수 — 작은 물방울 줄 나누기·본문 첫 문장·지금 보는 곳·노드 수
//   ⑦ 3단계 — 장소 묶음(데이터·배치·간선·검색) · 영역 제목 옆 [+ 사람][+ 모임]/[+ 장소][+ 묶음] 자리
//   ⑧ 2026-11-02 E2E 재검증 — 시기 노드 사람·장소 수(버튼 이름·패널 같은 함수, 이야기로만 이은 곳 포함) · 제목 없는 이야기 패널
//   ⑨ 2026-11-02 3단계 E2E — 연결 수·차례로 보기(시기 수와 같은 기준) · 지도 이동 요청 한 번만·패널 작업 뒤 지도 유지 · 한 번 탭 = 패널
//   ⑩ 2026-11-02 3단계 E2E 후속 2 — 지도 위 떠 있던 가장자리 버튼을 도구줄(이동 줄)·머리 줄(연결된 곳)로
//   ⑪ 2026-11-02 3단계 최종 E2E — 차례 보기 [다음 연결](연결 n/N, 마지막 다음 = 처음으로) · 시기 패널 사람·장소 목록 = 수와 같은 기준(이야기에 나온 곳 포함)
//   ⑫ 2026-11-02 Q69 — /story-review 합치기: redirect·archived · 앱 안 링크 0 · 사이드 패널 · 목록 보기 카드 자리·그때의 나 = 시기 아래 꼬리표로만 ·
//      지도 [이야기 거리] 시트 · 이야기 패널 [이야기 고치기] · 인물 확인 화면 삭제(2026-11-03 — 파일 없음·주소 → /my-life·링크 0)
//
// 자체 픽스처 계정 2개만 만들고 지운다(test30·실고객 접촉 0).
// 실행: npx tsx db/test-my-life.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge } from "../lib/episode";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { getMyLifeData, type MyLifeData, type MyLifeEvent, type MyLifePerson } from "../lib/my-life";
import type { MyLifeCustom, MyLifeRef } from "../lib/my-life-custom";
import { edgeSamples, selectionEdges } from "../lib/my-life-edges";
import { MY_LIFE_COPY as C } from "../lib/my-life-copy";
import { rectInsideShape, rectOutsideShape, type GroupShapeKind } from "../lib/my-life-group-shape";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  categoryEntries,
  eventPeoplePlaceList,
  eventPeoplePlaceRefs,
  eventPeoplePlaces,
  countMapNodes,
  countTimelineNodes,
  eventSatRefs,
  findOverlaps,
  layoutMyLife,
  orbitCount,
  periodPlanetD,
  resolveOverlaps,
  satelliteSlots,
  storySatRefs,
  yearText,
  type LayoutNode,
  type MyLifeLayout,
} from "../lib/my-life-layout";
import { normalizeForSearch, searchMyLife } from "../lib/my-life-search";
import {
  LABEL_GAP,
  LABEL_H,
  LABEL_W,
  ORBIT_CYCLE_MS,
  ORBIT_PERIOD_MS,
  ORBIT_REVS,
  ORBIT_STEPS,
  SAT_R,
  labelKeyframes,
  labelVisible,
  orbitAssign,
  orbitCss,
  orbitDelayMs,
  orbitFrac,
  orbitKeyframes,
  orbitPoint,
  orbitProgressAt,
  orbitShape,
} from "../lib/space-orbit";
import { DRAG_SLOP, DROP_RANGE, EDGE_ARM, LONG_PRESS_MS, isAndroid, pickDropTarget, spiralPath, wobbleScales } from "../lib/space-drag";
import { applyOptDecor, applyOptLinks, decorOf, hasLink, putOptDecor, putOptLink, settleOptDecor, settleOptLinks, type OptDecor, type OptLink } from "../lib/my-life-optimistic";
import { DECOR_SHAPES, decorName, isDecorShape } from "../lib/space-decor";
import { withJosa } from "../lib/josa";
import { saveNodeLink } from "../lib/node-graph";
import fs from "node:fs";
import path from "node:path";

import { hasOwnTitle, storyLead } from "../lib/story-title";
import {
  ASK_HINT,
  closeTourId,
  DRAG_FAILS_FOR_BUTTON,
  initialTutorial,
  shouldOffer,
  showButtonAdd,
  TUTORIAL_DONE,
  TUTORIAL_HREF,
  TUTORIAL_LATER,
  TUTORIAL_SKIP,
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  tutorialReducer,
} from "../lib/tutorial";
import { PRACTICE_STORY_KEY, practiceData } from "../lib/tutorial-practice";

const EMAIL_A = "fixture-mylife-a@lifebook.invalid";
const EMAIL_B = "fixture-mylife-b@lifebook.invalid";

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function makeUser(email: string, name: string): Promise<string> {
  const now = new Date();
  const u = await prisma.user.create({
    data: {
      email, name, birthYear: 1958, onboardingTrack: "V3",
      termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: u.id, birthYear: 1958, region: "부산", skeletonGeneratedAt: now } });
  return u.id;
}

async function makeEvent(userId: string, type: LifeEventType, label: string, year: number | null, sequenceOrder: number) {
  const e = await prisma.lifeEvent.create({
    data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder, personAsked: true },
    select: { id: true },
  });
  return e.id;
}

async function makePerson(userId: string, name: string, opts: { relation?: string; lifeEventId?: string; isDraft?: boolean; companion?: string } = {}) {
  const p = await prisma.person.create({
    data: { userId, name, relation: opts.relation ?? null, isDraft: opts.isDraft ?? false, companionSessionId: opts.companion ?? null },
    select: { id: true },
  });
  if (opts.lifeEventId) await prisma.personLifeEvent.create({ data: { personId: p.id, lifeEventId: opts.lifeEventId, userId } });
  return p.id;
}

async function makeStory(userId: string, lifeEventId: string, label: string, content: string, personId?: string) {
  const r = await createEpisodeBridge(userId, lifeEventId, label, null, content, `[본인] ${content}`, personId);
  if (!r) throw new Error("createEpisodeBridge 실패");
  return r;
}

const nodeMap = (lay: MyLifeLayout) => new Map<string, LayoutNode>(lay.nodes.map((n) => [n.key, n]));
type PersonNode = Extract<LayoutNode, { kind: "person" }>;
const insideCenter = (p: { x: number; y: number }, c: LayoutNode) => p.x > c.x + 1 && p.x < c.x + c.w - 1 && p.y > c.y + 1 && p.y < c.y + c.h - 1;

// 모임 영역 소속 검사 — 영역에 보이는 모임 중 그 사람이 속한 영역 안에만, 나머지 영역 밖에.
// 인물 = 모임 영역, 장소 = 장소 묶음 영역(3단계). 다른 영역의 도형과는 언제나 밖.
function membershipErrors(data: MyLifeData, lay: MyLifeLayout): string[] {
  const errs: string[] = [];
  const personById = new Map(data.people.map((p) => [p.id, p]));
  const placeById = new Map(data.places.map((p) => [p.id, p]));
  for (const n of lay.nodes) {
    if (n.kind !== "person" && n.kind !== "place") continue;
    const name = n.kind === "person" ? personById.get(n.personId)!.name : placeById.get(n.placeId)!.name;
    for (const s of lay.shapes) {
      const member =
        n.kind === "person"
          ? s.region === "people" && personById.get(n.personId)!.groupIds.includes(s.groupId)
          : s.region === "places" && placeById.get(n.placeId)!.groupIds.includes(s.groupId);
      if (member ? !rectInsideShape(s, n) : !rectOutsideShape(s, n)) errs.push(`${name}:${s.groupId}:${member ? "밖에있음" : "안에있음"}`);
    }
  }
  return errs;
}

// 간선 곡선이 (출발 노드가 아닌) 중심 노드 안을 지나는지.
function edgesHittingCenters(data: MyLifeData, lay: MyLifeLayout, selections: string[]): string[] {
  const nm = nodeMap(lay);
  const centers = lay.nodes.filter((n) => n.kind === "event");
  const bad: string[] = [];
  for (const sel of selections) {
    for (const e of selectionEdges(data, lay, sel, { person: true, place: true }).edges) {
      const from = nm.get(e.from)!;
      const pts = edgeSamples(from, from.kind === "event" ? "event" : "story", nm.get(e.to)!);
      if (pts.some((p) => centers.some((c) => c.key !== e.from && insideCenter(p, c)))) bad.push(`${e.from}>${e.to}`);
    }
  }
  return bad;
}

// U1 위성·행성 자리 검사(ui-space §1.2·§1.3) — 행성 원·위성 칸이 자기 계 상자 안 · 같은 계 위성 칸끼리 안 겹침 ·
// 위성 원이 행성 원과 8px 이상 떨어짐 · 위성 원 가운데끼리 56px 이상(손가락 하나에 하나) · 키 하나씩.
function satErrors(lay: MyLifeLayout): string[] {
  const errs: string[] = [];
  const nm = nodeMap(lay);
  const inside = (r: { x: number; y: number; w: number; h: number }, n: LayoutNode) => r.x >= n.x && r.y >= n.y && r.x + r.w <= n.x + n.w && r.y + r.h <= n.y + n.h;
  for (const n of lay.nodes) {
    if (n.kind !== "event" && n.kind !== "story") continue;
    const p = n.planet;
    if (!inside({ x: p.cx - p.d / 2, y: p.cy - p.d / 2, w: p.d, h: p.d }, n)) errs.push(`${n.key}:행성밖`);
  }
  const byPlanet = new Map<string, MyLifeLayout["satellites"]>();
  for (const s of lay.satellites) byPlanet.set(s.planetKey, [...(byPlanet.get(s.planetKey) ?? []), s]);
  for (const [pk, sats] of byPlanet) {
    const n = nm.get(pk);
    if (!n || (n.kind !== "event" && n.kind !== "story")) {
      errs.push(`${pk}:주인없음`);
      continue;
    }
    if (findOverlaps(sats).length) errs.push(`${pk}:칸겹침`);
    for (const s of sats) {
      if (!inside(s, n)) errs.push(`${s.key}:상자밖`);
      if (Math.hypot(s.cx - n.planet.cx, s.cy - n.planet.cy) < n.planet.d / 2 + L.SAT_D / 2 + 8) errs.push(`${s.key}:행성에붙음`);
    }
    for (let i = 0; i < sats.length; i++) for (let j = i + 1; j < sats.length; j++) {
      if (Math.hypot(sats[i].cx - sats[j].cx, sats[i].cy - sats[j].cy) < 56) errs.push(`${sats[i].key}~${sats[j].key}:가까움`);
    }
    // U2 공전(ui-space §1.2·§1.4 ①②) — 위 칸 = 펼침 자리. 공전 자리 = 행성 가운데 + 궤도 점(36걸음), 원(반지름 24)·이름표(104×24, 원 아래 4)가 상자 안.
    for (const s of sats) {
      const sh = orbitShape(n.planet.d, s.orbit);
      if (sh.ry < n.planet.d / 2 + SAT_R + 8) errs.push(`${s.key}:궤도가원판에`);
      for (let k = 0; k < ORBIT_STEPS; k++) {
        const p = orbitPoint(sh, k / ORBIT_STEPS);
        const cx = n.planet.cx + p.x, cy = n.planet.cy + p.y;
        const box = { x: Math.min(cx - SAT_R, cx - LABEL_W / 2), y: cy - SAT_R, w: Math.max(2 * SAT_R, LABEL_W), h: 2 * SAT_R + LABEL_GAP + LABEL_H };
        if (!inside(box, n)) { errs.push(`${s.key}:공전${k}상자밖`); break; }
      }
    }
  }
  if (new Set(lay.satellites.map((s) => s.key)).size !== lay.satellites.length) errs.push("키중복");
  return errs;
}

// 합성 데이터 — 중심 N, 이야기 S, 인물 P, 모임 G(구성 무작위·여러 모임 소속 포함), 장소 Q. 결정적 의사난수.
function synthetic(o: { events: number; stories: number; people: number; groups: number; places: number; placeGroups?: number; seed?: number }): MyLifeData {
  let x = o.seed ?? 7;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const names = ["김민수", "박영수", "이순자", "정미숙", "한상철", "최영희", "강동원", "윤정아", "조성호", "임하늘", "송미란", "오세훈"];
  const people: MyLifePerson[] = Array.from({ length: o.people }, (_, i) => ({
    id: `p${i}`, name: `${names[i % names.length]}${i >= names.length ? i : ""}`, relation: null, metYear: null, birthYear: null, memo: null, groupIds: [], body: "",
  }));
  const groups = Array.from({ length: o.groups }, (_, g) => ({ id: `g${g}`, name: `모임${g}`, memberIds: [] as string[] }));
  for (const p of people) {
    for (const g of groups) {
      if (rnd() < 0.3) {
        p.groupIds.push(g.id);
        g.memberIds.push(p.id);
      }
    }
  }
  const places = Array.from({ length: o.places }, (_, i) => ({ id: `q${i}`, name: `장소${i}`, address: null, source: null, lat: null, lng: null, groupIds: [] as string[] }));
  const placeGroups = Array.from({ length: o.placeGroups ?? 0 }, (_, g) => ({ id: `pg${g}`, name: `묶음${g}`, memberIds: [] as string[] }));
  for (const q of places) {
    for (const g of placeGroups) {
      if (rnd() < 0.3) {
        q.groupIds.push(g.id);
        g.memberIds.push(q.id);
      }
    }
  }
  const events: MyLifeEvent[] = Array.from({ length: o.events }, (_, i) => ({
    id: `e${i}`, type: "CUSTOM", label: `시기 ${i}`, year: i % 7 === 3 ? null : 1950 + i * (rnd() < 0.2 ? 12 : 3), endYear: null, decor: null,
    stories: [], personIds: [], placeIds: [], groupIds: [],
  }));
  for (let k = 0; k < o.stories; k++) {
    const ev = events[Math.floor(rnd() * events.length)];
    const chips = [
      ...(people.length ? Array.from({ length: Math.floor(rnd() * 3) }, () => people[Math.floor(rnd() * people.length)]).map((p) => ({ kind: "person" as const, id: p.id, name: p.name })) : []),
      ...(places.length && rnd() < 0.4 ? [places[Math.floor(rnd() * places.length)]].map((q) => ({ kind: "place" as const, id: q.id, name: q.name })) : []),
    ].filter((c, i, arr) => arr.findIndex((d) => d.id === c.id) === i);
    ev.stories.push({ id: `s${k}`, kind: rnd() < 0.15 ? "SELF" : "STORY", title: null, content: "가".repeat(10 + Math.floor(rnd() * 80)) + ".", primaryEventId: ev.id, otherEventIds: [], subjectPersonId: null, chips, richBody: false, bodyVersion: 0, decor: null });
  }
  for (const ev of events) if (people.length && rnd() < 0.5) ev.personIds.push(people[Math.floor(rnd() * people.length)].id);
  for (const ev of events) if (places.length && rnd() < 0.3) ev.placeIds.push(places[Math.floor(rnd() * places.length)].id);
  return { events, people, groups, places, placeGroups };
}

async function main() {
  await removeFixtures();
  try {
    const a = await makeUser(EMAIL_A, "[fixture] My Life A");
    const b = await makeUser(EMAIL_B, "[fixture] My Life B");

    const birth = await makeEvent(a, "BIRTH", "출생", 1958, 0);
    const mil = await makeEvent(a, "MILITARY", "군 입대", 1978, 5); // 아래에서 미확정으로 — 지도에 안 나옴
    const hs = await makeEvent(a, "HIGH_SCHOOL", "고등학교 입학", 1974, 3);
    const job = await makeEvent(a, "FIRST_JOB", "첫 직장", null, 7); // 연도 없는 확정 중심

    const mom = await makePerson(a, "[fixture] 어머니", { relation: "어머니", lifeEventId: birth });
    const mate = await makePerson(a, "[fixture] 짝꿍", { relation: "고교 친구", lifeEventId: hs });
    const teacher = await makePerson(a, "[fixture] 담임", { relation: "선생님", lifeEventId: hs });
    const leader = await makePerson(a, "[fixture] 반장", { relation: "고교 친구", lifeEventId: hs });
    const lonely = await makePerson(a, "[fixture] 가나다 이웃", { relation: "이웃" }); // 연결 없는 분 — 인물록에는 나와야 함
    const draft = await makePerson(a, "[fixture] 확인 대기 분", { isDraft: true });
    const session = await prisma.companionSession.create({ data: { userId: a, audioPaths: [] }, select: { id: true } });
    const compDraft = await makePerson(a, "[fixture] 말동무 초안", { isDraft: true, companion: session.id }); // 안 나와야 함
    const choir = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 합창부" }, select: { id: true } })).id;
    const alumni = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 동창회" }, select: { id: true } })).id;
    const hiking = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 등산회" }, select: { id: true } })).id; // 빈 모임
    for (const [g, p] of [[choir, mate], [choir, leader], [alumni, mate]] as const) await prisma.personGroupMember.create({ data: { groupId: g, personId: p, userId: a } });
    const place1 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 외가", source: "naver" }, select: { id: true } })).id;
    const place2 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 학교 강당" }, select: { id: true } })).id;
    const place3 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 가보고 싶은 곳" }, select: { id: true } })).id; // 연결 없음

    const s1 = await makeStory(a, birth, "출생", "외가에서 태어났다고 들었다. 어머니가 늘 그 이야기를 하셨다.", mom);
    await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PERSON", id: mate });
    await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PERSON", id: draft }, { status: "PROPOSED", source: "AI" });
    await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PLACE", id: place1 });
    // 장소 노드 없는 장소 행(정합 점검 13 대상 — 만드는 경로 0, 2026-11-03 이름만 남은 장소 예외 제거) — 지도에 안 보여야 함.
    await prisma.memoryPlace.create({ data: { memoryId: s1.memoryId, placeName: "[fixture] 옛 동네", sortOrder: 5 } });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "EPISODE", id: s1.episodeId });
    await makeStory(a, hs, "고등학교 입학", "합창부에서 처음 솔로를 맡았다.");
    const self = await makeStory(a, hs, "고등학교 입학", "반장 앞에서는 괜히 말수가 줄었다.");
    await prisma.episode.update({ where: { id: self.episodeId }, data: { kind: "SELF" } });
    await saveNodeLink(a, { type: "EPISODE", id: self.episodeId }, { type: "PERSON", id: leader });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PERSON_GROUP", id: choir });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PLACE", id: place2 });
    await makeStory(a, mil, "군 입대", "훈련소 첫날 밤.");
    await prisma.lifeEvent.update({ where: { id: mil }, data: { status: "UNCONFIRMED", confirmedAt: null } });
    const bEvent = await makeEvent(b, "BIRTH", "출생", 1960, 0);
    await makeStory(b, bEvent, "출생", "B 의 이야기.");
    await makePerson(b, "[fixture] B 인물", { lifeEventId: bEvent });
    await prisma.place.create({ data: { userId: b, name: "[fixture] B 장소" } });

    // ── ① 포함 규칙 ──────────────────────────────────────────────
    const d = await getMyLifeData(a);
    check("① 확정 중심만, sequenceOrder 순(출생 → 고등학교 → 첫 직장)", JSON.stringify(d.events.map((e) => e.id)) === JSON.stringify([birth, hs, job]));
    const [eb, eh, ej] = d.events;
    check("① 연도 없는 중심 — year null, 맨 뒤", ej.year === null && ej.stories.length === 0);
    check("① 걸친 이야기 — 출생(주 소속)·고등학교(추가 소속) 두 곳, otherEventIds 서로",
      eb.stories[0].id === s1.episodeId && eb.stories[0].otherEventIds.join() === hs && eh.stories.some((s) => s.id === s1.episodeId && s.otherEventIds.join() === birth));
    // 확인 대기(PROPOSED) 연결·그 초안 인물은 안 보임 — 그걸 확인하던 화면은 2026-11-03 삭제(설계 §15.6, 확정만 그림).
    check("① 작은 물방울 — 대상 인물·확정 연결·입구로 넣은 장소(확인 대기 연결·장소 노드 없는 장소 행은 안 보임)",
      JSON.stringify(eb.stories[0].chips.map((c) => [c.kind, c.name])) === JSON.stringify([
        ["person", "[fixture] 어머니"], ["person", "[fixture] 짝꿍"],
        ["place", "[fixture] 외가"],
      ]), eb.stories[0].chips);
    const pIds = d.people.map((p) => p.id);
    check("① 인물록 = 확정 인물 전부(연결 없는 분 포함), 초안(확인 대기·말동무) 제외",
      [mom, mate, teacher, leader, lonely].every((id) => pIds.includes(id)) && !pIds.includes(draft) && !pIds.includes(compDraft) && pIds.length === 5, d.people.map((p) => p.name));
    check("① 인물록 가나다순", JSON.stringify(d.people.map((p) => p.name)) === JSON.stringify([...d.people.map((p) => p.name)].sort((x, y) => x.localeCompare(y, "ko"))));
    check("① 모임 소속",
      JSON.stringify([...(d.people.find((p) => p.id === mate)?.groupIds ?? [])].sort()) === JSON.stringify([choir, alumni].sort()) && d.people.find((p) => p.id === lonely)?.groupIds.length === 0);
    check("① 모임 3개(빈 모임 포함)와 구성원", d.groups.length === 3 && d.groups.find((g) => g.id === hiking)?.memberIds.length === 0 &&
      JSON.stringify([...(d.groups.find((g) => g.id === choir)?.memberIds ?? [])].sort()) === JSON.stringify([mate, leader].sort()));
    check("① 장소록 = 사용자 장소 전부(연결 없는 곳 포함)", JSON.stringify(d.places.map((p) => p.id).sort()) === JSON.stringify([place1, place2, place3].sort()));
    check("① 중심 직접 연결 — 출생 사람 [어머니] · 고등학교 사람 [짝꿍·담임·반장]·장소 [강당]·모임 [합창부]",
      eb.personIds.join() === mom && JSON.stringify([...eh.personIds].sort()) === JSON.stringify([mate, teacher, leader].sort()) &&
        eh.placeIds.join() === place2 && eh.groupIds.join() === choir);
    const all = JSON.stringify(d);
    check("① 남의 데이터 0 · 미확정 중심 이야기 없음", !all.includes("B 의 이야기") && !all.includes("B 인물") && !all.includes("B 장소") && !all.includes("훈련소 첫날 밤"));

    // ── ② Prisma 호출 수 고정 ────────────────────────────────────
    let ops = 0;
    const counted = prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            ops += 1;
            return query(args);
          },
        },
      },
    }) as unknown as typeof prisma;
    await getMyLifeData(a, counted);
    const opsSmall = ops;
    for (let i = 0; i < 8; i++) {
      const st = await makeStory(a, hs, "고등학교 입학", `추가 이야기 ${i}.`);
      const pid = await makePerson(a, `[fixture] 추가 ${i}`, { lifeEventId: hs });
      await saveNodeLink(a, { type: "EPISODE", id: st.episodeId }, { type: "PERSON", id: pid });
      await saveNodeLink(a, { type: "EPISODE", id: st.episodeId }, { type: "PLACE", id: place2 });
    }
    ops = 0;
    const big = await getMyLifeData(a, counted);
    check("② Prisma 호출 수 = 10 고정(기록 8건·인물 8명·연결 16건 늘려도 — 3단계 장소 묶음 +1 · 2b-3c 노드 본문 +1 · U4 꾸미기 +1 · custom-graph 2단계 사용자 카테고리 +1, 같은 병렬 묶음)", opsSmall === 10 && ops === 10 && big.people.length === 13, { opsSmall, ops, people: big.people.length });

    // ── ③ 배치 ───────────────────────────────────────────────────
    const lay = layoutMyLife(d);
    const nm = nodeMap(lay);
    check("③ 노드 교차 0 · 세계 안 · 해소 0회", findOverlaps(lay.nodes).length === 0 && lay.shifted === 0 &&
      lay.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= lay.width && n.y + n.h <= lay.height), findOverlaps(lay.nodes));
    const timelineKinds = new Set(["event", "story", "fold", "gap"]);
    check("③ 시간 줄기(계 상자 x 56~416)와 인물록·장소록(x ≥ 480) 분리, 오른쪽 가지 없음",
      lay.nodes.filter((n) => timelineKinds.has(n.kind)).every((n) => n.x + n.w <= L.TIME_X + L.SYS_W) && L.TIME_X + L.SYS_W < L.REGION_X &&
        lay.nodes.filter((n) => !timelineKinds.has(n.kind)).every((n) => n.x >= L.REGION_X) &&
        lay.shapes.every((s) => s.x >= L.REGION_X) && !lay.nodes.some((n) => (n.kind as string) === "branch"));
    check("③ 인물 노드 5(초안 빠짐) · 장소 노드 3 · 모임 이름 3 · 칩 없음(3개 이하)",
      lay.nodes.filter((n) => n.kind === "person").length === 5 && lay.nodes.filter((n) => n.kind === "place").length === 3 &&
        lay.nodes.filter((n) => n.kind === "groupLabel").length === 3 && !lay.nodes.some((n) => n.kind === "groupChip"));
    check("③ 모임 소속 — 각 인물이 자기 모임 영역 안·다른 모임 영역 밖(짝꿍 = 합창부∩동창회, 반장 = 합창부만, 나머지 = 밖)", membershipErrors(d, lay).length === 0, membershipErrors(d, lay));
    const hikingShape = lay.shapes.find((s) => s.groupId === hiking);
    check("③ 빈 모임(등산회)도 영역이 보임·그 안에 사람 없음", !!hikingShape && lay.nodes.filter((n) => n.kind === "person").every((n) => rectOutsideShape(hikingShape!, n)));
    check("③ 인물록 제목 맨 위·장소록은 인물록 아래", lay.regions.places.y >= lay.regions.people.y + lay.regions.people.h + L.REGION_GAP - 1 && nm.get("title:people")!.y === L.TOP_PAD);
    // U1(ui-space Q105) — 시기 행성 = 이야기 수로 128·144·160, 이야기 행성 = 128, 계 상자 폭 360 고정.
    const ev3 = lay.nodes.filter((n): n is Extract<LayoutNode, { kind: "event" }> => n.kind === "event");
    const st3 = lay.nodes.filter((n): n is Extract<LayoutNode, { kind: "story" }> => n.kind === "story");
    check("③ 행성 크기 — 시기 = 이야기 수로(출생 1 → 128 · 고등학교 3 → 144 · 첫 직장 0 → 128), 이야기 = 128, 계 상자 폭 360",
      ev3.length === 3 && ev3.every((n) => n.w === L.SYS_W && n.planet.d === periodPlanetD(d.events.find((e) => e.id === n.eventId)!.stories.length)) &&
        JSON.stringify(ev3.map((n) => n.planet.d)) === JSON.stringify([128, 144, 128]) &&
        st3.length === 4 && st3.every((n) => n.w === L.SYS_W && n.planet.d === L.PLANET_STORY),
      ev3.map((n) => n.planet.d));
    check("③ 같은 입력 같은 출력", JSON.stringify(layoutMyLife(d)) === JSON.stringify(lay));
    check("③ 출생(1958)→고등학교(1974) 16년 표지", lay.nodes.some((n) => n.kind === "gap" && n.key === `gap:${hs}` && n.years === 16));
    const fl = layoutMyLife(d, { folded: new Set([hs]) });
    check("③ 접힌 띠 — 이야기 노드 없음·펼치기 버튼(이야기 수 3)", !fl.nodes.some((n) => n.kind === "story" && n.eventId === hs) &&
      fl.nodes.some((n) => n.kind === "fold" && n.eventId === hs && n.count === 3) && findOverlaps(fl.nodes).length === 0);
    // 겹침 해소는 시간 줄기에만 건다(layoutTimeline 안) — 인물록·장소록은 칸 격자·소속 검사로 따로 보장.
    const tl = lay.nodes.filter((n) => timelineKinds.has(n.kind));
    const broken = { ...lay, shifted: 0, nodes: tl.map((n) => (n.kind === "story" && n.eventId === hs ? { ...n, y: tl[0].y + 10, x: tl[0].x } : n)) };
    const fixedL = resolveOverlaps(broken);
    check("③ 겹침 해소 — 일부러 겹친 시간 줄기도 교차 0", findOverlaps(broken.nodes).length > 0 && findOverlaps(fixedL.nodes).length === 0 && fixedL.shifted > 0, { before: findOverlaps(broken.nodes).length, after: findOverlaps(fixedL.nodes).slice(0, 3), shifted: fixedL.shifted });

    for (const shapeKind of ["roundRect", "ellipse"] as GroupShapeKind[]) {
      for (const g of [0, 1, 2, 3, 4, 5]) {
        for (const [ppl, sts] of [[12, 23], [30, 60]] as const) {
          const syn = synthetic({ events: 11, stories: sts, people: ppl, groups: g, places: 14, seed: 3 + g });
          const ly = layoutMyLife(syn, { shapeKind });
          const shown = ly.shapes.length;
          const chips = ly.nodes.filter((n) => n.kind === "groupChip").length;
          const ok =
            findOverlaps(ly.nodes).length === 0 &&
            membershipErrors(syn, ly).length === 0 &&
            shown === Math.min(g, 3) &&
            chips === (g > 3 ? g : 0) &&
            ly.nodes.filter((n) => n.kind === "person").length === ppl &&
            ly.shifted === 0;
          check(`③ 합성 ${shapeKind} 모임 ${g}·인물 ${ppl}·이야기 ${sts} — 교차 0·소속 맞음·영역 ${Math.min(g, 3)}개${g > 3 ? `·칩 ${g}` : ""}·칸 사이 ${ly.cellGap}`, ok,
            { o: findOverlaps(ly.nodes).slice(0, 3), m: membershipErrors(syn, ly).slice(0, 3), shown, chips });
        }
      }
    }
    // 4개 이상 — 고른 모임이 영역에, 숨은 모임 수 표시.
    const syn5 = synthetic({ events: 6, stories: 20, people: 30, groups: 5, places: 3, seed: 11 });
    const ly5 = layoutMyLife(syn5, { shownGroupIds: ["g4", "g3"] });
    check("③ 모임 5개 — 고른 g4·g3 + 인원 많은 1개가 영역, 노드마다 숨은 모임 수", ly5.shownGroupIds.slice(0, 2).join() === "g4,g3" && ly5.shownGroupIds.length === 3 &&
      ly5.nodes.filter((n): n is PersonNode => n.kind === "person").every((n) => {
        const p = syn5.people.find((x) => x.id === n.personId)!;
        return n.hiddenGroups === p.groupIds.filter((gid) => !ly5.shownGroupIds.includes(gid)).length;
      }), ly5.shownGroupIds);

    // U1 위성 — 픽스처 · 합성(이야기 60·인물 30) · 위성 13·30개 계("+N" 칸 하나).
    const satB = lay.satellites.filter((s) => s.planetKey === `st:${birth}:${s1.episodeId}`);
    check("③ U1 위성 — 출생 이야기 = 작은 물방울 3개(어머니·짝꿍·외가) 자리 · 고등학교 시기 = 바로 이은 5개(사람 3·모임 1·장소 1)",
      JSON.stringify(satB.map((s) => s.ref?.id)) === JSON.stringify([mom, mate, place1]) &&
        lay.satellites.filter((s) => s.planetKey === `ev:${hs}`).length === 5 && satErrors(lay).length === 0, { satB: satB.map((s) => s.key), e: satErrors(lay) });
    const synS = synthetic({ events: 11, stories: 60, people: 30, groups: 3, places: 14, seed: 5 });
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "person" as const, id: `p${i % 30}x${i}`, name: `분${i}` }));
    synS.events[0].stories[0] = { ...synS.events[0].stories[0], chips: many(13) };
    synS.events[1].stories.push({ ...synS.events[0].stories[0], id: "s-big", primaryEventId: synS.events[1].id, chips: many(30) });
    const lyS = layoutMyLife(synS);
    const moreOf = (sid: string, eid: string) => lyS.satellites.filter((s) => s.planetKey === `st:${eid}:${sid}`);
    const m13 = moreOf(synS.events[0].stories[0].id, synS.events[0].id);
    const m30 = moreOf("s-big", synS.events[1].id);
    check("③ U1 위성 — 합성(이야기 60·인물 30·장소 14 + 위성 13·30개 계): 상자 안·칸 안 겹침·행성과 8px·서로 56px·키 하나씩 · 교차 0",
      satErrors(lyS).length === 0 && findOverlaps(lyS.nodes).length === 0 && lyS.shifted === 0, satErrors(lyS).slice(0, 5));
    check("③ U1 \"+N\" — 13개 = 11 + \"+2\" · 30개 = 11 + \"+19\"(마지막 칸)",
      m13.length === 12 && m13[11].ref === null && m13[11].more === 2 && m13[11].key.endsWith(":more") &&
        m30.length === 12 && m30[11].ref === null && m30[11].more === 19, { m13: m13.length, m30: m30.length });

    // ── ④ 간선 ───────────────────────────────────────────────────
    const on = { person: true, place: true };
    const keyS1 = `st:${birth}:${s1.episodeId}`;
    const e1 = selectionEdges(d, lay, keyS1, on);
    check("④ 이야기 선택 — 사람 2(어머니·짝꿍)·장소 1(외가) 간선, 장소 노드 없는 행·확인 대기 연결 빠짐",
      JSON.stringify(e1.edges.map((e) => e.to).sort()) === JSON.stringify([`pe:${mom}`, `pe:${mate}`, `pl:${place1}`].sort()) && e1.related.size === 3, e1.edges.map((e) => e.to));
    const e1p = selectionEdges(d, lay, keyS1, { person: false, place: true });
    check("④ 인물 간선 끄기 — 장소 간선만, 사람 연결 표시도 없음", e1p.edges.length === 1 && e1p.edges[0].kind === "place" && !e1p.related.has(`pe:${mom}`));
    const e2 = selectionEdges(d, lay, `pe:${mate}`, on);
    check("④ 인물 선택(짝꿍) — 걸친 이야기의 두 노드(출생·고등학교) + 고등학교 중심(직접 연결)",
      JSON.stringify(e2.edges.map((e) => e.from).sort()) === JSON.stringify([`st:${birth}:${s1.episodeId}`, `st:${hs}:${s1.episodeId}`, `ev:${hs}`].sort()), e2.edges.map((e) => e.from));
    const e3 = selectionEdges(d, lay, `ev:${hs}`, on);
    check("④ 중심 선택(고등학교) — 직접 연결 사람 3·장소 1 간선 + 모임(합창부) 연결 표시",
      e3.edges.filter((e) => e.kind === "person").length === 3 && e3.edges.filter((e) => e.kind === "place").length === 1 && e3.related.has(`gl:${choir}`));
    const e4 = selectionEdges(d, lay, `gl:${choir}`, on);
    check("④ 모임 선택 — 간선 없이 구성원 연결 표시", e4.edges.length === 0 && e4.related.has(`pe:${mate}`) && e4.related.has(`pe:${leader}`) && e4.related.size === 2);
    const e5 = selectionEdges(d, fl, `pe:${mate}`, on);
    check("④ 접힌 띠의 이야기 간선은 빠짐", !e5.edges.some((e) => e.from === `st:${hs}:${s1.episodeId}`) && e5.edges.some((e) => e.from === `st:${birth}:${s1.episodeId}`));
    const synE = synthetic({ events: 11, stories: 60, people: 30, groups: 3, places: 14, seed: 5 });
    const lyE = layoutMyLife(synE);
    const bad = [
      ...edgesHittingCenters(d, lay, [keyS1, `pe:${mate}`, `ev:${hs}`, `pl:${place2}`]),
      ...edgesHittingCenters(synE, lyE, lyE.nodes.filter((n) => n.kind === "person" || n.kind === "place" || n.kind === "event").map((n) => n.key)),
    ];
    check("④ 간선 곡선이 중심 노드를 지나지 않음(픽스처 + 합성 이야기 60·인물 30·장소 14 전부)", bad.length === 0, bad.slice(0, 5));

    // ── ⑤ 검색 ───────────────────────────────────────────────────
    check("⑤ 정규화 — 공백·대소문자 무시", normalizeForSearch(" 김 민 수 ") === "김민수" && normalizeForSearch("AbC") === "abc");
    const r1 = searchMyLife(d, "짝 꿍");
    check("⑤ 띄어쓰기 무시 — '짝 꿍' → 인물 짝꿍", r1.some((r) => r.kind === "person" && r.key === `pe:${mate}`));
    const r2 = searchMyLife(d, "외가");
    check("⑤ 이름 일치(장소 외가)가 본문 일치(출생 이야기)보다 앞, 본문은 앞뒤 조각", r2[0]?.key === `pl:${place1}` &&
      r2.some((r) => r.kind === "story" && r.snippet?.match === "외가" && r.key === `st:${birth}:${s1.episodeId}`), r2);
    const r3 = searchMyLife(d, "태어났다");
    check("⑤ 걸친 이야기는 주 소속 쪽 한 번만", r3.filter((r) => r.kind === "story").length === 1 && r3[0].eventId === birth);
    check("⑤ 빈 질의·공백만 = 결과 0", searchMyLife(d, "").length === 0 && searchMyLife(d, "   ").length === 0);
    check("⑤ 모임·중심 이름", searchMyLife(d, "동창").some((r) => r.key === `gl:${alumni}`) && searchMyLife(d, "고등학교").some((r) => r.key === `ev:${hs}`));
    const syn60 = synthetic({ events: 11, stories: 60, people: 30, groups: 0, places: 14 });
    check("⑤ 결과 최대 30", searchMyLife(syn60, "가").length === 30);

    // ── ⑥ 순수 함수 ──────────────────────────────────────────────
    // U1(ui-space Q108) — 위성 12개까지 전부, 13개부터 11개 + "+N" · 궤도 수(U2 용) 0 / 1~6 = 1 / 7 이상 = 2.
    check("⑥ 위성 수·\"+N\"·궤도 수 — 0·3·6·7·12·13·30",
      JSON.stringify([0, 3, 6, 7, 12, 13, 30].map((n) => [satelliteSlots(n).shown, satelliteSlots(n).more, orbitCount(n)])) ===
        JSON.stringify([[0, 0, 0], [3, 0, 1], [6, 0, 1], [7, 0, 2], [12, 0, 2], [11, 2, 2], [11, 19, 2]]));
    check("⑥ 위성 순서 — 이야기 = 작은 물방울 순서 · 시기 = 바로 이은 사람 → 모임 → 장소(이야기에서만 나온 분·곳은 시기 위성 아님)",
      JSON.stringify(storySatRefs(eb.stories[0])) === JSON.stringify(eb.stories[0].chips.map((c) => ({ kind: c.kind, id: c.id }))) &&
        JSON.stringify(eventSatRefs(eh).map((r) => r.kind)) === JSON.stringify(["person", "person", "person", "group", "place"]));
    {
      // U2 공전 키프레임·자리(ui-space §2.1 — 걸음 수·타원 위 점·지연 값)
      const s0 = orbitShape(128, 0), s1 = orbitShape(128, 1), s160 = orbitShape(160, 0);
      const onEllipse = [0, 0.1, 0.37, 0.5, 0.81].every((p) => { const q = orbitPoint(s0, p); return Math.abs((q.x / s0.rx) ** 2 + (q.y / s0.ry) ** 2 - 1) < 1e-9; });
      const tilted = [0, 0.2, 0.6].every((p) => { const q = orbitPoint(s1, p); const a = -Math.PI / 3; const x = q.x * Math.cos(a) - q.y * Math.sin(a), y = q.x * Math.sin(a) + q.y * Math.cos(a); return Math.abs((x / s1.rx) ** 2 + (y / s1.ry) ** 2 - 1) < 1e-9; });
      const kf = orbitKeyframes(s0);
      const stops = kf.match(/\d+(\.\d+)?%\{/g) ?? [];
      check("⑥ U2 궤도 — RY = R + 32 · RX = max(128, RY + 16)(128 → 128·96, 160 → 128·112) · 타원 위 점 · 두 번째 궤도 = 60° 기울인 같은 타원 · 짧은 반지름 ≥ R + 24 + 8",
        s0.rx === 128 && s0.ry === 96 && s160.rx === 128 && s160.ry === 112 && onEllipse && tilted && s0.ry >= 64 + SAT_R + 8 && s160.ry >= 80 + SAT_R + 8);
      check(`⑥ U2 키프레임 — 한 벌 = ${ORBIT_REVS}바퀴 × ${ORBIT_STEPS}걸음 + 1 칸(0% = 100%) · 바퀴마다 같은 점 · 주기 24초(Q109) · 이름표 = 원판과 겹치는 걸음 0(아래 1·위 0)`,
        stops.length === ORBIT_STEPS * ORBIT_REVS + 1 && ORBIT_PERIOD_MS === 24_000 && ORBIT_CYCLE_MS === 24_000 * ORBIT_REVS &&
          kf.includes("0%{transform:translate(128px,0px)}") && kf.includes("100%{transform:translate(128px,0px)}") &&
          labelVisible(s0, 0.25) && !labelVisible(s0, 0.75) && labelKeyframes(s0).startsWith("@keyframes orbl-96-0{0%{opacity:1}"),
        { stops: stops.length });
      const d = orbitDelayMs(0.25, 30_000);
      check("⑥ U2 지연 — 문서 시계 기준(진행 = 지금/주기 + 자리) · 자리 나누기(6 + 6, 13개 = 11 + \"+N\" = 12칸) · 두 번째 궤도 반 칸 엇갈림",
        d === -Math.round((30_000 % ORBIT_CYCLE_MS) + 6_000) && Math.abs(orbitProgressAt(0.25, 30_000) - 0.5) < 1e-9 &&
          JSON.stringify(orbitAssign(12).map((a) => a.orbit)) === JSON.stringify([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]) &&
          orbitAssign(3).every((a) => a.n === 3) && orbitFrac({ orbit: 0, k: 1, n: 4 }) === 0.25 && orbitFrac({ orbit: 1, k: 0, n: 2 }) === 0.25,
        { d });
      const css = orbitCss([128, 128, 144, 160]);
      check("⑥ U2 CSS — 키프레임 6벌(크기 3 × 궤도 2) + 이름표 6벌 · 공전 = 화면 안 계([data-orbit=on])·안 펼침만 · 멈춤 = 같은 선택자 재생 멈춤 · 이름표 지연 물려받기 없음",
        (css.match(/@keyframes orb-/g) ?? []).length === 6 && (css.match(/@keyframes orbl-/g) ?? []).length === 6 &&
          css.includes('.space-map[data-motion] .orbit-sys[data-orbit="on"]:not([data-open]) .orbit-sat{animation:var(--orb) 96000ms linear infinite}') &&
          css.includes('.space-map[data-motion="hold"] .orbit-sys[data-orbit="on"]:not([data-open]) :is(.orbit-sat,.orbit-lbl){animation-play-state:paused}') &&
          !css.includes("inherit"));
    }
    check("⑥ 본문 첫 문장", storyLead("  외가에서 태어났다.  어머니가 말씀하셨다. ") === "외가에서 태어났다." && storyLead("마침표 없는 글") === "마침표 없는 글");
    const mid = (lay.bands[1].top + lay.bands[1].bottom) / 2;
    check("⑥ 지금 보는 곳", bandAt(lay, mid)?.eventId === hs && bandAt(lay, -100)?.eventId === birth);
    check("⑥ 노드 수 = 중심 + 이야기 + 인물 + 장소, 시간 줄기 수 = 중심 + 이야기, 접기 기준 60",
      countMapNodes(d) === 3 + 4 + 5 + 3 && countTimelineNodes(d) === 3 + 4 && FOLD_ALL_ABOVE === 60);

    // ── ⑦ 3단계 — 장소 묶음 · 영역 제목 옆 만들기 자리 ─────────────────
    const pgSea = (await prisma.placeGroup.create({ data: { userId: a, name: "[fixture] 바닷가 곳들" }, select: { id: true } })).id;
    await saveNodeLink(a, { type: "PLACE_GROUP", id: pgSea }, { type: "PLACE", id: place1 });
    await prisma.placeGroup.create({ data: { userId: b, name: "[fixture] B 묶음" } });
    const d7 = await getMyLifeData(a);
    const q1 = d7.places.find((x) => x.id === place1);
    check("⑦ 데이터 — 장소 묶음·구성원(입구로 넣음), 장소의 묶음 id, 남의 묶음 0",
      d7.placeGroups.length === 1 && d7.placeGroups[0].id === pgSea && d7.placeGroups[0].memberIds.join() === place1 && q1?.groupIds.join() === pgSea, d7.placeGroups);
    const ly7 = layoutMyLife(d7);
    const pgl = ly7.nodes.find((n) => n.key === `pgl:${pgSea}`);
    check("⑦ 배치 — 장소록에 묶음 영역(장소 쪽 도형 1·이름 pgl:)·구성원은 그 안·나머지 장소는 밖·교차 0",
      !!pgl && pgl.kind === "groupLabel" && pgl.region === "places" && ly7.shapes.filter((s) => s.region === "places").length === 1 &&
        membershipErrors(d7, ly7).length === 0 && findOverlaps(ly7.nodes).length === 0 && ly7.shownPlaceGroupIds.join() === pgSea,
      { m: membershipErrors(d7, ly7), o: findOverlaps(ly7.nodes) });
    const add7 = ly7.nodes.filter((n) => n.kind === "regionAdd");
    const title7 = (r: string) => ly7.nodes.find((n) => n.key === `title:${r}`)!;
    check("⑦ 영역 만들기 자리 — 인물록·장소록 각 1(제목 바로 아래 줄·영역 왼쪽 맞춤·폭 300 — 390 화면 안·56px·겹침 0)",
      add7.length === 2 && add7.every((n) => n.h === L.ADD_H && n.w <= 300 && n.x === L.REGION_X) &&
        ["people", "places"].every((r) => add7.find((n) => n.key === `add:${r}`)!.y === title7(r).y + L.TITLE_H + L.ADD_GAP));
    const e7 = selectionEdges(d7, ly7, `pgl:${pgSea}`, on);
    check("⑦ 간선 — 장소 묶음 선택 = 간선 없이 구성원 장소 연결 표시", e7.edges.length === 0 && e7.related.has(`pl:${place1}`) && e7.related.size === 1, [...e7.related]);
    check("⑦ 검색 — 장소 묶음 이름", searchMyLife(d7, "바닷가").some((r) => r.kind === "placeGroup" && r.key === `pgl:${pgSea}`));
    // ── ⑧ 시기 노드 사람·장소 수 · 제목 없는 이야기 패널(2026-11-02 E2E 재검증) ──────────
    // 재현 모양: 카드로 만든 이야기 — 사람은 시기에도 이어지지만(PersonLifeEvent) 장소는 이야기에만(MemoryPlace).
    const uni = await makeEvent(a, "UNIVERSITY", "대학교 입학", 1977, 7);
    const uStory = await makeStory(a, uni, "", "[fixture] 학교 앞 가게에서 친구와 자주 먹었다. 시험이 끝나면 꼭 갔다.");
    const uFriend = await makePerson(a, "[fixture] 대학 친구", { lifeEventId: uni });
    const uPlace = (await prisma.place.create({ data: { userId: a, name: "[fixture] 학교 앞 가게" }, select: { id: true } })).id;
    await saveNodeLink(a, { type: "EPISODE", id: uStory.episodeId }, { type: "PERSON", id: uFriend });
    await saveNodeLink(a, { type: "EPISODE", id: uStory.episodeId }, { type: "PLACE", id: uPlace });
    const d8 = await getMyLifeData(a);
    const ev8 = d8.events.find((e) => e.id === uni)!;
    const n8 = eventPeoplePlaces(ev8);
    check("⑧ 시기 사람·장소 수 — 시기에 바로 이은 분 + 이야기로만 이은 곳 = 사람 1·장소 1(예전 버튼 이름은 바로 이은 것만 세어 1)",
      n8.people === 1 && n8.places === 1 && ev8.personIds.length + ev8.placeIds.length === 1, { n8, personIds: ev8.personIds, placeIds: ev8.placeIds });
    const hsN = eventPeoplePlaces(d8.events.find((e) => e.id === hs)!);
    check("⑧ 시기 사람·장소 수 — 같은 분·곳 한 번 · 모임 작은 물방울은 안 셈",
      eventPeoplePlaces({ personIds: ["p"], placeIds: [], stories: [{ chips: [{ kind: "person", id: "p", name: "x" }, { kind: "group", id: "g", name: "모임" }] } as never] }).people === 1 &&
        eventPeoplePlaces({ personIds: [], placeIds: ["x"], stories: [{ chips: [{ kind: "place", id: "x", name: "X" }] } as never] }).places === 1 &&
        hsN.people >= 1);
    const view = fs.readFileSync(path.resolve(__dirname, "../app/my-life/MyLifeView.tsx"), "utf8");
    check("⑧ 버튼 이름·패널이 같은 함수(eventPeoplePlaces)를 씀",
      /const n = eventPeoplePlaces\(ev\);\n\s*return C\.eventName\(y, ev\.label, ev\.stories\.length, n\.people \+ n\.places\);/.test(view) && /C\.panelPeople\(n\.people\)} · {C\.panelPlaces\(n\.places\)}/.test(view));
    const s8 = ev8.stories.find((s) => s.id === uStory.episodeId)!;
    check("⑧ 제목 없는 이야기 — hasOwnTitle 거짓(빈 문자열·공백·null) · 있는 제목은 참",
      !hasOwnTitle(s8) && !hasOwnTitle({ title: "  " }) && !hasOwnTitle({ title: null }) && hasOwnTitle({ title: "분식집 떡볶이" }));
    check("⑧ 이야기 패널 — 제목이 없으면 제목 줄은 화면에서 생략(화면 낭독용 sr-only, 본문은 그대로) · 있으면 보임",
      /<h2 id="mylife-panel-title" className=\{hasOwnTitle\(story\) \? "m-0 text-2xl" : "sr-only"\}>/.test(view));

    // ── ⑨ 3단계 E2E(2026-11-02) — 연결 수·차례로 보기 = 시기 노드 사람·장소 수와 같은 기준 · 패널 작업 뒤 지도 유지 · 한 번 탭 = 패널 ──
    const s1d = d.events.find((e) => e.id === birth)!.stories.find((s) => s.id === s1.episodeId)!;
    const idRefs = (r: { people: Set<string>; places: Set<string> }) => [...[...r.people].map((x) => `pe:${x}`), ...[...r.places].map((x) => `pl:${x}`)].sort();
    check("⑨ 이야기 연결 — 확정 사람·장소만(확인 대기·장소 노드 없는 행은 안 셈), 시기 수와 같은 함수(eventPeoplePlaceRefs)",
      JSON.stringify([...e1.connected].sort()) === JSON.stringify([`pe:${mom}`, `pe:${mate}`, `pl:${place1}`].sort()) &&
        JSON.stringify([...e1.connected].sort()) === JSON.stringify(idRefs(eventPeoplePlaceRefs({ personIds: [], placeIds: [], stories: [s1d] }))),
      e1.connected);
    const hsEv = d.events.find((e) => e.id === hs)!;
    check("⑨ 시기 연결 — 바로 이은 분·곳 + 그 시기 이야기의 분·곳(eventPeoplePlaces 와 같은 기준), 전부 윤곽 · 간선은 바로 이은 것만",
      JSON.stringify([...e3.connected].sort()) === JSON.stringify(idRefs(eventPeoplePlaceRefs(hsEv)).filter((k) => lay.nodes.some((n) => n.key === k))) &&
        e3.connected.every((k) => e3.related.has(k)) && e3.edges.filter((e) => e.kind === "person").length === 3 && e3.edges.filter((e) => e.kind === "place").length === 1,
      { connected: e3.connected, refs: idRefs(eventPeoplePlaceRefs(hsEv)) });
    check("⑨ 인물 간선 끄기 — 연결 수도 장소만 · 모임 선택 = 구성원(related 그대로)",
      JSON.stringify(e1p.connected) === JSON.stringify([`pl:${place1}`]) && JSON.stringify([...e4.connected].sort()) === JSON.stringify([...e4.related].sort()), { e1p: e1p.connected, e4: e4.connected });
    check("⑨ 머리 줄 \"연결 N\"·[연결된 곳 차례로 보기(N)] = 연결 전체 수(화면 밖 것만 세던 것 고침) · 차례로 보기는 그 노드들",
      view.includes("C.selectedLine(nodeName(selected, data, idx), connected.length)") && view.includes("{C.toRelated(related.count)}") &&
        /const on = new Set\(connected\);\n\s*return layout\.nodes\.map\(\(n\) => n\.key\)\.filter\(\(k\) => on\.has\(k\)\);/.test(view));
    check("⑨ 지도 이동 요청은 한 번만(넣기·빼기로 레이아웃이 바뀌어도 처음 목표로 다시 안 감) · 패널 작업 뒤 = 고른 노드 자리가 바뀌어 보이는 곳 밖일 때만 이동",
      view.includes("focusDoneRef.current === focusRequest.n) return;") && view.includes("focusDoneRef.current = focusRequest.n;") &&
        view.includes("if (!now || (was && was.x === now.x && was.y === now.y)) return;") && view.includes("setPendingOpen({ ...r, keep: true });"));
    check("⑨ 한 번 탭 = 패널 — 전체 보기 배율에서도(확대와 같이, 일찍 끝내지 않음) · 칩 = 그 모임 패널 + 영역으로 · 탭·패널 닫기 포커스로는 지도 안 움직임(키보드만)",
      view.includes("if (stateRef.current.scale < OVERVIEW_SCALE) zoomAbovePanel(el);\n    if (nodeKind === \"fold\"") &&
        view.includes("const key = `${places ? \"pgl\" : \"gl\"}:${groupId}`;\n      openPanel(key);") &&
        view.includes("if (stateRef.current.scale >= OVERVIEW_SCALE) requestAnimationFrame(() => requestAnimationFrame(() => ensureVisible(key)));") &&
        !/aria-pressed=\{c\.shown\}/.test(view) &&
        view.includes('if (!el.matches(":focus-visible")) return;'));
    // ── ⑩ 3단계 E2E 후속 2(2026-11-02) — 지도 위에 떠 있던 가장자리 버튼(노드를 가림 — §8.4)을 지도 밖으로 ──
    check("⑩ 지도 위 떠 있는 버튼 0 — 가장자리 버튼(EdgeButtons·화살표·화면 밖 계산) 없음",
      !/EdgeButtons|updateOffscreen|dirOf\(|ARROW\[/.test(view) && !/pointer-events-none absolute z-10/.test(view));
    check("⑩ 도구줄 이동 줄 [시간 줄기][인물록][장소록] — 늘 같은 자리, 지금 보는 곳 표시(aria-current), 지도 상자 밖(확대 줄 위)",
      /<nav aria-label=\{C\.moveBarLabel\}[^>]*>\n\s*\{\(\["timeline", "people", "places"\] as const\)/.test(view) &&
        view.includes('aria-current={area === w ? "true" : undefined}') &&
        view.indexOf("<nav aria-label={C.moveBarLabel}") > view.indexOf("ref={boxRef}") && view.indexOf("<nav aria-label={C.moveBarLabel}") < view.indexOf("aria-label={C.zoomOut}"));
    check("⑩ [연결된 곳 차례로 보기(N)] = 패널 안(머리 줄에서 옮김 — 2026-11-02 성민 지시) · 누르면 패널 닫고 지도가 다음 곳으로(요청 번호 한 번만)",
      !view.includes("{C.toRelated(connected.length)}") && view.includes("{C.toRelated(related.count)}") &&
        view.includes("dialogRef.current?.close();\n                        setTour((t) => ({ sel: panel, at: 1, n: (t?.n ?? 0) + 1 }));") &&
        view.includes("if (!tour || tour.n === tourDoneRef.current) return;") &&
        /selectionEdges\(data, layout, selected, ALL_EDGES\)\.connected\.length/.test(view));

    // ── ⑪ 3단계 최종 E2E(2026-11-02) — 차례 보기 [다음 연결] · 시기 패널 장소 목록(이야기에 나온 곳 포함) ──
    const edit = fs.readFileSync(path.resolve(__dirname, "../app/my-life/EditUI.tsx"), "utf8");
    check("⑪ 차례 보기 진행 중에만 선택 줄 [다음 연결](연결 n/N) · 마지막 다음은 [처음으로] = 고른 노드로 돌아가고 끝 · 고른 노드가 바뀌거나 연결이 줄면 끝",
      view.includes("const tourAt = tour && tour.sel === selected && tour.at <= tourOrder.length ? tour.at : 0;") &&
        view.includes("{tourAt > 0 && (") && view.includes("data-tour-next") &&
        view.includes("setTour({ sel: selected, at: back ? 0 : tourAt + 1, n: (tour?.n ?? 0) + 1 });") &&
        view.includes("const key = tour.at === 0 ? tour.sel : tourOrder[tour.at - 1];") &&
        view.includes("{tourAt >= tourOrder.length ? C.tourBack : C.tourNext}") &&
        C.tourLine(2, 3, "미자") === "연결 2/3 · 미자");
    check("⑪ 차례 보기 시작 — 패널이 닫히며 포커스는 [다음 연결]로(키보드로 이어 누르기)",
      view.includes("focusTourRef.current = true;\n                        dialogRef.current?.close();") &&
        view.includes('document.querySelector<HTMLElement>("[data-tour-next]")?.focus({ preventScroll: true });'));
    const list8 = eventPeoplePlaceList(ev8);
    check("⑪ 시기 목록 — 재현 모양(시기에 이은 분 + 이야기에만 이은 곳): 사람 = 바로 이은 분, 장소 = 이야기에서 나온 곳(그 이야기)",
      list8.people.length === 1 && list8.people[0].direct && list8.people[0].id === uFriend &&
        list8.places.length === 1 && !list8.places[0].direct && list8.places[0].id === uPlace && list8.places[0].storyId === uStory.episodeId,
      list8);
    const synEv = {
      personIds: ["p"],
      placeIds: ["x"],
      stories: [
        { id: "s1", chips: [{ kind: "person", id: "q", name: "Q" }, { kind: "person", id: "p", name: "P" }, { kind: "group", id: "g", name: "모임" }] },
        { id: "s2", chips: [{ kind: "place", id: "y", name: "Y" }, { kind: "place", id: "x", name: "X" }] },
      ],
    } as never as MyLifeEvent;
    const synL = eventPeoplePlaceList(synEv);
    const synR = eventPeoplePlaceRefs(synEv);
    check("⑪ 시기 목록 = 수(eventPeoplePlaces)·연결과 같은 기준 — 바로 이은 것 먼저 · 이야기에서만 나온 분·곳(처음 나온 이야기) · 같은 것 한 번 · 모임 빠짐",
      JSON.stringify(synL.people.map((r) => [r.id, r.direct, r.storyId])) === JSON.stringify([["p", true, null], ["q", false, "s1"]]) &&
        JSON.stringify(synL.places.map((r) => [r.id, r.direct, r.storyId])) === JSON.stringify([["x", true, null], ["y", false, "s2"]]) &&
        JSON.stringify([...synR.people]) === JSON.stringify(synL.people.map((r) => r.id)) && JSON.stringify([...synR.places]) === JSON.stringify(synL.places.map((r) => r.id)) &&
        eventPeoplePlaces(synEv).people === synL.people.length && eventPeoplePlaces(synEv).places === synL.places.length,
      synL);
    check("⑪ 시기 패널 — 사람·장소 목록 = eventPeoplePlaceList · 바로 이은 것만 [빼기] · 이야기에서만 = 그 이야기 이름(빼기 없음) · [넣기] 후보에선 바로 이은 것만 뺌",
      edit.includes("const list = eventPeoplePlaceList(ev);") &&
        edit.includes("sections.push({ title: C.panelPeriodPlaces, items: nn(list.places.map((r) => periodItem(r, \"place\"))) });") &&
        edit.includes("if (r.direct) return make(r.id);") && edit.includes("const it = make(r.id, false, inStory(r.storyId));") &&
        edit.includes("s.items.filter((i) => !i.fromStory)") && edit.includes("{it.removable && (") &&
        !edit.includes("ev.placeIds.map(placeItem)"));
    // 2026-11-03 — 이름만 남은 장소 예외 제거(설계 §15.8): 시기 패널 이야기로 가기 우회·이야기 패널 id 없는 칩 줄·id 거르기 없음.
    check("⑪ 이름만 남은 장소 예외 코드 없음 — 시기 패널 이야기로 우회(name: r.name) · 이야기 패널 칩 줄(!c.id) · 장소 칩 id 거르기 · 간선 id 조건",
      !edit.includes("name: r.name") && !edit.includes("c.kind === \"place\" && c.id") && !view.includes("(c) => !c.id") && !view.includes("if (!c.id) continue") &&
        !fs.readFileSync(path.resolve(__dirname, "../lib/my-life-edges.ts"), "utf8").includes("c.id && c.kind") &&
        !fs.readFileSync(path.resolve(__dirname, "../lib/my-life.ts"), "utf8").includes("mp.placeName"));

    // ── ⑫ Q69(2026-11-02) — /story-review 를 My Life 로 합침 ──
    const src = (rel: string) => fs.readFileSync(path.resolve(__dirname, "..", rel), "utf8");
    const review = src("app/story-review/page.tsx");
    // 2026-11-03 — 보존해 둔 옛 화면 본문·카드 컴포넌트·lib/story-review 삭제(리다이렉트만 남김, 설계 §15.4).
    const gone = ["app/story-review/EpisodeCard.tsx", "app/story-review/TimelineRow.tsx", "app/story-review/DeleteCustomEventButton.tsx", "app/story-review/loading.tsx", "lib/story-review.ts"];
    check("⑫ /story-review = /my-life?view=list redirect 만(옛 본문·카드·lib 삭제)",
      /export default function StoryReviewPage\(\) \{\s*redirect\("\/my-life\?view=list"\);\s*\}/.test(review) && !review.includes("_StoryReviewPageArchived") &&
        gone.every((f) => !fs.existsSync(path.resolve(__dirname, "..", f))));
    // 인물 확인 화면(2026-11-03 삭제 — 확인 대기 0·만드는 경로 0, 설계 §15.6) — 화면·액션·lib·문구 파일 없음 · 주소로 오면 /my-life.
    const nextConfig = src("next.config.ts");
    const confirmGone = ["app/story-review/confirm", "app/actions/node-confirm.ts", "lib/node-confirm.ts", "lib/node-confirm-copy.ts", "db/test-node-confirm.ts"];
    check("⑫ 인물 확인 화면(/story-review/confirm)·액션·lib·문구·회귀 없음 · 주소 → /my-life",
      confirmGone.every((f) => !fs.existsSync(path.resolve(__dirname, "..", f))) &&
        nextConfig.includes('{ source: "/story-review/confirm", destination: "/my-life", permanent: false }'));
    // 옛 온보딩 화면 4개(2026-11-03 삭제 — 진입 링크 0) — 라우트 폴더 없음 · 주소로 오면 /enter(next.config redirects).
    check("⑫ 옛 온보딩 화면(/onboarding-v2·-confirm·-episode·-episode-chat) 라우트 없음 · 주소 → /enter",
      ["app/onboarding-v2", "app/onboarding-confirm", "app/onboarding-episode", "app/onboarding-episode-chat"].every((d) => !fs.existsSync(path.resolve(__dirname, "..", d))) &&
        ['"/onboarding-v2"', '"/onboarding-confirm"', '"/onboarding-episode"', '"/onboarding-episode-chat/:eventId"'].every((x) => nextConfig.includes(x)) &&
        nextConfig.includes('destination: "/enter"'));
    const walkFiles = (dir: string): string[] =>
      fs.readdirSync(path.resolve(__dirname, "..", dir), { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? (d.name === "generated" ? [] : walkFiles(`${dir}/${d.name}`)) : /\.(ts|tsx)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
    // 주석 줄은 빼고 — 링크·redirect·push·revalidatePath 로 쓰인 "/story-review"·"/story-review/confirm"(2026-11-03 — 인물 확인도 셈)
    const toReview = ["app", "lib", "components"].flatMap(walkFiles)
      .filter((f) => f !== "app/story-review/page.tsx")
      .filter((f) => src(f).split("\n").some((line) => !/^\s*(\/\/|\*|\{\/\*)/.test(line) && /["'`]\/story-review(["'`?#/])/.test(line)));
    check("⑫ 앱 안 /story-review·/story-review/confirm 링크·redirect·revalidatePath 0", toReview.length === 0, toReview);
    const side = src("app/timemachine/SidePanel.tsx");
    check("⑫ 사이드 패널 \"내 이야기\" 빠짐 · My Life 메뉴 그대로", !side.includes('href="/story-review"') && side.includes('href="/my-life"'));
    const page = src("app/my-life/page.tsx");
    check("⑫ My Life 페이지가 카드 데이터를 만든다(오늘의 인터뷰·갭 3·진행 중) — 옮기기 전과 같은 함수 · 인물 확인 대기 수는 안 셈",
      ["getInterviewCardState(userId),", "detectGaps(userId),", "getFreeChatTopic(userId),", "pickTopGaps(gaps, 3)", "<MyLifeView data={data} suggest={suggest} completedTours={completedTours} />"].every((x) => page.includes(x)) &&
        !page.includes("countPendingPeople"));
    const listStart = view.indexOf("function ListMode(");
    const list = view.slice(listStart, view.indexOf("function PersonRow("));
    const at = (x: string) => list.indexOf(x);
    check("⑫ 목록 보기 — 오늘의 인터뷰가 시간 줄기 위, 더 들어볼까요?가 시간 줄기 바로 아래·인물록 위 · 정리할 것 카드 없음",
      at("<InterviewEntryCard state={suggest.interview} />") > 0 && !view.includes("PendingPeopleCard") &&
        at("<InterviewEntryCard state={suggest.interview} />") < at("<ol aria-label={C.mapListLabel}") &&
        /<\/ol>\s*<GapCards gaps=\{suggest\.gaps\} \/>/.test(list) &&
        at("<GapCards gaps={suggest.gaps} />") < at('aria-labelledby="mylife-list-people"'));
    // Q69 후속(2026-11-02, 성민 결정) — 그때의 나 별도 묶음은 시기 아래와 같은 이야기를 두 번 보여 뺌. 시기 아래 꼬리표 + sage 테두리로만.
    check("⑫ 그때의 나 = 시기 아래 꼬리표로만 — 별도 묶음 없음 · 목록 이야기 꼬리표 \"그때의 나\" · sage 테두리",
      !view.includes("mylife-list-self") && !view.includes("@self") && !view.includes("selfStoriesTitle") &&
        view.includes('if (t === "self") return C.selfTag;') && list.includes("{tag && <span className=\"text-lg text-ink-soft\">{tag}</span>}") &&
        list.includes('${s.kind === "SELF" ? "border-sage" : "border-ink-soft"}') && C.selfTag === "그때의 나");
    const mapPart = view.slice(view.indexOf("function MapMode("), listStart);
    // U1(ui-space §6.2) — [이야기 거리]는 지도 머리 줄에서 만들기 시트 맨 아래로(지도 첫 화면 글자 40자 이하).
    check("⑫ 지도 보기 — [이야기 거리] = 만들기 시트 맨 아래(지도 위 줄 없음) · 시트 = 같은 카드(제목 h3)",
      !mapPart.includes("onOpenSuggest") && !mapPart.includes("nowText") &&
        /onSuggest=\{\(\) => \{\s*createRef\.current\?\.close\(\);\s*openSuggest\(\);/.test(view) &&
        /\{onSuggest && \(\s*<Button variant="secondary" size="lg" onClick=\{onSuggest\}>\s*\{C\.suggest\}/.test(edit) &&
        view.includes('<InterviewEntryCard state={suggest.interview} as="h3" />') &&
        view.includes('<GapCards gaps={suggest.gaps} as="h3" />') && view.includes('aria-labelledby="mylife-suggest-title"'));
    const sug = src("app/my-life/Suggestions.tsx");
    check("⑫ 카드 — 갭은 있을 때만(진행 중 = [이어서 이야기하기]) · 링크 = 인터뷰·/chat-v3 딥링크",
      sug.includes("if (gaps.length === 0) return null;") &&
        sug.includes("{g.inProgress ? C.gapContinue : C.gapStart}") && sug.includes('href="/interview"') && sug.includes("href={g.href}"));
    check("⑫ 이야기 패널 [글 고치기] — 같은 서버 액션(updateEpisodeContentAction, 읽은 글 버전·평문 = base — 충돌이면 글 고치기 화면과 같은 [다시 불러오기]) · 저장 뒤 바로 보임 + 지도 다시 읽기 · 응답 실패도 다시 읽기",
      view.includes("const r = await updateEpisodeContentAction(story.id, text, base);") && view.includes("setBody(text);") &&
        view.includes("setBase({ version: r.version, content: text.trim() });") && view.includes("{conflict && <ConflictReload kept={conflict.kept} />}") &&
        view.includes("<StoryPanel key={s.id}") &&
        /setDraft\(null\);\s*router\.refresh\(\);/.test(view) && /setError\(C\.editBodyRetry\);\s*router\.refresh\(\);/.test(view) && view.includes("{C.editBody}") &&
        view.includes("aria-label={C.bodyLabel}"));

    // ── ⑬ 지도·목록 공통·패널 정보 문구 확정(2026-11-04) · 연도 글자 한 곳 ──
    const story13 = src("app/my-life/story/[id]/page.tsx");
    check("⑬ 연도 글자 = lib/my-life-layout yearText 한 곳(지도·만들기·이야기 상세 3벌 삭제) · 출력 그대로(1971 · 1971~1974 · 같은 해 · 연도 모름)",
      yearText({ year: 1971, endYear: null }) === "1971" && yearText({ year: 1971, endYear: 1974 }) === "1971~1974" &&
        yearText({ year: 1971, endYear: 1971 }) === "1971" && yearText({ year: null, endYear: 1980 }) === C.yearUnknown &&
        ![view, edit, story13].some((t) => t.includes("function yearText(")) &&
        [view, edit, story13].every((t) => /import \{[^}]*\byearText\b[^}]*\} from "@\/lib\/my-life-layout";/.test(t)));
    // U1(ui-space §6.2) — "지금 보는 곳" 줄 삭제(지도 낭독 이름이 대신 — space.regionAt). 지운 뒤 알림·접힌 띠가 있을 때만 줄이 생김.
    check("⑬ U1 — \"지금 보는 곳\" 줄 없음(nowViewing 키·nowText 없음) · 알림·[모두 펼치기]가 있을 때만 줄 · 지도 낭독 이름 = 지금 보는 시기 · 접기 = 이야기만",
      !("nowViewing" in C) && !view.includes("nowText") && view.includes("(status || anyFolded) && (") &&
        view.includes('"aria-label": regionLabel,') && C.space.regionAt("1974 고등학교 입학") === "My Life 지도 — 지금 보는 시기: 1974 고등학교 입학" &&
        C.unfold(3) === "이야기 3개 펼치기" && C.fold === "이야기 접기");
    // 밤 우주 1단계(2026-11-05 — docs/phase/ui-night.md N1): 단일 테마 · 허용 목록 계정만 서버가 <html data-theme="night"> ·
    // U1 지도 안 토글·기기 저장값·첫 그림 스크립트 삭제(Q149) · 밝은 우주 지도 값(.space-map)은 남김(허용 목록 밖).
    {
      const layoutSrc = src("app/layout.tsx");
      const css = src("app/globals.css");
      check("⑬ 밤 우주 전원(2026-11-05) — 루트 레이아웃이 서버에서 늘 html data-theme=night(깜빡임 0 — 스크립트·허용 목록 없음) · global-error 도 밤 · 허용 목록 판정 파일 없음",
        layoutSrc.includes("data-theme=\"night\"") && !layoutSrc.includes("isNightThemeUser") && !fs.existsSync(path.resolve(__dirname, "../lib/night-theme.ts")) &&
          src("app/global-error.tsx").includes("<html lang=\"ko\" data-theme=\"night\">") && src("app/manifest.ts").includes("theme_color: \"#221d52\"") && layoutSrc.includes("themeColor: \"#221d52\""));
      check("⑬ 밤 1단계 — My Life 지도 안 토글·기기 저장값·첫 그림 스크립트 없음 · data-space 없음 · 지도 바탕 = 밝은 .space-map + [data-theme=night] .space-map",
        !/data-space|SPACE_KEY|SPACE_BOOT|toggleSpace|mylife:space/.test(view) && !("toNight" in C.space) && !/data-space/.test(css) &&
          css.includes(".space-map {") && css.includes('[data-theme="night"] .space-map {'));
      check("⑬ 밤 1단계 — 뜻이 뒤집히는 곳 공통 값 한 곳: 주요 버튼 text-on-action(+ 밤 bg-action 글자 규칙) · 덮개 bg-scrim(My Life 대화상자 bg-ink 덮개 0) · 포커스 여백 = canvas(base 층) · 그림자 → 테두리 빛",
        src("components/ui/Button.tsx").includes('primary: "bg-action text-on-action hover:bg-action-hover",') &&
          /\[data-theme="night"\] \.bg-action \{\s*color: var\(--color-on-action\);/.test(css) &&
          (view.match(/backdrop:bg-scrim/g) ?? []).length === 5 && !/bg-ink\//.test(view) &&
          /@layer base \{[\s\S]*\[data-theme="night"\] \*,[\s\S]*--tw-ring-offset-color: var\(--color-canvas\);/.test(css) &&
          css.includes('[data-theme="night"] :is(.shadow-sm, .shadow, .shadow-md, .shadow-lg, .shadow-xl, .shadow-2xl) {') &&
          css.includes("--color-on-action: #ffffff;") && css.includes("--color-scrim: rgb(42 37 32 / 0.4);"));
      const side = src("app/timemachine/SidePanel.tsx");
      const raw = side.match(/\b(?:text|bg|border|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b|\b(?:text|bg|border)-(?:white|black)\b/g) ?? [];
      check("⑬ 밤 1단계 — 공통 요소 [내 정보]·사이드 패널 직접 색 0(amber → 토큰)", raw.length === 0, raw);
    }
    {
      // U1 대비(1.4.3·1.4.11) — globals.css 값으로 계산. 밤 우주 = 글자 4.5·테두리·포커스 3 전부, 밝은 우주 = 행성·위성 테두리 3(U1 기준 ①).
      // 밝은 우주의 brand(버튼 테두리·포커스)·line(칸 테두리)은 앱 전체 토큰이라 여기서 안 봄(U1 보고 — 앱 전체 결정).
      const css = src("app/globals.css");
      const blk = (re: RegExp) => Object.fromEntries([...css.match(re)![1].matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
      const lt = blk(/@theme \{([\s\S]*?)\n\}/);
      const nt = { ...lt, ...blk(/\[data-theme="night"\] \{([\s\S]*?)\n\}/) };
      const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
      const lum = (h: string) => rgb(h).map((v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
      const cr = (a: string, b: string) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
      const mixHex = (fg: string, a: number, bg: string) => "#" + rgb(fg).map((c, i) => Math.round(c * a + rgb(bg)[i] * (1 - a)).toString(16).padStart(2, "0")).join("");
      const lMap = ["#ece6ff", "#f7f0ff", "#fff0e6"];
      const nMap = ["#221d52", mixHex("#be78ff", 0.35, "#221d52"), mixHex("#5aa0ff", 0.3, "#221d52")];
      const low: string[] = [];
      const need = (label: string, fg: string, bgs: string[], min: number) => bgs.forEach((b) => cr(fg, b) < min && low.push(`${label} ${fg}/${b} ${cr(fg, b).toFixed(2)}`));
      for (const k of ["planet-edge", "period-edge", "person", "place", "glow"]) need(`밝음 ${k}`, lt[k], lMap, 3);
      for (const k of ["ink", "ink-soft"]) need(`밤 ${k}`, nt[k], [nt.canvas, nt.surface, nt.banner, ...nMap], 4.5);
      for (const k of ["ink-faint", "action", "danger", "person", "place"]) need(`밤 ${k}`, nt[k], [nt.surface, nt.canvas], 4.5);
      need("밤 주요 버튼 글자 on-action", nt["on-action"], [nt.action, nt["action-hover"]], 4.5);
      need("밝음 주요 버튼 글자 on-action", lt["on-action"], [lt.action, lt["action-hover"]], 4.5);
      for (const k of ["success", "success-deep", "sage"]) need(`밤 ${k}`, nt[k], [nt.surface, nt.canvas, nt.banner], 4.5);
      for (const d of [1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020]) {
        need(`밤 워시 ${d} 위 ink`, nt.ink, [nt[`decade-${d}`]], 4.5);
        need(`밤 스트립 ${d}`, nt[`decade-strip-${d}`], [nt.canvas], 3);
      }
      need("편지지 글자", lt["paper-ink"], [lt.paper], 4.5);
      need("편지지 보조", lt["paper-ink-soft"], [lt.paper], 4.5);
      need("편지지 링크", lt["paper-action"], [lt.paper], 4.5);
      need("편지지 칸 테두리", lt["paper-line"], [lt.paper], 3);
      for (const k of ["planet-edge", "period-edge", "person", "place", "glow", "ink", "sage"]) need(`밤 ${k} 테두리`, nt[k], nMap, 3);
      for (const k of ["brand", "line"]) need(`밤 ${k} 테두리`, nt[k], [nt.surface, nt.canvas], 3);
      check("⑬ 대비 — 밝은 우주 행성·위성 테두리·빛 고리 3:1 · 밤 우주 글자 4.5:1·테두리·포커스 3:1·연대 틴트·편지지(globals.css 값으로 계산 — ui-night §1.2)", low.length === 0, low);
    }
    check("⑬ U1·U2 행성 탭(Q110) — 펼침 + 패널 · 펼친 계가 패널·지도 상자에 걸릴 때만 패널 위로(배율 그대로) · 고른 행성을 다시 탭 = 접고 다시 공전 · 펼친 위성만 누르는 곳(공전 중 inert) · 위성 = 바로가기 패널 + [원래 자리로 가기]",
      view.includes("if (planet && stateRef.current.scale >= OVERVIEW_SCALE) liftAbovePanel(nodeKey);") &&
        view.includes("if (rTop >= top && rBottom <= bottom) return;") && view.includes("api.setTransform(st.positionX, st.positionY + dy, st.scale, 300);") &&
        view.includes("if (planet && nodeKey === selected) {") && view.includes("const open = selected === n.key;") && view.includes("inert={!open}") &&
        view.includes('else if (nodeKind === "satellite" && targetKey) openPanel(targetKey, true);') &&
        view.includes('else if (nodeKind === "satMore" && targetKey) openPanel(targetKey);') && view.includes("{C.space.goOrigin}"));
    {
      // U2 공전(ui-space §2.6 ① · §3) — 프레임마다 도는 코드 없음(공전 모듈에 rAF·setInterval·setTimeout 0) · 화면 안 계만(IntersectionObserver, 한 화면 여유) ·
      // [움직임 멈추기](Q112 A — 확대 줄 · 기기 기억 · reduced-motion 이면 처음부터 멈춤) · 전체 보기 배율(0.6 미만) = 멈춤 · 문구 [임시] copy.
      const orbitSrc = fs.readFileSync(path.resolve(__dirname, "../app/my-life/orbit.ts"), "utf8");
      const libSrc = fs.readFileSync(path.resolve(__dirname, "../lib/space-orbit.ts"), "utf8");
      const noLoop = (t: string) => !/requestAnimationFrame|setInterval|setTimeout/.test(t.replace(/\/\/.*$/gm, ""));
      check("⑬ U2 공전 — 공전 모듈(lib/space-orbit·app/my-life/orbit)에 rAF·타이머 0 · 화면 안 계만(관찰 기준 = 지도 감싼 상자, 여유 한 화면) · 지연은 위성·이름표에 직접",
        noLoop(orbitSrc) && noLoop(libSrc) && orbitSrc.includes('rootMargin: "100% 100% 100% 100%"') &&
          view.includes('const root = boxRef.current?.querySelector<HTMLElement>(".react-transform-wrapper");') &&
          orbitSrc.includes('const lbl = el.querySelector<HTMLElement>(":scope > .orbit-lbl");'));
      check("⑬ U2 움직임 멈추기 — 확대 줄 [−][+][전체][멈춤](비서 버튼 자리 96) · 이름 바뀜(움직임 멈추기 ↔ 움직이기) · 기기 기억(mylife:motion) · reduced-motion 기본 멈춤 · 전체 보기 배율 멈춤",
        view.includes('const motion = motionPref === "stop" || scale < OVERVIEW_SCALE ? "hold" : "run";') && view.includes("data-motion={motion}") &&
          view.includes('pr-[96px]') && view.includes("{C.space.fitAllShort}") && view.includes("aria-label={motionPref === \"stop\" ? C.space.motionStart : C.space.motionStop}") &&
          orbitSrc.includes('export const MOTION_KEY = "mylife:motion";') && orbitSrc.includes('return reducedMotion() ? "stop" : "run";') &&
          C.space.motionStop === "움직임 멈추기" && C.space.motionStart === "움직이기");
      // U3 끌어 넣기(ui-space §4) — 계산(순수 함수)
      const planets = [
        { key: "st:a", cx: 0, cy: 0, rx: 100, ry: 80 },
        { key: "st:b", cx: 0, cy: 300, rx: 100, ry: 80 },
      ];
      const sp = spiralPath({ x: 200, y: 50 }, { x: 0, y: 0 }, { x: -40, y: 90 });
      const wb = wobbleScales();
      check(`⑥ U3 끌기 계산 — 집기 ${LONG_PRESS_MS}ms · 8px 넘게 먼저 움직이면 지도 이동 · 놓을 행성 = 궤도 정규화 거리 ${DROP_RANGE} 안 가장 가까운 허용 행성(없으면 튕김) · 나선 시작 = 놓은 점·끝 = 궤도 점 · 출렁임 끝 1 · 진동 Android 만`,
        LONG_PRESS_MS === 280 && DRAG_SLOP === 8 && EDGE_ARM === 24 &&
          pickDropTarget({ x: 50, y: 40 }, planets, new Set(["st:a", "st:b"])) === "st:a" &&
          pickDropTarget({ x: 0, y: 250 }, planets, new Set(["st:a", "st:b"])) === "st:b" &&
          pickDropTarget({ x: 50, y: 40 }, planets, new Set(["st:b"])) === null &&
          pickDropTarget({ x: 400, y: 0 }, planets, new Set(["st:a"])) === null &&
          Math.hypot(sp[0].x - 200, sp[0].y - 50) < 1e-9 && Math.hypot(sp[sp.length - 1].x + 40, sp[sp.length - 1].y - 90) < 1e-6 &&
          wb[0] === 1 && Math.abs(wb[wb.length - 1] - 1) < 0.01 &&
          isAndroid("Mozilla/5.0 (Linux; Android 14; SM-S918N)") && !isAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"));
      const dragSrc = fs.readFileSync(path.resolve(__dirname, "../app/my-life/drag.ts"), "utf8");
      const editSrc = fs.readFileSync(path.resolve(__dirname, "../app/my-life/EditUI.tsx"), "utf8");
      check("⑬ U3 끌어 넣기 — 끄는 것 = 인물록·장소록 노드·모임 이름표·펼친 위성(data-drag, draggable 안 씀) · 집은 동안 지도 이동·확대 끔 · 저장 = 패널 넣기와 같은 입구(addLinkAction → saveNodeLink)·같은 되돌리기(undoLinksAction) · 끌기 직후 클릭 무시",
        view.includes("data-drag={`PERSON:${p.id}`}") && view.includes("data-drag={`PLACE:${p.id}`}") && view.includes("data-drag={`PERSON_GROUP:${l.groupId}`}") &&
          view.includes("data-drag-from={open && s.ref ? n.key : undefined}") && !/draggable/.test(view + dragSrc + editSrc) &&
          view.includes("panning={{ disabled: grabbing }}") && view.includes("pinch={{ disabled: grabbing }}") &&
          view.includes("const r = await addLinkAction(planetOf(key), ref);") && view.includes("const r = await undoLinksAction(created).catch(() => ({ ok: false as const }));") &&
          view.includes("if (dragJustEnded()) return;") && editSrc.includes("const r = await addLinkAction(self!, other);") && editSrc.includes("const r = await addLinkAction(self!, c.ref);"));
      check("⑬ U3 손짓 — 집기 전 실제 이동 시각이 280ms 전이면 집기를 되돌림(바쁜 메인 스레드에서 늦게 온 이동) · 가장자리 자동 이동은 24px 움직인 뒤 · 두 번째 손가락 = 취소 · 이미 있는 행성 위에 놓으면 이미 들어 있어요 문구(멀어서 아님) · 연출 없이(움직임 줄이기·[움직임 멈추기]) · 진동 Android 만 · 터치 누름은 지도 라이브러리 키보드 포커스 건너뜀",
        dragSrc.includes("if (grabbed && moved && e.timeStamp - o.pointer.t < LONG_PRESS_MS) {") && dragSrc.includes("if (!armed) armed = Math.hypot(last.x - grabAt.x, last.y - grabAt.y) > EDGE_ARM;") &&
          dragSrc.includes('window.addEventListener("pointerdown", onSecond, true);') && dragSrc.includes('export const stillMotion = () => reduced() || readMotion() === "stop";') &&
          dragSrc.includes("if (isAndroid(navigator.userAgent)) navigator.vibrate?.(ms);") &&
          dragSrc.includes('bounce(pickDropTarget(last, all, new Set(all.map((p) => p.key))) ? "already" : "far");') && view.includes('else if (why === "already") setDropNotice({ text: C.edit.alreadyLinked });') &&
          view.includes('if (lastPointerRef.current !== "touch") focusForKeyboard();'));
      check("⑬ U3 넣을 것 줄(Q116) — 행성 패널 [넣을 것 보기] · 줄 안 버튼 = 누르면 넣기(키보드·낭독 — 버튼 경로) · 길게 눌러 위 행성으로 · 문구 [임시] 9키",
        editSrc.includes("{showRow ? C.space.addRowHide : C.space.addRowShow}") && editSrc.includes("aria-label={C.space.addRowItem(c.label)}") &&
          editSrc.includes("onAdd(c.ref);") && editSrc.includes("onPointerDown={(e) => onPress(e, c)}") &&
          ["grabHint", "dropped", "dropFar", "dropCancel", "addRowShow", "addRowHide", "addRowTitle", "addRowHint", "addRowItem"].every((k) => k in C.space));

      // U3 후속 — 낙관적 반영(lib/my-life-optimistic): 놓는 즉시 궤도(저장 응답 전) · 실패면 빠짐 · 서버 데이터에 보이면 항목 지움 · 순서 꼬임
      type Story = MyLifeEvent["stories"][number];
      const ev = (id: string, stories: Story[] = [], personIds: string[] = []): MyLifeEvent => ({ id, type: "CUSTOM" as LifeEventType, label: id, year: 2000, endYear: null, decor: null, stories, personIds, placeIds: [], groupIds: [] });
      const story = (id: string, primaryEventId: string, chips: Story["chips"] = [], subjectPersonId: string | null = null) =>
        ({ id, kind: "STORY", title: "", content: "", primaryEventId, otherEventIds: [], subjectPersonId, chips, richBody: false, bodyVersion: 0, decor: null }) as Story;
      const chips0: Story["chips"] = [{ kind: "person", id: "p0", name: "가" }, { kind: "place", id: "l0", name: "곳" }];
      const base: MyLifeData = {
        events: [ev("e1", [story("s1", "e1", chips0, "p9")]), ev("e2", [story("s1", "e1", chips0, "p9")])], // 같은 이야기가 두 시기에
        people: [
          { id: "p0", name: "가", relation: null, metYear: null, birthYear: null, memo: null, groupIds: [], body: "" },
          { id: "p1", name: "나", relation: null, metYear: null, birthYear: null, memo: null, groupIds: [], body: "" },
          { id: "p9", name: "대상", relation: null, metYear: null, birthYear: null, memo: null, groupIds: [], body: "" },
        ],
        groups: [],
        places: [{ id: "l1", name: "새곳", address: null, source: null, lat: null, lng: null, groupIds: [] }],
        placeGroups: [],
      };
      const S1 = { type: "EPISODE", id: "s1" } as const;
      const E1 = { type: "LIFE_EVENT", id: "e1" } as const;
      const P1 = { type: "PERSON", id: "p1" } as const;
      type Ref = OptLink["planet"];
      const op = (id: number, o: "add" | "remove", planet: Ref, sat: Ref, saved = false, alsoPeriod = false): OptLink => ({ id, op: o, planet, sat, alsoPeriod, saved });
      // 서버가 넣은 뒤의 데이터(이야기 칩 + 시기 사람 — addLink 의 STORY 시기 연결)
      const withP1: MyLifeData = applyOptLinks(base, [op(0, "add", S1, P1, true, true)]);
      const a1 = applyOptLinks(base, [op(1, "add", S1, P1, false, true)]);
      const s1chips = (d: MyLifeData, e: number) => d.events[e].stories[0].chips.map((c) => `${c.kind}:${c.id}`).join(",");
      check("⑬ U3 낙관적 반영 — 이야기에 사람 = 두 시기의 같은 이야기 모두 + 서버 순서 자리(장소 앞) + 그 시기 사람(alsoPeriod) · 장소 = 맨 끝 · 대상 인물은 이미 있음 · 항목 없으면 서버 데이터 그대로",
        s1chips(a1, 0) === "person:p0,person:p1,place:l0" && s1chips(a1, 1) === "person:p0,person:p1,place:l0" && a1.events[0].personIds.join() === "p1" &&
          s1chips(applyOptLinks(base, [op(1, "add", S1, { type: "PLACE", id: "l1" })]), 0) === "person:p0,place:l0,place:l1" &&
          hasLink(base, S1, { type: "PERSON", id: "p9" }) && applyOptLinks(base, [op(1, "add", S1, { type: "PERSON", id: "p9" })]).events[0].stories[0].chips.length === 2 &&
          applyOptLinks(base, [op(1, "add", E1, P1)]).events[0].personIds.join() === "p1" && applyOptLinks(base, []) === base);

      // 화면 흐름 흉내 — MyLifeView 와 같은 규칙(그릴 때마다 settle, 새 항목은 같은 쌍을 대신, 저장 끝 = saved, 실패 = 지움)
      const sim = (server: MyLifeData) => {
        let list: readonly OptLink[] = [];
        let srv = server;
        let seq = 0;
        return {
          show: (o: "add" | "remove") => {
            const id = ++seq;
            list = putOptLink(list, op(id, o, S1, P1, false, true));
            return id;
          },
          saved: (id: number) => {
            list = list.map((x) => (x.id === id ? { ...x, saved: true } : x));
          },
          hide: (id: number) => {
            list = list.filter((x) => x.id !== id);
          },
          refresh: (d: MyLifeData) => {
            srv = d;
          },
          render: () => {
            list = settleOptLinks(srv, list);
            return hasLink(applyOptLinks(srv, list), S1, P1);
          },
          size: () => list.length,
        };
      };
      // ① 넣기 — 궤도에 든 순간 보임 → 저장 → 새 데이터에 보이면 항목 지움
      const t1 = sim(base);
      const i1 = t1.show("add");
      const r1a = t1.render();
      t1.saved(i1);
      const r1b = t1.render() && t1.size() === 1; // 새 데이터 오기 전 — 항목 그대로
      t1.refresh(withP1);
      const r1c = t1.render() && t1.size() === 0;
      // ② 저장 실패 — 위성 빠짐
      const t2 = sim(base);
      t2.hide(t2.show("add"));
      const r2 = !t2.render() && t2.size() === 0;
      // ③ 되돌리는 중 다시 넣기 — 늦은 되돌리기 응답·새로고침이 다시 넣은 위성을 숨기지 않음
      const t3 = sim(withP1);
      const u3 = t3.show("remove");
      const r3a = !t3.render();
      const i3 = t3.show("add"); // 같은 쌍 — 되돌리기 항목을 대신
      t3.saved(u3); // 늦게 온 되돌리기 응답(이미 대신됨 — 영향 없음)
      t3.refresh(base); // 되돌리기 새로고침(위성 없음)
      const r3b = t3.render();
      t3.saved(i3);
      t3.refresh(withP1);
      const r3c = t3.render() && t3.size() === 0;
      // ③-2 되돌리기 응답 뒤 새로고침이 이미 다시 넣은 뒤의 데이터(위성 있음)를 가져와도 — 대신된 되돌리기 항목이 남아 숨기지 않음
      const t3b = sim(withP1);
      const u3b = t3b.show("remove");
      const i3b = t3b.show("add");
      t3b.saved(u3b);
      t3b.refresh(withP1);
      t3b.saved(i3b);
      const r3d = t3b.render() && t3b.size() === 0;
      // ④ 저장 응답 전에 새로고침이 먼저 와도 — 보임 유지, 저장 끝나면 바로 정리(남은 항목이 뒤 [빼기]를 뒤집지 않게)
      const t4 = sim(base);
      const i4 = t4.show("add");
      t4.refresh(withP1);
      const r4a = t4.render() && t4.size() === 1;
      t4.saved(i4);
      const r4b = t4.render() && t4.size() === 0;
      t4.refresh(base); // 그 뒤 패널 [빼기]
      const r4c = !t4.render();
      // ⑤ 되돌리기 실패 — 다시 보임
      const t5 = sim(withP1);
      const u5 = t5.show("remove");
      const r5a = !t5.render();
      t5.hide(u5);
      const r5b = t5.render() && t5.size() === 0;
      // ⑥ 넣고 바로 되돌림(저장 끝 뒤) → 넣기 새로고침이 늦게 와도 숨김 유지
      const t6 = sim(base);
      const i6 = t6.show("add");
      t6.saved(i6);
      const u6 = t6.show("remove");
      t6.refresh(withP1);
      const r6a = !t6.render();
      t6.saved(u6);
      t6.refresh(base);
      const r6b = !t6.render() && t6.size() === 0;
      check("⑬ U3 낙관적 반영 순서 — ① 넣기 보임 → 저장 → 새 데이터에 보이면 정리 ② 실패 = 빠짐 ③ 되돌리는 중 다시 넣기(늦은 되돌리기 응답·새로고침이 안 숨김) ④ 저장 전 새로고침 → 저장 끝 바로 정리(뒤 [빼기] 안 뒤집음) ⑤ 되돌리기 실패 = 다시 보임 ⑥ 넣고 바로 되돌림(늦은 넣기 새로고침이 안 보임)",
        r1a && r1b && r1c && r2 && r3a && r3b && r3c && r3d && r4a && r4b && r4c && r5a && r5b && r6a && r6b,
        { r1a, r1b, r1c, r2, r3a, r3b, r3c, r3d, r4a, r4b, r4c, r5a, r5b, r6a, r6b });
      check("⑬ U3 낙관적 반영 화면 — 나선이 끝나면 onLand(저장 응답 전 위성) · 결과는 onSettled(실패 = 위성 빼고 튕김 + 넣지 못했어요) · 지도 이동은 응답 전 다시 켬 · [되돌리기]는 저장 끝 뒤에만 눌림(지도·패널) · 저장 뒤 새로고침 · 그릴 때 정리",
        dragSrc.includes(`const landed = early !== "failed" && early !== "already";`) &&
          dragSrc.includes("    o.onEnd(); // 지도 이동·확대 다시 켬 — 저장 응답과 무관\n    const r = await result;\n    o.onSettled(key, r, landed);") &&
          view.includes("if (optId) links.hide(optId); // 위성이 빠지고 그림이 튕겨 제자리(drag.ts)") && view.includes("setDropNotice({ text: C.space.dropFailed });") &&
          view.includes("disabled={!dropNotice.undo}") && editSrc.includes("disabled={pending || !notice.undo}") && editSrc.includes("setNotice({ key: nodeKey, text: E.linked, saving: true });") &&
          view.includes("const liveOpt = settleOptLinks(serverData, optLinks);") && view.includes("links.refresh();") && typeof C.space.dropFailed === "string");

      // U4 — 행성 꾸미기(docs/phase/ui-space.md §5·§7.5)
      const css = fs.readFileSync(path.resolve(__dirname, "../app/globals.css"), "utf8");
      const decorSrc = fs.readFileSync(path.resolve(__dirname, "../app/my-life/Decor.tsx"), "utf8");
      // 우주 문구 확정(2026-11-05 성민) — [임시] 표시 0 · dropped 의 을/를 = 넣은 것 이름의 받침·읽는 소리(lib/josa 한 곳) · decorHint 새 문구
      const copySrc = fs.readFileSync(path.resolve(__dirname, "../lib/my-life-copy.ts"), "utf8");
      const spaceBlock = copySrc.slice(copySrc.indexOf("  // 우주 개편 U1"), copySrc.lastIndexOf("};"));
      const dj = [
        C.space.dropped("김민준", "운동회"), // 받침 있음 → 을
        C.space.dropped("최영희", "운동회"), // 받침 없음 → 를
        C.space.dropped("Tom", "운동회"), // 영문 m(톰) → 을
        C.space.dropped("Paul", "운동회"), // 영문 l(폴) → 을
        C.space.dropped("Jack", "운동회"), // 영문 ck(잭) → 을
        C.space.dropped("Mike", "운동회"), // 영문 모음 끝(마이크) → 를
        C.space.dropped("Peter", "운동회"), // 영문 r(피터) → 를
        C.space.dropped("James", "운동회"), // 영문 s(제임스 — 판단 어려움) → 를
        C.space.dropped("친구1", "운동회"), // 숫자 1(일) → 을
        C.space.dropped("친구2", "운동회"), // 숫자 2(이) → 를
        C.space.dropped("반 10", "운동회"), // 숫자 0(십) → 을
        C.space.dropped("반 5", "운동회"), // 숫자 5(오) → 를
      ];
      check("⑬ 우주 문구 확정 — space 블록 [임시] 0 · dropped 을/를 = 받침 있음 을·없음 를 · 영문 끝 읽는 소리(톰·폴·잭 을 / 마이크·피터 를 · 제임스 = 판단 어려움 를) · 숫자 끝 읽는 소리(1 일·0 십 을 / 2 이·5 오 를) · decorHint 새 문구",
        !/임시/.test(spaceBlock) &&
          dj.join("|") ===
            "운동회에 김민준을 넣었어요.|운동회에 최영희를 넣었어요.|운동회에 Tom을 넣었어요.|운동회에 Paul을 넣었어요.|운동회에 Jack을 넣었어요.|운동회에 Mike를 넣었어요.|운동회에 Peter를 넣었어요.|운동회에 James를 넣었어요.|운동회에 친구1을 넣었어요.|운동회에 친구2를 넣었어요.|운동회에 반 10을 넣었어요.|운동회에 반 5를 넣었어요." &&
          C.space.decorHint === "고르면 바로 행성에 붙어요. 하나만 달 수 있어요.",
        dj);
      // 으로/로 — ㄹ 받침이면 "로"(2026-11-05 성민): 한글 ㄹ · 영문 l · 숫자 1·7·8 = "로" · 그 밖 받침 = "으로" · 받침 없음 = "로". 화면 = 만들기 재사용 알림·옮기기 확인
      const ro = ["서울", "부산", "대구", "Paul", "Tom", "1", "3"].map((w) => w + withJosa(w, "으로/로"));
      check("⑬ 조사 으로/로 — 서울로·부산으로·대구로·Paul로·Tom으로·1로·3으로 · 화면 문구(만들기 재사용·옮기기 확인)도 같은 함수",
        ro.join(" ") === "서울로 부산으로 대구로 Paul로 Tom으로 1로 3으로" &&
          C.edit.reused("교실") === "이미 있는 교실로 했어요." && C.edit.moveConfirm("소풍", "1971 고등학교 입학").endsWith("1971 고등학교 입학으로 옮길까요?"),
        ro);
      // custom-graph 2단계 임시 문구 62키 조사 점검(2026-11-06 — 점검 표 docs/temp-copy-inventory.md). 이름 바로 뒤 조사는 lib/josa 로.
      const X13 = C.custom;
      const same = ["초롱이", "강아지", "사진첩", "물건", "Paul", "Tom", "Mary", "7", "2"].map((w) => X13.sameNameTitle(w));
      const movedTo = ["취미", "물건", "서울", "Paul", "Tom", "1", "3"].map((w) => X13.moved(w));
      check("⑬ 사용자 카테고리 조사 — sameNameTitle 이/가(받침·읽는 소리) · moved 으로/로(ㄹ 받침 = 로)",
        same.join("|") ===
          "지도에 ‘초롱이’가 이미 있어요|지도에 ‘강아지’가 이미 있어요|지도에 ‘사진첩’이 이미 있어요|지도에 ‘물건’이 이미 있어요|지도에 ‘Paul’이 이미 있어요|지도에 ‘Tom’이 이미 있어요|지도에 ‘Mary’가 이미 있어요|지도에 ‘7’이 이미 있어요|지도에 ‘2’가 이미 있어요" &&
          movedTo.join("|") === "취미로 옮겼어요.|물건으로 옮겼어요.|서울로 옮겼어요.|Paul로 옮겼어요.|Tom으로 옮겼어요.|1로 옮겼어요.|3으로 옮겼어요.",
        [same, movedTo]);
      // 받침에 따라 갈리는 조사가 변수 바로 뒤에 글자로 적힌 곳 0(문구 파일·My Life 화면) — 있으면 withJosa 로.
      const rawJosa = ["lib/my-life-copy.ts", ...fs.readdirSync(path.resolve(__dirname, "..", "app/my-life")).filter((f) => /[.]tsx?$/.test(f)).map((f) => `app/my-life/${f}`)]
        .flatMap((f) => src(f).split(String.fromCharCode(10)).map((l, i) => [f, i + 1, l] as const))
        .filter(([, , l]) => new RegExp("[$][{][^}]+[}][’'\"”)]?(이|가|을|를|은|는|과|와|으로|로|이랑|랑|아|야)(?![가-힣])").test(l))
        .map(([f, n]) => `${f}:${n}`);
      check("⑬ 변수 바로 뒤 조사 글자 0(lib/my-life-copy·app/my-life) — 받침 따라 갈리는 조사는 lib/josa 만", rawJosa.length === 0, rawJosa);
      check("⑬ U4 꾸미기 목록 — 확정 8종 키·이름·순서(고리·혜성 꼬리·오로라·별빛 가루·태양 플레어·소용돌이·쌍둥이 별·블랙홀) · 목록 밖 값 거름 · dropFailed 확정 문구",
        DECOR_SHAPES.map((d) => `${d.key}:${d.name}`).join(",") ===
          "ring:고리,comet:혜성 꼬리,aurora:오로라,stardust:별빛 가루,flare:태양 플레어,vortex:소용돌이,binary:쌍둥이 별,blackhole:블랙홀" &&
          isDecorShape("vortex") && !isDecorShape("sparkle") && !isDecorShape(null) && decorName("binary") === "쌍둥이 별" &&
          C.space.dropFailed === "넣지 못했어요. 다시 해 주세요.");
      const runAt = DECOR_SHAPES.map((d) => css.indexOf(`.space-map[data-motion] .decor-sys[data-orbit="on"] .decor-${d.key} .dc-b {`));
      const holdAt = css.indexOf(`.space-map[data-motion="hold"] .decor-sys[data-orbit="on"] .decor .dc-b {\n  animation-play-state: paused;`);
      check("⑬ U4 꾸미기 그림 — CSS 만(Decor.tsx 에 rAF·타이머·animate 0) · 8종 모두 멈춘 그림(.dc-a)·움직임 규칙(화면 안 계만) · 멈춤 규칙(전체 보기·[움직임 멈추기]·움직임 줄이기 = 그 자리, 구체성 같고 뒤) · 화면 밖 판정 = 공전 관찰이 .decor-sys 도",
        !/requestAnimationFrame|setInterval|setTimeout|\.animate\(/.test(decorSrc) &&
          DECOR_SHAPES.every((d) => css.includes(`.decor-${d.key} .dc-a {`)) && runAt.every((i) => i > 0) && holdAt > Math.max(...runAt) &&
          orbitSrc.includes(`root.querySelectorAll(".orbit-sys, .decor-sys").forEach((el) => io.observe(el));`),
        { runAt, holdAt });
      // 반복 경계마다 animationiteration 이 메인 스레드를 깨움(React 뿌리 수신 — U2 와 같은 이유) — 한 벌 14초 이상 · alternate 안 씀(2026-11-05 실측: 1.8초 반짝임 = 메인 13.9ms/초 → 36초 한 벌 1.5)
      const runRules = DECOR_SHAPES.map((d) => {
        const i = css.indexOf(`.decor-sys[data-orbit="on"] .decor-${d.key} .dc-b {\n  animation: `);
        const m = /animation: (decor-[a-z]+) ([\d.]+)s ([a-z-]+) infinite([^;]*);/.exec(css.slice(i, i + 200));
        return i > 0 && m ? { name: m[1], secs: Number(m[2]), rest: m[4] } : null;
      });
      check("⑬ U4 꾸미기 움직임 한 벌 14초 이상 · alternate 0(반복 경계가 메인 스레드를 깨우지 않게)", runRules.every((r) => r && r.secs >= 14 && !/alternate/.test(r.rest)), runRules);
      check("⑬ U4 블랙홀·이름표 — 블랙홀 행성 면 = 어두운 면 + 밝은 글자 + 빛 테(지도·고르기 칸) · 꾸민 행성의 위성 이름표 = 바탕색 테두리(그림 위 글자 대비)",
        css.includes(`.planet-period[data-decor="blackhole"],\n.planet-story[data-decor="blackhole"] {`) && css.includes("  color: #f1eeff;\n  border-color: #ffd27a;") &&
          css.includes(".orbit-sys[data-decor] .orbit-lbl {\n  text-shadow: 0 0 2px var(--color-canvas)"));
      check("⑬ U4 지도·고르기 — 꾸미기 계가 행성 버튼 앞(행성·위성 뒤에 그림) · 행성 버튼·위성 계 data-decor · 고르기 = SELECTED 한 가지 + aria-pressed · 칸 높이 104 · [꾸미기 없애기]",
        view.includes("              {decorSys(en, ev.decor)}\n              <button") && view.includes("                        {decorSys(n, s.decor)}\n                        <StoryPlanet") &&
          view.includes("                data-decor={ev.decor ?? undefined}") && view.includes("      data-decor={story.decor ?? undefined}") &&
          view.includes("data-decor={decor ?? undefined}>") && decorSrc.includes("on ? SELECTED :") && decorSrc.includes("aria-pressed={on}") &&
          decorSrc.includes("min-h-[104px]") && decorSrc.includes("{C.space.decorClear}"));
      // 낙관적 반영 — 고르는 순간 보임 · 실패면 원래대로 · 빠르게 두 번 고르면 뒤 것 · 늦은 새로고침이 뒤집지 않음 · 이야기 모든 자리
      const dBase: MyLifeData = { ...base, events: base.events.map((e) => ({ ...e, decor: null, stories: e.stories.map((s) => ({ ...s, decor: null })) })) };
      const withDecor = (d: MyLifeData, k: "ev" | "st", shape: string | null): MyLifeData => ({
        ...d,
        events: d.events.map((e) => (k === "ev" && e.id === "e1" ? { ...e, decor: shape } : k === "st" ? { ...e, stories: e.stories.map((s) => (s.id === "s1" ? { ...s, decor: shape } : s)) } : e)),
      });
      const od = (id: number, planet: OptDecor["planet"], shape: string | null, saved = false): OptDecor => ({ id, planet, shape, saved });
      let ld: readonly OptDecor[] = putOptDecor([], od(1, E1, "ring"));
      const q1 = decorOf(applyOptDecor(dBase, ld), E1) === "ring";
      ld = putOptDecor(ld, od(2, E1, "comet")); // 저장 전에 다시 고름 — 앞 항목을 대신
      const q2 = ld.length === 1 && decorOf(applyOptDecor(dBase, ld), E1) === "comet";
      ld = settleOptDecor(withDecor(dBase, "ev", "ring"), ld); // 앞 고르기 새로고침(고리)이 먼저 와도
      const q3 = decorOf(applyOptDecor(withDecor(dBase, "ev", "ring"), ld), E1) === "comet";
      ld = settleOptDecor(withDecor(dBase, "ev", "comet"), ld.map((o) => ({ ...o, saved: true })));
      const q4 = ld.length === 0;
      let lf: readonly OptDecor[] = putOptDecor([], od(3, E1, "vortex"));
      lf = lf.filter((o) => o.id !== 3); // 실패
      const q5 = decorOf(applyOptDecor(dBase, lf), E1) === null;
      const st2 = applyOptDecor(dBase, [od(4, S1, "blackhole")]);
      const q6 = st2.events.every((e) => e.stories.every((s) => s.decor === "blackhole")) && applyOptDecor(dBase, []) === dBase;
      check("⑬ U4 꾸미기 낙관적 반영 — 고르는 순간 보임 · 저장 전 다시 고르면 뒤 것 · 앞 고르기 새로고침이 먼저 와도 뒤 것 유지 · 저장 끝 + 서버 같음 = 정리 · 실패 = 원래대로 · 같은 이야기 모든 자리",
        q1 && q2 && q3 && q4 && q5 && q6, { q1, q2, q3, q4, q5, q6 });
    }
    {
      // 밤 우주 전원(2026-11-05) — 화면 코드에 직접 적은 기본 팔레트 색이 다시 생기지 않게(밤에서 안 뒤집혀 섞인 색이 됨, ui-night §8).
      // 예외 = 포스터 그림·인쇄물(print-export·PosterInteractive)·공유 그림·매니페스트(색 클래스가 아닌 그림 값).
      const walk = (dir: string): string[] =>
        fs.readdirSync(path.resolve(__dirname, "..", dir), { withFileTypes: true }).flatMap((d) =>
          d.isDirectory() ? walk(`${dir}/${d.name}`) : /\.(ts|tsx)$/.test(d.name) ? [`${dir}/${d.name}`] : []);
      const RAW = /(?:^|[^a-z-])(?:text|bg|border|border-[lrtbxy]|ring|from|to|via|fill|stroke|outline|divide|placeholder|accent|decoration|caret)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/;
      const hits = ["app", "components"].flatMap(walk)
        .filter((f) => !/^app\/(poster\/(print-export|PosterInteractive)|opengraph-image|manifest)\./.test(f))
        .flatMap((f) => src(f).split("\n").map((l, i) => [f, i + 1, l] as const))
        .filter(([, , l]) => RAW.test(l) || /(?:^|[\s"'`:])bg-white\b/.test(l) || /bg-action\b[^"'`]*\btext-white\b/.test(l))
        .map(([f, n]) => `${f}:${n}`);
      check("⑬ 밤 우주 전원 — 화면 코드 Tailwind 기본 팔레트 색·bg-white·\"bg-action … text-white\" 0(토큰만)", hits.length === 0, hits.slice(0, 8));
      // 이름 뒤 "님" = 띄어 씀(2026-11-07 성민). 직함 뒤 붙여 쓰는 곳은 lib/person-honorific 한 곳.
      const nim = ["app", "components", "lib"].flatMap(walk)
        .filter((f) => !f.startsWith("lib/generated/") && f !== "lib/person-honorific.ts")
        .flatMap((f) => src(f).split("\n").map((l, i) => [f, i + 1, l] as const))
        .filter(([, , l]) => /(?:\}|<\/b>|<\/span>)님/.test(l))
        .map(([f, n]) => `${f}:${n}`);
      check("⑬ 이름 뒤 \"님\" 띄어 씀 — 값 바로 뒤에 붙인 고정 문구 0", nim.length === 0, nim.slice(0, 8));
      // 제목 글꼴 = 저장소 파일(2026-11-07 — 빌드가 Google 글꼴 받기에 기대지 않게, docs/troubleshooting/next-font-google-build.md)
      const fontDir = path.resolve(__dirname, "..", "app/fonts/noto-serif-kr");
      check("⑬ 제목 글꼴 = 저장소 파일 — next/font/google 없음 · 글꼴 4개 · 라이선스 파일",
        !["app", "components", "lib"].flatMap(walk).some((f) => !f.startsWith("lib/generated/") && src(f).includes('from "next/font/google"')) &&
          ["Regular-core", "Bold-core", "Regular-rest", "Bold-rest"].every((n) => fs.existsSync(path.join(fontDir, `NotoSerifKR-${n}.woff2`))) &&
          fs.existsSync(path.join(fontDir, "OFL.txt")));
    }
    check("⑬ 사이드 패널 첫 진입 = 닫힘(모든 화면 — 2026-11-05 성민 결정) · 연 기록(\"open\")이 있을 때만 열림",
      src("app/timemachine/SidePanel.tsx").includes('const open = choice ?? (mounted && stored === "open");') && !src("app/timemachine/SidePanel.tsx").includes("firstOpen"));
    check("⑬ 꼬리표 \"다른 시기에도\" — 화면 꼬리표가 보이면 낭독 이름 끝에도 · 그때의 나는 그대로 · 이야기 패널 \"다른 시기에도 있어요: …\"",
      C.alsoElsewhereShort === "다른 시기에도" && C.storyName("수학여행", ["철수"], C.alsoElsewhereShort) === "이야기, 수학여행, 함께: 철수, 다른 시기에도" &&
        C.storyName("수학여행", []) === "이야기, 수학여행" && view.includes("C.storyName(displayTitle(s), names, tagText(s))") &&
        C.panelAlsoIn("1971 고등학교 입학, 1975 대학교 입학") === "다른 시기에도 있어요: 1971 고등학교 입학, 1975 대학교 입학");
    check("⑬ 패널 목록 제목 — 시기 패널 \"이 시기의 분들\"·\"이 시기의 장소\" / 이야기 패널 \"함께 나온 분\"·\"이야기에 나온 곳\"(이야기 상세와 같은 글) · 장소 패널 지도 앱 버튼 · 사람 패널 /people 링크 없음(인물록 통합 2026-11-06)",
      edit.includes("sections.push({ title: C.panelPeriodPeople,") && edit.includes("sections.push({ title: C.panelPeriodPlaces,") &&
        edit.includes("title: C.panelWithPeople,") && edit.includes("sections.push({ title: C.panelWithPlaces, items: nn(story.chips") &&
        C.panelWithPeople === C.body.peopleTitle && C.panelWithPlaces === C.body.placesTitle &&
        !("openPerson" in C) && !view.includes("href={`/people/") && C.openMap === "지도 앱에서 열기" && view.includes("{C.openMap} ↗"));
    const side13 = src("app/timemachine/SidePanel.tsx");
    check("⑬ 사이드 메뉴 전부 — 이름·설명 18px(메뉴 항목 하나의 부품 MenuItem)",
      side13.includes('<span className="flex items-center gap-1.5 text-lg font-semibold text-ink">') && side13.includes('<span className="mt-0.5 text-lg text-ink-soft">{hint}</span>') &&
        !side13.includes("text-xs text-ink-soft\">{hint}") && !/\blarge\b/.test(side13));
    // 확대 줄 오른쪽 비서 버튼 자리 104 → 96(U2 — Q112 A [움직임 멈추기]가 들어갈 폭 278)
    check("⑬ 지도 아래 이동 줄·확대 줄 위아래 여백 4px",
      view.includes('className="flex items-center gap-2 bg-surface px-4 pt-1"') && view.includes('className="flex items-center gap-2 bg-surface py-1 pl-4 pr-[96px]"'));
    check("⑬ 지도 머리 줄 — 390 에서 제목 한 줄(안 꺾음) · 좁은 화면 [찾기]·[목록으로 보기] 좌우 여백 12px",
      view.includes('<h1 className="m-0 shrink-0 whitespace-nowrap text-[28px]">{C.pageTitle}</h1>') &&
        (view.match(/className="px-3! sm:px-4!" onClick={(onOpenFind|onToggleView)}/g) ?? []).length === 2);
    // 2026-11-04 — 고정 [내 정보] 버튼 겹침: 로그인한 화면의 앱 머리 줄을 위에 붙이고(sticky) 버튼을 그 안 오른쪽 빈자리에. 다른 sticky 줄·앵커는 그 아래에서.
    const layout13 = src("app/layout.tsx");
    const css13 = src("app/globals.css");
    check("⑬ 앱 머리 줄(로그인) — sticky·높이 --app-header-h 56px·오른쪽 버튼 자리 · 버튼은 그 안 가운데(보이는 48 + 터치 56) · html scroll-padding · chat-v3·포스터 고르기 sticky 줄은 그 아래",
      layout13.includes('"sticky top-0 z-20 flex h-[var(--app-header-h)] items-center border-b border-line bg-canvas pl-6 pr-44"') &&
        layout13.includes('data-app-header={sidePanelData ? "" : undefined}') && css13.includes("--app-header-h: 3.5rem;") && side13.includes("before:absolute before:inset-x-0 before:-inset-y-1.5") &&
        /html\[data-app-header\] \{\s*scroll-padding-top: var\(--app-header-h\);/.test(css13) &&
        side13.includes("fixed right-4 top-[calc((var(--app-header-h)-3rem)/2)] z-30") &&
        src("app/chat-v3/ChatV3Client.tsx").includes('className="sticky top-[var(--app-header-h)] z-20 ') &&
        src("app/chat-v3/ChatV3Client.tsx").includes("root.style.scrollPaddingTop = `calc(var(--app-header-h) + ${el.offsetHeight}px)`;") &&
        src("app/poster/select/PosterSelectClient.tsx").includes('className="sticky top-[var(--app-header-h)] z-10 ') &&
        ["app/privacy/page.tsx", "app/terms/page.tsx"].every((f) => src(f).includes('role="note" className="mt-4 scroll-mt-4 ')) &&
        !/sticky top-0/.test(src("app/chat-v3/ChatV3Client.tsx") + src("app/poster/select/PosterSelectClient.tsx")));

    for (const [g, pg] of [[0, 1], [2, 2], [3, 3], [1, 5]] as const) {
      const syn = synthetic({ events: 11, stories: 23, people: 12, groups: g, places: 14, placeGroups: pg, seed: 21 + pg });
      const ly = layoutMyLife(syn);
      const placeShapes = ly.shapes.filter((s) => s.region === "places").length;
      const placeChips = ly.nodes.filter((n) => n.kind === "groupChip" && n.region === "places").length;
      check(`⑦ 합성 모임 ${g}·장소 묶음 ${pg} — 교차 0·소속 맞음(두 영역)·묶음 영역 ${Math.min(pg, 3)}${pg > 3 ? `·칩 ${pg}` : ""}`,
        findOverlaps(ly.nodes).length === 0 && membershipErrors(syn, ly).length === 0 && placeShapes === Math.min(pg, 3) && placeChips === (pg > 3 ? pg : 0) &&
          ly.nodes.filter((n) => n.kind === "place").length === 14 && ly.shifted === 0,
        { o: findOverlaps(ly.nodes).slice(0, 3), m: membershipErrors(syn, ly).slice(0, 3), placeShapes, placeChips });
    }
    // ── ⑭ 사용자 카테고리 배치(custom-graph 2단계 — docs/phase/custom-graph.md §3.2·§3.3 9 · §6.6) ─────────────────────
    {
      // F-20-300: 시간 줄기 100(시기 20·이야기 80) · 인물록 64(사람 60·모임 4) · 장소록 42(장소 40·묶음 2) · 사용자 카테고리 18 · 항목·묶음 94 · 넣기 60
      const base = synthetic({ events: 20, stories: 80, people: 60, groups: 4, places: 40, placeGroups: 2, seed: 11 });
      let x = 5;
      const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
      const cats = Array.from({ length: 18 }, (_, i) => ({ id: `cat${i}`, name: `카테고리 ${i}`, refs: [] as MyLifeRef[] }));
      const cgroups: MyLifeCustom["groups"] = [];
      const items: MyLifeCustom["items"] = [];
      for (let k = 0; k < 94; k++) {
        const c = cats[k % 18];
        if (k % 6 === 0) cgroups.push({ id: `cg${k}`, name: `묶음 ${k}`, categoryId: c.id, memberRefs: [] });
        else items.push({ id: `it${k}`, name: `항목 ${k}`, categoryId: c.id, body: "", related: [] });
      }
      const sixes: MyLifeRef[] = [
        ...base.people.map((p) => ({ type: "PERSON" as const, id: p.id })),
        ...base.places.map((p) => ({ type: "PLACE" as const, id: p.id })),
        ...base.events.flatMap((e) => e.stories.map((s) => ({ type: "EPISODE" as const, id: s.id }))),
      ];
      for (let k = 0; k < 60; k++) {
        const c = cats[Math.floor(rnd() * 18)];
        const r = sixes[Math.floor(rnd() * sixes.length)];
        const gs = cgroups.filter((g) => g.categoryId === c.id);
        if (gs.length > 0 && rnd() < 0.5) {
          const g = gs[Math.floor(rnd() * gs.length)];
          if (!g.memberRefs.some((m) => m.type === r.type && m.id === r.id)) g.memberRefs.push(r);
        } else if (!c.refs.some((m) => m.type === r.type && m.id === r.id)) c.refs.push(r);
      }
      // 항목 일부는 자기 카테고리 묶음에 · 다른 카테고리에도 넣기(바로가기)
      for (const it of items) {
        const gs = cgroups.filter((g) => g.categoryId === it.categoryId);
        if (gs.length > 0 && rnd() < 0.4) gs[0].memberRefs.push({ type: "CUSTOM", id: it.id });
        if (rnd() < 0.15) cats[(Number(it.categoryId.slice(3)) + 1) % 18].refs.push({ type: "CUSTOM", id: it.id });
      }
      const custom: MyLifeCustom = { categories: cats, groups: cgroups, items, builtinNames: { PEOPLE: null, PLACES: null } };
      const d14: MyLifeData = { ...base, custom };
      const all = new Set(cats.map((c) => c.id));
      const closedL = layoutMyLife(d14);
      check("⑭ 사용자 카테고리 18개(6개 이상) — 처음엔 전부 제목 줄(칸 0) · 제목마다 [펼치기]",
        closedL.nodes.filter((n) => n.kind === "catTitle" && n.collapsed && n.foldable).length === 18 && !closedL.nodes.some((n) => n.kind === "catItem" || n.kind === "catRef"));
      const openL = layoutMyLife(d14, { openCats: all, moreCats: all });
      const keys = openL.nodes.map((n) => n.key);
      check("⑭ F-20-300 전부 펼침 — 노드 교차 0 · 키 중복 0 · 세계 안",
        findOverlaps(openL.nodes).length === 0 && new Set(keys).size === keys.length && openL.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= openL.width && n.y + n.h <= openL.height),
        findOverlaps(openL.nodes).slice(0, 3));
      // 소속 — 칸은 자기 묶음 성운 안·같은 카테고리 다른 묶음 성운 밖
      const memberErrs: string[] = [];
      for (const s of openL.shapes.filter((x) => x.region === "custom")) {
        const g = cgroups.find((y) => y.id === s.groupId)!;
        const cat = cats.find((c) => c.id === g.categoryId)!;
        for (const e of categoryEntries(cat, custom)) {
          const n = openL.nodes.find((m) => m.key === e.key);
          if (!n) continue;
          const member = e.groupIds.includes(g.id);
          if (member ? !rectInsideShape(s, n) : !rectOutsideShape(s, n)) memberErrs.push(`${e.key}:${g.id}`);
        }
      }
      check("⑭ 묶음 성운 소속 오류 0(Euler — 인물록 모임과 같은 배치)", memberErrs.length === 0, memberErrs.slice(0, 5));
      // 진짜 노드는 한 번 · 바로가기는 카테고리마다 한 칸
      const itemCells = openL.nodes.filter((n) => n.kind === "catItem").map((n) => n.key);
      const refPerCat = new Map<string, number>();
      for (const n of openL.nodes) if (n.kind === "catRef") refPerCat.set(`${n.categoryId}:${n.ref.type}:${n.ref.id}`, (refPerCat.get(`${n.categoryId}:${n.ref.type}:${n.ref.id}`) ?? 0) + 1);
      check("⑭ 사용자 항목 = 지도에 한 번(자리) · 바로가기 = 한 카테고리 안에서 한 칸 · 6종 진짜 노드는 그대로 한 번",
        new Set(itemCells).size === items.length && [...refPerCat.values()].every((v) => v === 1) &&
          openL.nodes.filter((n) => n.kind === "person").length === base.people.length && openL.nodes.filter((n) => n.kind === "place").length === base.places.length);
      // 종류별 x 범위 — 사용자 카테고리는 오른쪽 열(REGION_X 부터), 장소록 아래
      const catNodes = openL.nodes.filter((n) => "categoryId" in n);
      const placesBottom = openL.regions.places.y + openL.regions.places.h;
      check("⑭ 사용자 카테고리 칸 = 오른쪽 열(x ≥ REGION_X) · 장소록 아래 · 영역 18개",
        catNodes.every((n) => n.x >= L.REGION_X && n.y >= placesBottom) && openL.regions.categories.length === 18);
      // 접힘 ① — 묶음에 없는 칸 9개 넘으면 9 + [N개 더 보기](펼치지 않은 [더 보기])
      const big: MyLifeCustom = { ...custom, categories: [{ id: "catB", name: "많은 카테고리", refs: [] }], groups: [], items: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, name: `칸 ${i}`, categoryId: "catB", body: "", related: [] })) };
      const bl = layoutMyLife({ ...base, custom: big });
      const more = bl.nodes.find((n) => n.kind === "catMore");
      const blOpen = layoutMyLife({ ...base, custom: big }, { moreCats: new Set(["catB"]) });
      check("⑭ 접힘 ① — 묶음 없는 칸 12 → 9칸 + [3개 더 보기] · 열면 12칸 + [접기]",
        bl.nodes.filter((n) => n.kind === "catItem").length === 9 && more?.kind === "catMore" && more.count === 3 && !more.open &&
          blOpen.nodes.filter((n) => n.kind === "catItem").length === 12 && blOpen.nodes.some((n) => n.kind === "catMore" && n.open));
      // 390 — 제목 줄([펼치기]·[접기])·추가 줄은 영역을 왼쪽 24 에 맞췄을 때 화면 안(330 + 24 ≤ 366)
      check("⑭ 390 — 제목 줄·[+ 항목][+ 묶음][+ 넣기] 폭 330(영역 왼쪽 24 → 오른쪽 끝 354 ≤ 390)",
        openL.nodes.filter((n) => n.kind === "catTitle" || n.kind === "catAdd").every((n) => n.w === L.CAT_ADD_W) && L.CAT_ADD_W + 24 <= 366);
      // 배치 시간 — 50ms 이하(5번 중 가운데)
      const times = Array.from({ length: 5 }, () => {
        const t0 = performance.now();
        layoutMyLife(d14, { openCats: all, moreCats: all });
        return performance.now() - t0;
      }).sort((p, q) => p - q);
      check("⑭ layoutMyLife(F-20-300 전부 펼침) 50ms 이하", times[2] <= 50, { median: Math.round(times[2] * 10) / 10 });
      // 찾기 — 카테고리·묶음·항목(이름·글)
      const s14 = searchMyLife({ ...d14, custom: { ...custom, items: [...items, { id: "itx", name: "초롱이", categoryId: "cat0", body: "진돗개 강아지", related: [] }] } }, "진돗개");
      check("⑭ 찾기 — 항목 글(진돗개) · 카테고리 이름 · 묶음 이름",
        s14.some((r) => r.kind === "item" && r.key === "cn:itx") && searchMyLife(d14, "카테고리 3").some((r) => r.kind === "category" && r.key === "cat:cat3") &&
          searchMyLife(d14, "묶음 6").some((r) => r.kind === "customGroup"));
      // 화면 입구(정적)
      const view14 = src("app/my-life/MyLifeView.tsx");
      const cust14 = src("app/my-life/Custom.tsx");
      check("⑭ 화면 — 지도 영역(CategoryRegions)·이동 줄 [다른 카테고리](CategorySheet)·목록 보기 절·패널 정보·찾기 종류·기본 카테고리 제목 버튼",
        view14.includes("<CategoryRegions data={data} layout={layout}") && view14.includes("<CategorySheet open={catSheet}") && view14.includes("<CategoryListSections data={data}") &&
          view14.includes("return customPanelInfo(nodeKey, data);") && view14.includes('data-node-key="bcat:PEOPLE"') && view14.includes("C.custom.toCategories") &&
          cust14.includes('data-node-kind="catRef"') && cust14.includes("data-target-key={info.key}") && !/"[^"]*\[임시/.test(cust14));
    }
    // ── ⑯ 튜토리얼(docs/phase/tutorial.md — T1~T8 2026-11-08) — 흐름(순수) · 다시 보기 입구 · 연습 판 = 실제 그리기 · DB·모델 0 ──
    {
      check("⑯ 첫 진입 카드 — 마침·건너뜀·나중에 기록이 없을 때만(T1)",
        shouldOffer([]) && shouldOffer(["main", ASK_HINT]) && !shouldOffer([TUTORIAL_DONE]) && !shouldOffer([TUTORIAL_SKIP]) && !shouldOffer([TUTORIAL_LATER]));
      check("⑯ 닫을 때 기록 — 끝내기 = 마침 · 건너뛰기 = 건너뜀(T8 — 둘을 가름)", closeTourId("finish") === TUTORIAL_DONE && closeTourId("skip") === TUTORIAL_SKIP);
      let st = initialTutorial();
      check("⑯ 처음 = ① 지도 읽기 · 아직 안 펼침", st.step === "read" && !st.opened);
      st = tutorialReducer(tutorialReducer(st, { t: "openPlanet" }), { t: "next" });
      check("⑯ ① 펼침 → [다음] = ② 직접 넣기", st.opened && st.step === "drag" && !showButtonAdd(st));
      const f1 = tutorialReducer(st, { t: "dropFail" });
      const f2 = tutorialReducer(f1, { t: "dropFail" });
      check(`⑯ ② 끌기 ${DRAG_FAILS_FOR_BUTTON}번 실패 → [버튼으로 넣기](1번은 아직)`, !showButtonAdd(f1) && showButtonAdd(f2) && DRAG_FAILS_FOR_BUTTON === 2);
      const ok = tutorialReducer(f2, { t: "dropped" });
      check("⑯ ② 넣으면 버튼 사라짐 · 넣은 뒤 실패는 안 셈", !showButtonAdd(ok) && ok.dropped && tutorialReducer(ok, { t: "dropFail" }).dragFails === 2);
      let ai = tutorialReducer(ok, { t: "next" });
      ai = tutorialReducer(tutorialReducer(tutorialReducer(ai, { t: "ask" }), { t: "editPlan" }), { t: "editApply" });
      check("⑯ ③ 물어보기 예시 · 고치기 예시 확인 카드 → 결과 → 되돌리기", ai.step === "ai" && ai.askShown && ai.edit === "done" && tutorialReducer(ai, { t: "editUndo" }).edit === "undone" && tutorialReducer(tutorialReducer(ai, { t: "editUndo" }), { t: "editUndo" }).edit === "undone");
      const end = tutorialReducer(ai, { t: "next" });
      check("⑯ 끝 카드에서 [다음]은 더 안 감 · 단계 3 + 끝", end.step === "end" && tutorialReducer(end, { t: "next" }).step === "end" && TUTORIAL_STEPS.length === 4 && TUTORIAL_STEP_COUNT === 3);
      check("⑯ 체험 안 해도 [다음]으로 넘어감(강제 아님)", tutorialReducer(tutorialReducer(initialTutorial(), { t: "next" }), { t: "next" }).step === "ai");

      // 연습 판 = 실제 배치·그리기(T4) — 가짜 데이터로 layoutMyLife → 이야기 행성 + 위성
      const lay0 = layoutMyLife(practiceData({ added: false, title: C.tutorial.fakeStory }));
      const lay1 = layoutMyLife(practiceData({ added: true, title: C.tutorial.fakeStory }));
      const sats = (l: MyLifeLayout) => l.satellites.filter((x) => x.planetKey === PRACTICE_STORY_KEY && x.ref).length;
      check("⑯ 연습 판 — 실제 배치로 이야기 행성 1 · 위성 2 → 넣으면 3", lay0.nodes.some((n) => n.key === PRACTICE_STORY_KEY && n.kind === "story") && sats(lay0) === 2 && sats(lay1) === 3);
      const tut = src("app/my-life/Tutorial.tsx");
      check("⑯ 연습 판 — 실제 그리기 코드(StoryPlanet · OrbitSystem · ORBIT_CSS · 공전 관찰 · 끌기 beginPress · 실제 카드 부품)",
        /import \{ ORBIT_CSS, OrbitSystem, StoryPlanet \} from "\.\/MyLifeView"/.test(tut) && tut.includes("beginPress({") && tut.includes("observeOrbits(root)") &&
          tut.includes("layoutMyLife(data)") && /import \{ AnswerClaims, PlanCard, ResultCard \} from "\.\/AskCards"/.test(tut) && src("app/my-life/MyLifeView.tsx").includes("return <OrbitSystem n={n} list={list}"));
      const tutLibs = [tut, src("lib/tutorial.ts"), src("lib/tutorial-practice.ts")].join("\n");
      check("⑯ 연습 = DB 쓰기·모델 호출 0 — 서버 액션은 투어 기록 하나뿐 · DB·AI 모듈 안 씀",
        !/from "\.\/actions"|@\/lib\/db|lib\/ai"|sendMessage|planMapEdit|applyMapEdit|askMap\(/.test(tutLibs) && (tut.match(/Action\(/g) ?? []).every(() => true) &&
          [...tut.matchAll(/(\w+Action)\(/g)].every((m) => m[1] === "markTourCompletedAction"));
      // 다시 보기 입구(T3) — 사이드 패널(V3) · [찾기] 시트 맨 아래 · ?tutorial=1
      const side = src("app/timemachine/SidePanel.tsx");
      const view16 = src("app/my-life/MyLifeView.tsx");
      check("⑯ 다시 보기 — 사이드 패널(V3: 같은 화면이면 신호 · 아니면 /my-life?tutorial=1) · [찾기] 시트 맨 아래 · 튜토리얼이 둘 다 들음",
        side.includes("if (pathname === \"/my-life\") window.dispatchEvent(new Event(TUTORIAL_EVENT));") && side.includes("else router.push(TUTORIAL_HREF);") && TUTORIAL_HREF === "/my-life?tutorial=1" &&
          view16.includes("window.dispatchEvent(new Event(TUTORIAL_EVENT));") && view16.includes("{C.tutorial.again}") &&
          tut.includes("window.addEventListener(TUTORIAL_EVENT, on)") && tut.includes("searchParams.get(TUTORIAL_QUERY)"));
      check("⑯ 건너뛰기·Esc = 건너뜀 기록 · [나중에] = 나중에 기록 · [끝내기] 뒤 [찾기] 한 번 가리키기(data-tour)",
        tut.includes('close("skip")') && tut.includes("onCancel={(e) => {") && tut.includes("markTourCompletedAction(TUTORIAL_LATER)") && tut.includes("markTourCompletedAction(closeTourId(how))") &&
          tut.includes('target: "mylife-find"') && view16.includes('data-tour="mylife-find"'));
      check("⑯ AI 시트 첫 안내(T2) — 처음 연 때만 · 그때 기록", view16.includes("markTourCompletedAction(ASK_HINT)") && src("app/my-life/AskSheet.tsx").includes("{hint && <p") && src("app/my-life/page.tsx").includes("completedTours"));
      // 가짜 이름 = 픽스처·재생 세트·실제 대화 낱말과 안 겹침(작업 규칙 8 취지) · 조작 안내에 "행성·위성" 없음(T7 (나)) · 문구 [임시]
      const fakes = [C.tutorial.fakeEvent, C.tutorial.fakeStory, C.tutorial.fakeStoryRenamed, C.tutorial.fakePerson, C.tutorial.fakePlace, C.tutorial.fakeCandidate];
      const fixtureText = [
        ...fs.readdirSync(path.resolve(__dirname, "test-fixtures/map-agent-replay")).map((f) => src(`db/test-fixtures/map-agent-replay/${f}`)),
        src("db/test-chat-proposal.ts"),
        src("db/test-my-life-edit.ts"),
      ].join("\n");
      check("⑯ 연습 판 가짜 이름이 픽스처·재생 세트 낱말과 안 겹침", fakes.every((w) => !fixtureText.includes(w)), fakes.filter((w) => fixtureText.includes(w)));
      const guide = Object.entries(C.tutorial).filter(([k, v]) => k !== "mood" && typeof v === "string").map(([, v]) => v as string).join("\n");
      check("⑯ 조작 안내에 \"행성·위성\" 없음(분위기 한 줄만 예외 — T7 (나)) · 문구 [임시] 표시", !/행성|위성/.test(guide) && /튜토리얼[^\n]*\[임시/.test(src("lib/my-life-copy.ts")));
    }
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
