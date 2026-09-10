// v3 P23 검증. 실행: npx tsx db/test-p23.ts
//
// P23-1 — person 단계(pending person 재개 포함)에서 이름 후보가 0개인
// 답변이 실은 무관한 실질 이야기면 submitPersonAnswer 가 promoteOpenTurn
// 으로 재분류해 CUSTOM LifeEvent 를 만들어 promoted 로 돌려주는지. 단순
// 거절/무응답은 여전히 승격 안 되는지(회귀).
//
// 실 Sonnet 호출 있음. 테스트 계정은 끝에 deleteAccountTx 로 삭제.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { submitPersonAnswer } from "../lib/person-chat";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

async function main() {
  const user = await prisma.user.create({
    data: { email: "p23-test-alice@test", name: "alice" },
  });

  try {
    const middleSchool = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type: "MIDDLE_SCHOOL",
        label: "중학교 입학",
        year: 1963,
        status: "CONFIRMED",
        sequenceOrder: 0,
      },
    });

    console.log("=== P23-1 무관한 실질 이야기 → 승격 ===");
    const promoted = await submitPersonAnswer(
      user.id,
      middleSchool.id,
      "중학교 다닐 때 친하게 지낸 사람 있으세요?",
      "스물다섯 살 때 부산에서 배를 탔어요. 3년 동안 원양어선을 탔죠.",
    );
    console.log("결과:", promoted);
    check("인물로는 저장 안 됨(savedCount=0)", promoted.savedCount === 0);
    check("promoted 채워짐", promoted.promoted !== null);

    if (promoted.promoted) {
      const created = await prisma.lifeEvent.findUnique({
        where: { id: promoted.promoted.eventId },
        select: { type: true, status: true, userId: true, label: true },
      });
      check("CUSTOM 타입(지우기 가능 대상)", created?.type === "CUSTOM");
      check("CONFIRMED 상태(바로 이야기 이어갈 수 있음)", created?.status === "CONFIRMED");
      check("본인 소유", created?.userId === user.id);
    }

    // 골격 이벤트(중학교 입학) 는 이 과정에서 안 건드림.
    const middleSchoolAfter = await prisma.lifeEvent.findUnique({
      where: { id: middleSchool.id },
      select: { type: true, personAsked: true },
    });
    check("골격 이벤트 type 그대로(CUSTOM 아님, 지우기 버튼 없음)", middleSchoolAfter?.type === "MIDDLE_SCHOOL");
    check("personAsked=true(갭 재노출 방지)", middleSchoolAfter?.personAsked === true);

    console.log("\n=== P23-1 회귀 — 단순 거절은 승격 안 됨 ===");
    const highSchool = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type: "HIGH_SCHOOL",
        label: "고등학교 입학",
        year: 1966,
        status: "CONFIRMED",
        sequenceOrder: 1,
      },
    });
    const declined = await submitPersonAnswer(
      user.id,
      highSchool.id,
      "고등학교 다닐 때 친하게 지낸 사람 있으세요?",
      "기억이 잘 안 나요",
    );
    check("단순 거절 → savedCount 0", declined.savedCount === 0);
    check("단순 거절 → promoted 없음", declined.promoted === null);
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
