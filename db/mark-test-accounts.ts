// 테스트 계정 명시 표시(User.isTestAccount — 2026-11-08 성민 지시). 표시된 계정의 AI 사용분은 운영 하루 예산에서 빠진다
// (lib/chat-v3-usage — 이메일 최상위 도메인 .invalid·.test 계정은 표시 없이도 테스트).
// 기본 = 계획만(바뀔 계정 출력, DB 쓰기 0). --apply 때만 쓴다. 유료 API 호출 0.
//
//   npx tsx db/mark-test-accounts.ts --all-existing [--apply]        지금 있는 계정 전부(2026-11-08 — 운영 계정 = 전부 성민 테스트·픽스처)
//   npx tsx db/mark-test-accounts.ts --email a@b.c [--email …] [--apply] [--unmark]

import "dotenv/config";

import { prisma } from "../lib/db";
import { isTestAccountEmail } from "../lib/chat-v3-usage";

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const unmark = args.includes("--unmark");
  const all = args.includes("--all-existing");
  const emails = args.flatMap((a, i) => (a === "--email" && args[i + 1] ? [args[i + 1].trim().toLowerCase()] : []));
  if (!all && emails.length === 0) {
    console.log("대상을 정하세요: --all-existing 또는 --email <주소> (여러 번). 계획만 보려면 --apply 없이.");
    process.exit(1);
  }
  if (all && unmark) {
    console.log("--all-existing 와 --unmark 는 같이 쓰지 않는다(전부 풀기는 위험 — --email 로 하나씩).");
    process.exit(1);
  }
  const users = await prisma.user.findMany({
    where: all ? {} : { email: { in: emails } },
    select: { id: true, email: true, name: true, isTestAccount: true },
    orderBy: { createdAt: "asc" },
  });
  const want = !unmark;
  const change = users.filter((u) => u.isTestAccount !== want);
  for (const u of change) console.log(`${want ? "표시" : "해제"} — ${u.email ?? "(이메일 없음)"} · ${u.name ?? ""}${isTestAccountEmail(u.email) ? " (이메일로도 테스트)" : ""}`);
  const missing = emails.filter((e) => !users.some((u) => u.email === e));
  if (missing.length) console.log("없는 계정:", missing.join(", "));
  console.log(`대상 ${users.length} · 바뀔 계정 ${change.length} · 이미 그 상태 ${users.length - change.length}`);
  if (!apply) {
    console.log("계획만 — 쓰려면 --apply");
    return;
  }
  const r = await prisma.user.updateMany({ where: { id: { in: change.map((u) => u.id) } }, data: { isTestAccount: want } });
  console.log(`적용 — ${r.count}개 계정 ${want ? "표시" : "해제"}`);
}

main().finally(() => prisma.$disconnect());
