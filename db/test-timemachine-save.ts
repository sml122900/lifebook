// Phase T3 보완 — save/load 라운드트립 검증.
// 한 사용자로 (year, month) 한 달치 저장 → 다시 읽어와서 일치하는지 확인.
// 마지막에 두 번째 저장으로 멱등 확인 (덮어쓰기).

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  loadTimemachineMonth,
  saveTimemachineMonth,
} from "../lib/timemachine-memories";

async function main() {
  // 시드의 2025년 8월 MonthEvent id 2개를 사용.
  const events = await prisma.monthEvent.findMany({
    where: { year: 2025, month: 8 },
    select: { id: true, title: true },
    take: 2,
  });
  if (events.length < 2) {
    throw new Error("need at least 2 MonthEvent rows for 2025-08");
  }

  const user = await prisma.user.create({
    data: {
      email: `tmsave-${Date.now()}@test`,
      name: "tmsave",
    },
  });

  try {
    // 1) 빈 상태 로드
    const before = await loadTimemachineMonth(user.id, 2025, 8);
    console.log("초기 상태:", before);

    // 2) 첫 저장
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [
        { monthEventId: events[0].id, story: "그날 비가 왔다" },
        { monthEventId: events[1].id, story: "" },
      ],
      monthStory: "여름 막바지였다",
    });
    const after1 = await loadTimemachineMonth(user.id, 2025, 8);
    console.log("첫 저장 후:", after1);

    // 3) 두 번째 저장 (멱등 + 변경)
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [
        { monthEventId: events[0].id, story: "수정된 메모" },
      ],
      monthStory: "다시 떠올려보니",
    });
    const after2 = await loadTimemachineMonth(user.id, 2025, 8);
    console.log("두번째 저장 후:", after2);

    // 4) 빈 페이로드로 저장 (clear)
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [],
      monthStory: "",
    });
    const after3 = await loadTimemachineMonth(user.id, 2025, 8);
    console.log("비우기 후:", after3);

    // 5) 알 수 없는 monthEventId 필터링
    await saveTimemachineMonth(user.id, 2025, 8, {
      keptEvents: [
        { monthEventId: events[0].id, story: "valid" },
        { monthEventId: "doesnt-exist", story: "should be dropped" },
      ],
      monthStory: "",
    });
    const after4 = await loadTimemachineMonth(user.id, 2025, 8);
    console.log("알 수 없는 id 필터링:", after4);

    const check = (label: string, ok: boolean) =>
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

    console.log("\n=== 체크 ===");
    check("초기 빈 상태", before.keptEvents.length === 0 && before.monthStory === "");
    check("첫 저장 keptEvents 2건", after1.keptEvents.length === 2);
    check("첫 저장 monthStory 일치", after1.monthStory === "여름 막바지였다");
    check("두번째 저장 keptEvents 1건(덮어쓰기)", after2.keptEvents.length === 1);
    check("두번째 저장 story 갱신", after2.keptEvents[0]?.story === "수정된 메모");
    check("비우기 — keptEvents 0건", after3.keptEvents.length === 0);
    check("비우기 — monthStory 빈문자열", after3.monthStory === "");
    check("알수없는 id 필터링", after4.keptEvents.length === 1 && after4.keptEvents[0].monthEventId === events[0].id);
  } finally {
    await prisma.timemachineMonth.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
