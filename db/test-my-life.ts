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
import { edgeSamples, selectionEdges } from "../lib/my-life-edges";
import { MY_LIFE_COPY as C } from "../lib/my-life-copy";
import { rectInsideShape, rectOutsideShape, type GroupShapeKind } from "../lib/my-life-group-shape";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  eventPeoplePlaceList,
  eventPeoplePlaceRefs,
  eventPeoplePlaces,
  countMapNodes,
  countTimelineNodes,
  estimateChipWidth,
  findOverlaps,
  layoutMyLife,
  overflowLabel,
  packChips,
  resolveOverlaps,
  type LayoutNode,
  type MyLifeLayout,
} from "../lib/my-life-layout";
import { normalizeForSearch, searchMyLife } from "../lib/my-life-search";
import { saveNodeLink } from "../lib/node-graph";
import fs from "node:fs";
import path from "node:path";

import { hasOwnTitle, storyLead } from "../lib/story-title";

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

// 합성 데이터 — 중심 N, 이야기 S, 인물 P, 모임 G(구성 무작위·여러 모임 소속 포함), 장소 Q. 결정적 의사난수.
function synthetic(o: { events: number; stories: number; people: number; groups: number; places: number; placeGroups?: number; seed?: number }): MyLifeData {
  let x = o.seed ?? 7;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const names = ["김민수", "박영수", "이순자", "정미숙", "한상철", "최영희", "강동원", "윤정아", "조성호", "임하늘", "송미란", "오세훈"];
  const people: MyLifePerson[] = Array.from({ length: o.people }, (_, i) => ({
    id: `p${i}`, name: `${names[i % names.length]}${i >= names.length ? i : ""}`, relation: null, metYear: null, groupIds: [], body: "",
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
    id: `e${i}`, type: "CUSTOM", label: `시기 ${i}`, year: i % 7 === 3 ? null : 1950 + i * (rnd() < 0.2 ? 12 : 3), endYear: null,
    stories: [], personIds: [], placeIds: [], groupIds: [],
  }));
  for (let k = 0; k < o.stories; k++) {
    const ev = events[Math.floor(rnd() * events.length)];
    const chips = [
      ...(people.length ? Array.from({ length: Math.floor(rnd() * 3) }, () => people[Math.floor(rnd() * people.length)]).map((p) => ({ kind: "person" as const, id: p.id, name: p.name })) : []),
      ...(places.length && rnd() < 0.4 ? [places[Math.floor(rnd() * places.length)]].map((q) => ({ kind: "place" as const, id: q.id, name: q.name })) : []),
    ].filter((c, i, arr) => arr.findIndex((d) => d.id === c.id) === i);
    ev.stories.push({ id: `s${k}`, kind: rnd() < 0.15 ? "SELF" : "STORY", title: null, content: "가".repeat(10 + Math.floor(rnd() * 80)) + ".", primaryEventId: ev.id, otherEventIds: [], subjectPersonId: null, chips, richBody: false });
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
    check("② Prisma 호출 수 = 8 고정(기록 8건·인물 8명·연결 16건 늘려도 — 3단계 장소 묶음 +1 · 2b-3c 노드 본문 +1)", opsSmall === 8 && ops === 8 && big.people.length === 13, { opsSmall, ops, people: big.people.length });

    // ── ③ 배치 ───────────────────────────────────────────────────
    const lay = layoutMyLife(d);
    const nm = nodeMap(lay);
    check("③ 노드 교차 0 · 세계 안 · 해소 0회", findOverlaps(lay.nodes).length === 0 && lay.shifted === 0 &&
      lay.nodes.every((n) => n.x >= 0 && n.y >= 0 && n.x + n.w <= lay.width && n.y + n.h <= lay.height), findOverlaps(lay.nodes));
    const timelineKinds = new Set(["event", "story", "fold", "gap"]);
    check("③ 시간 줄기(x ≤ 420)와 인물록·장소록(x ≥ 520) 분리, 오른쪽 가지 없음",
      lay.nodes.filter((n) => timelineKinds.has(n.kind)).every((n) => n.x + n.w <= L.CENTER_RIGHT) &&
        lay.nodes.filter((n) => !timelineKinds.has(n.kind)).every((n) => n.x >= L.REGION_X) &&
        lay.shapes.every((s) => s.x >= L.REGION_X) && !lay.nodes.some((n) => (n.kind as string) === "branch"));
    check("③ 인물 노드 5(초안 빠짐) · 장소 노드 3 · 모임 이름 3 · 칩 없음(3개 이하)",
      lay.nodes.filter((n) => n.kind === "person").length === 5 && lay.nodes.filter((n) => n.kind === "place").length === 3 &&
        lay.nodes.filter((n) => n.kind === "groupLabel").length === 3 && !lay.nodes.some((n) => n.kind === "groupChip"));
    check("③ 모임 소속 — 각 인물이 자기 모임 영역 안·다른 모임 영역 밖(짝꿍 = 합창부∩동창회, 반장 = 합창부만, 나머지 = 밖)", membershipErrors(d, lay).length === 0, membershipErrors(d, lay));
    const hikingShape = lay.shapes.find((s) => s.groupId === hiking);
    check("③ 빈 모임(등산회)도 영역이 보임·그 안에 사람 없음", !!hikingShape && lay.nodes.filter((n) => n.kind === "person").every((n) => rectOutsideShape(hikingShape!, n)));
    check("③ 인물록 제목 맨 위·장소록은 인물록 아래", lay.regions.places.y >= lay.regions.people.y + lay.regions.people.h + L.REGION_GAP - 1 && nm.get("title:people")!.y === L.TOP_PAD);
    const ev3 = lay.nodes.filter((n) => n.kind === "event");
    check("③ 중심 노드 전부 같은 크기 248×120", ev3.length === 3 && ev3.every((n) => n.w === L.CENTER_W && n.h === L.CENTER_H));
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
    const row = L.COL_W - 2 * L.STORY_PAD_X;
    const five = ["김민수", "박영수", "이순자", "정미숙", "한상철"];
    const p = packChips(five);
    const fits = (r: number[], extra: string | null) =>
      r.reduce((s, i) => s + Math.min(estimateChipWidth(five[i]), row), 0) + L.CHIP_GAP * (r.length - 1) + (extra ? L.CHIP_GAP + estimateChipWidth(extra) : 0) <= row;
    check("⑥ 작은 물방울 — 최대 2줄, 넘치면 마지막 줄에 '외 N'", p.rows.length <= 2 && p.overflow > 0 && p.rows.flat().length + p.overflow === 5 &&
      p.rows.every((r, i) => fits(r, i === p.rows.length - 1 ? overflowLabel(p.overflow) : null)), p);
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
        /selectionEdges\(data, layout, selected, edgesOn\)\.connected\.length/.test(view));

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
        edit.includes("sections.push({ title: C.panelWithPlaces, items: nn(list.places.map((r) => periodItem(r, \"place\"))) });") &&
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
      ["getInterviewCardState(userId),", "detectGaps(userId),", "getFreeChatTopic(userId),", "pickTopGaps(gaps, 3)", "<MyLifeView data={data} suggest={suggest} />"].every((x) => page.includes(x)) &&
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
    check("⑫ 지도 보기 — 노드 안 골랐을 때 \"지금 보는 곳\" 줄에 [이야기 거리] · 시트 = 같은 카드(제목 h3)",
      mapPart.includes("onClick={onOpenSuggest}") && mapPart.indexOf("onClick={onOpenSuggest}") > mapPart.indexOf("{nowText}") &&
        view.includes('<InterviewEntryCard state={suggest.interview} as="h3" />') &&
        view.includes('<GapCards gaps={suggest.gaps} as="h3" />') && view.includes('aria-labelledby="mylife-suggest-title"'));
    const sug = src("app/my-life/Suggestions.tsx");
    check("⑫ 카드 — 갭은 있을 때만(진행 중 = [이어서 이야기하기]) · 링크 = 인터뷰·/chat-v3 딥링크",
      sug.includes("if (gaps.length === 0) return null;") &&
        sug.includes("{g.inProgress ? C.gapContinue : C.gapStart}") && sug.includes('href="/interview"') && sug.includes("href={g.href}"));
    check("⑫ 이야기 패널 [이야기 고치기] — 같은 서버 액션(updateEpisodeContentAction) · 저장 뒤 바로 보임 + 지도 다시 읽기 · 응답 실패도 다시 읽기",
      view.includes("const r = await updateEpisodeContentAction(story.id, text);") && view.includes("setBody(text);") &&
        /setDraft\(null\);\s*router\.refresh\(\);/.test(view) && /setError\(C\.editBodyRetry\);\s*router\.refresh\(\);/.test(view) && view.includes("{C.editBody}") &&
        view.includes("aria-label={C.bodyLabel}"));

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
