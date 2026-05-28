// Phase 9.3 점검.
//
// 두 사용자가 각각 UserMemory 를 쓴다. 둘이 같은 룸에 합류하면 각자
// 두 추억(내 것 + 상대 것)을 작성자와 함께 본다. 멤버가 아닌 제3자는
// 아무것도 못 본다.
//
// 실행: npx tsx db/test-room-timeline.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  createInvite,
  createRoom,
  joinViaInvite,
  listRoomMemories,
} from "../lib/rooms";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `a-${Date.now()}@example.invalid`, name: "엄마" },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `b-${Date.now()}@example.invalid`, name: "민호" },
    select: { id: true },
  });
  const eve = await prisma.user.create({
    data: { email: `e-${Date.now()}@example.invalid`, name: "외부인" },
    select: { id: true },
  });

  try {
    // Alice creates room and invites Bob.
    const room = await createRoom(alice.id, "우리 가족");
    const invite = await createInvite(alice.id, room.id);
    await joinViaInvite(bob.id, invite.token);

    // Each member writes a personal memory.
    await prisma.userMemory.create({
      data: {
        userId: alice.id,
        year: 1995,
        title: "결혼식 날",
        content: "꽃이 정말 많았어요.",
        createdVia: "manual",
      },
    });
    await prisma.userMemory.create({
      data: {
        userId: bob.id,
        year: 1995,
        title: "그해 운동회",
        content: "달리기 1등이었어요.",
        createdVia: "manual",
      },
    });

    // Eve writes one too — she is NOT in the room.
    await prisma.userMemory.create({
      data: {
        userId: eve.id,
        year: 1995,
        title: "혼자의 기억",
        content: "이 글은 룸에 보이면 안 돼요.",
        createdVia: "manual",
      },
    });

    console.log("\n— alice's view of the room");
    const aliceView = await listRoomMemories(room.id, alice.id);
    aliceView?.forEach((m) =>
      console.log(`  ${m.year} | ${m.user.name} | ${m.title}`),
    );

    console.log("\n— bob's view of the room");
    const bobView = await listRoomMemories(room.id, bob.id);
    bobView?.forEach((m) =>
      console.log(`  ${m.year} | ${m.user.name} | ${m.title}`),
    );

    console.log("\n— eve's view (non-member)");
    const eveView = await listRoomMemories(room.id, eve.id);
    console.log(`  ${eveView === null ? "null (blocked)" : `${eveView.length} rows`}`);

    const failures: string[] = [];
    if (!aliceView || aliceView.length !== 2) failures.push("alice should see 2 memories");
    if (!bobView || bobView.length !== 2) failures.push("bob should see 2 memories");
    if (eveView !== null) failures.push("non-member must get null, not data");
    if (aliceView && aliceView.some((m) => m.userId === eve.id))
      failures.push("eve's memory leaked into the room view");
    if (bobView && !bobView.some((m) => m.userId === alice.id))
      failures.push("bob can't see alice's memory");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: members see each other, non-member is blocked.");
    }
  } finally {
    // UserMemory.user has no onDelete:Cascade (production-safe default).
    // Clear it explicitly so the test users can be removed.
    await prisma.userMemory.deleteMany({
      where: { userId: { in: [alice.id, bob.id, eve.id] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, bob.id, eve.id] } },
    });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
