// 사용자 카테고리 1단계 회귀 — docs/phase/custom-graph.md §2.3·§6.4(2026-11-04). LLM 0.
//
// ⚠️ 로컬 .env 는 운영 DB 다. 이 스크립트는 자기 픽스처 계정(fixture-custom-*@lifebook.invalid)만 만들고 지운다
// (실고객·test30 접촉 0). 시작 때 남은 픽스처를 지우고, 끝나면(실패해도) 다시 지운다(deleteAccountTx).
//
//   ① 자리 규칙 — 같은 사용자만·고리·자기 자신(코드 + DB CHECK)·깊이 2(자리는 사용자 카테고리만)·종류·이름
//   ② 역할 규칙(customPairRole · saveNodeLink) — 카테고리 > 묶음 > 항목, 담는 쪽 = 높은 쪽, 같은 종류 넣기 금지,
//      기본 카테고리 행 거부, 자리와 겹치는 넣기 거부, 부르는 쪽 role 거부 · 빼기·되살리기
//   ③ 기본 카테고리 행 — 이름 바꿀 때만 생김(그 전 0행 · 기본 이름 = null) · 이름 말고는 못 바꿈
//   ④ 정합 점검 14 — 정상 0 · 남의 parentId·고리·같은 종류 넣기를 직접 넣으면 잡힘 · 자기 자신 부모는 CHECK 가 막음 ·
//      사용자 노드 연결·본문이 점검 1·5(끝 없음)에 안 잡힘(ownerOf)
//   ⑤ 지우기 — 묶음 = 연결만(항목 남음) · 카테고리 = 자기 묶음·항목 Cascade + 연결·본문·이전 판 정리, 넣어 둔 사람·이야기 보존
//   ⑥ 옮기기 — 자리 바꿈 + 새 자리와 겹치는 넣기 연결 정리
//   ⑦ 같은 이름 판정(Q98·Q100)
//   ⑧ 탈퇴 — 사용자 노드·연결·본문·이전 판 0
//
// 실행: npx tsx db/test-custom-graph.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import {
  builtinNames,
  createCategory,
  createCustomNode,
  CUSTOM_LIMITS,
  deleteCustomNode,
  moveCustomNode,
  renameCustomNode,
  sameNameNodes,
  setBuiltinName,
} from "../lib/custom-node";
import { createEpisodeBridge } from "../lib/episode";
import type { NodeType } from "../lib/generated/prisma/enums";
import { customPairRole, removeNodeLink, restoreNodeLink, saveNodeLink, type NodeRef } from "../lib/node-graph";
import { countNodeGraphIssues } from "../lib/node-graph-reconcile";

const EMAIL_A = "fixture-custom-a@lifebook.invalid";
const EMAIL_B = "fixture-custom-b@lifebook.invalid";
const EMAIL_C = "fixture-custom-c@lifebook.invalid";

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
      termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: u.id, birthYear: 1960, region: "대구", skeletonGeneratedAt: now } });
  return u.id;
}

async function makeEvent(userId: string, label: string, year: number, sequenceOrder: number) {
  return (
    await prisma.lifeEvent.create({
      data: { userId, type: "HIGH_SCHOOL", label, year, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder, personAsked: true },
      select: { id: true },
    })
  ).id;
}

const C = (id: string): NodeRef => ({ type: "CUSTOM", id });
const touching = (type: NodeType, id: string) => ({ OR: [{ fromType: type, fromId: id }, { toType: type, toId: id }] });
const reason = (r: { ok: boolean; reason?: string }) => (r.ok ? "ok" : r.reason);
const issues14 = async (userId: string) => (await countNodeGraphIssues({ userId })).custom;
const total14 = (c: Record<string, number>) => Object.values(c).reduce((s, v) => s + v, 0);

async function throws(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main() {
  await removeFixtures();
  try {
    const a = await makeUser(EMAIL_A, "[fixture] 사용자 노드 A");
    const b = await makeUser(EMAIL_B, "[fixture] 사용자 노드 B");

    // ── ① 자리 규칙 ───────────────────────────────────────────────
    const pet = await createCategory(a, { name: "  반려동물  " });
    const home = await createCategory(a, { name: "우리 집" });
    if (!pet.ok || !home.ok) throw new Error(`카테고리 만들기 실패: ${JSON.stringify({ pet, home })}`);
    const petName = await prisma.customNode.findUnique({ where: { id: pet.id }, select: { name: true, kind: true, parentId: true } });
    check("① 카테고리 만들기 — 이름 앞뒤 공백 정리·종류 CATEGORY·자리 없음", petName?.name === "반려동물" && petName.kind === "CATEGORY" && petName.parentId === null, petName);
    const chorong = await createCustomNode(a, { kind: "ITEM", name: "초롱이", parentId: pet.id });
    const bokshil = await createCustomNode(a, { kind: "ITEM", name: "복실이", parentId: pet.id });
    const dogs = await createCustomNode(a, { kind: "GROUP", name: "우리 집 개들", parentId: pet.id });
    if (!chorong.ok || !bokshil.ok || !dogs.ok) throw new Error(`항목·묶음 만들기 실패: ${JSON.stringify({ chorong, bokshil, dogs })}`);
    check("① 항목·묶음 만들기 — 자리 = 사용자 카테고리", true);

    const beforeBad = await prisma.customNode.count({ where: { userId: { in: [a, b] } } });
    check("① 종류 — CATEGORY 를 항목 함수로 만들기 거부(bad_kind)", reason(await createCustomNode(a, { kind: "CATEGORY", name: "x", parentId: pet.id })) === "bad_kind");
    check("① 이름 — 빈 이름 거부(need_name)", reason(await createCategory(a, { name: "   " })) === "need_name");
    check(`① 이름 — ${CUSTOM_LIMITS.name}자 넘음 거부(too_long)`, reason(await createCategory(a, { name: "가".repeat(CUSTOM_LIMITS.name + 1) })) === "too_long");
    check("① 깊이 2 — 항목 아래 항목 거부(depth)", reason(await createCustomNode(a, { kind: "ITEM", name: "x", parentId: chorong.id })) === "depth");
    check("① 깊이 2 — 묶음 아래 항목 거부(묶음 소속은 넣기 연결로 — depth)", reason(await createCustomNode(a, { kind: "ITEM", name: "x", parentId: dogs.id })) === "depth");
    check("① 같은 사용자만 — B 가 A 의 카테고리를 자리로 만들기 거부(not_found — 있는지도 안 알림)",
      reason(await createCustomNode(b, { kind: "ITEM", name: "x", parentId: pet.id })) === "not_found");
    const bCat = await createCategory(b, { name: "[fixture] B 의 카테고리" });
    if (!bCat.ok) throw new Error("B 카테고리 실패");
    check("① 같은 사용자만 — A 항목을 B 카테고리로 옮기기 거부(not_found)", reason(await moveCustomNode(a, chorong.id, bCat.id)) === "not_found");
    check("① 같은 사용자만 — B 가 A 항목 옮기기 거부(not_found)", reason(await moveCustomNode(b, chorong.id, bCat.id)) === "not_found");
    check("① 자기 자신 — 자기를 자리로 옮기기 거부(self_parent)", reason(await moveCustomNode(a, chorong.id, chorong.id)) === "self_parent");
    check("① 고리 — 카테고리를 자기 항목 아래로 옮기기 거부(cycle)", reason(await moveCustomNode(a, pet.id, chorong.id)) === "cycle");
    check("① 깊이 — 카테고리를 다른 카테고리 아래로 옮기기 거부(depth — 카테고리는 자리 없음)", reason(await moveCustomNode(a, pet.id, home.id)) === "depth");
    check("① 거부한 요청은 행을 만들지·바꾸지 않음",
      (await prisma.customNode.count({ where: { userId: { in: [a, b] } } })) === beforeBad + 1 &&
        (await prisma.customNode.findUnique({ where: { id: chorong.id }, select: { parentId: true } }))?.parentId === pet.id);
    check("① DB CHECK — 자기 자신 부모 직접 저장 거부(CustomNode_parent_not_self_check)",
      await throws(() => prisma.customNode.update({ where: { id: chorong.id }, data: { parentId: chorong.id } })));

    // ── ② 역할 규칙 ───────────────────────────────────────────────
    const ev = await makeEvent(a, "고등학교 입학", 1976, 0);
    const story = await createEpisodeBridge(a, ev, "고등학교 입학", null, "[fixture] 하굣길에 강아지를 처음 데려왔다.", "[본인] [fixture] 하굣길에 강아지를 처음 데려왔다.");
    if (!story) throw new Error("이야기 만들기 실패");
    const person = (await prisma.person.create({ data: { userId: a, name: "[fixture] 옆집 아저씨", relation: "이웃" }, select: { id: true } })).id;
    const place = (await prisma.place.create({ data: { userId: a, name: "[fixture] 동네 개천" }, select: { id: true } })).id;
    const group = (await prisma.personGroup.create({ data: { userId: a, name: "[fixture] 동네 사람들" }, select: { id: true } })).id;

    const roleOf = async (x: NodeRef, y: NodeRef) => {
      const rows = await prisma.nodeLink.findMany({
        where: { userId: a, OR: [{ fromType: x.type, fromId: x.id, toType: y.type, toId: y.id }, { fromType: y.type, fromId: y.id, toType: x.type, toId: x.id }] },
        select: { role: true, fromType: true, toType: true },
      });
      return rows.map((r) => `${r.fromType}>${r.toType}:${r.role || "관련"}`);
    };
    const P: NodeRef = { type: "PERSON", id: person };
    const E: NodeRef = { type: "EPISODE", id: story.episodeId };
    const s1 = await saveNodeLink(a, P, C(pet.id));
    const s2 = await saveNodeLink(a, E, C(dogs.id));
    const s3 = await saveNodeLink(a, P, C(chorong.id));
    const s4 = await saveNodeLink(a, C(chorong.id), C(dogs.id));
    const s5 = await saveNodeLink(a, C(chorong.id), C(bokshil.id));
    const s6 = await saveNodeLink(a, C(chorong.id), C(home.id));
    const s7 = await saveNodeLink(a, { type: "PERSON_GROUP", id: group }, C(home.id));
    check("② 사람 → 카테고리 = 넣기(MEMBER) · 이야기 → 묶음 = 넣기 · 사람 ↔ 항목 = 관련", s1.ok && s2.ok && s3.ok &&
      JSON.stringify(await roleOf(P, C(pet.id))) === JSON.stringify(["PERSON>CUSTOM:MEMBER"]) &&
      JSON.stringify(await roleOf(E, C(dogs.id))) === JSON.stringify(["EPISODE>CUSTOM:MEMBER"]) &&
      JSON.stringify(await roleOf(P, C(chorong.id))) === JSON.stringify(["PERSON>CUSTOM:관련"]), { s1, s2, s3 });
    check("② 항목 → 묶음 = 넣기(담는 쪽 = 순서 높은 쪽) · 항목 ↔ 항목 = 관련 · 항목 → 다른 카테고리 = 넣기 · 모임 → 카테고리 = 넣기",
      s4.ok && s5.ok && s6.ok && s7.ok && (await roleOf(C(chorong.id), C(dogs.id)))[0]?.endsWith(":MEMBER") &&
        (await roleOf(C(chorong.id), C(bokshil.id)))[0]?.endsWith(":관련") && (await roleOf(C(chorong.id), C(home.id)))[0]?.endsWith(":MEMBER"),
      { s4, s5, s6, s7 });
    const dogs2 = await createCustomNode(a, { kind: "GROUP", name: "[fixture] 다른 묶음", parentId: home.id });
    if (!dogs2.ok) throw new Error("묶음2 실패");
    const before2 = await prisma.nodeLink.count({ where: { userId: a } });
    check("② 같은 종류 넣기 금지 — 묶음 ↔ 묶음(same_kind)", reason(await saveNodeLink(a, C(dogs.id), C(dogs2.id))) === "same_kind");
    check("② 같은 종류 넣기 금지 — 카테고리 ↔ 카테고리(same_kind)", reason(await saveNodeLink(a, C(pet.id), C(home.id))) === "same_kind");
    check("② 같은 종류 넣기 금지 — 항목 ↔ 항목에 MEMBER 요청 거부(unsupported_option — 관련만)",
      reason(await saveNodeLink(a, C(chorong.id), C(bokshil.id), { role: "MEMBER" })) === "unsupported_option");
    check("② 부르는 쪽 role — 사람 → 카테고리에 관련(\"\") 요청 거부(unsupported_option)", reason(await saveNodeLink(a, P, C(pet.id), { role: "" })) === "unsupported_option");
    check("② 자리와 겹치는 넣기 거부 — 항목 → 자기 카테고리(home_category)", reason(await saveNodeLink(a, C(chorong.id), C(pet.id))) === "home_category");
    check("② 자리와 겹치는 넣기 거부 — 묶음 → 자기 카테고리(home_category)", reason(await saveNodeLink(a, C(dogs.id), C(pet.id))) === "home_category");
    check("② 모임 ↔ 항목 관련 거부(Q79 밖 — pair_not_allowed)", reason(await saveNodeLink(a, { type: "PERSON_GROUP", id: group }, C(chorong.id))) === "pair_not_allowed");
    check("② 남의 사용자 노드 거부(not_found)", reason(await saveNodeLink(b, { type: "PERSON", id: person }, C(pet.id))) === "not_found");
    // 순수 함수 — 담는 쪽 결정이 입력 순서와 무관.
    const end = (id: string, kind: string, parentId: string | null = null) => ({ type: "CUSTOM" as const, id, kind, parentId, builtin: null });
    const pr1 = customPairRole(end("i", "ITEM", "c0"), end("g", "GROUP", "c0"));
    const pr2 = customPairRole(end("g", "GROUP", "c0"), end("i", "ITEM", "c0"));
    const pr3 = customPairRole(end("g", "GROUP", "c0"), end("c0", "CATEGORY"));
    const pr4 = customPairRole(end("g", "GROUP", "c0"), end("c1", "CATEGORY"));
    check("② customPairRole — 입력 순서 무관 · 묶음 → 다른 카테고리 = 넣기 · 자기 카테고리 = home_category",
      JSON.stringify([pr1, pr2, pr4]) === JSON.stringify([{ ok: true, role: "MEMBER" }, { ok: true, role: "MEMBER" }, { ok: true, role: "MEMBER" }]) &&
        !pr3.ok && pr3.reason === "home_category", { pr1, pr2, pr3, pr4 });

    // ③ 기본 카테고리 행 — 위 동작들(카테고리·항목·연결 만들기)은 builtin 행을 만들지 않는다.
    const builtin0 = await prisma.customNode.count({ where: { userId: a, builtin: { not: null } } });
    const names0 = await builtinNames(a);
    check("③ 기본 카테고리 행 — 이름 바꾸기 전 0행 · 표시 이름 null(화면 = 기본 이름)", builtin0 === 0 && names0.PEOPLE === null && names0.PLACES === null, { builtin0, names0 });
    const sb1 = await setBuiltinName(a, "PEOPLE", "만난 분들");
    const sb2 = await setBuiltinName(a, "PEOPLE", "고마운 분들");
    const builtinRows = await prisma.customNode.findMany({ where: { userId: a, builtin: { not: null } }, select: { id: true, kind: true, parentId: true, name: true, builtin: true } });
    const names1 = await builtinNames(a);
    check("③ 이름 바꿀 때만 생성 — 첫 변경 1행 생성·두 번째는 이름만 갱신 · 장소록은 그대로 null",
      sb1.ok && sb1.prevName === null && sb2.ok && sb2.prevName === "만난 분들" && builtinRows.length === 1 && builtinRows[0].kind === "CATEGORY" &&
        builtinRows[0].parentId === null && names1.PEOPLE === "고마운 분들" && names1.PLACES === null, { builtinRows, names1 });
    const bid = builtinRows[0].id;
    check("③ 기본 카테고리 행 — 이름 함수 밖 거부(rename·delete·move = builtin)·잘못된 값 거부(bad_kind)",
      reason(await renameCustomNode(a, bid, "x")) === "builtin" && reason(await deleteCustomNode(a, bid)) === "builtin" &&
        reason(await moveCustomNode(a, bid, home.id)) === "builtin" && reason(await setBuiltinName(a, "TIMELINE", "x")) === "bad_kind");
    check("③ 기본 카테고리 행 — 자리로 쓰기 거부(depth) · 넣기 거부(builtin_category — 인물록·장소록은 기존 영역 그대로)",
      reason(await createCustomNode(a, { kind: "ITEM", name: "x", parentId: bid })) === "depth" &&
        reason(await saveNodeLink(a, P, C(bid))) === "builtin_category" && reason(await saveNodeLink(a, C(chorong.id), C(bid))) === "builtin_category");
    check("② ③ 거부한 연결 요청은 행을 만들지 않음", (await prisma.nodeLink.count({ where: { userId: a } })) === before2);

    // 빼기·되살리기 — 같은 역할 계산.
    const rm = await removeNodeLink(a, P, C(pet.id));
    const rmWrongRole = await removeNodeLink(a, E, C(dogs.id), { role: "" });
    const rs = rm.ok ? await restoreNodeLink(a, P, C(pet.id), rm.rows) : null;
    check("② 빼기 = 넣기 연결 1행 · 다른 role 로 빼기 = 0행 · 되살리기 = MEMBER 로 1행",
      rm.ok && rm.removed === 1 && rm.rows[0]?.role === "MEMBER" && rmWrongRole.ok && rmWrongRole.removed === 0 && rs?.ok === true && rs.restored === 1 &&
        JSON.stringify(await roleOf(P, C(pet.id))) === JSON.stringify(["PERSON>CUSTOM:MEMBER"]), { rm, rmWrongRole, rs });

    // ── ④ 정합 점검 14 ────────────────────────────────────────────
    await prisma.nodeBody.create({ data: { userId: a, nodeType: "CUSTOM", nodeId: chorong.id, doc: { v: 1, blocks: [] }, plainText: "[fixture] 초롱이 이야기" } });
    const clean = await countNodeGraphIssues({ userId: a });
    check("④ 정상 상태 — 점검 14 전부 0 · 사용자 노드 연결·본문이 점검 1·5(끝 없음·노드 없음)에 안 잡힘(ownerOf CUSTOM)",
      total14(clean.custom) === 0 && clean.danglingLinks === 0 && clean.bodyMissingNode === 0 && clean.ownerMismatch === 0 && clean.badDirectionOrPair === 0,
      clean);
    // 직접 넣은 이상 행(lib 입구를 거치지 않음 — DB 는 깊이·남의 자리·고리를 막지 않는다, Q75).
    const foreign = await prisma.customNode.create({ data: { userId: b, kind: "ITEM", name: "[fixture] 남의 자리", parentId: pet.id }, select: { id: true } });
    const loopA = await prisma.customNode.create({ data: { userId: a, kind: "ITEM", name: "[fixture] 고리 1", parentId: home.id }, select: { id: true } });
    const loopB = await prisma.customNode.create({ data: { userId: a, kind: "ITEM", name: "[fixture] 고리 2", parentId: loopA.id }, select: { id: true } });
    await prisma.customNode.update({ where: { id: loopA.id }, data: { parentId: loopB.id } });
    const [lo, hi] = [loopA.id, loopB.id].sort(); // cuid 는 ASCII — 기본 정렬 = 바이트 순(방향 CHECK 와 같음)
    await prisma.nodeLink.create({ data: { userId: a, fromType: "CUSTOM", fromId: lo, toType: "CUSTOM", toId: hi, role: "MEMBER" } });
    const dirtyA = await issues14(a);
    const dirtyB = await issues14(b);
    check("④ 점검 14 — 남의 parentId 1(B 기준) · 고리 2노드 · 같은 종류 넣기 1 · 자기 자신 부모 0(CHECK)",
      dirtyB.foreignParent === 1 && dirtyA.cycles === 2 && dirtyA.sameKindMember === 1 && dirtyA.selfParent === 0 && dirtyB.selfParent === 0,
      { dirtyA, dirtyB });
    check("④ 점검 14 — 고리 노드는 자리 규칙 위반으로도 잡힘(자리가 카테고리 아님)", dirtyA.badHome === 2, dirtyA);
    await prisma.nodeLink.deleteMany({ where: { userId: a, fromId: lo, toId: hi } });
    await prisma.customNode.update({ where: { id: loopA.id }, data: { parentId: home.id } });
    await prisma.customNode.deleteMany({ where: { id: { in: [loopB.id, loopA.id, foreign.id] } } });
    check("④ 이상 행 지운 뒤 점검 14 다시 0", total14(await issues14(a)) === 0 && total14(await issues14(b)) === 0);

    // ── ⑥ 옮기기 ─────────────────────────────────────────────────
    const mv = await moveCustomNode(a, chorong.id, home.id);
    const chorongNow = await prisma.customNode.findUnique({ where: { id: chorong.id }, select: { parentId: true } });
    check("⑥ 옮기기 — 자리 = 새 카테고리 · 새 자리와 겹치던 넣기 연결 1행 정리 · 다른 연결(묶음 넣기·관련) 그대로",
      mv.ok && mv.prevParentId === pet.id && mv.removedLinks === 1 && chorongNow?.parentId === home.id &&
        (await roleOf(C(chorong.id), C(home.id))).length === 0 && (await roleOf(C(chorong.id), C(dogs.id))).length === 1 &&
        (await roleOf(P, C(chorong.id))).length === 1, { mv, chorongNow });
    check("⑥ 옮긴 뒤 점검 14 — 0(자리와 겹치는 넣기 없음)", total14(await issues14(a)) === 0);

    // ── ⑤ 지우기 ─────────────────────────────────────────────────
    const g0 = await deleteCustomNode(a, dogs.id);
    check("⑤ 묶음 지우기 — 묶음 행·넣기 연결만 사라짐(항목·이야기 남음)",
      g0.ok && (await prisma.customNode.count({ where: { id: dogs.id } })) === 0 && (await prisma.nodeLink.count({ where: touching("CUSTOM", dogs.id) })) === 0 &&
        (await prisma.customNode.count({ where: { id: { in: [chorong.id, bokshil.id] } } })) === 2 && (await prisma.episode.count({ where: { id: story.episodeId } })) === 1);
    // pet 카테고리: 자기 항목 bokshil + 묶음 하나 더, 사람(넣기)·이야기(넣기) — 지우면 자기 것만 사라지고 넣어 둔 것은 연결만.
    const petGroup = await createCustomNode(a, { kind: "GROUP", name: "[fixture] 산책 친구들", parentId: pet.id });
    if (!petGroup.ok) throw new Error("묶음 실패");
    await saveNodeLink(a, E, C(pet.id));
    await saveNodeLink(a, P, C(petGroup.id));
    await prisma.nodeBody.create({ data: { userId: a, nodeType: "CUSTOM", nodeId: bokshil.id, doc: { v: 1, blocks: [] }, plainText: "[fixture] 복실이" } });
    await prisma.nodeBodyRevision.create({ data: { userId: a, nodeType: "CUSTOM", nodeId: bokshil.id, plainText: "[fixture] 복실이 옛 글" } });
    const ownIds = [pet.id, bokshil.id, petGroup.id];
    const personLinksBefore = await prisma.nodeLink.count({ where: { userId: a, ...touching("PERSON", person), NOT: { toType: "CUSTOM", toId: { in: ownIds } } } });
    const delCat = await deleteCustomNode(a, pet.id);
    const anyOwnLink = await prisma.nodeLink.count({ where: { OR: ownIds.flatMap((id) => touching("CUSTOM", id).OR) } });
    check("⑤ 카테고리 지우기 — 자기 묶음·항목 Cascade · 그 노드의 연결·본문·이전 판 0",
      delCat.ok && (await prisma.customNode.count({ where: { id: { in: ownIds } } })) === 0 && anyOwnLink === 0 &&
        (await prisma.nodeBody.count({ where: { nodeType: "CUSTOM", nodeId: { in: ownIds } } })) === 0 &&
        (await prisma.nodeBodyRevision.count({ where: { nodeType: "CUSTOM", nodeId: { in: ownIds } } })) === 0, { delCat, anyOwnLink });
    check("⑤ 카테고리 지우기 — 넣어 둔 사람·이야기 보존(행 그대로 · 다른 연결 그대로)",
      (await prisma.person.count({ where: { id: person } })) === 1 && (await prisma.episode.count({ where: { id: story.episodeId } })) === 1 &&
        (await prisma.nodeLink.count({ where: { userId: a, ...touching("PERSON", person) } })) === personLinksBefore && personLinksBefore >= 1,
      { personLinksBefore });
    check("⑤ 지운 뒤 다른 카테고리 항목(옮긴 초롱이)·관련 연결 남음", (await prisma.customNode.count({ where: { id: chorong.id } })) === 1 && (await roleOf(P, C(chorong.id))).length === 1);

    // ── ⑦ 같은 이름 판정 ─────────────────────────────────────────
    await prisma.person.create({ data: { userId: a, name: "김 영수", relation: "친구" } });
    await prisma.place.create({ data: { userId: a, name: "부산역" } });
    const sn1 = await sameNameNodes(a, "김영수");
    const sn2 = await sameNameNodes(a, " 부산 역 ");
    const sn3 = await sameNameNodes(a, "고등학교입학");
    const sn4 = await sameNameNodes(a, "초롱이");
    check("⑦ 같은 이름(공백 무시) — 사람·장소·시기 이름만, 사용자 항목·다른 이름은 안 셈",
      sn1.length === 1 && sn1[0].type === "PERSON" && sn2.length === 1 && sn2[0].type === "PLACE" && sn3.some((x) => x.type === "LIFE_EVENT") && sn4.length === 0,
      { sn1, sn2, sn3, sn4 });

    // ── ⑧ 탈퇴 ───────────────────────────────────────────────────
    const c = await makeUser(EMAIL_C, "[fixture] 사용자 노드 C");
    const cCat = await createCategory(c, { name: "취미" });
    if (!cCat.ok) throw new Error("C 카테고리 실패");
    const cItem = await createCustomNode(c, { kind: "ITEM", name: "낚시", parentId: cCat.id });
    if (!cItem.ok) throw new Error("C 항목 실패");
    const cPerson = (await prisma.person.create({ data: { userId: c, name: "[fixture] 낚시 친구", relation: "친구" }, select: { id: true } })).id;
    await saveNodeLink(c, { type: "PERSON", id: cPerson }, C(cCat.id));
    await saveNodeLink(c, { type: "PERSON", id: cPerson }, C(cItem.id));
    await setBuiltinName(c, "PLACES", "다닌 곳");
    await prisma.nodeBody.create({ data: { userId: c, nodeType: "CUSTOM", nodeId: cItem.id, doc: { v: 1, blocks: [] }, plainText: "[fixture] 낚시" } });
    await prisma.nodeBodyRevision.create({ data: { userId: c, nodeType: "CUSTOM", nodeId: cItem.id, plainText: "[fixture] 낚시 옛 글" } });
    const cIds = [cCat.id, cItem.id];
    await deleteAccountTx(c);
    const left = {
      user: await prisma.user.count({ where: { id: c } }),
      customNodes: await prisma.customNode.count({ where: { userId: c } }),
      links: await prisma.nodeLink.count({ where: { OR: [{ userId: c }, ...cIds.flatMap((id) => touching("CUSTOM", id).OR)] } }),
      bodies: await prisma.nodeBody.count({ where: { OR: [{ userId: c }, { nodeType: "CUSTOM", nodeId: { in: cIds } }] } }),
      revisions: await prisma.nodeBodyRevision.count({ where: { OR: [{ userId: c }, { nodeType: "CUSTOM", nodeId: { in: cIds } }] } }),
    };
    check("⑧ 탈퇴 — 사용자 노드(기본 카테고리 행 포함)·연결·본문·이전 판 0", Object.values(left).every((v) => v === 0), left);
  } finally {
    await removeFixtures();
  }
  const leftover = await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_C] } } });
  check("정리 — 픽스처 계정 0", leftover === 0, { leftover });
  console.log(`\n${count - failed}/${count} 통과`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
