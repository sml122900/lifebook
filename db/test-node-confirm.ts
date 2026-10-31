// 노드 그래프 2b-2 — 이야기에 나온 인물 확인 회귀. docs/phase/node-graph-self.md §6 2b.3·2b.6. LLM 0
// (추출 결과 대신 후보를 saveProposedPeople 에 직접 넣는다 — 실제 추출 1회는 test-person-mode 10).
//
//   ① 저장 규칙 — 새 이름 = 초안 + 확인 대기 연결 · 확정 인물은 연결만 · 이야기의 대상 인물·이름 없는 후보는
//      연결 없음 · 두 이야기의 같은 새 이름 → 초안 1명 · 다시 저장해도 연결 무변
//   ② 확인 전 미노출 — /people 목록·타임라인 인물 칩·인물 이야기 갭·말동무 초안 검토 · 대기 수
//   ③ 확인 화면 데이터 — 이야기별 묶음·순서·"이미 등록된 분"
//   ④ 맞아요 — 확정·연결 CONFIRMED·PersonLifeEvent(멱등) · 두 번 = 건너뜀 · 남의 연결 = 건너뜀
//   ⑤ 아니에요 — 초안은 삭제, 확정 인물은 보존
//   ⑥ 고칠게요 — 초안 이름 고침 · 고친 이름이 확정 인물과 같으면 되물음 → 같은 분 = 그 인물로 합침(초안 삭제) ·
//      잘못 맞춰진 확정 인물 → 새 인물(원래 정보 무변) · 대상 인물로 고치면 연결 대신 PersonLifeEvent 만 · 잘못된 입력 거부
//   ⑦ 동명이인(자동 병합 안 함) — 맞아요 때 같은 이름 확정 인물이 있으면 되물음(관계가 달라도) ·
//      같은 분이에요 → 병합(초안의 다른 이야기 대기 연결도 옮김) · 다른 분이에요 → 별도 확정 ·
//      등록된 분 행을 같은 이름으로 고치기 → 다른 분 = 새 인물 · 잘못된 같은 분 대상 거부 · 모두 맞아요(되묻는 행만 남음)
//   ⑧ 확인 후 노출 + 정합 점검(고아 초안·끝 없는 연결·한 쌍 두 곳 0, 대기 0)
//
// 자체 픽스처 계정 2개만 만들고 지운다(test30·실고객 접촉 0).
// 실행: npx tsx db/test-node-confirm.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge } from "../lib/episode";
import { detectGaps } from "../lib/gap-detector";
import type { LifeEventType } from "../lib/generated/prisma/enums";
import { countPendingPeople, decidePeople, getPendingPeopleGroups } from "../lib/node-confirm";
import { countNodeGraphIssues } from "../lib/node-graph-reconcile";
import { listPeople } from "../lib/people";
import { saveProposedPeople } from "../lib/person-chat";
import { getStoryReviewData } from "../lib/story-review";

const EMAIL_A = "fixture-nodeconfirm-a@lifebook.invalid";
const EMAIL_B = "fixture-nodeconfirm-b@lifebook.invalid";

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

async function makeEvent(userId: string, type: LifeEventType, label: string, year: number, sequenceOrder: number) {
  const e = await prisma.lifeEvent.create({
    data: { userId, type, label, year, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder, personAsked: true },
    select: { id: true },
  });
  return e.id;
}

async function makePerson(userId: string, name: string, relation: string, lifeEventId?: string) {
  const p = await prisma.person.create({ data: { userId, name, relation }, select: { id: true } });
  if (lifeEventId) await prisma.personLifeEvent.create({ data: { personId: p.id, lifeEventId, userId } });
  return p.id;
}

async function makeStory(userId: string, lifeEventId: string, title: string, personId?: string) {
  const r = await createEpisodeBridge(userId, lifeEventId, title, null, `${title} 이야기를 들려주었다.`, `[본인] ${title}`, personId);
  if (!r) throw new Error("createEpisodeBridge 실패");
  return r.episodeId;
}

const linkOf = (userId: string, episodeId: string, personId: string) =>
  prisma.nodeLink.findFirst({ where: { userId, fromType: "EPISODE", fromId: episodeId, toType: "PERSON", toId: personId } });
const personByName = (userId: string, name: string) => prisma.person.findMany({ where: { userId, name } });
const ple = (personId: string, lifeEventId: string) => prisma.personLifeEvent.count({ where: { personId, lifeEventId } });

async function main() {
  await removeFixtures();
  try {
    const a = await makeUser(EMAIL_A, "[fixture] 확인 A");
    const b = await makeUser(EMAIL_B, "[fixture] 확인 B");
    await makeEvent(a, "BIRTH", "출생", 1958, 0);
    const hs = await makeEvent(a, "HIGH_SCHOOL", "고등학교 입학", 1974, 3);
    const mil = await makeEvent(a, "MILITARY", "군 입대", 1978, 5);
    const park = await makePerson(a, "박영수", "고교 친구", hs);
    const teacher = await makePerson(a, "최담임", "담임 선생님", hs);
    const wife = await makePerson(a, "정미숙", "아내");
    const story1 = await makeStory(a, hs, "고등학교 수학여행", teacher); // 대상 인물 = 최담임
    const story2 = await makeStory(a, mil, "훈련소 첫날");
    const story3 = await makeStory(a, mil, "자대 배치");

    // ── ① 저장 규칙 ─────────────────────────────────────────────
    const n1 = await saveProposedPeople(a, hs, story1, [
      { name: "이순자", relation: "국어 선생님" },
      { name: "박 영수", relation: "친구" }, // 확정 박영수(공백 무시·관계 호환)
      { name: "김철수", relation: "짝꿍" },
      { name: "최담임", relation: "선생님" }, // 이 이야기의 대상 인물
      { name: null, relation: "어머니" }, // 이름 없는 호칭 — 저장 안 함
    ]);
    const lee = await personByName(a, "이순자");
    const kim = await personByName(a, "김철수");
    check("① 연결 3건(새 이름 2 + 확정 인물 1) — 대상 인물·이름 없는 후보 제외", n1 === 3, n1);
    check("① 새 이름 = 초안(isDraft, 말동무 세션 없음)", lee.length === 1 && lee[0].isDraft && lee[0].companionSessionId === null && kim.length === 1 && kim[0].isDraft, { lee, kim });
    check("① 초안 metYear = 중심 연도", lee[0]?.metYear === 1974);
    check("① 확정 인물은 새로 만들지 않음(박영수 1명)", (await personByName(a, "박영수")).length === 1 && (await personByName(a, "박 영수")).length === 0);
    check("① 이름 없는 호칭은 인물을 만들지 않음", (await personByName(a, "어머니")).length === 0);
    const leeId = lee[0].id;
    const kimId = kim[0].id;
    const l1Lee = await linkOf(a, story1, leeId);
    const l1Park = await linkOf(a, story1, park);
    const l1Kim = await linkOf(a, story1, kimId);
    check("① 연결 = 확인 대기(PROPOSED, source AI)", [l1Lee, l1Park, l1Kim].every((l) => l?.status === "PROPOSED" && l.source === "AI"));
    check("① 대상 인물(Episode.personId)에는 연결을 안 만듦", (await linkOf(a, story1, teacher)) === null);
    check("① 확인 전에는 중심 연결(PersonLifeEvent) 없음", (await ple(leeId, hs)) === 0 && (await ple(kimId, hs)) === 0);

    const n2 = await saveProposedPeople(a, mil, story2, [
      { name: "이 순자", relation: "선생님" }, // 같은 새 이름 → 같은 초안
      { name: "정미숙", relation: "아내" }, // 확정 인물(중심 연결 없음)
      { name: "박용수", relation: "고교 친구" }, // 잘못 들은 이름(⑥ 합침용)
    ]);
    check("① 두 이야기의 같은 새 이름 → 초안 1명·연결 2건",
      n2 === 3 && (await prisma.person.count({ where: { userId: a, name: { in: ["이순자", "이 순자"] } } })) === 1 &&
        (await prisma.nodeLink.count({ where: { userId: a, toType: "PERSON", toId: leeId } })) === 2,
      n2);
    const before = await prisma.nodeLink.count({ where: { userId: a } });
    await saveProposedPeople(a, hs, story1, [{ name: "이순자", relation: "국어 선생님" }]);
    check("① 같은 이야기에 다시 저장해도 연결 수 무변", (await prisma.nodeLink.count({ where: { userId: a } })) === before);
    check("① 다른 중심의 이야기 id 로는 저장 안 됨(0)", (await saveProposedPeople(a, mil, story1, [{ name: "누군가", relation: "친구" }])) === 0);
    check("① 남의 이야기로는 저장 안 됨(0)", (await saveProposedPeople(b, hs, story1, [{ name: "누군가", relation: "친구" }])) === 0 && (await personByName(b, "누군가")).length === 0);

    // ── ② 확인 전 미노출 ─────────────────────────────────────────
    const people0 = await listPeople(a);
    check("② /people 목록에 초안 없음", !people0.some((p) => p.id === leeId || p.id === kimId));
    const review0 = await getStoryReviewData(a);
    const hsChips0 = review0.timeline.find((t) => t.id === hs)?.people.map((p) => p.id) ?? [];
    check("② 타임라인 인물 칩 = 확정 인물만(박영수·최담임)", hsChips0.length === 2 && hsChips0.includes(park) && hsChips0.includes(teacher), hsChips0);
    const gaps0 = await detectGaps(a);
    check("② 인물 이야기 갭에 초안 없음", !gaps0.some((g) => g.targetPersonId === leeId || g.targetPersonId === kimId));
    check("② 말동무 초안 검토(companionSessionId 있는 초안)에 안 섞임",
      (await prisma.person.count({ where: { userId: a, isDraft: true, companionSessionId: { not: null } } })) === 0);
    check("② 확인 대기 수 = 6", (await countPendingPeople(a)) === 6);

    // ── ③ 확인 화면 데이터 ────────────────────────────────────────
    const groups = await getPendingPeopleGroups(a);
    const g1 = groups[0];
    check("③ 이야기별 묶음 2개(저장 순) · 제목·연도", groups.length === 2 && g1.episodeId === story1 && g1.title === "고등학교 수학여행" && g1.year === 1974 && groups[1].episodeId === story2 && groups[1].year === 1978,
      groups.map((g) => [g.title, g.year, g.rows.length]));
    const rowPark = g1.rows.find((r) => r.linkId === l1Park?.id);
    const rowLee = g1.rows.find((r) => r.linkId === l1Lee?.id);
    check("③ 확정 인물 행 = 이미 등록된 분, 초안 행 = 아님", rowPark?.registered === true && rowLee?.registered === false && g1.rows.length === 3);
    check("③ 남의 화면엔 안 보임", (await getPendingPeopleGroups(b)).length === 0 && (await countPendingPeople(b)) === 0);

    // ── ④ 맞아요 ────────────────────────────────────────────────
    const yes1 = await decidePeople(a, [{ linkId: l1Park!.id, kind: "yes" }]);
    check("④ 확정 인물 맞아요 → 연결 CONFIRMED·PersonLifeEvent 그대로 1건",
      yes1.done.length === 1 && (await linkOf(a, story1, park))?.status === "CONFIRMED" && (await ple(park, hs)) === 1, yes1);
    const yes1again = await decidePeople(a, [{ linkId: l1Park!.id, kind: "yes" }]);
    check("④ 두 번 눌러도 안전(건너뜀)", yes1again.skipped.length === 1 && yes1again.done.length === 0, yes1again);
    const foreign = await decidePeople(b, [{ linkId: l1Lee!.id, kind: "yes" }, { linkId: l1Kim!.id, kind: "no" }]);
    check("④ 남의 연결은 건너뜀(상태 무변)",
      foreign.skipped.length === 2 && (await linkOf(a, story1, leeId))?.status === "PROPOSED" && (await linkOf(a, story1, kimId)) !== null, foreign);

    // ── ⑤ 아니에요 ──────────────────────────────────────────────
    await decidePeople(a, [{ linkId: l1Kim!.id, kind: "no" }]);
    check("⑤ 초안 아니에요 → 연결 삭제 + 다른 연결 없는 초안 삭제", (await linkOf(a, story1, kimId)) === null && (await personByName(a, "김철수")).length === 0);
    const l2Wife = await linkOf(a, story2, wife);
    await decidePeople(a, [{ linkId: l2Wife!.id, kind: "no" }]);
    check("⑤ 확정 인물 아니에요 → 연결만 삭제, 인물 보존·중심 연결 안 생김",
      (await linkOf(a, story2, wife)) === null && (await prisma.person.count({ where: { id: wife } })) === 1 && (await ple(wife, mil)) === 0);

    // ── ⑥ 고칠게요 ──────────────────────────────────────────────
    const bad1 = await decidePeople(a, [{ linkId: l1Lee!.id, kind: "edit", name: "  ", relation: "선생님" }]);
    const bad2 = await decidePeople(a, [{ linkId: l1Lee!.id, kind: "edit", name: "가".repeat(51), relation: "" }]);
    const bad3 = await decidePeople(a, [{ linkId: l1Lee!.id, kind: "edit", name: "이순자", relation: "가".repeat(31) }]);
    check("⑥ 빈 이름·이름 51자·관계 31자 → 거부(상태 무변)",
      bad1.invalid.length === 1 && bad2.invalid.length === 1 && bad3.invalid.length === 1 && (await linkOf(a, story1, leeId))?.status === "PROPOSED");
    await decidePeople(a, [{ linkId: l1Lee!.id, kind: "edit", name: "이순자", relation: "국어 담당 선생님" }]);
    const leeAfter = await prisma.person.findUnique({ where: { id: leeId } });
    check("⑥ 초안 고칠게요 → 같은 인물이 고친 관계로 확정 + 연결 CONFIRMED + PersonLifeEvent",
      leeAfter?.isDraft === false && leeAfter.relation === "국어 담당 선생님" && (await linkOf(a, story1, leeId))?.status === "CONFIRMED" && (await ple(leeId, hs)) === 1,
      leeAfter);
    const g2 = (await getPendingPeopleGroups(a)).find((g) => g.episodeId === story2);
    check("⑥ 다른 이야기의 같은 초안 행은 이제 '이미 등록된 분'", g2?.rows.find((r) => r.name === "이순자")?.registered === true, g2);

    const yongsu = (await personByName(a, "박용수"))[0];
    const l2Yong = await linkOf(a, story2, yongsu.id);
    const askYong = await decidePeople(a, [{ linkId: l2Yong!.id, kind: "edit", name: "박영수", relation: "친구" }]);
    check("⑥ 고친 이름과 같은 확정 인물이 있으면 되물음(후보 = 박영수) · 상태 무변",
      askYong.ask.length === 1 && askYong.ask[0].candidates.map((c) => c.id).join() === park && askYong.done.length === 0 &&
        (await linkOf(a, story2, yongsu.id))?.status === "PROPOSED" && (await personByName(a, "박용수")).length === 1,
      askYong);
    await decidePeople(a, [{ linkId: l2Yong!.id, kind: "same", personId: park }]);
    check("⑥ 같은 분이에요 → 그 인물에 연결·중심 연결, 초안 삭제",
      (await linkOf(a, story2, park))?.status === "CONFIRMED" && (await ple(park, mil)) === 1 &&
        (await personByName(a, "박용수")).length === 0 && (await linkOf(a, story2, yongsu.id)) === null);

    await saveProposedPeople(a, mil, story3, [{ name: "박영수", relation: "친구" }]); // 확정 박영수로 맞춰짐(실제론 다른 사람)
    const l3Park = await linkOf(a, story3, park);
    await decidePeople(a, [{ linkId: l3Park!.id, kind: "edit", name: "박영숙", relation: "군대 동기" }]);
    const youngsuk = await personByName(a, "박영숙");
    const parkAfter = await prisma.person.findUnique({ where: { id: park } });
    check("⑥ 잘못 맞춰진 확정 인물 고칠게요 → 새 확정 인물 연결, 원래 연결 삭제, 원래 인물 정보 무변",
      youngsuk.length === 1 && !youngsuk[0].isDraft && (await linkOf(a, story3, youngsuk[0].id))?.status === "CONFIRMED" &&
        (await ple(youngsuk[0].id, mil)) === 1 && (await linkOf(a, story3, park)) === null &&
        parkAfter?.name === "박영수" && parkAfter.relation === "고교 친구",
      { youngsuk, parkAfter });

    await saveProposedPeople(a, hs, story1, [{ name: "최영희", relation: "선생님" }]);
    const choi = (await personByName(a, "최영희"))[0];
    const choiLink = (await linkOf(a, story1, choi.id))!.id;
    const askChoi = await decidePeople(a, [{ linkId: choiLink, kind: "edit", name: "최담임", relation: "담임 선생님" }]);
    await decidePeople(a, [{ linkId: choiLink, kind: "same", personId: askChoi.ask[0]?.candidates[0]?.id ?? "" }]);
    check("⑥ 이야기의 대상 인물로 고쳐 같은 분이에요 → 연결은 안 만들고(한 쌍 = 한 곳) 초안 삭제",
      askChoi.ask[0]?.candidates[0]?.id === teacher &&
        (await linkOf(a, story1, teacher)) === null && (await personByName(a, "최영희")).length === 0 && (await ple(teacher, hs)) === 1);

    // ── ⑦ 동명이인 — 자동 병합 안 함 ───────────────────────────────
    // 같은 분이에요 → 병합: 초안 뒤에 같은 이름·호환 관계 확정 인물이 생긴 경우(인물 모드 직접 답 흉내).
    await saveProposedPeople(a, mil, story3, [{ name: "한상철", relation: "선임" }]);
    const hanDraft = (await personByName(a, "한상철"))[0];
    const hanConfirmed = await makePerson(a, "한상철", "선임");
    const hanLink = (await linkOf(a, story3, hanDraft.id))!.id;
    const askHan = await decidePeople(a, [{ linkId: hanLink, kind: "yes" }]);
    check("⑦ 맞아요 → 같은 이름 확정 인물이 있으면 되물음(후보 = 그 인물) · 초안·연결·중심 연결 무변",
      askHan.ask.length === 1 && askHan.ask[0].candidates.map((c) => c.id).join() === hanConfirmed && askHan.done.length === 0 &&
        (await prisma.person.findUnique({ where: { id: hanDraft.id } }))?.isDraft === true &&
        (await linkOf(a, story3, hanDraft.id))?.status === "PROPOSED" && (await ple(hanConfirmed, mil)) === 0,
      askHan);
    const foreignPerson = await makePerson(b, "한상철", "선임");
    const badSame = await decidePeople(a, [{ linkId: hanLink, kind: "same", personId: foreignPerson }]);
    const badSame2 = await decidePeople(a, [{ linkId: hanLink, kind: "same", personId: hanDraft.id }]);
    check("⑦ 같은 분이에요 대상이 남의 인물·초안이면 거부(상태 무변)",
      badSame.invalid.length === 1 && badSame2.invalid.length === 1 && (await linkOf(a, story3, hanDraft.id))?.status === "PROPOSED");
    await decidePeople(a, [{ linkId: hanLink, kind: "same", personId: hanConfirmed }]);
    check("⑦ 같은 분이에요 → 그 인물로 합침(연결 CONFIRMED·중심 연결), 초안 삭제",
      (await personByName(a, "한상철")).length === 1 && (await linkOf(a, story3, hanConfirmed))?.status === "CONFIRMED" && (await ple(hanConfirmed, mil)) === 1);

    // 다른 분이에요 → 별도 확정: 이름만 같고 관계가 다른 경우(아내 정미숙 vs 여자친구 정미숙).
    const job = await makeEvent(a, "FIRST_JOB", "첫 직장", 1982, 6);
    const story4 = await makeStory(a, job, "첫 직장 회식");
    await saveProposedPeople(a, job, story4, [{ name: "정미숙", relation: "여자친구" }]);
    const gfDraft = (await personByName(a, "정미숙")).find((p) => p.isDraft);
    check("⑦ 이름만 같고 관계가 다르면 저장 때 새 초안(확정 아내와 따로)", gfDraft !== undefined && (await linkOf(a, story4, wife)) === null);
    const gfLink = (await linkOf(a, story4, gfDraft!.id))!.id;
    const askGf = await decidePeople(a, [{ linkId: gfLink, kind: "yes" }]);
    check("⑦ 관계가 달라도 같은 이름이면 되물음(후보 = 아내 정미숙)",
      askGf.ask.length === 1 && askGf.ask[0].candidates.map((c) => c.id).join() === wife && askGf.ask[0].candidates[0].relation === "아내", askGf);
    await decidePeople(a, [{ linkId: gfLink, kind: "different" }]);
    const mi = await personByName(a, "정미숙");
    const wifeAfter = await prisma.person.findUnique({ where: { id: wife } });
    check("⑦ 다른 분이에요 → 초안을 새 인물로 확정(연결 CONFIRMED·중심 연결), 기존 인물 무변 — 정미숙 2명",
      mi.length === 2 && mi.every((p) => !p.isDraft) && (await linkOf(a, story4, gfDraft!.id))?.status === "CONFIRMED" &&
        (await ple(gfDraft!.id, job)) === 1 && (await ple(wife, job)) === 0 && wifeAfter?.relation === "아내",
      mi);

    // 같은 분이에요 = 초안 한 사람 전체: 두 이야기에 걸친 초안의 다른 대기 연결도 옮긴다.
    const aunt = await makePerson(a, "김순덕", "이모");
    await saveProposedPeople(a, mil, story2, [{ name: "김순덕", relation: "동네 이웃" }]);
    await saveProposedPeople(a, job, story4, [{ name: "김 순덕", relation: "이웃" }]);
    const ndDraft = (await personByName(a, "김순덕")).find((p) => p.isDraft)!;
    const ndLink2 = (await linkOf(a, story2, ndDraft.id))!.id;
    const ndLink4 = (await linkOf(a, story4, ndDraft.id))!.id;
    await decidePeople(a, [{ linkId: ndLink2, kind: "same", personId: aunt }]);
    const moved = await prisma.nodeLink.findUnique({ where: { id: ndLink4 } });
    check("⑦ 같은 분이에요 → 초안의 다른 이야기 대기 연결도 그 인물로(같은 연결 id·대기 유지), 초안 삭제",
      (await linkOf(a, story2, aunt))?.status === "CONFIRMED" && moved?.toId === aunt && moved.status === "PROPOSED" &&
        (await prisma.person.count({ where: { id: ndDraft.id } })) === 0,
      moved);
    const ndYes = await decidePeople(a, [{ linkId: ndLink4, kind: "yes" }]);
    check("⑦ 옮겨진 행 맞아요 → 되묻지 않고 확정(연결 CONFIRMED·중심 연결)",
      ndYes.done.length === 1 && (await linkOf(a, story4, aunt))?.status === "CONFIRMED" && (await ple(aunt, job)) === 1, ndYes);

    // 등록된 분 행(확정 박영수로 맞춰짐)을 같은 이름으로 고치기 → 되물음 → 다른 분 = 고친 값으로 새 인물.
    await saveProposedPeople(a, job, story4, [{ name: "박영수", relation: "친구" }]);
    const l4Park = (await linkOf(a, story4, park))!.id;
    const askPark = await decidePeople(a, [{ linkId: l4Park, kind: "edit", name: "박영수", relation: "직장 동료" }]);
    await decidePeople(a, [{ linkId: l4Park, kind: "different", name: "박영수", relation: "직장 동료" }]);
    const parks = await personByName(a, "박영수");
    const coworker = parks.find((p) => p.id !== park);
    check("⑦ 등록된 분 행을 같은 이름으로 고치면 되물음(후보에 그 인물) → 다른 분이에요 = 새 인물, 원래 인물·연결 정리",
      askPark.ask[0]?.candidates.some((c) => c.id === park) === true && parks.length === 2 && coworker?.relation === "직장 동료" &&
        (await linkOf(a, story4, coworker.id))?.status === "CONFIRMED" && (await linkOf(a, story4, park)) === null &&
        (await prisma.person.findUnique({ where: { id: park } }))?.relation === "고교 친구",
      { askPark, parks });

    // 모두 맞아요 — 되묻는 행만 남고 나머지는 처리.
    await saveProposedPeople(a, mil, story3, [{ name: "오만석", relation: "후임" }, { name: "유재석", relation: "전우" }, { name: "정미숙", relation: "첫사랑" }]);
    const open = (await getPendingPeopleGroups(a)).flatMap((g) => g.rows.map((r) => r.linkId));
    const all = await decidePeople(a, open.map((linkId) => ({ linkId, kind: "yes" as const })));
    check("⑦ 모두 맞아요 → 같은 이름 확정 인물이 있는 행만 되물음(후보 2명), 나머지 처리",
      open.length === 4 && all.done.length === 3 && all.ask.length === 1 && all.ask[0].candidates.length === 2 && (await countPendingPeople(a)) === 1,
      { open: open.length, all });
    await decidePeople(a, [{ linkId: all.ask[0].linkId, kind: "different" }]);
    check("⑦ 남은 행 다른 분이에요 → 대기 0 · 초안 0",
      (await countPendingPeople(a)) === 0 && (await prisma.person.count({ where: { userId: a, isDraft: true } })) === 0);

    // ── ⑧ 확인 후 노출 + 정합 점검 ────────────────────────────────
    const people1 = await listPeople(a);
    const review1 = await getStoryReviewData(a);
    const hsChips1 = review1.timeline.find((t) => t.id === hs)?.people.map((p) => p.id) ?? [];
    check("⑧ 확인 후 /people 목록·타임라인 칩에 보임(이순자)", people1.some((p) => p.id === leeId) && hsChips1.includes(leeId));
    const issues = await countNodeGraphIssues({ userId: a });
    check("⑧ 정합 점검 — 고아 초안·끝 없는 연결·한 쌍 두 곳·주인 불일치 0, 확인 대기 0",
      issues.orphanDrafts === 0 && issues.danglingLinks === 0 && issues.episodeSubjectDup === 0 && issues.ownerMismatch === 0 &&
        issues.badDirectionOrPair === 0 && issues.pendingPeopleLinks === 0,
      issues);
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
