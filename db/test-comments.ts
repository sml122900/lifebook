// Phase 9.4 점검.
//
// 사용자 셋, 한 실행에 두 시나리오:
//   1. Alice + Bob 이 한 룸에 합류. 서로의 추억에 댓글을 달고, 둘 다 두
//      댓글을 읽을 수 있으며, Alice 는 자기 댓글만 삭제 가능(Bob 것은 X).
//   2. Eve 는 어느 룸에도 없다. 룸 데이터에 대한 모든 작업이 거부돼야 한다.
//
// 실행: npx tsx db/test-comments.ts

import "dotenv/config";

import {
  createComment,
  deleteComment,
  listRoomCommentsByTarget,
} from "../lib/comments";
import { prisma } from "../lib/db";
import {
  createInvite,
  createRoom,
  getMembership,
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
  const userIds = [alice.id, bob.id, eve.id];

  try {
    // Track A walkthrough setup
    const room = await createRoom(alice.id, "우리 가족");
    const invite = await createInvite(alice.id, room.id);
    await joinViaInvite(bob.id, invite.token);

    const am = await prisma.userMemory.create({
      data: { userId: alice.id, year: 1995, title: "엄마 결혼식", createdVia: "manual" },
      select: { id: true },
    });
    const bm = await prisma.userMemory.create({
      data: { userId: bob.id, year: 1995, title: "내 운동회", createdVia: "manual" },
      select: { id: true },
    });

    console.log("\n— alice comments on bob's memory");
    await createComment(alice.id, room.id, "user_memory", bm.id, "잘했네!");
    console.log("— bob comments on alice's memory");
    await createComment(bob.id, room.id, "user_memory", am.id, "축하해요");

    const aliceView = await listRoomCommentsByTarget(
      room.id,
      alice.id,
      "user_memory",
      [am.id, bm.id],
    );
    console.log(`\nalice sees: am=${aliceView?.get(am.id)?.length} comments, bm=${aliceView?.get(bm.id)?.length}`);

    const bobView = await listRoomCommentsByTarget(
      room.id,
      bob.id,
      "user_memory",
      [am.id, bm.id],
    );
    console.log(`bob sees:   am=${bobView?.get(am.id)?.length}, bm=${bobView?.get(bm.id)?.length}`);

    console.log("\n— eve tries to read room comments");
    const eveCommentView = await listRoomCommentsByTarget(
      room.id,
      eve.id,
      "user_memory",
      [am.id, bm.id],
    );
    console.log(`eve sees:   ${eveCommentView === null ? "null (blocked)" : "DATA LEAK"}`);

    console.log("\n— eve tries to comment");
    let eveCommentBlocked = false;
    try {
      await createComment(eve.id, room.id, "user_memory", am.id, "끼어들기");
    } catch (err) {
      eveCommentBlocked = true;
      console.log(`  blocked: ${err instanceof Error ? err.message : err}`);
    }

    console.log("\n— eve tries to read room memories");
    const eveMemView = await listRoomMemories(room.id, eve.id);
    console.log(`  ${eveMemView === null ? "null (blocked)" : "DATA LEAK"}`);

    console.log("\n— eve tries to verify membership directly");
    const eveMembership = await getMembership(eve.id, room.id);
    console.log(`  ${eveMembership === null ? "null (not a member)" : "DATA LEAK"}`);

    console.log("\n— alice tries to delete bob's comment");
    const bobComment = await prisma.comment.findFirst({
      where: { authorId: bob.id, roomId: room.id },
      select: { id: true },
    });
    let aliceDeletedBob = false;
    try {
      if (!bobComment) throw new Error("no bob comment");
      await deleteComment(bobComment.id, alice.id);
      aliceDeletedBob = true;
    } catch (err) {
      console.log(`  blocked: ${err instanceof Error ? err.message : err}`);
    }

    console.log("\n— alice deletes her own comment");
    const aliceComment = await prisma.comment.findFirst({
      where: { authorId: alice.id, roomId: room.id },
      select: { id: true },
    });
    let aliceDeletedSelf = false;
    if (aliceComment) {
      await deleteComment(aliceComment.id, alice.id);
      aliceDeletedSelf = true;
      console.log("  ok");
    }

    const failures: string[] = [];
    if (aliceView?.get(am.id)?.length !== 1) failures.push("alice should see 1 comment on her own memory");
    if (aliceView?.get(bm.id)?.length !== 1) failures.push("alice should see 1 comment on bob's memory");
    if (bobView?.get(am.id)?.length !== 1) failures.push("bob should see alice's memory comment");
    if (bobView?.get(bm.id)?.length !== 1) failures.push("bob should see his own memory comment");
    if (eveCommentView !== null) failures.push("eve read comments — leak");
    if (eveMemView !== null) failures.push("eve read memories — leak");
    if (eveMembership !== null) failures.push("eve was reported a member");
    if (!eveCommentBlocked) failures.push("eve was allowed to comment");
    if (aliceDeletedBob) failures.push("alice deleted bob's comment");
    if (!aliceDeletedSelf) failures.push("alice could not delete her own comment");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: members can comment on each other, only-own delete, non-member blocked everywhere.");
    }
  } finally {
    await prisma.comment.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.userMemory.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
