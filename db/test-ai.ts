// Phase 7.1 sanity check: confirm Claude API key + wrapper work end
// to end with a short Korean prompt.
//
// Run with: npx tsx db/test-ai.ts

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
