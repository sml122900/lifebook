// Phase 9.1 점검: 룸 생성이 만든 이를 consentAt 가 찍힌 owner 로 등록하고,
// 비멤버는 getMembership 을 통과 못 하는지 확인.
//
// 실행: npx tsx db/test-room-create.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { createRoom, getMembership } from "../lib/rooms";

async function main() {
  const aliceEmail = `room-alice-${Date.now()}@example.invalid`;
  const bobEmail = `room-bob-${Date.now()}@example.invalid`;

  const alice = await prisma.user.create({
    data: { email: aliceEmail },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: bobEmail },
    select: { id: true },
  });

  try {
    const room = await createRoom(alice.id, "우리 가족");
    console.log(`room ${room.id} name=${room.name}`);

    const aliceMember = await getMembership(alice.id, room.id);
    console.log("alice (creator):", aliceMember);

    const bobMember = await getMembership(bob.id, room.id);
    console.log("bob (non-member):", bobMember);

    const failures: string[] = [];
    if (!aliceMember || aliceMember.role !== "owner") failures.push("creator should be owner");
    if (!aliceMember?.consentAt) failures.push("creator consentAt should be set");
    if (bobMember !== null) failures.push("non-member should return null");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: owner enrolled, non-member blocked.");
    }
  } finally {
    await prisma.user.deleteMany({
      where: { id: { in: [alice.id, bob.id] } },
    });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
