// 회원 탈퇴 흐름이 실제 DB 행에서 올바르게 동작하는지 검증.
// 실행: npx tsx db/test-withdrawal.ts
//
// 커버 시나리오:
// 1) 방장 탈퇴 + 다른 동의 멤버 있음 → 소유권 이전.
// 2) 방장 탈퇴 + 다른 동의 멤버 없음 → 룸 cascade 삭제.
// 3) 탈퇴자가 쓴 SharedMemory 는 익명화 (createdById=null).
// 4) paid TokenOrder 익명화 (userId=null), pending/failed 는 삭제.
// 5) UserMemory cascade. 그에 달린 고아 룸 댓글은 사전 정리.

import "dotenv/config";

import { prisma } from "../lib/db";

async function cleanup() {
  await prisma.user.deleteMany({
    where: { email: { startsWith: "withdrawal-test-" } },
  });
  // Orphan rows from previous runs (anonymized).
  await prisma.tokenOrder.deleteMany({
    where: { id: { startsWith: "wtest_" } },
  });
  await prisma.sharedMemory.deleteMany({
    where: { id: { startsWith: "wtest_" } },
  });
  await prisma.sharedRoom.deleteMany({
    where: { name: { startsWith: "withdrawal-test-" } },
  });
}

async function runDeletion(userId: string) {
  await prisma.$transaction(async (tx) => {
    const ownedRooms = await tx.sharedRoom.findMany({
      where: { ownerId: userId },
      select: {
        id: true,
        members: {
          where: { userId: { not: userId }, consentAt: { not: null } },
          orderBy: { joinedAt: "asc" },
          take: 1,
          select: { id: true, userId: true },
        },
      },
    });
    for (const room of ownedRooms) {
      const successor = room.members[0];
      if (successor) {
        await tx.sharedRoom.update({
          where: { id: room.id },
          data: { ownerId: successor.userId },
        });
        await tx.roomMember.update({
          where: { id: successor.id },
          data: { role: "owner" },
        });
      } else {
        await tx.sharedRoom.delete({ where: { id: room.id } });
      }
    }
    await tx.tokenOrder.deleteMany({
      where: { userId, status: { not: "paid" } },
    });
    const memoryIds = await tx.userMemory.findMany({
      where: { userId },
      select: { id: true },
    });
    if (memoryIds.length > 0) {
      await tx.comment.deleteMany({
        where: {
          targetType: "user_memory",
          targetId: { in: memoryIds.map((m) => m.id) },
        },
      });
    }
    await tx.user.delete({ where: { id: userId } });
  });
}

async function scenario1_transfer() {
  console.log("\n=== scenario 1: owner withdraws, transfer to other member ===");
  const alice = await prisma.user.create({
    data: { email: "withdrawal-test-alice@test", name: "alice" },
  });
  const bob = await prisma.user.create({
    data: { email: "withdrawal-test-bob@test", name: "bob" },
  });
  const room = await prisma.sharedRoom.create({
    data: {
      name: "withdrawal-test-room-1",
      ownerId: alice.id,
      members: {
        create: [
          { userId: alice.id, role: "owner", consentAt: new Date() },
          { userId: bob.id, role: "member", consentAt: new Date() },
        ],
      },
    },
  });
  // Bob authors a SharedMemory; Alice authors another.
  const aliceMem = await prisma.sharedMemory.create({
    data: {
      id: "wtest_alice_mem_1",
      roomId: room.id,
      year: 2000,
      title: "alice memory",
      createdById: alice.id,
    },
  });
  const bobMem = await prisma.sharedMemory.create({
    data: {
      id: "wtest_bob_mem_1",
      roomId: room.id,
      year: 2001,
      title: "bob memory",
      createdById: bob.id,
    },
  });
  // Alice has a paid order + a pending order.
  await prisma.tokenOrder.create({
    data: {
      id: "wtest_paid_alice",
      userId: alice.id,
      packageId: "p100",
      krw: 1000,
      tokens: 100,
      status: "paid",
      paymentKey: "wtest_pk_alice",
      approvedAt: new Date(),
    },
  });
  await prisma.tokenOrder.create({
    data: {
      id: "wtest_pending_alice",
      userId: alice.id,
      packageId: "p100",
      krw: 1000,
      tokens: 100,
      status: "pending",
    },
  });

  await runDeletion(alice.id);

  const aliceAfter = await prisma.user.findUnique({ where: { id: alice.id } });
  const roomAfter = await prisma.sharedRoom.findUnique({
    where: { id: room.id },
  });
  const bobMember = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId: room.id, userId: bob.id } },
  });
  const aliceMemAfter = await prisma.sharedMemory.findUnique({
    where: { id: aliceMem.id },
  });
  const bobMemAfter = await prisma.sharedMemory.findUnique({
    where: { id: bobMem.id },
  });
  const paidAfter = await prisma.tokenOrder.findUnique({
    where: { id: "wtest_paid_alice" },
  });
  const pendingAfter = await prisma.tokenOrder.findUnique({
    where: { id: "wtest_pending_alice" },
  });

  console.log("user alice deleted:", aliceAfter === null);
  console.log("room still alive:", roomAfter !== null);
  console.log("room owner = bob:", roomAfter?.ownerId === bob.id);
  console.log("bob role upgraded:", bobMember?.role === "owner");
  console.log(
    "alice memory anonymized:",
    aliceMemAfter !== null && aliceMemAfter.createdById === null,
  );
  console.log("bob memory untouched:", bobMemAfter?.createdById === bob.id);
  console.log("paid order anonymized:", paidAfter !== null && paidAfter.userId === null);
  console.log("pending order deleted:", pendingAfter === null);
}

async function scenario2_cascadeRoom() {
  console.log(
    "\n=== scenario 2: owner withdraws, no other consented member ===",
  );
  const carol = await prisma.user.create({
    data: { email: "withdrawal-test-carol@test", name: "carol" },
  });
  const dan = await prisma.user.create({
    data: { email: "withdrawal-test-dan@test", name: "dan" },
  });
  const room = await prisma.sharedRoom.create({
    data: {
      name: "withdrawal-test-room-2",
      ownerId: carol.id,
      members: {
        create: [
          { userId: carol.id, role: "owner", consentAt: new Date() },
          // dan is invited but not consented yet
          { userId: dan.id, role: "member", consentAt: null },
        ],
      },
    },
  });
  const mem = await prisma.sharedMemory.create({
    data: {
      id: "wtest_carol_mem_1",
      roomId: room.id,
      year: 1999,
      title: "carol memory",
      createdById: carol.id,
    },
  });

  await runDeletion(carol.id);

  const roomAfter = await prisma.sharedRoom.findUnique({
    where: { id: room.id },
  });
  const memAfter = await prisma.sharedMemory.findUnique({
    where: { id: mem.id },
  });
  console.log("room deleted (no consented successor):", roomAfter === null);
  console.log("shared memory cascaded:", memAfter === null);
}

async function scenario3_userMemoryComments() {
  console.log(
    "\n=== scenario 3: orphan comments on user_memory cleaned up ===",
  );
  const eve = await prisma.user.create({
    data: { email: "withdrawal-test-eve@test", name: "eve" },
  });
  const frank = await prisma.user.create({
    data: { email: "withdrawal-test-frank@test", name: "frank" },
  });
  const room = await prisma.sharedRoom.create({
    data: {
      name: "withdrawal-test-room-3",
      ownerId: frank.id,
      members: {
        create: [
          { userId: frank.id, role: "owner", consentAt: new Date() },
          { userId: eve.id, role: "member", consentAt: new Date() },
        ],
      },
    },
  });
  const eveMem = await prisma.userMemory.create({
    data: {
      userId: eve.id,
      year: 2010,
      title: "eve private memory",
      visibility: "family",
    },
  });
  const frankComment = await prisma.comment.create({
    data: {
      roomId: room.id,
      targetType: "user_memory",
      targetId: eveMem.id,
      authorId: frank.id,
      content: "frank's comment on eve's memory",
    },
  });

  await runDeletion(eve.id);

  const eveAfter = await prisma.user.findUnique({ where: { id: eve.id } });
  const eveMemAfter = await prisma.userMemory.findUnique({
    where: { id: eveMem.id },
  });
  const commentAfter = await prisma.comment.findUnique({
    where: { id: frankComment.id },
  });
  console.log("eve deleted:", eveAfter === null);
  console.log("eve UserMemory cascaded:", eveMemAfter === null);
  console.log(
    "orphan comment on eve's memory cleaned:",
    commentAfter === null,
  );
}

async function main() {
  await cleanup();
  await scenario1_transfer();
  await scenario2_cascadeRoom();
  await scenario3_userMemoryComments();
  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
