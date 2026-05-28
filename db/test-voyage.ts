// Phase 6.1 점검: 한국어 1 + 영어 1 문자열을 Voyage 에 보내, 기대 차원의
// 벡터가 돌아오는지 확인.
//
// 실행: npx tsx db/test-voyage.ts

import "dotenv/config";

import { EMBEDDING_DIM, EMBEDDING_MODEL, embedTexts } from "../lib/embeddings";

async function main() {
  const samples = ["광화문 연가 - 이문세 (1987)", "Bohemian Rhapsody - Queen (1975)"];
  const vectors = await embedTexts(samples, "document");

  for (let i = 0; i < samples.length; i++) {
    const dim = vectors[i].length;
    console.log(
      `[${i}] "${samples[i]}" → dim=${dim} ${dim === EMBEDDING_DIM ? "OK" : "MISMATCH"}`,
    );
  }
  console.log(`model=${EMBEDDING_MODEL} expected_dim=${EMBEDDING_DIM}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
