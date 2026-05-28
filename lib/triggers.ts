// Phase 6.6 — 사용자별 음악 트리거 사건 RAG 검색.
//
// 파이프라인:
//   1. birthYear + interests + favMusic 로 짧은 프로필 문자열을 만든다.
//   2. Voyage 로 "query" 벡터로 임베딩한다.
//   3. 코사인 유사도 × "회상 가중치"로 트리거 사건을 랭킹 — 사용자의
//      10대 후반~20대 초반 노래가 같은 유사도의 다른 시기 노래보다 위로.
//   4. 사용자가 태어나기 전 노래는 버린다.

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

// 시드 작성기가 Event.description 을 "{아티스트} · {맥락}" 으로 저장했으므로,
// 아티스트만 따로 필요한 호출자를 위해 여기서 다시 분리한다.
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

// 회상 가중치: 사람은 ~18세 무렵 음악을 가장 생생히 기억한다.
// 13~25세 구간에 만점, 바깥으로 갈수록 낮추고, 출생 전(음수 나이)은 0
// (어차피 상위에서 필터됨).
//
// 이 로직의 SQL 판본이 getMusicTriggersForUser 안에 있어, 가중 랭킹이
// 한 쿼리로 끝난다.
export function bumpWeight(ageAtYear: number): number {
  if (ageAtYear < 0) return 0;
  if (ageAtYear >= 13 && ageAtYear <= 25) return 1.0;
  if (ageAtYear >= 6 && ageAtYear <= 35) return 0.7;
  return 0.4;
}

/**
 * 임베딩/벡터 검색이 실패해도(Voyage 다운, 네트워크 끊김 등) 타임라인
 * 전체를 죽이지 않고 작은 배너만 띄우게 하는 반환 형태. failed=true 면
 * triggers=[].
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

    // TriggerResponse 를 LEFT JOIN 해, "무시됨" 제안을 한 번에 거르고
    // "확정됨"을 함께 가져온다. userId 가 null 이면 조인 조건이 절대 안
    // 맞아 tr.status 는 항상 NULL → 모든 후보가 status=null 로 통과.
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
    // Voyage / pgvector 실패가 타임라인을 죽여선 안 된다. 앵커 + 개인
    // 추억 + 공유 추억은 이 쿼리와 독립이라 계속 렌더돼야 한다. 호출자가
    // failed=true 일 때 작은 배너를 띄운다.
    console.error("[triggers] retrieval failed:", err);
    return { triggers: [], failed: true };
  }
}
