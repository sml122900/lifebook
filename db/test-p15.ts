// v3 P15 검증(순수, DB·API 0). 실행: npx tsx db/test-p15.ts
//
// P15-1 — nextClosingIndexFromLog: 복원된 로그에서 마지막 마무리 문구의
//         다음 인덱스를 잇는다(리마운트 후에도 4종이 골고루 돌게).
// P15-2 는 클라(ChatV3Client) exit 경로의 clearPending 호출이라 여기선
// 검증 불가 — docs/daily/2026-09-07.md 의 실기기 확인 절차 참고.

import { EPISODE_CLOSINGS, nextClosingIndexFromLog } from "../lib/episode-text";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

const a = (content: string) => ({ role: "assistant", content });
const u = (content: string) => ({ role: "user", content });

console.log("=== P15-1 마무리 멘트 순환 복원 ===");
check("로그 없음 → 0", nextClosingIndexFromLog([]) === 0);
check("문구 없음 → 0", nextClosingIndexFromLog([a("하고 싶은 이야기 있으세요?"), u("네")]) === 0);
check(
  "마지막 문구가 0번 → 1",
  nextClosingIndexFromLog([a(EPISODE_CLOSINGS[0]), u("대학교 이야기"), a("어떤 일이 있으셨어요?")]) === 1,
);
check(
  "마지막 문구가 3번 → 0(순환)",
  nextClosingIndexFromLog([a(EPISODE_CLOSINGS[1]), a(EPISODE_CLOSINGS[3])]) === 0,
);
check(
  "가장 최근 문구 기준(앞의 0번 무시)",
  nextClosingIndexFromLog([a(EPISODE_CLOSINGS[0]), u("x"), a(EPISODE_CLOSINGS[2]), u("y")]) === 3,
);
check(
  "user 역할의 같은 문구는 무시",
  nextClosingIndexFromLog([a(EPISODE_CLOSINGS[1]), u(EPISODE_CLOSINGS[3])]) === 2,
);

// 리마운트 시뮬레이션 — 이야기 5개를 매번 새 인스턴스(ref=0)로 시작하되
// 로그에서 복원하면 0,1,2,3,0 으로 돈다.
const log: { role: string; content: string }[] = [];
const seen: number[] = [];
for (let i = 0; i < 5; i++) {
  const idx = nextClosingIndexFromLog(log);
  seen.push(idx);
  log.push(u("이야기"), a(EPISODE_CLOSINGS[idx]));
}
check("리마운트 5회 → 0,1,2,3,0", seen.join(",") === "0,1,2,3,0", seen);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
