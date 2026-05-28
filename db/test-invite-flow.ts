// Phase 9.2 점검.
//
// 일회용 사용자 둘을 초대 + 동의 흐름에 통과시킨다:
//   1. Alice 가 룸과 초대 링크를 만든다.
//   2. 합류 전 Bob 은 멤버가 아니다 (getMembership 이 null).
//   3. Bob 이 초대로 합류 (함수는 호출자를 신뢰; UI 에선 Bob 이 동의
//      체크박스를 누르고 폼을 제출한 뒤에만 일어난다).
//   4. 이제 Bob 은 role=member 인 동의 멤버.
//   5. 토큰 자체는 URL-safe + 256비트 엔트로피.
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
