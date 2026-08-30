// v3 통합 채팅(P2) — /story-review 화면 데이터. 순수 읽기 전용.

import { prisma } from "./db";

export type TimelineItem = {
  id: string;
  year: number | null;
  label: string;
  hasEpisode: boolean;
};

export type EpisodeSummary = {
  id: string; // LifeEvent id (episode 가 딸린 이벤트)
  label: string;
  year: number | null;
  content: string;
};

export async function getStoryReviewData(userId: string): Promise<{
  timeline: TimelineItem[];
  episodes: EpisodeSummary[];
}> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    orderBy: { sequenceOrder: "asc" },
    include: { episodes: { select: { content: true }, take: 1 } },
  });

  const timeline: TimelineItem[] = events.map((e) => ({
    id: e.id,
    year: e.correctedYear ?? e.year,
    label: e.correctedLabel ?? e.label,
    hasEpisode: e.hasEpisode,
  }));

  const episodes: EpisodeSummary[] = events
    .filter((e) => e.hasEpisode && e.episodes.length > 0)
    .map((e) => ({
      id: e.id,
      label: e.correctedLabel ?? e.label,
      year: e.correctedYear ?? e.year,
      content: e.episodes[0].content,
    }));

  return { timeline, episodes };
}
