// Phase 7.1 점검: 짧은 한국어 프롬프트로 Claude API 키 + 래퍼가 끝까지
// 동작하는지 확인.
//
// 실행: npx tsx db/test-ai.ts

import "dotenv/config";

import { chat } from "../lib/ai";

async function main() {
  const t0 = Date.now();
  const res = await chat(
    [
      {
        role: "user",
        content: "한 문장으로 인사해주세요.",
      },
    ],
    { maxTokens: 128 },
  );
  const elapsed = Date.now() - t0;
  console.log(`model=${res.model}  in=${res.inputTokens}  out=${res.outputTokens}  ${elapsed}ms`);
  console.log(`text=${res.text}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
