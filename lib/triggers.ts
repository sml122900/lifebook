// Phase 6.6 — per-user RAG retrieval of music trigger events.
//
// Pipeline:
//   1. Build a short profile string from birthYear + interests + favMusic.
//   2. Embed it as a "query" vector with Voyage.
//   3. Rank trigger events by cosine similarity, multiplied by a
//      reminiscence-bump weight so songs from the user's late teens /
//      early 20s outrank equally-similar songs from outside that window.
//   4. Drop songs from before the user was born.

import { embedOne } from "./embeddings";
import { prisma } from "./db";

export type UserMusicProfile = {
  birthYear: number;
  interests: string[];
  favMusic: string[];
};

export type TriggerCandidate = {
  id: string;
  year: number;
  title: string;
  description: string | null;
  region: string;
  sourceUrl: string | null;
  distance: number; // cosine distance, lower is more similar
  ageAtYear: number; // year - birthYear
  bumpWeight: number; // [0, 1], peaks in late teens
  score: number; // (1 - distance) * bumpWeight
};

export function buildUserMusicProfile(p: UserMusicProfile): string {
  const parts: string[] = [];
  parts.push(`${p.birthYear}년생`);
  if (p.interests.length > 0) {
    parts.push(`관심 분야: ${p.interests.join(", ")}`);
  }
  if (p.favMusic.length > 0) {
    parts.push(`좋아하는 음악: ${p.favMusic.join(", ")}`);
  }
  return parts.join(". ");
}

// Reminiscence bump: people remember music from ~18 most vividly.
// We give the 13–25 window full weight, taper outward, and zero out
// pre-birth years (those get filtered upstream anyway).
//
// SQL mirror of this lives inside getMusicTriggersForUser so the
// weighted ranking happens in one query.
export function bumpWeight(ageAtYear: number): number {
  if (ageAtYear < 0) return 0;
  if (ageAtYear >= 13 && ageAtYear <= 25) return 1.0;
  if (ageAtYear >= 6 && ageAtYear <= 35) return 0.7;
  return 0.4;
}

export async function getMusicTriggersForUser(
  profile: UserMusicProfile,
  limit = 10,
): Promise<TriggerCandidate[]> {
  const queryText = buildUserMusicProfile(profile);
  const queryVec = await embedOne(queryText, "query");
  const vecLiteral = `[${queryVec.join(",")}]`;

  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      year: number;
      title: string;
      description: string | null;
      region: string;
      sourceUrl: string | null;
      distance: number;
      bump_weight: number;
      score: number;
    }>
  >(
    `SELECT id, year, title, description, region, "sourceUrl",
       (embedding <=> $1::vector(1024))::float AS distance,
       CASE
         WHEN year - $2 BETWEEN 13 AND 25 THEN 1.0
         WHEN year - $2 BETWEEN 6 AND 35 THEN 0.7
         ELSE 0.4
       END AS bump_weight,
       ((1.0 - (embedding <=> $1::vector(1024)))
        * CASE
            WHEN year - $2 BETWEEN 13 AND 25 THEN 1.0
            WHEN year - $2 BETWEEN 6 AND 35 THEN 0.7
            ELSE 0.4
          END)::float AS score
     FROM "Event"
     WHERE category = 'trigger'
       AND domain = 'music'
       AND embedding IS NOT NULL
       AND year >= $2
     ORDER BY score DESC
     LIMIT $3`,
    vecLiteral,
    profile.birthYear,
    limit,
  );

  return rows.map((r) => ({
    id: r.id,
    year: r.year,
    title: r.title,
    description: r.description,
    region: r.region,
    sourceUrl: r.sourceUrl,
    distance: r.distance,
    ageAtYear: r.year - profile.birthYear,
    bumpWeight: r.bump_weight,
    score: r.score,
  }));
}
