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
  id: string; // Episode id — 같은 LifeEvent 에 여러 Episode 가 붙을 수 있어 LifeEvent id 는 key 로 못 씀(P9-1)
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
        select: { id: true, content: true, memory: { select: { title: true } } },
        orderBy: { createdAt: "asc" },
      },
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

  const episodes: EpisodeSummary[] = events.flatMap((e) =>
    e.episodes.map((ep) => ({
      id: ep.id,
      label: ep.memory.title,
      year: e.correctedYear ?? e.year,
      content: ep.content,
    })),
  );

  return { timeline, episodes };
}
