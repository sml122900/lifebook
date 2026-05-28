// Phase 8.1 점검 — 정책 상수 + tokensFromUsage 검증.
// 실행: npx tsx db/test-token-policy.ts

import {
  AI_TOKENS_PER_SERVICE_TOKEN,
  SIGNUP_GRANT_TOKENS,
  TOPUP_PACKAGES,
  getPackage,
  tokensFromUsage,
} from "../lib/tokens/policy";

const cases: Array<[number, number, number]> = [
  // [inputTokens, outputTokens, expectedServiceTokens]
  [0, 0, 0],
  [1, 0, 1], // tiny call → still 1
  [936, 177, 1], // measured average → 1 token
  [1500, 600, 2], // bigger cycle
  [4000, 0, 2], // pure input
  [10_000, 0, 5],
];

let failed = 0;
for (const [i, o, expected] of cases) {
  const got = tokensFromUsage(i, o);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? "OK " : "FAIL"}  in=${i.toString().padStart(5)} out=${o.toString().padStart(4)}  expected=${expected}  got=${got}`,
  );
}

console.log("");
console.log(`N=${AI_TOKENS_PER_SERVICE_TOKEN}  signupGrant=${SIGNUP_GRANT_TOKENS}`);
console.log("Packages:");
for (const p of TOPUP_PACKAGES) {
  console.log(`  ${p.id}: ${p.krw.toLocaleString()}원 = ${p.tokens}토큰  (${(p.krw / p.tokens).toFixed(1)}원/토큰)`);
}
console.log(`getPackage("starter") → ${JSON.stringify(getPackage("starter"))}`);
console.log(`getPackage("bogus")   → ${getPackage("bogus")}`);

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
}
