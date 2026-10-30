// 노드 그래프 1단계(데이터 층) 회귀 — docs/phase/node-graph-self.md §1·§6. LLM 0.
//
//   ① DB 카탈로그 — 정리 트리거 6개·방향 CHECK 존재, NodeType 선언 순서 = lib 순위표
//   ② 방향 정규화(순수 함수)
//   ③ saveNodeLink — 역방향 요청이 같은 행으로 합쳐짐 · 제안→확정만 올림 · 다른 사용자 노드 거부 ·
//      허용 안 된 쌍·자기 연결·주 소속 중복 거부
//   ④ DB CHECK — 역방향·같은 종류 역순·자기 연결 직접 삽입 거부
//   ⑤ 연쇄 삭제 시 트리거 정리 — 이야기(브릿지 삭제 cascade)·직접 추가 사건(CUSTOM)·인물·그룹·
//      장소 삭제, 본문 사진 메모리 정리(이야기 브릿지는 보존)
//   ⑥ 일반 이야기(STORY)만 센다 — 갭 판정·포스터 브릿지·인터뷰
//   ⑦ 같은 유형 중심 2개일 때 인터뷰 계획 — 풀 질문 1번·대상 = 세션과 같은 기준의 첫 사건
//
// 자체 픽스처 계정 3개만 만들고 지운다(test30·실고객 접촉 0).
// 실행: npx tsx db/test-node-graph.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge, deleteEpisode } from "../lib/episode";
import { detectGaps } from "../lib/gap-detector";
import type { LifeEventType, NodeType } from "../lib/generated/prisma/enums";
import { computeTodayPlan } from "../lib/interview/plan";
import { itemKeyOf, kstDay } from "../lib/interview/keys";
import { startInterviewSession } from "../lib/interview/session";
import { deleteCustomLifeEvent } from "../lib/life-event-delete";
import { NODE_RANK, normalizeNodePair, saveNodeLink } from "../lib/node-graph";
import { syncV3Bridge } from "../lib/poster/v3-bridge";

const EMAIL_A = "fixture-nodegraph-a@lifebook.invalid";
const EMAIL_B = "fixture-nodegraph-b@lifebook.invalid";
const EMAIL_C = "fixture-nodegraph-c@lifebook.invalid";

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B, EMAIL_C]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function makeUser(email: string, name: string): Promise<string> {
  const now = new Date();
  const u = await prisma.user.create({
    data: {
      email, name, birthYear: 1960, onboardingTrack: "V3",
      termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: u.id, birthYear: 1960, region: "대구", skeletonGeneratedAt: now } });
  return u.id;
}

async function makeEvent(userId: string, type: LifeEventType, label: string, year: number | null, sequenceOrder: number) {
  const e = await prisma.lifeEvent.create({
    data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder, personAsked: true },
    select: { id: true },
  });
  return e.id;
}

async function makeStory(userId: string, lifeEventId: string, label: string, content: string, personId?: string) {
  const r = await createEpisodeBridge(userId, lifeEventId, label, null, content, `[본인] ${content}`, personId);
  if (!r) throw new Error("createEpisodeBridge 실패");
  return r;
}

const linkCount = (where: object) => prisma.nodeLink.count({ where });
const touching = (type: NodeType, id: string) => ({ OR: [{ fromType: type, fromId: id }, { toType: type, toId: id }] });

async function throwsOnCreate(data: Parameters<typeof prisma.nodeLink.create>[0]["data"]): Promise<string | null> {
  try {
    await prisma.nodeLink.create({ data });
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function main() {
  await removeFixtures();
  try {
    // ── ① 카탈로그 ────────────────────────────────────────────────
    const triggers = await prisma.$queryRawUnsafe<{ tgname: string; enabled: string }[]>(
      `SELECT t.tgname::text AS tgname, t.tgenabled::text AS enabled FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND p.proname IN ('node_graph_cleanup','node_body_cleanup_memory') ORDER BY 1`);
    const expected = [
      "Episode_node_graph_cleanup", "LifeEvent_node_graph_cleanup", "NodeBody_cleanup_memory",
      "PersonGroup_node_graph_cleanup", "Person_node_graph_cleanup", "Place_node_graph_cleanup",
    ];
    check("① 정리 트리거 6개 존재·활성", JSON.stringify(triggers.map((t) => t.tgname)) === JSON.stringify(expected) && triggers.every((t) => t.enabled === "O"), triggers);
    const checks = await prisma.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM pg_constraint WHERE conname = 'NodeLink_direction_check' AND contype = 'c'`);
    check("① 방향 CHECK(NodeLink_direction_check) 존재", Number(checks[0].n) === 1);
    const enumOrder = await prisma.$queryRawUnsafe<{ label: string }[]>(
      `SELECT e.enumlabel::text AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'NodeType' ORDER BY e.enumsortorder`);
    check("① DB NodeType 선언 순서 = lib NODE_RANK", JSON.stringify(enumOrder.map((e) => e.label)) === JSON.stringify(NODE_RANK), enumOrder);

    // ── ② 방향 정규화 ─────────────────────────────────────────────
    const n1 = normalizeNodePair({ type: "PLACE", id: "p1" }, { type: "LIFE_EVENT", id: "e1" });
    check("② 상위 종류가 from(PLACE,LIFE_EVENT → LIFE_EVENT→PLACE)", n1?.from.type === "LIFE_EVENT" && n1.to.type === "PLACE");
    const n2 = normalizeNodePair({ type: "PERSON", id: "b" }, { type: "PERSON", id: "a" });
    check("② 같은 종류는 id 사전순이 from(b,a → a→b)", n2?.from.id === "a" && n2.to.id === "b");
    check("② 자기 자신과의 연결은 null", normalizeNodePair({ type: "PERSON", id: "x" }, { type: "PERSON", id: "x" }) === null);

    // ── 픽스처 ───────────────────────────────────────────────────
    const a = await makeUser(EMAIL_A, "[fixture] 노드 A");
    const b = await makeUser(EMAIL_B, "[fixture] 노드 B");
    await makeEvent(a, "BIRTH", "출생", 1960, 0);
    const hs = await makeEvent(a, "HIGH_SCHOOL", "고등학교 입학", 1976, 3);
    const mil = await makeEvent(a, "MILITARY", "군 입대", 1980, 5);
    const personA = (await prisma.person.create({ data: { userId: a, name: "[fixture] 담임", relation: "고교 선생님" }, select: { id: true } })).id;
    const personA2 = (await prisma.person.create({ data: { userId: a, name: "[fixture] 짝꿍", relation: "고교 친구" }, select: { id: true } })).id;
    const groupA = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 합창부" }, select: { id: true } })).id;
    await prisma.personGroupMember.create({ data: { groupId: groupA, personId: personA2, userId: a } });
    const placeA = (await prisma.place.create({ data: { userId: a, name: "[fixture] 강당" }, select: { id: true } })).id;
    const placeB = (await prisma.place.create({ data: { userId: b, name: "[fixture] B의 장소" }, select: { id: true } })).id;
    const story1 = await makeStory(a, hs, "고등학교 입학", "합창부에서 처음 솔로를 맡았던 날이 지금도 생생하다.");

    // ── ③ saveNodeLink ───────────────────────────────────────────
    const s1 = await saveNodeLink(a, { type: "PLACE", id: placeA }, { type: "LIFE_EVENT", id: hs });
    const s2 = await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PLACE", id: placeA });
    const rows = await prisma.nodeLink.findMany({ where: { userId: a, ...touching("PLACE", placeA) } });
    check("③ 역방향 요청이 같은 행으로 합쳐짐(1행, 같은 id)", s1.ok && s2.ok && s1.linkId === s2.linkId && rows.length === 1, { s1, s2, n: rows.length });
    check("③ 저장된 방향 = LIFE_EVENT→PLACE", rows[0]?.fromType === "LIFE_EVENT" && rows[0]?.fromId === hs && rows[0]?.toType === "PLACE");

    const p1 = await saveNodeLink(a, { type: "EPISODE", id: story1.episodeId }, { type: "PERSON", id: personA2 }, { status: "PROPOSED", source: "AI" });
    const p2 = await saveNodeLink(a, { type: "PERSON", id: personA2 }, { type: "EPISODE", id: story1.episodeId }, { status: "CONFIRMED" });
    const p3 = await saveNodeLink(a, { type: "EPISODE", id: story1.episodeId }, { type: "PERSON", id: personA2 }, { status: "PROPOSED" });
    const pRow = p1.ok ? await prisma.nodeLink.findUnique({ where: { id: p1.linkId } }) : null;
    check("③ 제안(PROPOSED) → 확정 요청 시 확정으로 올림, 다시 제안 요청해도 내려가지 않음",
      p1.ok && p1.status === "PROPOSED" && p2.ok && p2.status === "CONFIRMED" && p3.ok && p3.status === "CONFIRMED" && pRow?.status === "CONFIRMED" && pRow.confirmedAt !== null && pRow.source === "AI",
      { p1, p2, p3, status: pRow?.status });

    const o1 = await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PLACE", id: placeB });
    const o2 = await saveNodeLink(b, { type: "LIFE_EVENT", id: hs }, { type: "PLACE", id: placeB });
    check("③ 다른 사용자 노드 연결 거부(내 사건+남의 장소 / 남의 사건+내 장소)", !o1.ok && o1.reason === "not_found" && !o2.ok && o2.reason === "not_found", { o1, o2 });
    check("③ 거부된 연결은 행이 생기지 않음", (await linkCount(touching("PLACE", placeB))) === 0);

    const na = await Promise.all([
      saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "PERSON", id: personA }), // PersonLifeEvent 몫
      saveNodeLink(a, { type: "EPISODE", id: story1.episodeId }, { type: "PLACE", id: placeA }), // MemoryPlace 몫
      saveNodeLink(a, { type: "PERSON_GROUP", id: groupA }, { type: "PERSON", id: personA2 }), // PersonGroupMember 몫
      saveNodeLink(a, { type: "PERSON", id: personA }, { type: "PERSON", id: personA2 }), // 같은 종류 쌍 — 1단계 미허용
    ]);
    check("③ 다른 곳에 저장하는 쌍·미허용 쌍 거부(pair_not_allowed 4건)", na.every((r) => !r.ok && r.reason === "pair_not_allowed"), na);
    const self = await saveNodeLink(a, { type: "PERSON", id: personA }, { type: "PERSON", id: personA });
    check("③ 자기 자신과의 연결 거부(self_link)", !self.ok && self.reason === "self_link", self);
    const prim = await saveNodeLink(a, { type: "LIFE_EVENT", id: hs }, { type: "EPISODE", id: story1.episodeId });
    const extra = await saveNodeLink(a, { type: "EPISODE", id: story1.episodeId }, { type: "LIFE_EVENT", id: mil });
    check("③ 이야기의 주 소속 시기는 추가 소속으로 거부, 다른 시기는 허용", !prim.ok && prim.reason === "primary_membership" && extra.ok, { prim, extra });

    // ── ④ DB CHECK 직접 삽입 ──────────────────────────────────────
    const [lo, hi] = [personA, personA2].sort();
    const e1 = await throwsOnCreate({ userId: a, fromType: "PLACE", fromId: placeA, toType: "LIFE_EVENT", toId: mil });
    const e2 = await throwsOnCreate({ userId: a, fromType: "PERSON", fromId: hi, toType: "PERSON", toId: lo });
    const e3 = await throwsOnCreate({ userId: a, fromType: "PERSON", fromId: lo, toType: "PERSON", toId: lo });
    check("④ CHECK — 역방향 종류(PLACE→LIFE_EVENT) 직접 삽입 거부", e1 !== null && /direction_check|check constraint/i.test(e1), e1?.slice(0, 120));
    check("④ CHECK — 같은 종류 id 역순 직접 삽입 거부", e2 !== null && /direction_check|check constraint/i.test(e2), e2?.slice(0, 120));
    check("④ CHECK — 자기 자신 직접 삽입 거부", e3 !== null && /direction_check|check constraint/i.test(e3), e3?.slice(0, 120));
    const ok4 = await throwsOnCreate({ userId: a, fromType: "PERSON", fromId: lo, toType: "PERSON", toId: hi, role: "check-control" });
    check("④ 대조 — 규칙에 맞는 직접 삽입은 통과", ok4 === null, ok4?.slice(0, 120));
    await prisma.nodeLink.deleteMany({ where: { userId: a, role: "check-control" } });

    // ── ⑤ 연쇄 삭제 시 트리거 정리 ────────────────────────────────
    // 이야기: 브릿지 메모리 삭제(deleteEpisode) → Episode cascade → 트리거.
    const story2 = await makeStory(a, hs, "고등학교 입학", "수학여행 버스 안에서 다 같이 노래를 불렀다.");
    await saveNodeLink(a, { type: "EPISODE", id: story2.episodeId }, { type: "PERSON", id: personA });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: mil }, { type: "EPISODE", id: story2.episodeId });
    await saveNodeLink(a, { type: "EPISODE", id: story2.episodeId }, { type: "PERSON_GROUP", id: groupA });
    await prisma.nodeBody.create({ data: { userId: a, nodeType: "EPISODE", nodeId: story2.episodeId, doc: { v: 1, blocks: [] }, plainText: "", memoryId: story2.memoryId } });
    const before5 = await linkCount(touching("EPISODE", story2.episodeId));
    const del = await deleteEpisode(a, story2.episodeId);
    check("⑤ 이야기 삭제(브릿지 cascade) → 그 이야기 연결 3건·본문이 트리거로 정리",
      del.ok && before5 === 3 && (await linkCount(touching("EPISODE", story2.episodeId))) === 0 &&
        (await prisma.nodeBody.count({ where: { nodeType: "EPISODE", nodeId: story2.episodeId } })) === 0,
      { del, before5 });

    // 이야기 본문을 지워도 이야기 브릿지 메모리는 보존(createdVia="episode").
    const story3 = await makeStory(a, mil, "군 입대", "훈련소 첫날 밤 잠이 오지 않았다.");
    const body3 = await prisma.nodeBody.create({ data: { userId: a, nodeType: "EPISODE", nodeId: story3.episodeId, doc: { v: 1, blocks: [] }, plainText: "", memoryId: story3.memoryId } });
    await prisma.nodeBody.delete({ where: { id: body3.id } });
    check("⑤ 이야기 본문 삭제 시 이야기 브릿지 메모리는 그대로", (await prisma.userMemory.count({ where: { id: story3.memoryId } })) === 1);

    // 장소: 삭제 → 연결·본문·본문 사진 메모리(node_body) 정리, MemoryPlace.placeId SetNull.
    await saveNodeLink(a, { type: "PERSON", id: personA }, { type: "PLACE", id: placeA });
    const mp = await prisma.memoryPlace.create({ data: { memoryId: story3.memoryId, placeName: "[fixture] 강당", placeId: placeA }, select: { id: true } });
    const bodyMem = await prisma.userMemory.create({ data: { userId: a, year: 1976, title: "[fixture] 장소 본문", createdVia: "node_body" }, select: { id: true } });
    await prisma.nodeBody.create({ data: { userId: a, nodeType: "PLACE", nodeId: placeA, doc: { v: 1, blocks: [] }, plainText: "", memoryId: bodyMem.id } });
    const beforePlace = await linkCount(touching("PLACE", placeA));
    await prisma.place.delete({ where: { id: placeA } });
    const mpAfter = await prisma.memoryPlace.findUnique({ where: { id: mp.id }, select: { placeId: true, placeName: true } });
    check("⑤ 장소 삭제 → 연결 2건·본문·본문 사진 메모리 정리, 기존 장소 행은 이름만 남음(placeId null)",
      beforePlace === 2 && (await linkCount(touching("PLACE", placeA))) === 0 &&
        (await prisma.nodeBody.count({ where: { nodeType: "PLACE", nodeId: placeA } })) === 0 &&
        (await prisma.userMemory.count({ where: { id: bodyMem.id } })) === 0 &&
        mpAfter?.placeId === null && mpAfter.placeName === "[fixture] 강당",
      { beforePlace, mpAfter });

    // 직접 추가 사건(CUSTOM): 삭제 → 그 사건·소속 이야기의 연결 정리.
    const custom = await makeEvent(a, "CUSTOM", "서울 상경", 1979, 4);
    const story4 = await makeStory(a, custom, "서울 상경", "야간 기차를 타고 서울역에 내렸다.");
    await saveNodeLink(a, { type: "EPISODE", id: story4.episodeId }, { type: "PERSON", id: personA });
    await saveNodeLink(a, { type: "LIFE_EVENT", id: custom }, { type: "PERSON_GROUP", id: groupA });
    const delC = await deleteCustomLifeEvent(a, custom);
    check("⑤ 직접 추가 사건 삭제 → 사건·소속 이야기 연결 모두 정리",
      delC.ok && (await linkCount(touching("LIFE_EVENT", custom))) === 0 && (await linkCount(touching("EPISODE", story4.episodeId))) === 0,
      delC);

    // 인물·그룹 삭제.
    await saveNodeLink(a, { type: "EPISODE", id: story3.episodeId }, { type: "PERSON", id: personA });
    await saveNodeLink(a, { type: "EPISODE", id: story3.episodeId }, { type: "PERSON_GROUP", id: groupA });
    await prisma.person.delete({ where: { id: personA } });
    check("⑤ 인물 삭제 → 그 인물 연결 정리", (await linkCount(touching("PERSON", personA))) === 0);
    await prisma.personGroup.delete({ where: { id: groupA } });
    check("⑤ 그룹 삭제 → 그룹 연결·구성원 정리",
      (await linkCount(touching("PERSON_GROUP", groupA))) === 0 && (await prisma.personGroupMember.count({ where: { groupId: groupA } })) === 0);

    // ── ⑥ 일반 이야기(STORY)만 센다 ───────────────────────────────
    // 별도 계정 C — 갭이 이 시기 하나만 생기게(출생엔 이야기, 두 사건 연도 간격·현재까지 10년 미만)
    // 해서 인터뷰 계획(문항 수 제한)에 반드시 들어가게 한다.
    const c = await makeUser(EMAIL_C, "[fixture] 노드 C");
    const birthC = await makeEvent(c, "BIRTH", "출생", 2018, 0);
    await makeStory(c, birthC, "출생", "할머니 댁 마당이 있는 집에서 태어났다고 들었다.");
    const univ = await makeEvent(c, "UNIVERSITY", "대학교 입학", 2024, 4);
    const personU = (await prisma.person.create({ data: { userId: c, name: "[fixture] 지도교수", relation: "대학 교수" }, select: { id: true } })).id;
    await prisma.personLifeEvent.create({ data: { personId: personU, lifeEventId: univ, userId: c } });
    const selfEp = await makeStory(c, univ, "대학교 입학", "교수님 앞에서는 늘 말을 아끼는 학생이었다.", personU);
    await prisma.episode.update({ where: { id: selfEp.episodeId }, data: { kind: "SELF" } });
    const gaps1 = await detectGaps(c);
    check("⑥ 갭 판정 — 그때의 나(SELF)만 있는 시기는 이야기 갭이 남음", gaps1.some((g) => g.type === "episode" && g.targetEventId === univ));
    check("⑥ 갭 판정 — SELF 이야기는 인물 이야기 갭도 지우지 않음", gaps1.some((g) => g.type === "person_episode" && g.targetPersonId === personU));
    const bridge1 = await syncV3Bridge(c);
    const univRow1 = bridge1.find((r) => r.id === `v3_${univ}`);
    check("⑥ 포스터 브릿지 — SELF 본문은 넣지 않음(본문 없음)", univRow1 !== undefined && univRow1.content === null, univRow1);
    const plan1 = await computeTodayPlan(c, kstDay());
    check("⑥ 인터뷰 계획 — SELF 만 있는 시기의 이야기 문항이 후보에 남음", plan1.some((c) => c.itemKey === itemKeyOf("GAP_EPISODE", univ)), plan1.map((c) => c.itemKey));
    // 세션 쪽 필터(session.ts resolveTarget) — SELF 를 이야기로 세면 이 문항이 "그사이 채워짐"으로 버려진다.
    const stC = await startInterviewSession(c);
    const itemC = await prisma.interviewItem.findFirst({ where: { userId: c, itemKey: itemKeyOf("GAP_EPISODE", univ) }, select: { status: true } });
    check("⑥ 인터뷰 세션 — SELF 만 있는 시기의 이야기 문항이 버려지지 않고 출제됨", stC.kind === "item" && itemC !== null && itemC.status !== "DROPPED", { kind: stC.kind, status: itemC?.status });
    await makeStory(c, univ, "대학교 입학", "입학식 날 처음 본 캠퍼스가 넓어서 길을 잃었다.");
    const gaps2 = await detectGaps(c);
    const bridge2 = await syncV3Bridge(c);
    const univRow2 = bridge2.find((r) => r.id === `v3_${univ}`);
    check("⑥ STORY 가 생기면 이야기 갭 해소 + 브릿지 본문 = STORY 만",
      !gaps2.some((g) => g.type === "episode" && g.targetEventId === univ) &&
        univRow2?.content === "입학식 날 처음 본 캠퍼스가 넓어서 길을 잃었다.",
      univRow2?.content);

    // ── ⑦ 같은 유형 중심 2개 — 인터뷰 계획 ─────────────────────────
    // 두 번째 직장을 먼저 만들고(createdAt 이 앞섬) sequenceOrder 는 뒤로 — 생성 순이 아니라 순서로 고르는지.
    const job2 = await makeEvent(b, "FIRST_JOB", "두 번째 직장", 1990, 7);
    const job1 = await makeEvent(b, "FIRST_JOB", "첫 직장", 1984, 6);
    await makeEvent(b, "BIRTH", "출생", 1960, 0);
    const planB = await computeTodayPlan(b, kstDay());
    const poolKey = itemKeyOf("POOL", "firstjob-payday");
    const poolHits = planB.filter((c) => c.itemKey === poolKey);
    const sessionPick = await prisma.lifeEvent.findFirst({
      where: { userId: b, type: "FIRST_JOB", status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
      orderBy: [{ sequenceOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    check("⑦ 같은 유형 2개 — 계획이 에러 없이 만들어지고 문항 키 중복 없음", planB.length > 0 && new Set(planB.map((c) => c.itemKey)).size === planB.length, planB.map((c) => c.itemKey));
    check("⑦ 풀 질문(첫 월급)은 1번만, 대상 = 순서상 첫 사건(첫 직장)", poolHits.length === 1 && poolHits[0].eventId === job1, { poolHits, job1, job2 });
    check("⑦ 계획의 대상 = 세션(resolveTarget)과 같은 기준으로 고른 사건", sessionPick?.id === poolHits[0]?.eventId);
    const twinEvents = [await makeEvent(b, "MIDDLE_SCHOOL", "중학교 입학", 1973, 3), await makeEvent(b, "MIDDLE_SCHOOL", "중학교 전학", 1974, 3)];
    const planB2 = await computeTodayPlan(b, kstDay());
    const midPick = await prisma.lifeEvent.findFirst({
      where: { userId: b, type: "MIDDLE_SCHOOL", status: { in: ["CONFIRMED", "CORRECTED"] }, needsReview: false },
      orderBy: [{ sequenceOrder: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    const midHit = planB2.find((c) => c.itemKey === itemKeyOf("POOL", "middle-lunchbox"));
    check("⑦ 순서까지 같으면 id 로 가름 — 계획과 세션 기준이 같은 사건", midHit === undefined || (twinEvents.includes(midHit.eventId) && midHit.eventId === midPick?.id), { midHit, midPick });
    const state = await startInterviewSession(b);
    check("⑦ 같은 유형 2개인 계정으로 세션 시작 정상", state.kind === "item" && (await prisma.interviewItem.count({ where: { userId: b } })) > 0, state.kind);
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_C] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  process.exit(1);
});
