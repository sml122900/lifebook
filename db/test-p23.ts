// v3 P23 검증 — 지금 앱 경로(/chat-v3 자유 대화 + 제안 카드, My Life 개편 2단계)로. 실행: npx tsx db/test-p23.ts
//
// P23-1 원칙: 인물 질문("그 시절 가까이 지낸 분 있으세요?")에 그 시절과 무관한 실질 이야기가 오면 이야기는
// 버리지 않고(새 시기로 남김), 원래 질문은 "답했다"로 치지 않는다(personAsked 그대로 → person 갭 다시 제안).
// 단순 거절("기억이 잘 안 나요")은 "물어봤다"로 기록(P8-4 — 갭 재노출 막음).
// 옛 경로(submitPersonAnswer → promoteOpenTurn)는 개편 2단계에서 삭제 — 같은 규칙을 lib/free-chat 이 지킨다
// (주제 시작 startFreeTopic → 본인 답 → 제안 proposeFromSegment([지금 이야기 남기기]와 같은 호출) → [만들기]/[안 만들기]).
//
// 실 Sonnet 호출 있음(제안 1~2회). 테스트 계정은 끝에 deleteAccountTx 로 삭제.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { detectGaps } from "../lib/gap-detector";
import {
  createFromFreeChatProposal,
  declineFreeChatProposal,
  proposeFromSegment,
  startFreeTopic,
} from "../lib/free-chat";

const SESSION = "test-p23";
let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

async function answer(userId: string, text: string) {
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: text } });
  await new Promise((r) => setTimeout(r, 5));
}

async function main() {
  await prisma.user.deleteMany({ where: { email: "p23-test-alice@test" } });
  const user = await prisma.user.create({
    data: { email: "p23-test-alice@test", name: "alice", birthYear: 1950 },
  });

  try {
    const middleSchool = await prisma.lifeEvent.create({
      data: { userId: user.id, type: "MIDDLE_SCHOOL", label: "중학교 입학", year: 1963, status: "CONFIRMED", sequenceOrder: 0 },
    });

    console.log("=== P23-1 인물 질문에 무관한 실질 이야기 → 새 시기로 남김, 질문은 열어 둠 ===");
    const st = await startFreeTopic(user.id, { eventId: middleSchool.id, kind: "person" }, SESSION);
    check("인물 주제 시작 = 인물 질문 오프닝", st.kind === "opening" && st.opening.includes("친하게 지낸 사람"), st);
    await answer(user.id, "스물다섯 살 때 부산에서 배를 탔어요. 3년 동안 원양어선을 탔죠.");
    const p = await proposeFromSegment(user.id);
    const card = p.kind === "card" ? p.view.card : null;
    console.log("카드:", card && { title: card.title, center: card.center, people: card.people });
    check("이야기는 버리지 않음 — 카드가 뜸", !!card, p);
    check("카드 시기 = 새 시기(중학교 아님)", !!card && "new" in card.center, card?.center);
    check("카드 사람 0명(이름 없음)", !!card && card.people.length === 0, card?.people);
    const made = await createFromFreeChatProposal(user.id);
    const created = made.ok
      ? await prisma.lifeEvent.findUnique({ where: { id: made.eventId }, select: { type: true, status: true, userId: true, year: true } })
      : null;
    check("[만들기] → CUSTOM·CONFIRMED·본인 소유 새 시기", created?.type === "CUSTOM" && created.status === "CONFIRMED" && created.userId === user.id, created);
    check("새 시기 연도 = 1950 + 25 무렵(1974~1976)", !!created?.year && created.year >= 1974 && created.year <= 1976, created?.year);

    const middleAfter = await prisma.lifeEvent.findUnique({ where: { id: middleSchool.id }, select: { type: true, personAsked: true } });
    check("골격 이벤트 type 그대로(MIDDLE_SCHOOL)", middleAfter?.type === "MIDDLE_SCHOOL");
    check("personAsked=false(원래 질문엔 답한 적 없음 — 나중에 다시 제안 가능)", middleAfter?.personAsked === false);
    const gaps = await detectGaps(user.id);
    check("detectGaps — 중학교 person 갭 다시 제안됨", gaps.some((g) => g.type === "person" && g.targetEventId === middleSchool.id));

    console.log("\n=== P23-1 회귀 — 단순 거절은 새 시기 없음 + 물어봤다로 기록 ===");
    const highSchool = await prisma.lifeEvent.create({
      data: { userId: user.id, type: "HIGH_SCHOOL", label: "고등학교 입학", year: 1966, status: "CONFIRMED", sequenceOrder: 1 },
    });
    const eventsBefore = await prisma.lifeEvent.count({ where: { userId: user.id } });
    const st2 = await startFreeTopic(user.id, { eventId: highSchool.id, kind: "person" }, SESSION);
    check("인물 주제 시작(고등학교)", st2.kind === "opening", st2);
    await answer(user.id, "기억이 잘 안 나요");
    const p2 = await proposeFromSegment(user.id);
    // 내용 없음이면 카드 없이 넘어간다. 모델이 카드를 만들면 사용자는 [안 만들기] — 둘 다 같은 결과여야 한다.
    if (p2.kind === "card") {
      console.log("  (모델이 카드를 만듦 → [안 만들기])", p2.view.card.summary);
      await declineFreeChatProposal(user.id);
    }
    console.log("  거절 답 제안 결과:", p2.kind);
    const highAfter = await prisma.lifeEvent.findUnique({ where: { id: highSchool.id }, select: { personAsked: true } });
    check("단순 거절 → 새 시기·이야기·사람 0",
      (await prisma.lifeEvent.count({ where: { userId: user.id } })) === eventsBefore &&
        (await prisma.episode.count({ where: { lifeEventId: highSchool.id } })) === 0 &&
        (await prisma.person.count({ where: { userId: user.id } })) === 0);
    check("단순 거절 → personAsked=true(갭 재노출 방지)", highAfter?.personAsked === true);
    const gaps2 = await detectGaps(user.id);
    check("detectGaps — 고등학교 person 갭 안 뜸", !gaps2.some((g) => g.type === "person" && g.targetEventId === highSchool.id));
  } finally {
    await deleteAccountTx(user.id);
    const left = await prisma.user.findUnique({ where: { id: user.id } });
    check("테스트 계정 흔적 삭제", left === null);
  }
}

main()
  .then(() => {
    console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
