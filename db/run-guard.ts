// 실제 모델·유료 API(Anthropic·Voyage)를 부르는 단독 스크립트의 안전장치(2026-11-03, CLAUDE.md 작업 규칙 10).
// --run 이 없으면 계획(무엇을 몇 번 부르는지·DB 쓰기 여부)만 출력하고 끝낸다 — 실제 호출·DB 쓰기 0.
// 회귀 세트는 대상이 아니다(그쪽은 db/live-log requireTestBudget 테스트 한도로 막는다). main() 첫 줄에서 부른다.
export function requireRun(plan: string[]): void {
  if (process.argv.includes("--run")) return;
  console.log(["[계획만 — 실제 호출 0]", ...plan.map((l) => `  · ${l}`), "실제로 부르려면 --run 을 붙이세요."].join("\n"));
  process.exit(0);
}
