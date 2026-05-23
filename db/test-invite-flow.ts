// Phase 9.2 sanity check.
//
// Walks two throwaway users through the invite + consent flow:
//   1. Alice creates a room and an invite link.
//   2. Before joining, Bob is NOT a member (getMembership returns null).
//   3. Bob joins via the invite (the function trusts its caller; in
//      the UI this happens only after Bob ticks the consent box and
//      submits the form).
//   4. Bob is now a consented member with role=member.
//   5. The token itself is URL-safe and 256 bits of entropy.
//
// Run with: npx tsx db/test-invite-flow.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  createInvite,
  createRoom,
  getMembership,
  joinViaInvite,
} from "../lib/rooms";

async function main() {
  const alice = await prisma.user.create({
    data: { email: `alice-${Date.now()}@example.invalid` },
    select: { id: true },
  });
  const bob = await prisma.user.create({
    data: { email: `bob-${Date.now()}@example.invalid` },
    select: { id: true },
  });

  try {
    const room = await createRoom(alice.id, "테스트 룸");
    console.log(`room ${room.id} created by alice`);

    const invite = await createInvite(alice.id, room.id);
    console.log(`invite token len=${invite.token.length} (${invite.token.slice(0, 12)}…)`);

    const beforeJoin = await getMembership(bob.id, room.id);
    console.log("bob before join:", beforeJoin);

    const join = await joinViaInvite(bob.id, invite.token);
    console.log(`bob joined room ${join.roomId}`);

    const afterJoin = await getMembership(bob.id, room.id);
    console.log("bob after join:", afterJoin);

    const failures: string[] = [];
    if (invite.token.length < 32) failures.push("token too short");
    if (!/^[A-Za-z0-9_-]+$/.test(invite.token)) failures.push("token not url-safe");
    if (beforeJoin !== null) failures.push("bob was a member before consenting");
    if (!afterJoin || afterJoin.role !== "member") failures.push("bob should be member after join");
    if (!afterJoin?.consentAt) failures.push("consentAt must be set after join");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: invite token safe, no auto-join, consent recorded on agree.");
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
