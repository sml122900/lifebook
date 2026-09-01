// v3 통합 채팅(P2) — /story-review 화면 데이터. 순수 읽기 전용.

import { prisma } from "./db";

export type TimelineItem = {
  id: string;
  year: number | null;
  label: string;
  hasEpisode: boolean;
  // v3 P6 — 이 이벤트에 연결된 인물(그 시절 함께였던 사람들).
  people: { id: string; name: string }[];
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
    include: {
      episodes: { select: { content: true }, take: 1 },
      people: { select: { person: { select: { id: true, name: true } } } },
    },
  });

  const timeline: TimelineItem[] = events.map((e) => ({
    id: e.id,
    year: e.correctedYear ?? e.year,
    label: e.correctedLabel ?? e.label,
    hasEpisode: e.hasEpisode,
    people: e.people.map((pl) => pl.person),
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
