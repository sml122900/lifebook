// v3 P16-3 — hasEpisode 플래그 정합성 점검(읽기 전용). 실행:
// npx tsx db/check-episode-integrity.ts
//
// P16-1 이후 갭 감지기는 hasEpisode 플래그를 안 보고 "실질 내용 있는
// Episode 존재"를 직접 계산하므로, 이 플래그가 거짓이어도 더 이상 갭이
// 영구히 막히지는 않는다. 다만 hasEpisode 는 여전히 story-review 등
// "이야기 있음" 배지 표시에 쓰이므로 — 배지가 거짓으로 뜨는(실질 내용
// 없는데 "이야기 있음") 케이스를 찾는 정기 점검용. 쓰기 0.

import "dotenv/config";

import { prisma } from "../lib/db";
import { isSubstantiveEpisodeContent } from "../lib/episode-text";

async function main() {
  const events = await prisma.lifeEvent.findMany({
    where: { hasEpisode: true },
    select: {
      id: true,
      userId: true,
      label: true,
      correctedLabel: true,
      year: true,
      correctedYear: true,
      episodes: { select: { id: true, content: true, isPeriod: true, createdAt: true } },
    },
  });

  const bad = events.filter(
    (e) => !e.episodes.some((ep) => isSubstantiveEpisodeContent(ep.content)),
  );

  console.log(`hasEpisode=true 인 LifeEvent: ${events.length}건`);
  console.log(`실질 Episode 0건(배지 거짓양성 의심): ${bad.length}건\n`);

  for (const e of bad) {
    const label = e.correctedLabel ?? e.label;
    const year = e.correctedYear ?? e.year;
    console.log(`${e.id} | user=${e.userId} | ${label}(${year ?? "연도 없음"})`);
    for (const ep of e.episodes) {
      console.log(
        `  ep=${ep.id} isPeriod=${ep.isPeriod} createdAt=${ep.createdAt.toISOString()} content="${ep.content.slice(0, 80)}"`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
