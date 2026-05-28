// Phase 6.4 — musicEvents 시드 행을 모두 MusicBrainz 로 돌려, 정책대로
// 연도를 정합화(시드 우선, MB 가 더 이르면 채택)하고, 보강된 카탈로그를
// db/seed/musicEvents.enriched.json 으로 쓴다 → Phase 6.5 가 MB 를 다시
// 치지 않고 그대로 쓰게.
//
// 소요: ~70곡 × 1.1s ≈ 80초. 실행:
//   npx tsx db/enrich-music.ts

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import {
  mbidUrl,
  reconcileYear,
  searchRecording,
} from "../lib/musicbrainz";
import { musicEvents, type MusicEventSeed } from "./seed/musicEvents";

export type EnrichedMusicEvent = MusicEventSeed & {
  mbid: string | null;
  sourceUrl: string | null;
  mbReleaseYear: number | null;
  yearAdjusted: boolean;
};

async function main() {
  const out: EnrichedMusicEvent[] = [];
  let matched = 0;
  let adjusted = 0;
  let failed = 0;

  for (let i = 0; i < musicEvents.length; i++) {
    const seed = musicEvents[i];
    let match;
    try {
      match = await searchRecording(seed.title, seed.artist);
    } catch (err) {
      console.warn(`[${i + 1}/${musicEvents.length}] ERR ${seed.title}: ${err}`);
      out.push({
        ...seed,
        mbid: null,
        sourceUrl: null,
        mbReleaseYear: null,
        yearAdjusted: false,
      });
      failed++;
      continue;
    }

    if (!match) {
      console.log(
        `[${i + 1}/${musicEvents.length}] miss  ${seed.year} ${seed.title} / ${seed.artist}`,
      );
      out.push({
        ...seed,
        mbid: null,
        sourceUrl: null,
        mbReleaseYear: null,
        yearAdjusted: false,
      });
      failed++;
      continue;
    }

    matched++;
    const reconciledYear = reconcileYear(seed.year, match.firstReleaseYear);
    const yearAdjusted = reconciledYear !== seed.year;
    if (yearAdjusted) adjusted++;

    const marker = yearAdjusted
      ? `ADJ ${seed.year}->${reconciledYear}`
      : `keep ${seed.year}`;
    console.log(
      `[${i + 1}/${musicEvents.length}] ok    ${marker}  ${seed.title} / ${seed.artist}  (MB: ${match.firstReleaseYear ?? "—"})`,
    );

    out.push({
      ...seed,
      year: reconciledYear,
      mbid: match.mbid,
      sourceUrl: mbidUrl(match.mbid),
      mbReleaseYear: match.firstReleaseYear,
      yearAdjusted,
    });
  }

  const outPath = join(process.cwd(), "db", "seed", "musicEvents.enriched.json");
  writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log("");
  console.log(`Wrote ${out.length} rows → ${outPath}`);
  console.log(`matched=${matched}  miss=${failed}  yearAdjusted=${adjusted}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
