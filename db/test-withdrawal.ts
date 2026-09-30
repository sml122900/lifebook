// 회원 탈퇴 흐름이 실제 DB 행에서 올바르게 동작하는지 검증.
// 실행: npx tsx db/test-withdrawal.ts
//
// 커버 시나리오:
// 1) 방장 탈퇴 + 다른 동의 멤버 있음 → 소유권 이전.
// 2) 방장 탈퇴 + 다른 동의 멤버 없음 → 룸 cascade 삭제.
// 3) 탈퇴자가 쓴 SharedMemory 는 익명화 (createdById=null).
// 4) paid TokenOrder 익명화 (userId=null), pending/failed 는 삭제.
// 5) UserMemory cascade. 그에 달린 고아 룸 댓글은 사전 정리.
// (scenario 4) v3 모델 cascade. (scenario 5) 탈퇴 시 Storage 파일 삭제 — 실제 Storage 에
// 작은 테스트 파일을 올렸다가 지운다(이웃 폴더는 테스트 끝에 직접 정리).

import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

import { prisma } from "../lib/db";
import { deleteAccountTx, withdrawAccount } from "../lib/account-deletion";
import { createEpisodeBridge } from "../lib/episode";
import { listUserStorageObjects } from "../lib/storage-purge";

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

// 실제 앱이 쓰는 트랜잭션 그 자체(lib/account-deletion.ts) — 재현본이 아니다.
async function runDeletion(userId: string) {
  await deleteAccountTx(userId);
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

// 2026-09-01 lifeevent_cascade_fix 검증 — /chat-v3(v3 온보딩 채팅)이 만드는
// LifeEvent·Episode·OnboardingProfile·OnboardingChatMessage 가 탈퇴 시 고아로
// 안 남는지. Episode 생성은 실제 lib/episode.ts 의 createEpisodeBridge() 를
// 그대로 호출한다(재현 아님) — OnboardingProfile/LifeEvent/ChatMessage 는
// completeOnboarding/saveChatMessage 의 "use server" 액션이 auth() 세션을
// 요구해 스크립트에서 직접 호출 불가하므로, 그 액션들이 만드는 것과 동일한
// 모양의 행을 prisma 로 직접 생성한다(둘 다 단순 create 이라 로직 분기 없음 —
// 재현 위험은 deleteAccountTx 와 달리 낮음).
async function scenario4_v3Models() {
  console.log(
    "\n=== scenario 4: LifeEvent/Episode/OnboardingProfile/OnboardingChatMessage cascade (2026-09-01 fix) ===",
  );
  const grace = await prisma.user.create({
    data: {
      email: "withdrawal-test-v3-grace@test",
      name: "grace",
      birthYear: 1958,
    },
  });

  await prisma.onboardingProfile.create({
    data: {
      userId: grace.id,
      birthYear: 1958,
      birthMonth: 3,
      gender: null,
      region: "서울",
      skeletonGeneratedAt: new Date(),
    },
  });

  const birthEvent = await prisma.lifeEvent.create({
    data: {
      userId: grace.id,
      type: "BIRTH",
      label: "출생",
      year: 1958,
      isOptional: false,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder: 0,
    },
  });
  const elemEvent = await prisma.lifeEvent.create({
    data: {
      userId: grace.id,
      type: "ELEM_SCHOOL",
      label: "국민학교 입학",
      year: 1965,
      isOptional: false,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder: 1,
    },
  });
  // Unconfirmed event with no episode — orphan-check baseline.
  await prisma.lifeEvent.create({
    data: {
      userId: grace.id,
      type: "MIDDLE_SCHOOL",
      label: "중학교 입학",
      year: 1971,
      isOptional: false,
      status: "UNCONFIRMED",
      sequenceOrder: 2,
    },
  });

  await prisma.onboardingChatMessage.create({
    data: {
      userId: grace.id,
      sessionId: "wtest-session-1",
      role: "assistant",
      content: "언제 태어나셨어요?",
    },
  });
  await prisma.onboardingChatMessage.create({
    data: {
      userId: grace.id,
      sessionId: "wtest-session-1",
      role: "user",
      content: "1958년이요",
    },
  });

  // 실제 프로덕션 함수 호출 — Episode + UserMemory 브릿지 생성.
  const bridge1 = await createEpisodeBridge(
    grace.id,
    birthEvent.id,
    "출생",
    1958,
    "부산에서 태어났어요.",
    "[동반자] 언제 태어나셨어요?\n[본인] 부산에서 태어났어요.",
  );
  const bridge2 = await createEpisodeBridge(
    grace.id,
    elemEvent.id,
    "국민학교 입학",
    1965,
    "학교까지 한 시간을 걸어다녔어요.",
    "[동반자] 학교는 어떠셨어요?\n[본인] 학교까지 한 시간을 걸어다녔어요.",
  );
  if (!bridge1 || !bridge2) throw new Error("createEpisodeBridge failed in setup");

  const beforeCounts = {
    lifeEvents: await prisma.lifeEvent.count({ where: { userId: grace.id } }),
    episodes: await prisma.episode.count({
      where: { lifeEventId: { in: [birthEvent.id, elemEvent.id] } },
    }),
    profile: await prisma.onboardingProfile.count({ where: { userId: grace.id } }),
    chatMessages: await prisma.onboardingChatMessage.count({ where: { userId: grace.id } }),
    memories: await prisma.userMemory.count({
      where: { id: { in: [bridge1.memoryId, bridge2.memoryId] } },
    }),
  };
  console.log("before deletion:", beforeCounts);

  // 실제 탈퇴 액션이 쓰는 함수 그 자체(lib/account-deletion.ts).
  await deleteAccountTx(grace.id);

  const userAfter = await prisma.user.findUnique({ where: { id: grace.id } });
  const lifeEventsAfter = await prisma.lifeEvent.count({ where: { userId: grace.id } });
  const episodesAfter = await prisma.episode.count({
    where: { lifeEventId: { in: [birthEvent.id, elemEvent.id] } },
  });
  const profileAfter = await prisma.onboardingProfile.count({ where: { userId: grace.id } });
  const chatMessagesAfter = await prisma.onboardingChatMessage.count({
    where: { userId: grace.id },
  });
  const memoriesAfter = await prisma.userMemory.count({
    where: { id: { in: [bridge1.memoryId, bridge2.memoryId] } },
  });

  console.log("user deleted:", userAfter === null);
  console.log("LifeEvent orphans:", lifeEventsAfter, "(expect 0)");
  console.log("Episode orphans:", episodesAfter, "(expect 0)");
  console.log("OnboardingProfile orphans:", profileAfter, "(expect 0)");
  console.log("OnboardingChatMessage orphans:", chatMessagesAfter, "(expect 0)");
  console.log("UserMemory (episode bridge) orphans:", memoriesAfter, "(expect 0)");

  const allZero =
    lifeEventsAfter === 0 &&
    episodesAfter === 0 &&
    profileAfter === 0 &&
    chatMessagesAfter === 0 &&
    memoriesAfter === 0;
  if (userAfter !== null || !allZero) {
    throw new Error("scenario4 FAILED — orphan rows or user not deleted");
  }
}

// 2026-10-01 — 탈퇴 시 Storage 파일 삭제(A안). 실제 탈퇴 흐름 withdrawAccount() 그대로.
// 본인 폴더 3곳(photos/{id}/, photos/poster-bg/{id}/, recordings/{id}/)은 0개가 되고,
// 이름이 비슷한 이웃 폴더(더 긴 id·더 짧은 id·"_"를 다른 글자로 바꾼 id)는 그대로여야 한다.
async function scenario5_storagePurge() {
  console.log("\n=== scenario 5: withdrawal removes user's Storage files only (exact prefix) ===");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("scenario5 needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const supa = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const ts = Date.now();
  const id = `wtest_store_${ts}`;
  // 이웃: 더 긴 id(prefix 부분 일치), 더 짧은 id, "_"→"x"(LIKE 와일드카드 오인).
  const neighbors = [`${id}x`, id.slice(0, -1), id.replace(/_/g, "x")];
  const filesFor = (owner: string) => [
    { bucket: "photos", path: `${owner}/t.png`, type: "image/png" },
    { bucket: "photos", path: `poster-bg/${owner}/t.png`, type: "image/png" },
    { bucket: "recordings", path: `${owner}/t.webm`, type: "audio/webm" },
  ];
  const mine = filesFor(id);
  const theirs = neighbors.flatMap(filesFor);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);

  const existing = async (files: { bucket: string; path: string }[]) => {
    let n = 0;
    for (const f of files) {
      const rows = await prisma.$queryRaw<{ c: number }[]>`
        SELECT COUNT(*)::int AS c FROM storage.objects WHERE bucket_id = ${f.bucket} AND name = ${f.path}`;
      n += rows[0]?.c ?? 0;
    }
    return n;
  };

  await prisma.user.create({ data: { id, email: `withdrawal-test-storage-${ts}@test`, name: "storage" } });
  try {
    for (const f of [...mine, ...theirs]) {
      const { error } = await supa.storage
        .from(f.bucket)
        .upload(f.path, f.type === "image/png" ? png : webm, { contentType: f.type, upsert: true });
      if (error) throw new Error(`scenario5 upload failed (${f.bucket}): ${error.message}`);
    }
    const listedBefore = await listUserStorageObjects(id);
    console.log("user files before:", listedBefore.length, "(expect 3)");
    console.log("neighbor files before:", await existing(theirs), `(expect ${theirs.length})`);

    const result = await withdrawAccount(id);

    const userAfter = await prisma.user.findUnique({ where: { id } });
    const mineAfter = await existing(mine);
    const theirsAfter = await existing(theirs);
    console.log("user deleted:", userAfter === null);
    console.log("storageRemoved:", result.storageRemoved, "(expect 3)");
    console.log("user files after (3 folders):", mineAfter, "(expect 0)");
    console.log("neighbor files after:", theirsAfter, `(expect ${theirs.length}, untouched)`);

    if (
      listedBefore.length !== 3 ||
      userAfter !== null ||
      result.storageRemoved !== 3 ||
      mineAfter !== 0 ||
      theirsAfter !== theirs.length
    ) {
      throw new Error("scenario5 FAILED — Storage purge wrong scope or incomplete");
    }
  } finally {
    // 이웃 폴더 + (실패 시) 남은 본인 파일 정리.
    for (const bucket of ["photos", "recordings"]) {
      const paths = [...mine, ...theirs].filter((f) => f.bucket === bucket).map((f) => f.path);
      await supa.storage.from(bucket).remove(paths);
    }
    await prisma.user.deleteMany({ where: { id } });
  }
}

async function main() {
  await cleanup();
  await scenario1_transfer();
  await scenario2_cascadeRoom();
  await scenario3_userMemoryComments();
  await scenario4_v3Models();
  await scenario5_storagePurge();
  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
