// Phase 6.5 — load enriched music catalog into Event rows (category=
// trigger, tier=suggested), embed each via Voyage, store the vector
// into the Unsupported pgvector column via raw SQL.
//
// Idempotent: deletes existing music triggers first, then inserts.
// Run with: npx tsx db/seed-music-triggers.ts

import "dotenv/config";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { embedTexts } from "../lib/embeddings";
import { prisma } from "../lib/db";
import { embeddingTextFor, type MusicEventSeed } from "./seed/musicEvents";

type EnrichedRow = MusicEventSeed & {
  mbid: string | null;
  sourceUrl: string | null;
  mbReleaseYear: number | null;
  yearAdjusted: boolean;
};

function buildDescription(r: EnrichedRow): string {
  // We store "artist · context" in description so the trigger card can
  // surface the artist without a dedicated column. Event.description is
  // String? in the schema; we always populate it for triggers.
  return r.description ? `${r.artist} · ${r.description}` : r.artist;
}

async function main() {
  const rows: EnrichedRow[] = JSON.parse(
    readFileSync(
      join(process.cwd(), "db", "seed", "musicEvents.enriched.json"),
      "utf8",
    ),
  );
  console.log(`Loaded ${rows.length} enriched rows`);

  const deleted = await prisma.event.deleteMany({
    where: { category: "trigger", domain: "music" },
  });
  console.log(`Cleared ${deleted.count} existing music triggers`);

  const texts = rows.map((r) =>
    embeddingTextFor({
      year: r.year,
      title: r.title,
      artist: r.artist,
      description: r.description,
      region: r.region,
    }),
  );
  console.log(`Embedding ${texts.length} texts via Voyage...`);
  const vectors = await embedTexts(texts, "document");
  console.log(`Got ${vectors.length} vectors of dim ${vectors[0]?.length ?? 0}`);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const event = await prisma.event.create({
      data: {
        year: r.year,
        title: r.title,
        description: buildDescription(r),
        tier: "suggested",
        category: "trigger",
        domain: "music",
        region: r.region,
        sourceName: r.mbid ? "MusicBrainz" : null,
        sourceUrl: r.sourceUrl,
      },
      select: { id: true },
    });
    const vecLiteral = `[${vectors[i].join(",")}]`;
    await prisma.$executeRawUnsafe(
      `UPDATE "Event" SET embedding = $1::vector(1024) WHERE id = $2`,
      vecLiteral,
      event.id,
    );
  }
  console.log(`Inserted ${rows.length} rows`);

  const totals = await prisma.$queryRawUnsafe<
    Array<{ total: bigint; with_embedding: bigint }>
  >(
    `SELECT
       COUNT(*)::bigint AS total,
       COUNT(embedding)::bigint AS with_embedding
     FROM "Event"
     WHERE category = 'trigger' AND domain = 'music'`,
  );
  const { total, with_embedding } = totals[0];
  console.log(`Verify: total=${total}  with_embedding=${with_embedding}`);
  if (total !== with_embedding) {
    throw new Error("Some rows have no embedding");
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
