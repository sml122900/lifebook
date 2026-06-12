// 다듬기 Lv2 일회성 검증 — 군말 많은 회상 1건을 실제 Haiku 로 다듬어 결과 확인.
// 실행: npx tsx db/test-refine-lv2.ts  (실 API 호출 1건, 종료 시 테스트 행 정리)

import "dotenv/config";

import { prisma } from "../lib/db";
import { refineMemorySpelling } from "../lib/memory-refine";

const SAMPLE =
  "어 그때가 그니까 인제 1988년이었는데 어 내가 인제 회사를 처음 들어갔거든. " +
  "근데 그니까 첫 월급을 타가지고 어 부모님한테 인제 내복을 사드렸지. 사드렸지 " +
  "그때는 다 그랬어. 음 그래가 어머이가 억수로 좋아하시더라고.";

async function main() {
  const user = await prisma.user.create({
    data: { email: `refine-lv2-${Date.now()}@test`, name: "refine-test" },
    select: { id: true },
  });

  try {
    const memory = await prisma.userMemory.create({
      data: {
        userId: user.id,
        createdVia: "life_event",
        year: 1988,
        month: 3,
        title: "첫 직장",
        content: SAMPLE,
        eventTitle: "첫 직장",
        eventYear: 1988,
        eventMonth: 3,
        precision: "EXACT",
        category: "WORK",
      },
      select: { id: true },
    });

    const result = await refineMemorySpelling(user.id, memory.id);

    console.log("status:", result.status);
    console.log("--- 원문 (" + SAMPLE.length + "자) ---");
    console.log(SAMPLE);
    if (result.refinedText) {
      const ratio = result.refinedText.length / SAMPLE.length;
      console.log("--- 다듬은 글 (" + result.refinedText.length + "자, " +
        Math.round(ratio * 100) + "%) ---");
      console.log(result.refinedText);
    }
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
