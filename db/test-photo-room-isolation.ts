// Phase Photo (마무리) — 독립 사진 메모리는 가족 룸에 새지 않아야 한다.
//
// listRoomMemories 는 멤버의 UserMemory 를 createdVia 무관하게 보여주는데,
// 사진 메모리(createdVia="photo")도 year/title 미러링이 있어 이미지 없는
// 텍스트 카드로 새던 문제를 막았다. 검증:
//   1) bob 은 alice 의 life_event 를 본다 (정상)
//   2) bob 은 alice 의 era_event 를 본다 (E2/E3 정책 — 회귀 0)
//   3) bob 은 alice 의 photo 메모리는 못 본다 (6단계 전까지 룸 비노출)
//
// listRoomMemories 는 Storage 를 건드리지 않으므로 photo 메모리 행만 직접
// 생성(실제 업로드 불필요). 실행: npx tsx db/test-photo-room-isolation.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { createInvite, createRoom, joinViaInvite, listRoomMemories } from "../lib/rooms";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, actual?: unknown) {
  if (cond) {
    pass++;
    console.log(`  [✓] ${label}`);
  } else {
    fail++;
    console.log(`  [✗] ${label} — 실제:`, actual);
  }
}

async function main() {
  const alice = await prisma.user.create({
    data: { email: `pri-a-${Date.now()}@test`, name: "엄마" },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `pri-b-${Date.now()}@test`, name: "민호" },
    select: { id: true },
  });

  try {
    const room = await createRoom(alice.id, "우리 가족");
    const invite = await createInvite(alice.id, room.id);
    await joinViaInvite(bob.id, invite.token);

    // alice 의 세 종류 메모리
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        createdVia: "life_event",
        year: 1990,
        title: "초등학교 입학",
        eventYear: 1990,
        eventTitle: "초등학교 입학",
      },
    });
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        createdVia: "era_event",
        year: 2001,
        title: "9·11 테러",
        eventYear: 2001,
        eventTitle: "9·11 테러",
        content: "그때 뉴스를 봤어요.",
      },
    });
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        createdVia: "photo",
        year: 2010,
        month: 6,
        title: "2010년 6월 사진",
        content: "첫 손주 백일잔치",
        eventYear: 2010,
        eventMonth: 6,
      },
    });

    const bobView = await listRoomMemories(room.id, bob.id);
    const titles = (bobView ?? []).map((m) => m.title);
    console.log("\n[bob 의 룸 뷰]", JSON.stringify(titles));

    check("life_event 노출", titles.includes("초등학교 입학"), titles);
    check("era_event 노출 (회귀)", titles.includes("9·11 테러"), titles);
    check(
      "photo 메모리 비노출",
      !titles.includes("2010년 6월 사진"),
      titles,
    );
    check("룸 뷰 정확히 2건(life+era)", titles.length === 2, titles.length);
  } finally {
    await prisma.userMemory.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.roomMember.deleteMany({ where: { userId: { in: [alice.id, bob.id] } } });
    await prisma.sharedRoom.deleteMany({ where: { ownerId: alice.id } });
    await prisma.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
  }

  console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`} (통과 ${pass})`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
