"use server";

import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { prisma } from "@/lib/db";

// PIPA 동의 철회권 — 회원 탈퇴.
//
// 정책 (CLAUDE.md 결정사항):
// - 소유 룸: 최고참(가장 먼저 가입한 consent 완료) 멤버에게 ownerId 자동 이전.
//   넘길 멤버가 없으면 룸 cascade 삭제 (멤버/초대/공동추억/댓글 함께).
// - 공동 SharedMemory: createdById = NULL로 익명화 (스키마 SetNull). UI에서
//   "탈퇴한 사용자" 표기.
// - 결제 기록 (TokenOrder paid): userId = NULL 익명화 후 보존 (전자상거래법 5년).
//   pending/failed/canceled 주문은 사전 deleteMany.
// - 개인 추억 (UserMemory): cascade 전부 삭제.
// - 가족 룸 내 그 추억에 달린 댓글: 미리 deleteMany해서 고아 댓글 차단.
// - Account/Session/Wallet/Transaction/AIConversation/TriggerResponse:
//   기존 cascade로 자동 정리.
export async function deleteAccountAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  const userId = session.user.id;

  const confirmation = formData.get("confirmation");
  if (confirmation !== "탈퇴") {
    throw new Error("confirmation mismatch");
  }

  await prisma.$transaction(async (tx) => {
    // 1) 소유 룸 처리 — 최고참 consent 완료 멤버에게 양도, 없으면 삭제.
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
        // cascades: members, invites, comments, sharedMemories
        await tx.sharedRoom.delete({ where: { id: room.id } });
      }
    }

    // 2) 미결제/실패 주문 삭제. paid 주문은 SetNull로 익명화되며 자동 보존.
    await tx.tokenOrder.deleteMany({
      where: { userId, status: { not: "paid" } },
    });

    // 3) 사용자의 UserMemory를 향한 가족 룸 댓글 사전 삭제 (UserMemory 삭제 시
    //    targetId가 폴리모픽이라 자동 cascade 안 됨).
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

    // 4) 사용자 삭제 — 나머지는 FK 정책대로 cascade/SetNull.
    await tx.user.delete({ where: { id: userId } });
  });

  await signOut({ redirect: false });
  redirect("/?withdrawn=1");
}
