// v3 → 포스터 브릿지 검증(20항목). 설계: docs/phase/v3-poster-bridge.md
// 실행: npx tsx db/test-v3-poster-bridge.ts
//
// 자체 픽스처 계정(fixture-bridge@lifebook.invalid)을 시작 시 만들고 끝에
// (성공·실패 모두) 하위 데이터째 삭제한다. test30 등 다른 계정 접촉 0.
// 외부 AI 호출은 "연도 표시 시 구간 행 연도 없음" 항목의 buildPosterSnapshot(P3 문장
// 1회)뿐 — 나머지는 P1 을 부르는 loadPosterEditor 대신 그 안의 동기화·규칙·가드 함수를
// 직접 호출. 사진 정리 경로는 Storage 에 없는 경로로 remove 를 부른다(없는 경로는
// Supabase 가 무시 — 실제 파일 변화 0).

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge } from "../lib/episode";
import { getLifeEvents } from "../lib/life-events";
import { deleteCustomLifeEvent } from "../lib/life-event-delete";
import { createRoom, listRoomMemories } from "../lib/rooms";
import type { PosterCandidate } from "../lib/poster/poster-candidates";
import { editPosterEventText, persistPosterSelections } from "../lib/poster/selections";
import { buildPosterSnapshot, hasLiveSelections } from "../lib/poster/snapshot";
import {
  CREATED_VIA_V3_BRIDGE,
  applyBridgeTypeRules,
  bridgeMemoryId,
  hasPosterSourceEvents,
  periodMemoryId,
  syncV3Bridge,
} from "../lib/poster/v3-bridge";

const FIXTURE_EMAIL = "fixture-bridge@lifebook.invalid";
const STORY_A = "국민학교 운동장에서 처음 자전거를 배웠다. 아버지가 뒤에서 잡아 주셨다.";
const GUIDANCE = "더 많은 이야기를 들려주세요. 어떤 일이 있으셨나요?";
const STORY_B = "입학식 날 어머니가 새 고무신을 사 주셨다.";
const STORY_M = "강원도 화천에서 복무했다. 겨울이 몹시 추웠다.";
const STORY_M2 = "제대하던 날 동기들과 부대 앞 국밥집에 갔다.";
const STORY_C = "열여섯에 서울로 올라와 봉제 공장에 다녔다.";
const STORY_EP = "졸업할 무렵 동네에 처음으로 텔레비전이 들어왔다."; // 국민학교 입학 이후(구간)
const STORY_MP = "제대 후 부품 공장에 들어갔다가 월급을 더 준다는 곳으로 옮겼다."; // 군 입대 이후(구간)

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${count}. ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

async function removeFixture(): Promise<void> {
  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
}

async function bridgeRowsInDb(userId: string) {
  return prisma.userMemory.findMany({
    where: { userId, createdVia: CREATED_VIA_V3_BRIDGE },
    select: { id: true, title: true, content: true, eventYear: true, isDraft: true },
    orderBy: { id: "asc" },
  });
}

async function readSelections(userId: string): Promise<unknown> {
  const p = await prisma.poster.findUnique({ where: { userId }, select: { selections: true } });
  return p?.selections ?? null;
}

async function scenario(userId: string) {
  type EvType = "BIRTH" | "ELEM_SCHOOL" | "MILITARY" | "MARRIAGE" | "FIRST_JOB" | "UNIVERSITY" | "CUSTOM";
  const mkEvent = (data: {
    type: EvType;
    label: string;
    year: number | null;
    order: number;
    status?: "CONFIRMED" | "CORRECTED" | "UNCONFIRMED" | "SKIPPED";
    correctedLabel?: string;
    correctedYear?: number;
  }) =>
    prisma.lifeEvent.create({
      data: {
        userId,
        type: data.type,
        label: data.label,
        year: data.year,
        isOptional: !["BIRTH", "ELEM_SCHOOL"].includes(data.type),
        status: data.status ?? "CONFIRMED",
        confirmedAt: new Date(),
        sequenceOrder: data.order,
        correctedLabel: data.correctedLabel ?? null,
        correctedYear: data.correctedYear ?? null,
        personAsked: true,
      },
      select: { id: true },
    });

  // ── 14. /poster 게이트 — 사건 0 → 막힘, 연도 없는 확정 사건만 → 막힘, 연도 있는 확정 → 통과
  const gateEmpty = await hasPosterSourceEvents(userId);
  const marriage = await mkEvent({ type: "MARRIAGE", label: "결혼", year: null, order: 3 });
  const gateNoYear = await hasPosterSourceEvents(userId);

  const birth = await mkEvent({ type: "BIRTH", label: "출생", year: 1950, order: 0 });
  const elem = await mkEvent({
    type: "ELEM_SCHOOL", label: "국민학교 입학", year: 1957, order: 1,
    status: "CORRECTED", correctedLabel: "대구 국민학교 입학", correctedYear: 1958,
  });
  const military = await mkEvent({ type: "MILITARY", label: "군 입대", year: 1970, order: 2 });
  await mkEvent({ type: "FIRST_JOB", label: "첫 직장", year: 1975, order: 4, status: "UNCONFIRMED" });
  await mkEvent({ type: "UNIVERSITY", label: "대학교 입학", year: 1969, order: 5, status: "SKIPPED" });
  const custom = await mkEvent({ type: "CUSTOM", label: "서울 상경", year: 1972, order: 6 });
  const gateV3 = await hasPosterSourceEvents(userId);

  // Episode — 국민학교: 실질 A → 안내문 → 실질 B / 군 입대: M / 상경: C / 출생: 없음
  for (const [ev, label, year, body] of [
    [elem.id, "대구 국민학교 입학", 1958, STORY_A],
    [elem.id, "대구 국민학교 입학", 1958, GUIDANCE],
    [elem.id, "대구 국민학교 입학", 1958, STORY_B],
    [military.id, "군 입대", 1970, STORY_M],
    [custom.id, "서울 상경", 1972, STORY_C],
  ] as const) {
    if (!(await createEpisodeBridge(userId, ev, label, year, body, "raw"))) throw new Error("episode 생성 실패");
  }
  // 구간 이야기(isPeriod) — 국민학교 이후: 실질 1 + 안내문 1 / 군 입대 이후: 실질 1
  const period = async (ev: string, label: string, year: number, body: string) => {
    const r = await createEpisodeBridge(userId, ev, label, year, body, "raw", undefined, true);
    if (!r) throw new Error("구간 episode 생성 실패");
    return r.episodeId;
  };
  const epElemP = await period(elem.id, "대구 국민학교 입학 이후", 1958, STORY_EP);
  const epElemPGuide = await period(elem.id, "대구 국민학교 입학 이후", 1958, GUIDANCE);
  const epMilP = await period(military.id, "군 입대 이후", 1970, STORY_MP);

  const ids = {
    birth: bridgeMemoryId(birth.id),
    elem: bridgeMemoryId(elem.id),
    military: bridgeMemoryId(military.id),
    custom: bridgeMemoryId(custom.id),
    marriage: bridgeMemoryId(marriage.id),
    elemP: periodMemoryId(epElemP),
    elemPGuide: periodMemoryId(epElemPGuide),
    milP: periodMemoryId(epMilP),
  };

  // ── 1차 동기화
  const rows1 = await syncV3Bridge(userId);
  const byId1 = new Map(rows1.map((r) => [r.id, r]));
  const db1 = await bridgeRowsInDb(userId);

  check(
    "대상 필터 — CONFIRMED/CORRECTED·연도 있음만 행 생성(연도 없는 결혼·UNCONFIRMED·SKIPPED 제외)",
    rows1.filter((r) => !r.isPeriod).length === 4 &&
      [ids.birth, ids.elem, ids.military, ids.custom].every((id) => byId1.has(id)) && !byId1.has(ids.marriage),
    rows1.map((r) => r.title),
  );
  check(
    "BIRTH 행 생성 + CORRECTED 정정값(제목·연도) 반영",
    byId1.get(ids.birth)?.year === 1950 && byId1.get(ids.elem)?.title === "대구 국민학교 입학" && byId1.get(ids.elem)?.year === 1958,
    [byId1.get(ids.birth), byId1.get(ids.elem)],
  );
  check(
    "고정 id `v3_${lifeEventId}`·`v3p_${episodeId}` · createdVia=v3_bridge · eventYear 채움 · 초안 아님",
    db1.length === 6 &&
      db1.every((m) => /^v3p?_/.test(m.id) && m.eventYear === byId1.get(m.id)?.year && !m.isDraft),
    db1,
  );
  check(
    "본문 병합 — 실질 Episode 만 시간순(안내문 제외)",
    byId1.get(ids.elem)?.content === `${STORY_A}\n\n${STORY_B}`,
    byId1.get(ids.elem)?.content,
  );

  const cand = (eventId: string, suggestedType: "node" | "memo"): PosterCandidate => ({
    eventId, year: null, title: "", suggestedType, gist: "", priority: 3, recommended: true,
  });
  const ruled = applyBridgeTypeRules(
    [cand(ids.birth, "memo"), cand(ids.elem, "memo")],
    [{ eventId: ids.birth, type: "memo", order: 0 }, { eventId: ids.elem, type: "memo", order: 1 }],
    rows1,
  );
  check(
    "본문 없는 사건 → content null, P1 후보·저장돼 있던 선택 모두 node 고정(본문 있는 사건은 memo 유지)",
    byId1.get(ids.birth)?.content === null &&
      ruled.candidates[0].suggestedType === "node" && ruled.candidates[1].suggestedType === "memo" &&
      ruled.savedSelections[0].type === "node" && ruled.savedSelections[1].type === "memo",
    ruled,
  );

  // ── 구간 이야기 별도 행
  const elemP = byId1.get(ids.elemP);
  const milP = byId1.get(ids.milP);
  const periodRuled = applyBridgeTypeRules(
    [cand(ids.elemP, "node")],
    [{ eventId: ids.elemP, type: "node", order: 0 }],
    rows1,
  );
  check(
    "구간 분리 — Episode 마다 별도 행(id v3p_·제목=Episode 제목·본문=Episode 본문·연도=앵커), 안내문뿐인 구간은 행 없음, 기본 memo 후보(저장된 node 선택은 유지)",
    elemP?.isPeriod === true && elemP.title === "대구 국민학교 입학 이후" && elemP.content === STORY_EP && elemP.year === 1958 &&
      milP?.title === "군 입대 이후" && milP.content === STORY_MP && milP.year === 1970 &&
      !byId1.has(ids.elemPGuide) &&
      periodRuled.candidates[0].suggestedType === "memo" && periodRuled.savedSelections[0].type === "node",
    { elemP, milP, guide: byId1.has(ids.elemPGuide), periodRuled },
  );
  check(
    "앵커 사건 본문에 구간 이야기 내용 미포함",
    !byId1.get(ids.elem)?.content?.includes(STORY_EP) && byId1.get(ids.military)?.content === STORY_M,
    { elem: byId1.get(ids.elem)?.content, military: byId1.get(ids.military)?.content },
  );

  // ── 재동기화
  const rows2 = await syncV3Bridge(userId);
  const db2 = await bridgeRowsInDb(userId);
  check(
    "★ 재동기화 후 id 동일(행 수·id 집합 그대로)",
    JSON.stringify(rows2.map((r) => r.id)) === JSON.stringify(rows1.map((r) => r.id)) &&
      JSON.stringify(db2.map((m) => m.id)) === JSON.stringify(db1.map((m) => m.id)),
    { before: db1.map((m) => m.id), after: db2.map((m) => m.id) },
  );

  if (!(await createEpisodeBridge(userId, military.id, "군 입대", 1970, STORY_M2, "raw"))) {
    throw new Error("episode 추가 실패");
  }
  const rows3 = await syncV3Bridge(userId);
  check(
    "원천 변경(Episode 추가) → 같은 id 행의 본문 갱신",
    rows3.find((r) => r.id === ids.military)?.content === `${STORY_M}\n\n${STORY_M2}` && rows3.length === 6,
    rows3.find((r) => r.id === ids.military),
  );
  const periodIds = (rows: { id: string; isPeriod: boolean }[]) => rows.filter((r) => r.isPeriod).map((r) => r.id);
  check(
    "★ 재동기화 후 구간 행 id 동일 — 두 번 동기화·앵커 본문이 바뀐 뒤에도 같은 v3p_ id, 구간 본문 그대로",
    JSON.stringify(periodIds(rows2)) === JSON.stringify(periodIds(rows1)) &&
      JSON.stringify(periodIds(rows3)) === JSON.stringify(periodIds(rows1)) &&
      JSON.stringify(periodIds(rows1)) === JSON.stringify([ids.elemP, ids.milP]) &&
      rows3.find((r) => r.id === ids.milP)?.content === STORY_MP,
    { r1: periodIds(rows1), r2: periodIds(rows2), r3: periodIds(rows3) },
  );

  // ── override 보존 — 선택 저장 → (/poster/view 편집처럼) override 기록 → 재동기화 → 재저장
  const items = [
    { eventId: ids.military, type: "node" as const, order: 0 },
    { eventId: ids.elem, type: "memo" as const, order: 1 },
    { eventId: ids.birth, type: "node" as const, order: 2 },
  ];
  const save1 = await persistPosterSelections(userId, items);
  const override = { x: 500, y: 800, fontScale: 1.2, textOverride: "화천 복무" }; // 논리캔버스 1037×1517 안
  await prisma.poster.update({
    where: { userId },
    data: {
      selections: [
        { eventId: ids.military, type: "node", order: 0, override },
        { eventId: ids.elem, type: "memo", order: 1 },
        { eventId: ids.birth, type: "node", order: 2 },
      ],
    },
  });
  await syncV3Bridge(userId);
  const save2 = await persistPosterSelections(userId, items);
  const after = (await readSelections(userId)) as { eventId: string; override?: unknown }[];
  check(
    "★ override 보존 — 재동기화 + 선택 재저장 후에도 편집 override 그대로",
    save1.ok && save2.ok && JSON.stringify(after.find((s) => s.eventId === ids.military)?.override) === JSON.stringify(override),
    { save1, save2, after },
  );

  // ── 원천 삭제 — 상경 행에 사진(DB 행, Storage 에 없는 경로)을 붙인 뒤 원천 삭제
  const life = await prisma.userMemory.create({
    data: { userId, year: 1980, title: "개인 기록", eventTitle: "개인 기록", eventYear: 1980, createdVia: "life_event", content: "직접 쓴 이야기" },
    select: { id: true },
  });
  await prisma.photo.create({
    data: { userId, memoryId: ids.custom, storagePath: `${userId}/fixture-bridge-none.jpg`, mimeType: "image/jpeg", fileBytes: 1 },
  });
  const del = await deleteCustomLifeEvent(userId, custom.id);
  const rows4 = await syncV3Bridge(userId);
  const [customLeft, photoLeft, lifeLeft] = await Promise.all([
    prisma.userMemory.count({ where: { id: ids.custom } }),
    prisma.photo.count({ where: { memoryId: ids.custom } }),
    prisma.userMemory.count({ where: { id: life.id } }),
  ]);
  check(
    "★ 원천 삭제 → 그 행만 삭제(연결 사진 행 포함), 다른 브릿지 행·life_event 행은 유지",
    del.ok && customLeft === 0 && photoLeft === 0 && lifeLeft === 1 &&
      JSON.stringify(rows4.map((r) => r.id).sort()) ===
        JSON.stringify([ids.birth, ids.elem, ids.military, ids.elemP, ids.milP].sort()),
    { del, customLeft, photoLeft, lifeLeft, rows4: rows4.map((r) => r.id) },
  );

  await prisma.lifeEvent.update({ where: { id: military.id }, data: { status: "SKIPPED" } });
  const rows5 = await syncV3Bridge(userId);
  check(
    "대상에서 빠진 것(SKIPPED 전환) → 그 행만 삭제",
    !rows5.some((r) => r.id === ids.military) && (await prisma.userMemory.count({ where: { id: ids.military } })) === 0 && rows5.length === 3,
    rows5.map((r) => r.id),
  );
  check(
    "앵커가 대상에서 빠지면 그 구간 행도 같이 제외(다른 앵커의 구간 행은 유지)",
    !rows5.some((r) => r.id === ids.milP) && (await prisma.userMemory.count({ where: { id: ids.milP } })) === 0 &&
      rows5.some((r) => r.id === ids.elemP),
    rows5.map((r) => r.id),
  );

  // ── 본문 없는 사건 memo 저장 거부
  const before = JSON.stringify(await readSelections(userId));
  const rejected = await persistPosterSelections(userId, [{ eventId: ids.birth, type: "memo", order: 0 }]);
  const unchanged = JSON.stringify(await readSelections(userId)) === before;
  const asNode = await persistPosterSelections(userId, [
    { eventId: ids.birth, type: "node", order: 0 },
    { eventId: ids.elem, type: "memo", order: 1 },
  ]);
  check(
    "★ 본문 없는 사건 memo 저장 거부(저장 내용 그대로), node 로는 저장 가능",
    !rejected.ok && unchanged && asNode.ok,
    { rejected, unchanged, asNode },
  );

  // ── 유령 selections — 지워진 사건 id 만 남은 경우 주문 화면 진입 차단
  await prisma.poster.update({
    where: { userId },
    data: { selections: [{ eventId: ids.custom, type: "node", order: 0 }, { eventId: ids.military, type: "node", order: 1 }] },
  });
  const ghostOnly = await hasLiveSelections(userId, await readSelections(userId));
  const withLive = await hasLiveSelections(userId, [
    { eventId: ids.custom, type: "node", order: 0 },
    { eventId: ids.elem, type: "memo", order: 1 },
  ]);
  check(
    "★ 유령 selections 만 있으면 /poster/order 게이트 차단, 살아 있는 사건이 하나라도 있으면 통과",
    ghostOnly === false && withLive === true,
    { ghostOnly, withLive },
  );

  // ── 편집 차단
  const blocked = await editPosterEventText(userId, ids.elem, "바꾼 제목", "바꾼 내용");
  const blockedP = await editPosterEventText(userId, ids.elemP, "바꾼 제목", "바꾼 내용");
  const elemRow = await prisma.userMemory.findUnique({ where: { id: ids.elem }, select: { title: true, content: true } });
  const lifeEdit = await editPosterEventText(userId, life.id, "개인 기록(고침)", "직접 쓴 이야기");
  check(
    "v3_bridge 행(앵커·구간) 편집 차단(원본 채팅 안내·행 불변), life_event 행 편집은 그대로 가능",
    !blocked.ok && blocked.error.includes("원본 채팅") && !blockedP.ok && elemRow?.title === "대구 국민학교 입학" &&
      elemRow?.content === `${STORY_A}\n\n${STORY_B}` && lifeEdit.ok,
    { blocked, blockedP, elemRow, lifeEdit },
  );

  // ── 연도 표시 — 포스터 "연도 표시"를 켜도 구간 행 노드엔 연도 없음(앵커 노드엔 있음)
  await prisma.poster.update({
    where: { userId },
    data: {
      showNodeYears: true,
      selections: [{ eventId: ids.elem, type: "node", order: 0 }, { eventId: ids.elemP, type: "node", order: 1 }],
    },
  });
  const snap = await buildPosterSnapshot(userId, "[fixture] bridge");
  const snapElem = snap?.nodes.find((n) => n.eventId === ids.elem);
  const snapElemP = snap?.nodes.find((n) => n.eventId === ids.elemP);
  check(
    "연도 표시 켬 → 앵커 노드는 연도 1958, 구간 행 노드는 연도 없음(null)",
    snap?.showNodeYears === true && snapElem?.year === 1958 && snapElemP !== undefined && snapElemP.year === null,
    { showNodeYears: snap?.showNodeYears, snapElem, snapElemP },
  );

  check(
    "/poster 게이트 — 사건 0·연도 없는 확정만이면 차단, 연도 있는 확정 v3 사건이 있으면 통과",
    gateEmpty === false && gateNoYear === false && gateV3 === true,
    { gateEmpty, gateNoYear, gateV3 },
  );

  // ── 노출 범위 — 연혁(getLifeEvents)·가족 룸에 v3_bridge 행이 안 보임
  const room = await createRoom(userId, "[fixture] bridge 룸");
  const roomView = (await listRoomMemories(room.id, userId)) ?? [];
  const timeline = await getLifeEvents(userId);
  const bridgeIds = new Set([ids.birth, ids.elem, ids.elemP]);
  check(
    "노출 범위 — 연혁·가족 룸 목록에 v3_bridge 행 없음(life_event 행은 보임)",
    !timeline.some((e) => bridgeIds.has(e.id)) && timeline.some((e) => e.id === life.id) &&
      !roomView.some((m) => bridgeIds.has(m.id)) && roomView.some((m) => m.id === life.id),
    { timeline: timeline.map((e) => e.id), room: roomView.map((m) => m.id) },
  );
}

async function main() {
  await removeFixture();
  let userId: string | null = null;
  try {
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        email: FIXTURE_EMAIL,
        name: "[fixture] bridge",
        onboardingTrack: "V3",
        termsConsentAt: now,
        privacyConsentAt: now,
        overseasTransferConsentAt: now,
        privacyConsentVersion: CURRENT_CONSENT_VERSION,
      },
      select: { id: true },
    });
    userId = user.id;
    await prisma.onboardingProfile.create({
      data: { userId, birthYear: 1950, region: "대구", skeletonGeneratedAt: now },
    });
    await scenario(userId);
  } finally {
    // 시나리오 도중 실패해도 이메일로 찾아 지운다.
    await removeFixture();
    const id = userId ?? "";
    const [user, events, memories, photos, rooms] = await Promise.all([
      prisma.user.count({ where: { email: FIXTURE_EMAIL } }),
      prisma.lifeEvent.count({ where: { userId: id } }),
      prisma.userMemory.count({ where: { userId: id } }),
      prisma.photo.count({ where: { userId: id } }),
      prisma.sharedRoom.count({ where: { ownerId: id } }),
    ]);
    if (user + events + memories + photos + rooms === 0) {
      console.log("정리 — 픽스처 계정·하위 데이터 삭제 확인");
    } else {
      console.log("정리 실패 — 픽스처 잔재:", { user, events, memories, photos, rooms });
      failed += 1;
    }
  }
  console.log(failed === 0 && count === 20 ? "\nALL PASS (20)" : `\n${failed} FAILED / ${count} 항목`);
  process.exitCode = failed === 0 && count === 20 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
