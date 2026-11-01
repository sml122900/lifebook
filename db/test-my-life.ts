// 노드 그래프 2b-3a — My Life 마인드맵 데이터·배치 회귀. docs/phase/node-graph-self.md §6 2b.1. LLM 0.
//
//   ① 포함 규칙(getMyLifeData) — 확정 중심만·sequenceOrder 순·연도 없는 중심 자리 · 이야기 주 소속 + 추가 소속
//      (두 중심에 각각, otherEventIds) · 작은 물방울(대상 인물·확정/확인 대기 연결·장소 — saveNodeLink 입구로 넣은
//      MemoryPlace·이름만 있는 옛 장소) · 오른쪽 가지(PersonLifeEvent·모임·장소) · Q38 이야기 안에 보이는 것은 가지에서
//      뺌 · 그때의 나(SELF) · 초안 인물은 확인 대기로만 · 남의 데이터 0
//   ② Prisma 호출 수 고정 — 기록을 크게 늘려도 같은 수(N+1 없음)
//   ③ 배치(layoutMyLife, 순수 함수 — 고정 좌표 캔버스) — 실제 픽스처·합성 데이터(노드 0·1·36·60·100·800)에서 노드 사각형
//      교차 0·세계 안·겹침 해소 0회 · 같은 입력 같은 출력 · 접힌 띠엔 가지 없음(펼치기 버튼만) · 10년 이상 간격 표지 ·
//      연도 없는 중심 줄기 색 없음 · 지도 폭 592·가지는 줄기에서 56 · 중심 노드 전부 같은 크기 · 일부러 겹친 배치 해소
//   ④ 순수 함수 — 작은 물방울 줄 나누기("외 N" 자리)·본문 첫 문장·지금 보는 곳(bandAt)·노드 수
//
// 자체 픽스처 계정 2개만 만들고 지운다(test30·실고객 접촉 0).
// 실행: npx tsx db/test-my-life.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge } from "../lib/episode";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { getMyLifeData, type MyLifeData, type MyLifeEvent } from "../lib/my-life";
import {
  FOLD_ALL_ABOVE,
  L,
  bandAt,
  countMapNodes,
  estimateChipWidth,
  findOverlaps,
  layoutMyLife,
  overflowLabel,
  packChips,
  resolveOverlaps,
  storyLead,
  type MyLifeLayout,
} from "../lib/my-life-layout";
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

async function makePerson(userId: string, name: string, opts: { relation?: string; lifeEventId?: string; isDraft?: boolean } = {}) {
  const p = await prisma.person.create({ data: { userId, name, relation: opts.relation ?? null, isDraft: opts.isDraft ?? false }, select: { id: true } });
  if (opts.lifeEventId) await prisma.personLifeEvent.create({ data: { personId: p.id, lifeEventId: opts.lifeEventId, userId } });
  return p.id;
}

async function makeStory(userId: string, lifeEventId: string, label: string, content: string, personId?: string) {
  const r = await createEpisodeBridge(userId, lifeEventId, label, null, content, `[본인] ${content}`, personId);
  if (!r) throw new Error("createEpisodeBridge 실패");
  return r;
}

type Rect = { key: string; x: number; y: number; w: number; h: number };
function overlaps(layout: MyLifeLayout): string[] {
  const rs: Rect[] = layout.nodes;
  const bad: string[] = [];
  for (let i = 0; i < rs.length; i++) {
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i];
      const b = rs[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) bad.push(`${a.key}×${b.key}`);
    }
  }
  return bad;
}
function outOfWorld(layout: MyLifeLayout): string[] {
  return layout.nodes.filter((n) => n.x < 0 || n.y < 0 || n.x + n.w > layout.width || n.y + n.h > layout.height).map((n) => n.key);
}

// 합성 데이터 — 노드 수 N(중심 = N/10 이상 1, 나머지를 이야기·가지에 나눔), 결정적 의사난수.
function synthetic(nodes: number, seed = 7): MyLifeData {
  let x = seed;
  const rnd = () => ((x = (x * 1103515245 + 12345) % 2147483648) / 2147483648);
  if (nodes === 0) return { events: [] };
  const centers = Math.max(1, Math.round(nodes / 10));
  const events: MyLifeEvent[] = Array.from({ length: centers }, (_, i) => ({
    id: `e${i}`, type: "CUSTOM", label: `시기 ${i}`, year: i % 7 === 3 ? null : 1950 + i * (rnd() < 0.2 ? 12 : 3), endYear: null, stories: [], branches: [],
  }));
  const names = ["김민수", "박영수", "이순자", "정미숙", "한상철", "할머니 댁", "부산 해운대 백사장", "Kim", "철수"];
  for (let k = 0; k < nodes - centers; k++) {
    const ev = events[Math.floor(rnd() * centers)];
    if (rnd() < 0.6) {
      const chips = Array.from({ length: Math.floor(rnd() * 5) }, (_, c) => ({
        kind: (c % 3 === 2 ? "place" : "person") as "place" | "person", id: `c${k}-${c}`, name: names[Math.floor(rnd() * names.length)], proposed: rnd() < 0.1,
      }));
      ev.stories.push({ id: `s${k}`, kind: rnd() < 0.15 ? "SELF" : "STORY", content: "가".repeat(10 + Math.floor(rnd() * 80)) + ".", primaryEventId: ev.id, otherEventIds: rnd() < 0.1 ? ["e0"] : [], chips, hasPending: chips.some((c) => c.proposed) });
    } else {
      ev.branches.push({ kind: "person", id: `b${k}`, name: names[Math.floor(rnd() * names.length)], relation: null, metYear: null });
    }
  }
  return { events };
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

    const p1 = await makePerson(a, "[fixture] 어머니", { relation: "어머니", lifeEventId: birth });
    const p2 = await makePerson(a, "[fixture] 짝꿍", { relation: "고교 친구", lifeEventId: hs });
    const p3 = await makePerson(a, "[fixture] 담임", { relation: "선생님", lifeEventId: hs });
    const p4 = await makePerson(a, "[fixture] 반장", { relation: "고교 친구", lifeEventId: hs });
    const draft = await makePerson(a, "[fixture] 확인 대기 분", { isDraft: true });
    const group = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 합창부" }, select: { id: true } })).id;
    const place1 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 외가", source: "naver" }, select: { id: true } })).id;
    const place2 = (await prisma.place.create({ data: { userId: a, name: "[fixture] 학교 강당" }, select: { id: true } })).id;

    // 출생 이야기 — 대상 인물 = 어머니, 함께 = 짝꿍(확정)·확인 대기 분(PROPOSED), 장소 = 외가(입구로) + 옛 장소(이름만).
    const s1 = await makeStory(a, birth, "출생", "외가에서 태어났다고 들었다. 어머니가 늘 그 이야기를 하셨다.", p1);
    await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PERSON", id: p2 });
    await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PERSON", id: draft }, { status: "PROPOSED", source: "AI" });
    const routed = await saveNodeLink(a, { type: "EPISODE", id: s1.episodeId }, { type: "PLACE", id: place1 });
    await prisma.memoryPlace.create({ data: { memoryId: s1.memoryId, placeName: "[fixture] 옛 동네", sortOrder: 5 } });
    // 출생 이야기를 고등학교에도 걸침(추가 소속).
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "EPISODE", id: s1.episodeId });
    // 고등학교 — 이야기 1·그때의 나 1(반장과 있을 때), 중심 직접 연결 모임·장소.
    const s2 = await makeStory(a, hs, "고등학교 입학", "합창부에서 처음 솔로를 맡았다.");
    const self = await makeStory(a, hs, "고등학교 입학", "반장 앞에서는 괜히 말수가 줄었다.");
    await prisma.episode.update({ where: { id: self.episodeId }, data: { kind: "SELF" } });
    await saveNodeLink(a, { type: "EPISODE", id: self.episodeId }, { type: "PERSON", id: p4 });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PERSON_GROUP", id: group });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PLACE", id: place2 });
    // 미확정 중심의 이야기 — 안 나와야 함.
    await makeStory(a, mil, "군 입대", "훈련소 첫날 밤.");
    await prisma.lifeEvent.update({ where: { id: mil }, data: { status: "UNCONFIRMED", confirmedAt: null } });
    // 다른 사용자 — 섞이면 안 됨.
    const bEvent = await makeEvent(b, "BIRTH", "출생", 1960, 0);
    await makeStory(b, bEvent, "출생", "B 의 이야기.");
    await makePerson(b, "[fixture] B 인물", { lifeEventId: bEvent });

    // ── ① 포함 규칙 ──────────────────────────────────────────────
    const d = await getMyLifeData(a);
    check("① 확정 중심만, sequenceOrder 순(출생 → 고등학교 → 첫 직장), 미확정 군 입대 제외",
      JSON.stringify(d.events.map((e) => e.id)) === JSON.stringify([birth, hs, job]), d.events.map((e) => e.label));
    const [eb, eh, ej] = d.events;
    check("① 연도 없는 중심 — year null, 순서 자리 그대로(맨 뒤)", ej.year === null && ej.label === "첫 직장" && ej.stories.length === 0);
    check("① 출생 띠 — 주 소속 이야기 1개(추가 소속은 고등학교에)", eb.stories.length === 1 && eb.stories[0].id === s1.episodeId && eb.stories[0].otherEventIds.join() === hs, eb.stories.map((s) => s.otherEventIds));
    const hsIds = eh.stories.map((s) => s.id);
    check("① 고등학교 띠 — 주 소속 2개 + 추가 소속(출생 이야기)", hsIds.length === 3 && hsIds.includes(s2.episodeId) && hsIds.includes(self.episodeId) && hsIds.includes(s1.episodeId), hsIds);
    const s1InHs = eh.stories.find((s) => s.id === s1.episodeId)!;
    check("① 추가 소속 이야기 — 고등학교에서 본 다른 시기 = 출생", s1InHs.otherEventIds.join() === birth);
    const chips = eb.stories[0].chips;
    check("① 작은 물방울 — 대상 인물·확정 연결·확인 대기·입구로 넣은 장소·옛 장소 이름(순서대로)",
      JSON.stringify(chips.map((c) => [c.kind, c.name, c.proposed])) === JSON.stringify([
        ["person", "[fixture] 어머니", false], ["person", "[fixture] 짝꿍", false], ["person", "[fixture] 확인 대기 분", true],
        ["place", "[fixture] 외가", false], ["place", "[fixture] 옛 동네", false],
      ]) && chips[4].id === null && routed.ok && routed.store === "MEMORY_PLACE",
      chips);
    check("① 확인 대기가 있으면 hasPending", eb.stories[0].hasPending === true && eh.stories.find((s) => s.id === s2.episodeId)?.hasPending === false);
    check("① 그때의 나 — kind SELF, 안에 반장", (() => {
      const s = eh.stories.find((x) => x.id === self.episodeId);
      return s?.kind === "SELF" && s.chips.length === 1 && s.chips[0].id === p4;
    })());
    check("① Q38 — 출생 가지에 어머니 없음(이야기 안에 보임)", eb.branches.length === 0, eb.branches);
    const hsBranch = eh.branches.map((x) => `${x.kind}:${x.id}`);
    check("① Q38 — 고등학교 가지 = 담임·합창부·학교 강당(짝꿍은 걸친 출생 이야기 안, 반장은 그때의 나 안에 보여 뺌)",
      JSON.stringify(hsBranch) === JSON.stringify([`person:${p3}`, `group:${group}`, `place:${place2}`]), eh.branches.map((x) => x.name));
    check("① 초안 인물은 가지에 안 나오고 확인 대기 물방울로만", !d.events.some((e) => e.branches.some((x) => x.id === draft)));
    const all = JSON.stringify(d);
    check("① 남의 데이터 0(다른 사용자 이야기·인물·중심 없음)", !all.includes("B 의 이야기") && !all.includes("B 인물") && !all.includes(bEvent));
    check("① 미확정 중심 이야기 없음", !all.includes("훈련소 첫날 밤"));

    // ── ② Prisma 호출 수 고정 ────────────────────────────────────
    let ops = 0;
    const counted = prisma.$extends({
      query: { $allModels: { async $allOperations({ args, query }) { ops += 1; return query(args); } } },
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
    check("② Prisma 호출 수 = 6 고정(기록 8건·연결 16건 늘려도 같은 수)", opsSmall === 6 && ops === 6 && big.events[1].stories.length === 11, { opsSmall, ops });
    check("② 늘린 이야기의 인물·장소도 가지에서 빠짐(Q38) — 고등학교 가지 = 담임·합창부만",
      JSON.stringify(big.events[1].branches.map((x) => x.kind)) === JSON.stringify(["person", "group"]), big.events[1].branches.map((x) => x.name));

    // ── ③ 배치 ───────────────────────────────────────────────────
    const lay = layoutMyLife(d);
    check("③ 실제 픽스처 — 사각형 교차 0·세계 안", overlaps(lay).length === 0 && outOfWorld(lay).length === 0, { o: overlaps(lay), w: outOfWorld(lay) });
    check("③ 같은 입력 같은 출력", JSON.stringify(layoutMyLife(d)) === JSON.stringify(lay));
    check("③ 출생(1958)→고등학교(1974) 16년 간격 표지, 연도 없는 첫 직장 앞엔 없음",
      lay.nodes.some((n) => n.kind === "gap" && n.key === `gap:${hs}` && n.years === 16) && !lay.nodes.some((n) => n.key === `gap:${job}`));
    check("③ 연도 없는 중심의 줄기 = 색 없음(null), 다른 띠는 연대", lay.trunk[2].decade === null && lay.trunk[0].decade === 1950 && lay.trunk[1].decade === 1970, lay.trunk);
    check("③ 줄기 끊김 없음(띠마다 앞 끝에서 이어짐)", lay.trunk.every((t, i) => i === 0 || t.y1 === lay.trunk[i - 1].y2), lay.trunk);
    const story1 = lay.nodes.find((n) => n.kind === "story" && n.key === `st:${hs}:${s1.episodeId}`);
    check("③ 걸친 이야기는 두 띠에 각각 노드(키가 중심별로 다름)", !!story1 && lay.nodes.some((n) => n.key === `st:${birth}:${s1.episodeId}`));
    const fl = layoutMyLife(d, { folded: new Set([hs]) });
    check("③ 접힌 띠 — 이야기·가지 노드 없음, 펼치기 버튼(가지 수 6)만, 교차 0",
      !fl.nodes.some((n) => (n.kind === "story" || n.kind === "branch") && n.eventId === hs) &&
        fl.nodes.some((n) => n.kind === "fold" && n.eventId === hs && n.count === 6) && overlaps(fl).length === 0,
      fl.nodes.filter((n) => "eventId" in n && n.eventId === hs).map((n) => n.key));
    check("③ 접으면 아래 띠만 올라오고 그 띠 위치는 그대로",
      fl.bands[1].top === lay.bands[1].top && fl.bands[2].top < lay.bands[2].top);
    check("③ 누르는 노드 높이 56 이상(중심·이야기·가지·펼치기)",
      [...lay.nodes, ...fl.nodes].filter((n) => n.kind !== "gap").every((n) => n.h >= 56));
    check("③ 지도 폭 592 고정 — 가지는 줄기에서 56 떨어짐(왼쪽 열 오른쪽 끝·오른쪽 열 왼쪽 끝)",
      lay.width === 592 && lay.nodes.filter((n) => n.kind === "story").every((n) => n.x + n.w === L.TRUNK_X - L.BRANCH_DX) &&
        lay.nodes.filter((n) => n.kind === "branch").every((n) => n.x === L.TRUNK_X + L.BRANCH_DX));
    const evNodes = [...lay.nodes, ...fl.nodes].filter((n) => n.kind === "event");
    check("③ 중심 노드 전부 같은 크기(연도 모름·접힘·가지 없음 포함) 248×120",
      evNodes.length === 6 && evNodes.every((n) => n.w === L.CENTER_W && n.h === L.CENTER_H && n.x === L.TRUNK_X - L.CENTER_W / 2));
    check("③ 정상 배치는 겹침 해소가 필요 없음(shifted 0)", lay.shifted === 0 && fl.shifted === 0);
    // 일부러 겹치게 — 고등학교 띠 첫 가지를 출생 중심 위로 끌어올린 배치를 해소.
    const broken = { ...lay, shifted: 0, nodes: lay.nodes.map((n) => (n.kind === "branch" && n.eventId === hs && n.branchIndex === 0 ? { ...n, y: lay.nodes[0].y + 10, x: lay.nodes[0].x } : n)) };
    const fixedL = resolveOverlaps(broken);
    check("③ 겹침 해소 — 일부러 겹친 배치도 교차 0, 위아래 순서 유지, 높이 늘어남",
      findOverlaps(broken.nodes).length > 0 && findOverlaps(fixedL.nodes).length === 0 && fixedL.shifted > 0 && fixedL.height > broken.height &&
        fixedL.bands.every((b, i) => i === 0 || b.top > fixedL.bands[i - 1].top),
      { before: findOverlaps(broken.nodes).length, after: findOverlaps(fixedL.nodes) });

    for (const n of [0, 1, 36, 60, 100, 800]) {
      const syn = synthetic(n);
      const t0 = performance.now();
      const ly = layoutMyLife(syn);
      const ms = performance.now() - t0;
      const lf = layoutMyLife(syn, { folded: new Set(syn.events.map((e) => e.id)) });
      check(`③ 합성 노드 ${n} — 교차 0·세계 안(펼침·전부 접힘), 노드 수 = ${countMapNodes(syn)}, 배치 ${ms.toFixed(1)}ms`,
        countMapNodes(syn) === n && ly.shifted === 0 && overlaps(ly).length === 0 && outOfWorld(ly).length === 0 && overlaps(lf).length === 0 && outOfWorld(lf).length === 0,
        { o: overlaps(ly).slice(0, 3), w: outOfWorld(ly).slice(0, 3) });
    }
    check("③ 접기 기본 기준 60", FOLD_ALL_ABOVE === 60);

    // ── ④ 순수 함수 ──────────────────────────────────────────────
    const row = L.COL_W - 2 * L.STORY_PAD_X;
    const p = packChips(["김민수", "박영수", "이순자", "정미숙", "한상철"]);
    const fits = (r: number[], names: string[], extra: string | null) =>
      r.reduce((s, i) => s + Math.min(estimateChipWidth(names[i]), row), 0) + L.CHIP_GAP * (r.length - 1) + (extra ? L.CHIP_GAP + estimateChipWidth(extra) : 0) <= row;
    const five = ["김민수", "박영수", "이순자", "정미숙", "한상철"];
    check("④ 작은 물방울 — 최대 2줄, 넘치면 마지막 줄에 '외 N' 자리", p.rows.length <= 2 && p.overflow > 0 &&
      p.rows.flat().length + p.overflow === 5 && p.rows.every((r, i) => fits(r, five, i === p.rows.length - 1 ? overflowLabel(p.overflow) : null)), p);
    const longName = packChips(["부산광역시 해운대구 우동 백사장 앞 횟집"]);
    check("④ 작은 물방울 — 줄보다 긴 이름 1개는 그 줄에(말줄임)", longName.rows.length === 1 && longName.overflow === 0);
    check("④ 작은 물방울 — 없으면 줄 0", packChips([]).rows.length === 0);
    check("④ 본문 첫 문장", storyLead("  외가에서 태어났다.  어머니가 말씀하셨다. ") === "외가에서 태어났다." && storyLead("마침표 없는 글") === "마침표 없는 글");
    const mid = (lay.bands[1].top + lay.bands[1].bottom) / 2;
    check("④ 지금 보는 곳 — 띠 안이면 그 띠, 띠 사이면 가까운 띠, 맨 위 바깥이면 첫 띠",
      bandAt(lay, mid)?.eventId === hs && bandAt(lay, lay.bands[0].bottom + 2)?.eventId === birth && bandAt(lay, -100)?.eventId === birth);
    check("④ 노드 수 = 중심 + 이야기 + 가지(작은 물방울 제외)", countMapNodes(d) === 3 + 1 + 3 + 3);
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
