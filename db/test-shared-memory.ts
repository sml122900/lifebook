// Phase 9.6 점검.
//
// 사용자 셋:
//   - alice 가 룸 생성 (owner)
//   - bob 이 초대로 합류
//   - eve 는 룸 바깥
// 시나리오:
//   - 멤버 누구나 생성 가능
//   - 멤버 누구나 수정 가능 (공동 소유), lastEditedById 갱신
//   - 작성자도 방장도 아니면 삭제 불가
//   - 원작성자는 삭제 가능; 방장도 (별개로) 삭제 가능
//   - eve 는 모든 작업에서 차단
//
// 실행: npx tsx db/test-shared-memory.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  createInvite,
  createRoom,
  joinViaInvite,
} from "../lib/rooms";
import {
  createSharedMemory,
  deleteSharedMemory,
  listSharedMemories,
  updateSharedMemory,
} from "../lib/shared-memories";

async function expectThrow(label: string, fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    console.log(`  ${label}: NOT THROWN (leak)`);
    return false;
  } catch (err) {
    console.log(`  ${label}: blocked (${err instanceof Error ? err.message : err})`);
    return true;
  }
}

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
    const room = await createRoom(alice.id, "우리 가족");
    const invite = await createInvite(alice.id, room.id);
    await joinViaInvite(bob.id, invite.token);

    console.log("\n— alice creates a shared memory");
    const m1 = await createSharedMemory(alice.id, room.id, {
      year: 1998,
      month: 9,
      title: "신혼여행",
      content: "제주도, 비가 종일 왔어요.",
    });

    console.log("\n— bob edits it (co-ownership)");
    await updateSharedMemory(bob.id, m1.id, {
      year: 1998,
      month: 9,
      title: "신혼여행 — 제주도",
      content: "제주도, 비가 종일 왔어요. 우산을 두 번 잃어버렸어요.",
    });

    const afterEdit = await prisma.sharedMemory.findUnique({
      where: { id: m1.id },
      select: { title: true, lastEditedById: true },
    });
    console.log(
      `  title='${afterEdit?.title}'  lastEditedBy=${afterEdit?.lastEditedById === bob.id ? "bob" : "?"}`,
    );

    console.log("\n— bob tries to delete alice's memory (he's not author, not owner)");
    const bobDeleteBlocked = await expectThrow("bob.delete", () =>
      deleteSharedMemory(bob.id, m1.id),
    );

    console.log("\n— eve tries everything");
    const eveCreateBlocked = await expectThrow("eve.create", () =>
      createSharedMemory(eve.id, room.id, { year: 1990, title: "끼어들기" }),
    );
    const eveEditBlocked = await expectThrow("eve.update", () =>
      updateSharedMemory(eve.id, m1.id, { year: 1998, title: "변조 시도" }),
    );
    const eveDeleteBlocked = await expectThrow("eve.delete", () =>
      deleteSharedMemory(eve.id, m1.id),
    );
    const eveList = await listSharedMemories(room.id, eve.id);
    console.log(`  eve.list: ${eveList === null ? "null (blocked)" : "DATA LEAK"}`);

    console.log("\n— alice (original author) deletes her own memory");
    await deleteSharedMemory(alice.id, m1.id);
    const after = await prisma.sharedMemory.findUnique({ where: { id: m1.id } });
    console.log(`  row after: ${after === null ? "gone (ok)" : "still here"}`);

    console.log("\n— bob creates a memory, then alice (room owner) deletes it");
    const m2 = await createSharedMemory(bob.id, room.id, {
      year: 2001,
      title: "운동회",
    });
    await deleteSharedMemory(alice.id, m2.id); // owner-as-deleter
    const after2 = await prisma.sharedMemory.findUnique({ where: { id: m2.id } });
    console.log(`  row after: ${after2 === null ? "gone (ok)" : "still here"}`);

    const failures: string[] = [];
    if (!bobDeleteBlocked) failures.push("bob (non-author, non-owner) deleted");
    if (!eveCreateBlocked) failures.push("eve created");
    if (!eveEditBlocked) failures.push("eve edited");
    if (!eveDeleteBlocked) failures.push("eve deleted");
    if (eveList !== null) failures.push("eve read list");
    if (after !== null) failures.push("alice's own-delete failed");
    if (after2 !== null) failures.push("owner-delete on bob's memory failed");
    if (afterEdit?.lastEditedById !== bob.id) failures.push("lastEditedById not set on edit");

    if (failures.length) {
      console.error("\nFAILED:");
      for (const f of failures) console.error("  - " + f);
      process.exitCode = 1;
    } else {
      console.log("\nOK: co-edit allowed, delete restricted, non-member blocked.");
    }
  } finally {
    await prisma.sharedMemory.deleteMany({
      where: { createdById: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
