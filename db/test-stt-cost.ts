// STT 비용 계산 유틸 검증.
// 실행: npx tsx db/test-stt-cost.ts

import { calcSttTokens, STT_PER_MIN_TOKENS, STT_MAX_DURATION_SEC } from "../lib/stt-cost";

const cases: Array<[number, number, string]> = [
  // [durationSec, expectedTokens, label]
  [0,    0,   "0초 → 0 (무효 입력)"],
  [1,    2,   "1초  → 15초 올림 → 0.25분 × 5 → ceil(1.25) = 2"],
  [15,   2,   "15초 → 15초 올림 → 0.25분 × 5 → ceil(1.25) = 2"],
  [16,   3,   "16초 → 30초 올림 → 0.5분  × 5 → ceil(2.5)  = 3"],
  [60,   5,   "1분  → 경영방 확정 단가 검증"],
  [59,   5,   "59초 → 60초 올림 → 1분    × 5 → 5"],
  [61,   6,   "61초 → 75초 올림 → 1.25분 × 5 → ceil(6.25) = 7... 실제 6"],
  [3600, 300, "1시간(3600초) → 경영방 확정 단가 검증"],
  [5400, 450, "90분(5400초)  → 경영방 확정 단가 검증"],
  [-1,   0,   "음수 → 0 방어"],
];

// 61초 계산 수정: ceil(75/60 * 5) = ceil(6.25) = 7
// 위 표에서 레이블 오타 수정
const correctedCases: Array<[number, number, string]> = [
  [0,    0,   "0초 → 0 (무효 입력)"],
  [1,    2,   "1초  → 15초 올림 → 0.25분 × 5 → ceil(1.25) = 2"],
  [15,   2,   "15초 → 15초 올림 → 0.25분 × 5 → ceil(1.25) = 2"],
  [16,   3,   "16초 → 30초 올림 → 0.5분  × 5 → ceil(2.5)  = 3"],
  [59,   5,   "59초 → 60초 올림 → 1분    × 5 → 5"],
  [60,   5,   "1분(60초)  — 경영방 확정 단가"],
  [61,   7,   "61초 → 75초 올림 → 1.25분 × 5 → ceil(6.25) = 7"],
  [3600, 300, "1시간(3600초) — 경영방 확정 단가"],
  [5400, 450, "90분(5400초)  — 경영방 확정 단가"],
  [-1,   0,   "음수 → 0 방어"],
];

let failed = 0;
for (const [sec, expected, label] of correctedCases) {
  const got = calcSttTokens(sec);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "OK " : "FAIL"}  ${String(sec).padStart(5)}초 → ${String(got).padStart(4)}토큰  expected=${expected}  ${label}`);
}

console.log("");
console.log(`STT_PER_MIN_TOKENS = ${STT_PER_MIN_TOKENS}`);
console.log(`STT_MAX_DURATION_SEC = ${STT_MAX_DURATION_SEC} (${STT_MAX_DURATION_SEC / 60}분)`);
void cases; // suppress unused warning

if (failed > 0) {
  console.error(`\n${failed} case(s) failed`);
  process.exit(1);
} else {
  console.log("\n모두 통과 ✅");
}
