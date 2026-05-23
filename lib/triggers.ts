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
  artist: string;
  description: string | null;
  region: string;
  sourceUrl: string | null;
  distance: number; // cosine distance, lower is more similar
  ageAtYear: number; // year - birthYear
  bumpWeight: number; // [0, 1], peaks in late teens
  score: number; // (1 - distance) * bumpWeight
  // Phase 6.8: null = not responded yet. "dismissed" never reaches
  // here — the SQL filter drops it. So "confirmed" is the only
  // non-null value we expect.
  status: "confirmed" | null;
};

// Seed writer stored Event.description as "{artist} · {context}" so
// we split it back out here for callers that need the artist on its own.
function splitArtist(description: string | null): {
  artist: string;
  description: string | null;
} {
  if (!description) return { artist: "", description: null };
  const [artist, ...rest] = description.split(" · ");
  return {
    artist: artist ?? "",
    description: rest.length > 0 ? rest.join(" · ") : null,
  };
}

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

/**
 * Result shape lets the page show a small banner when the embedding /
 * vector search couldn't run (Voyage down, network drop, etc.) instead
 * of crashing the whole timeline. failed=true => triggers=[].
 */
export type TriggersResult = {
  triggers: TriggerCandidate[];
  failed: boolean;
};

export async function getMusicTriggersForUser(
  profile: UserMusicProfile,
  userId: string | null,
  limit = 10,
): Promise<TriggersResult> {
  try {
    const queryText = buildUserMusicProfile(profile);
    const queryVec = await embedOne(queryText, "query");
    const vecLiteral = `[${queryVec.join(",")}]`;

    // LEFT JOIN to TriggerResponse so the SQL filter can drop dismissed
    // suggestions and surface "confirmed" in one round trip. When userId
    // is null the join condition never matches and tr.status is always
    // NULL, so every candidate flows through with status=null.
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
        status: "confirmed" | "dismissed" | null;
      }>
    >(
      `SELECT e.id, e.year, e.title, e.description, e.region, e."sourceUrl",
         (e.embedding <=> $1::vector(1024))::float AS distance,
         CASE
           WHEN e.year - $2 BETWEEN 13 AND 25 THEN 1.0
           WHEN e.year - $2 BETWEEN 6 AND 35 THEN 0.7
           ELSE 0.4
         END AS bump_weight,
         ((1.0 - (e.embedding <=> $1::vector(1024)))
          * CASE
              WHEN e.year - $2 BETWEEN 13 AND 25 THEN 1.0
              WHEN e.year - $2 BETWEEN 6 AND 35 THEN 0.7
              ELSE 0.4
            END)::float AS score,
         tr.status::text AS status
       FROM "Event" e
       LEFT JOIN "TriggerResponse" tr
         ON tr."eventId" = e.id AND tr."userId" = $4
       WHERE e.category = 'trigger'
         AND e.domain = 'music'
         AND e.embedding IS NOT NULL
         AND e.year >= $2
         AND (tr.status IS NULL OR tr.status <> 'dismissed')
       ORDER BY score DESC
       LIMIT $3`,
      vecLiteral,
      profile.birthYear,
      limit,
      userId,
    );

    const triggers = rows.map((r) => {
      const { artist, description } = splitArtist(r.description);
      return {
        id: r.id,
        year: r.year,
        title: r.title,
        artist,
        description,
        region: r.region,
        sourceUrl: r.sourceUrl,
        distance: r.distance,
        ageAtYear: r.year - profile.birthYear,
        bumpWeight: r.bump_weight,
        score: r.score,
        status: (r.status === "confirmed" ? "confirmed" : null) as
          | "confirmed"
          | null,
      };
    });
    return { triggers, failed: false };
  } catch (err) {
    // Voyage / pgvector failure should NOT take the timeline down.
    // Anchors + personal memories + shared memories are independent
    // of this query and must keep rendering. The caller surfaces a
    // small banner when failed=true.
    console.error("[triggers] retrieval failed:", err);
    return { triggers: [], failed: true };
  }
}
