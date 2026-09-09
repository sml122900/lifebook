// v3 P19-2 — CUSTOM(자유 승격) LifeEvent 삭제. 골격 이벤트(BIRTH~MARRIAGE)는
// 대상 아님(삭제 불가 — 판단은 유예, 이번 범위는 CUSTOM만). 순수 모듈(auth
// 없음) — app/actions/life-event.ts 가 감싸서 클라에 노출한다.
import { prisma } from "./db";

export type DeleteCustomLifeEventResult = { ok: true } | { ok: false; error: string };

export async function deleteCustomLifeEvent(
  userId: string,
  lifeEventId: string,
): Promise<DeleteCustomLifeEventResult> {
  const event = await prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, type: "CUSTOM" },
    select: {
      id: true,
      episodes: { select: { memoryId: true } },
    },
  });
  if (!event) return { ok: false, error: "이야기를 찾을 수 없어요." };

  const memoryIds = event.episodes.map((e) => e.memoryId);

  await prisma.$transaction(async (tx) => {
    if (memoryIds.length > 0) {
      // lib/episode.ts deleteEpisode 와 같은 이유 — Comment/MemoryReaction
      // 은 폴리모픽이라 FK cascade가 안 된다.
      await tx.comment.deleteMany({
        where: { targetType: "user_memory", targetId: { in: memoryIds } },
      });
      await tx.memoryReaction.deleteMany({
        where: { targetType: "user_memory", targetId: { in: memoryIds } },
      });
      // UserMemory 삭제가 Episode 를 cascade(memoryId FK). LifeEvent 만
      // 지우면 Episode.lifeEventId cascade 는 타지만, Episode.memoryId 가
      // 가리키던 UserMemory 브릿지 행은 반대 방향 cascade가 없어 고아로
      // 남는다 — 반드시 이 순서로 먼저 지운다.
      await tx.userMemory.deleteMany({ where: { id: { in: memoryIds } } });
    }
    // PersonLifeEvent(lifeEventId FK cascade)·ChatV3PendingContext
    // (targetEventId FK cascade)는 LifeEvent 삭제 시 자동 정리.
    await tx.lifeEvent.delete({ where: { id: event.id } });
  });

  return { ok: true };
}
