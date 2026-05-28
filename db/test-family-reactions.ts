// 동기부여 ② 검증 — 감정 스탬프 + 가족 소식(읽음 추적) + 권한.
//
// 시나리오 (parent=어르신, child=자녀, stranger=비멤버):
//   준비) parent 가 방장인 룸에 child 동의 멤버. stranger 는 미가입.
//        parent 가 타임머신 회고 1건(자기 기록).
//   (e) 권한 — stranger 가 룸에 반응 시도 → 거부. child 가 룸 밖 추억에
//        반응 시도 → 거부. 비멤버 listReactionsByTarget → null.
//   (a) 토글 — child 가 stamp 켜기 → 1행, 끄기 → 0행.
//   (b) 중복·동시 — 켜기 2번/동시 → 1행. 끄기 2번 → 0행 (에러 없음).
//   (c)(d) 가족 소식 — baseline 후 child 반응+댓글+새 기록 → parent 가 봄,
//        markSeen 하면 배지에서 빠짐. parent 자기 반응은 카운트 X.

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  getFamilyNews,
  getFamilyNewsCount,
  markReactionsSeen,
  markRecordsSeen,
} from "../lib/family-news";
import { createComment } from "../lib/comments";
import { listReactionsByTarget, setReaction } from "../lib/reactions";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const stamp = "touched";
  const ts = Date.now();
  const parent = await prisma.user.create({
    data: { email: `fr-parent-${ts}@test`, name: "어머니" },
  });
  const child = await prisma.user.create({
    data: { email: `fr-child-${ts}@test`, name: "아들" },
  });
  const stranger = await prisma.user.create({
    data: { email: `fr-stranger-${ts}@test`, name: "남" },
  });

  const results: [string, boolean][] = [];
  const check = (label: string, ok: boolean) => results.push([label, ok]);
  const expectThrow = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      check(label, false);
    } catch {
      check(label, true);
    }
  };

  try {
    // 룸 + 멤버십 (parent owner, child member). stranger 미가입.
    const room = await prisma.sharedRoom.create({
      data: {
        name: "가족",
        ownerId: parent.id,
        members: {
          create: [
            { userId: parent.id, role: "owner", consentAt: new Date() },
            { userId: child.id, role: "member", consentAt: new Date() },
          ],
        },
      },
    });

    // parent 의 타임머신 회고 (자기 기록)
    const parentMemory = await prisma.userMemory.create({
      data: {
        userId: parent.id,
        year: 2026,
        month: 5,
        title: "2026년 5월 회고",
        content: "올해 봄은 따뜻했다",
        createdVia: "timemachine_month",
      },
    });
    // stranger 의 추억 (룸 밖)
    const strangerMemory = await prisma.userMemory.create({
      data: {
        userId: stranger.id,
        year: 2026,
        month: 5,
        title: "남의 기록",
        createdVia: "timemachine_month",
      },
    });

    // ── (e) 권한 ──
    await expectThrow("비멤버(stranger)는 룸 반응 거부", () =>
      setReaction(stranger.id, room.id, "user_memory", parentMemory.id, stamp, true),
    );
    await expectThrow("멤버라도 룸 밖 추억엔 반응 거부", () =>
      setReaction(child.id, room.id, "user_memory", strangerMemory.id, stamp, true),
    );
    const strangerView = await listReactionsByTarget(
      room.id,
      stranger.id,
      "user_memory",
      [parentMemory.id],
    );
    check("비멤버 listReactions → null", strangerView === null);

    // ── (a) 토글 ──
    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, true);
    let rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id, stamp },
    });
    check("스탬프 켜기 → 1행", rows === 1);

    const view = await listReactionsByTarget(room.id, child.id, "user_memory", [
      parentMemory.id,
    ]);
    const list = view?.get(parentMemory.id) ?? [];
    check(
      "listReactions 에 child 스탬프 노출",
      list.length === 1 && list[0].authorId === child.id && list[0].stamp === stamp,
    );

    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, false);
    rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id, stamp },
    });
    check("스탬프 끄기 → 0행", rows === 0);

    // ── (b) 중복·동시 ──
    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, true);
    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, true); // 중복
    rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id, stamp },
    });
    check("켜기 2번 → 여전히 1행 (중복 무시)", rows === 1);

    // 동시 켜기 (이미 1행) — idempotent
    await Promise.all([
      setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, true),
      setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, true),
    ]);
    rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id, stamp },
    });
    check("동시 켜기 → 1행 유지", rows === 1);

    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, false);
    await setReaction(child.id, room.id, "user_memory", parentMemory.id, stamp, false); // 중복 끄기
    rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id, stamp },
    });
    check("끄기 2번 → 0행 (에러 없음)", rows === 0);

    // 다른 종류 스탬프 동시 — 둘 다 남음
    await Promise.all([
      setReaction(child.id, room.id, "user_memory", parentMemory.id, "touched", true),
      setReaction(child.id, room.id, "user_memory", parentMemory.id, "proud", true),
    ]);
    rows = await prisma.memoryReaction.count({
      where: { targetId: parentMemory.id, authorId: child.id },
    });
    check("다른 종류 2개 동시 → 2행", rows === 2);
    // 정리 — 이후 가족소식 테스트의 baseline 을 깨끗하게
    await prisma.memoryReaction.deleteMany({
      where: { targetId: parentMemory.id, authorId: child.id },
    });

    // ── (c)(d) 가족 소식 ──
    // baseline: parent 가 처음 소식을 봄 → FamilyFeedSeen now() 기준선 생성
    const baseline = await getFamilyNews(parent.id);
    check(
      "baseline 가족소식 0건",
      baseline.newReactions.count === 0 && baseline.newRecords.count === 0,
    );

    await sleep(300); // baseline 시각보다 확실히 뒤에 활동 생성

    // child 가 반응(스탬프) + 댓글 + 새 기록
    await setReaction(child.id, room.id, "user_memory", parentMemory.id, "touched", true);
    await createComment(child.id, room.id, "user_memory", parentMemory.id, "엄마 최고예요");
    // parent 가 자기 기록에 자기 반응 (카운트 제외 대상)
    await setReaction(parent.id, room.id, "user_memory", parentMemory.id, "proud", true);
    // child 의 새 타임머신 기록
    await prisma.userMemory.create({
      data: {
        userId: child.id,
        year: 2026,
        month: 4,
        title: "2026년 4월 회고",
        content: "나도 한 줄",
        createdVia: "timemachine_month",
      },
    });

    const news = await getFamilyNews(parent.id);
    check(
      "parent 새 반응 2건 (child 스탬프+댓글, parent 자기반응 제외)",
      news.newReactions.count === 2,
    );
    const stampItem = news.newReactions.items.find((i) => i.kind === "stamp");
    check(
      "반응 아이템 roomId/memoryId/연월 정확",
      !!stampItem &&
        stampItem.roomId === room.id &&
        stampItem.memoryId === parentMemory.id &&
        stampItem.year === 2026 &&
        stampItem.month === 5,
    );
    check(
      "parent 새 기록(child 회고) 1건",
      news.newRecords.count === 1 &&
        news.newRecords.items[0].roomId === room.id &&
        news.newRecords.items[0].year === 2026 &&
        news.newRecords.items[0].month === 4,
    );

    const cnt = await getFamilyNewsCount(parent.id);
    check(
      "count 헬퍼 = 반응2 기록1 합3",
      cnt.reactions === 2 && cnt.records === 1 && cnt.total === 3,
    );

    // child 입장 — 기준선 먼저(parentMemory 는 이미 과거라 0), 그 뒤
    // parent 가 새 기록을 남기면 그제서야 "새 이야기"로 보임 (루프 핵심).
    const childBase = await getFamilyNews(child.id);
    check(
      "child baseline 0 (과거 기록은 소급 안 됨)",
      childBase.newRecords.count === 0,
    );
    await sleep(300);
    await prisma.userMemory.create({
      data: {
        userId: parent.id,
        year: 2026,
        month: 3,
        title: "2026년 3월 회고",
        content: "새로 쓴 이야기",
        createdVia: "timemachine_month",
      },
    });
    const childNews = await getFamilyNews(child.id);
    check(
      "child 새 기록(parent 새 회고) 보임",
      childNews.newRecords.count === 1 &&
        childNews.newRecords.items[0].month === 3,
    );

    // (d) 읽으면 빠짐
    await sleep(300);
    await markReactionsSeen(parent.id);
    await markRecordsSeen(parent.id);
    const afterSeen = await getFamilyNews(parent.id);
    check(
      "읽음 처리 후 parent 가족소식 0건",
      afterSeen.newReactions.count === 0 && afterSeen.newRecords.count === 0,
    );
    const cntAfter = await getFamilyNewsCount(parent.id);
    check("읽음 후 count.total 0", cntAfter.total === 0);

    // 룸 없는 사용자(stranger) → 항상 0, 조용히
    const strangerNews = await getFamilyNewsCount(stranger.id);
    check("룸 없는 사용자 소식 0", strangerNews.total === 0);

    // ── 출력 ──
    console.log("=== 동기부여 ② 가족 반응 검증 ===");
    let allOk = true;
    for (const [label, ok] of results) {
      if (!ok) allOk = false;
      console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
    }
    console.log(allOk ? "\n전체 통과" : "\n실패 있음");
    if (!allOk) process.exitCode = 1;
  } finally {
    await prisma.user.delete({ where: { id: parent.id } });
    await prisma.user.delete({ where: { id: child.id } });
    await prisma.user.delete({ where: { id: stranger.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
