// v3 통합 채팅(P2) — /story-review 화면 데이터. 순수 읽기 전용.

import type { LifeEventType } from "./generated/prisma/enums";
import { prisma } from "./db";

export type TimelineItem = {
  id: string;
  // v3 P19-2 — CUSTOM 만 화면에서 삭제 가능(골격 이벤트는 삭제 불가) 판단용.
  type: LifeEventType;
  year: number | null;
  label: string;
  hasEpisode: boolean;
  // v3 P6 — 이 이벤트에 연결된 인물(그 시절 함께였던 사람들).
  people: { id: string; name: string }[];
};

export type EpisodeSummary = {
  id: string; // Episode id — 같은 LifeEvent 에 여러 Episode 가 붙을 수 있어 LifeEvent id 는 key 로 못 씀(P9-1)
  // v3 P19-1 — 삭제/정정 대상 지정용(Episode 삭제는 UserMemory 를 지워서
  // cascade 시키므로 memoryId 가 실제 삭제 키).
  memoryId: string;
  label: string;
  year: number | null;
  content: string;
  // v3 P19-1 — 삭제 확인 모달 경고용. Comment + MemoryReaction 합산.
  familyActivityCount: number;
};

export async function getStoryReviewData(userId: string): Promise<{
  timeline: TimelineItem[];
  episodes: EpisodeSummary[];
}> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    orderBy: { sequenceOrder: "asc" },
    include: {
      // P9-1 — `take: 1` 이 한 이벤트에 여러 Episode 가 붙을 수 있게 된 뒤로
      // (예: 앵커 이벤트 자체 이야기 + period 대화 1건 이상) 첫 번째만 남기고
      // 나머지를 조용히 숨겼다(2회차 이후 내용이 "저장 안 됨"처럼 보이던
      // 원인). 전부 가져온다. label 은 각 Episode 가 실제로 어떤 주제였는지
      // (memory.title — createEpisodeBridge 가 topicOverride 를 반영해 저장한
      // 값)를 그대로 쓴다 — LifeEvent 자신의 label 을 재사용하면 period
      // 이야기도 전부 "결혼"으로만 보인다. year 는 memory.year 를 안 쓴다 —
      // UserMemory.year 는 NOT NULL 이라 이벤트 자신의 연도가 비어 있으면
      // createEpisodeBridge 가 의미 없는 오늘 연도로 채워둔 값이라(lib/
      // episode.ts resolveMemoryYear) 그걸 실제 연도처럼 보여주면 오히려
      // 왜곡 — 아래에서 LifeEvent 의 correctedYear/year 를 그대로 쓴다.
      episodes: {
        select: { id: true, memoryId: true, content: true, memory: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      },
      people: { select: { person: { select: { id: true, name: true } } } },
    },
  });

  const timeline: TimelineItem[] = events.map((e) => ({
    id: e.id,
    type: e.type,
    year: e.correctedYear ?? e.year,
    label: e.correctedLabel ?? e.label,
    hasEpisode: e.hasEpisode,
    people: e.people.map((pl) => pl.person),
  }));

  const rawEpisodes = events.flatMap((e) =>
    e.episodes.map((ep) => ({
      id: ep.id,
      memoryId: ep.memoryId,
      label: ep.memory.title,
      year: e.correctedYear ?? e.year,
      content: ep.content,
    })),
  );

  // v3 P19-1 — 삭제 경고("가족이 남긴 댓글·반응 N개도 함께 지워져요")용
  // 배치 집계. Comment/MemoryReaction 은 UserMemory 를 폴리모픽으로
  // 가리켜 FK 로 못 구하므로 targetId IN(...) 으로 한 번에 센다(N+1 회피).
  // targetId: { in: [] } 는 Prisma 에서 빈 결과를 정상 반환(에러 아님) —
  // memoryIds 0건 분기를 따로 안 둬도 안전하다.
  const memoryIds = rawEpisodes.map((e) => e.memoryId);
  const [commentRows, reactionRows] = await Promise.all([
    prisma.comment.groupBy({
      by: ["targetId"],
      where: { targetType: "user_memory", targetId: { in: memoryIds } },
      _count: { _all: true },
    }),
    prisma.memoryReaction.groupBy({
      by: ["targetId"],
      where: { targetType: "user_memory", targetId: { in: memoryIds } },
      _count: { _all: true },
    }),
  ]);
  const activityCount = new Map<string, number>();
  for (const r of commentRows) {
    activityCount.set(r.targetId, (activityCount.get(r.targetId) ?? 0) + r._count._all);
  }
  for (const r of reactionRows) {
    activityCount.set(r.targetId, (activityCount.get(r.targetId) ?? 0) + r._count._all);
  }

  const episodes: EpisodeSummary[] = rawEpisodes.map((e) => ({
    ...e,
    familyActivityCount: activityCount.get(e.memoryId) ?? 0,
  }));

  return { timeline, episodes };
}
