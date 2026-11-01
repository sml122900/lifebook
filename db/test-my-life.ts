// My Life 지도 회귀 — 데이터·배치·간선·검색. docs/phase/my-life-restructure.md §1·§5(개편 1단계) ·
// node-graph-self.md §6 2b.1·2b-3a 수정. LLM 0.
//
//   ① 포함 규칙(getMyLifeData) — 확정 중심만·sequenceOrder 순·연도 없는 중심 · 이야기 주 소속 + 추가 소속 · 작은 물방울
//      (대상 인물·확정/확인 대기 연결·입구로 넣은 장소·옛 장소 이름) · 인물록 = 확정 인물 전부(연결 없는 분 포함) +
//      확인 대기 초안(말동무 초안은 빠짐) · 모임과 구성원 · 장소록 = 사용자 장소 전부 · 중심 직접 연결(간선용) · 남의 데이터 0
//   ② Prisma 호출 수 고정 — 기록을 크게 늘려도 같은 수
//   ③ 배치 — 오른쪽 가지 없음 · 시간 줄기(x ≤ 420)와 인물록·장소록(x ≥ 520) 분리 · 노드 교차 0 · 중심 노드 전부 같은 크기 ·
//      모임 영역 소속(각 노드가 자기 모임 영역 안·다른 모임 영역 밖, 빈 모임 영역) · 합성 데이터 모임 0~5 × 둥근 사각·원 ·
//      4개 이상이면 3개만 영역 + 칩 · 같은 입력 같은 출력 · 접힘 · 10년 표지 · 정상 배치 해소 0회 · 일부러 겹친 배치 해소
//   ④ 간선 — 이야기·중심·인물·장소·모임 선택별 간선과 연결 노드 · 종류 끄기 · 접힌 띠 이야기 빠짐 · 곡선이 중심 노드를 안 지남
//   ⑤ 검색 — 띄어쓰기 무시·이름 > 본문 순서·본문 앞뒤 조각·걸친 이야기 한 번·빈 질의
//   ⑥ 순수 함수 — 작은 물방울 줄 나누기·본문 첫 문장·지금 보는 곳·노드 수
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
import { rectInsideShape, rectOutsideShape, type GroupShapeKind } from "../lib/my-life-group-shape";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  countMapNodes,
  countTimelineNodes,
  estimateChipWidth,
  findOverlaps,
  layoutMyLife,
  overflowLabel,
  packChips,
  resolveOverlaps,
  storyLead,
  type LayoutNode,
  type MyLifeLayout,
} from "../lib/my-life-layout";
import { normalizeForSearch, searchMyLife } from "../lib/my-life-search";
import { saveNodeLink } from "../lib/node-graph";

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
function membershipErrors(data: MyLifeData, lay: MyLifeLayout): string[] {
  const errs: string[] = [];
  const personById = new Map(data.people.map((p) => [p.id, p]));
  for (const n of lay.nodes) {
    if (n.kind !== "person") continue;
    const p = personById.get(n.personId)!;
    for (const s of lay.shapes) {
      const member = !p.draft && p.groupIds.includes(s.groupId);
      if (member ? !rectInsideShape(s, n) : !rectOutsideShape(s, n)) errs.push(`${p.name}:${s.groupId}:${member ? "밖에있음" : "안에있음"}`);
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
function synthetic(o: { events: number; stories: number; people: number; groups: number; places: number; seed?: number }): MyLifeData {
  let x = o.seed ?? 7;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const names = ["김민수", "박영수", "이순자", "정미숙", "한상철", "최영희", "강동원", "윤정아", "조성호", "임하늘", "송미란", "오세훈"];
  const people: MyLifePerson[] = Array.from({ length: o.people }, (_, i) => ({
    id: `p${i}`, name: `${names[i % names.length]}${i >= names.length ? i : ""}`, relation: null, metYear: null, groupIds: [], draft: i === o.people - 1 && o.people > 3,
  }));
  const groups = Array.from({ length: o.groups }, (_, g) => ({ id: `g${g}`, name: `모임${g}`, memberIds: [] as string[] }));
  for (const p of people) {
    if (p.draft) continue;
    for (const g of groups) {
      if (rnd() < 0.3) {
        p.groupIds.push(g.id);
        g.memberIds.push(p.id);
      }
    }
  }
  const places = Array.from({ length: o.places }, (_, i) => ({ id: `q${i}`, name: `장소${i}`, address: null, source: null, lat: null, lng: null }));
  const events: MyLifeEvent[] = Array.from({ length: o.events }, (_, i) => ({
    id: `e${i}`, type: "CUSTOM", label: `시기 ${i}`, year: i % 7 === 3 ? null : 1950 + i * (rnd() < 0.2 ? 12 : 3), endYear: null,
    stories: [], personIds: [], placeIds: [], groupIds: [],
  }));
  for (let k = 0; k < o.stories; k++) {
    const ev = events[Math.floor(rnd() * events.length)];
    const chips = [
      ...(people.length ? Array.from({ length: Math.floor(rnd() * 3) }, () => people[Math.floor(rnd() * people.length)]).map((p) => ({ kind: "person" as const, id: p.id, name: p.name, proposed: p.draft })) : []),
      ...(places.length && rnd() < 0.4 ? [places[Math.floor(rnd() * places.length)]].map((q) => ({ kind: "place" as const, id: q.id, name: q.name, proposed: false })) : []),
    ].filter((c, i, arr) => arr.findIndex((d) => d.id === c.id) === i);
    ev.stories.push({ id: `s${k}`, kind: rnd() < 0.15 ? "SELF" : "STORY", content: "가".repeat(10 + Math.floor(rnd() * 80)) + ".", primaryEventId: ev.id, otherEventIds: [], chips, hasPending: chips.some((c) => c.proposed) });
  }
  for (const ev of events) if (people.length && rnd() < 0.5) ev.personIds.push(people[Math.floor(rnd() * people.length)].id);
  for (const ev of events) if (places.length && rnd() < 0.3) ev.placeIds.push(places[Math.floor(rnd() * places.length)].id);
  return { events, people, groups, places };
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
    check("① 작은 물방울 — 대상 인물·확정 연결·확인 대기·입구로 넣은 장소·옛 장소 이름",
      JSON.stringify(eb.stories[0].chips.map((c) => [c.kind, c.name, c.proposed, c.id !== null])) === JSON.stringify([
        ["person", "[fixture] 어머니", false, true], ["person", "[fixture] 짝꿍", false, true], ["person", "[fixture] 확인 대기 분", true, true],
        ["place", "[fixture] 외가", false, true], ["place", "[fixture] 옛 동네", false, false],
      ]), eb.stories[0].chips);
    const pIds = d.people.map((p) => p.id);
    check("① 인물록 = 확정 인물 전부(연결 없는 분 포함) + 확인 대기 초안, 말동무 초안 제외",
      [mom, mate, teacher, leader, lonely, draft].every((id) => pIds.includes(id)) && !pIds.includes(compDraft) && pIds.length === 6, d.people.map((p) => p.name));
    check("① 인물록 가나다순", JSON.stringify(d.people.map((p) => p.name)) === JSON.stringify([...d.people.map((p) => p.name)].sort((x, y) => x.localeCompare(y, "ko"))));
    check("① 초안 표시·모임 소속", d.people.find((p) => p.id === draft)?.draft === true &&
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
    check("② Prisma 호출 수 = 6 고정(기록 8건·인물 8명·연결 16건 늘려도)", opsSmall === 6 && ops === 6 && big.people.length === 14, { opsSmall, ops });

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
    check("③ 인물 노드 6 · 장소 노드 3 · 모임 이름 3 · 칩 없음(3개 이하)",
      lay.nodes.filter((n) => n.kind === "person").length === 6 && lay.nodes.filter((n) => n.kind === "place").length === 3 &&
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
        return n.hiddenGroups === (p.draft ? p.groupIds.length : p.groupIds.filter((gid) => !ly5.shownGroupIds.includes(gid)).length);
      }), ly5.shownGroupIds);

    // ── ④ 간선 ───────────────────────────────────────────────────
    const on = { person: true, place: true };
    const keyS1 = `st:${birth}:${s1.episodeId}`;
    const e1 = selectionEdges(d, lay, keyS1, on);
    check("④ 이야기 선택 — 사람 3(어머니·짝꿍·확인 대기)·장소 1(외가) 간선, 옛 장소(노드 없음) 빠짐",
      JSON.stringify(e1.edges.map((e) => e.to).sort()) === JSON.stringify([`pe:${mom}`, `pe:${mate}`, `pe:${draft}`, `pl:${place1}`].sort()) && e1.related.size === 4, e1.edges.map((e) => e.to));
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
    const r1 = searchMyLife(d, "짝 꿍", storyLead);
    check("⑤ 띄어쓰기 무시 — '짝 꿍' → 인물 짝꿍", r1.some((r) => r.kind === "person" && r.key === `pe:${mate}`));
    const r2 = searchMyLife(d, "외가", storyLead);
    check("⑤ 이름 일치(장소 외가)가 본문 일치(출생 이야기)보다 앞, 본문은 앞뒤 조각", r2[0]?.key === `pl:${place1}` &&
      r2.some((r) => r.kind === "story" && r.snippet?.match === "외가" && r.key === `st:${birth}:${s1.episodeId}`), r2);
    const r3 = searchMyLife(d, "태어났다", storyLead);
    check("⑤ 걸친 이야기는 주 소속 쪽 한 번만", r3.filter((r) => r.kind === "story").length === 1 && r3[0].eventId === birth);
    check("⑤ 빈 질의·공백만 = 결과 0", searchMyLife(d, "", storyLead).length === 0 && searchMyLife(d, "   ", storyLead).length === 0);
    check("⑤ 모임·중심 이름", searchMyLife(d, "동창", storyLead).some((r) => r.key === `gl:${alumni}`) && searchMyLife(d, "고등학교", storyLead).some((r) => r.key === `ev:${hs}`));
    const syn60 = synthetic({ events: 11, stories: 60, people: 30, groups: 0, places: 14 });
    check("⑤ 결과 최대 30", searchMyLife(syn60, "가", storyLead).length === 30);

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
      countMapNodes(d) === 3 + 4 + 6 + 3 && countTimelineNodes(d) === 3 + 4 && FOLD_ALL_ABOVE === 60);
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
