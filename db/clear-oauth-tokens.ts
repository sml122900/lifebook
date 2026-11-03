// 소셜 로그인 토큰 칸 비우기 — 2026-11-03 부터 새 로그인은 토큰을 저장하지 않는다(lib/auth-adapter). 이 스크립트는
// 그 전에 저장된 Account 행의 토큰 칸(access·refresh·id 토큰 · 만료 · 종류 · 범위 · 세션 상태)을 비운다.
// docs/phase/my-life-restructure.md §16.2. 계정 식별(사업자·사업자 회원 식별값)은 그대로 — 로그인에 영향 없음.
//
// 기본은 dry-run(사업자별·계정 구분별 개수만 — 값 출력 없음). --apply 는 성민 별도 승인 뒤에만(실고객 계정 포함 대상).
// 백업은 남기지 않는다(토큰을 다른 파일로 옮기면 비우는 의미가 없음 — 쓰는 곳 0 이라 되돌릴 필요도 없음).
// User 가 0명으로 읽히면(잘못된 DB 연결) 중단.
//
// 실행: npx tsx db/clear-oauth-tokens.ts [--apply]

import "dotenv/config";

import { prisma } from "../lib/db";

const BLOCKED_LOCAL_PART = "sml122900";

const HAS_TOKEN = {
  OR: [
    { access_token: { not: null } },
    { refresh_token: { not: null } },
    { id_token: { not: null } },
    { expires_at: { not: null } },
    { token_type: { not: null } },
    { scope: { not: null } },
    { session_state: { not: null } },
  ],
};

async function main() {
  const apply = process.argv.includes("--apply");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  if (users.length === 0) throw new Error("User 0명 — DB 연결 확인. 중단.");
  const customer = new Set(users.filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART)).map((u) => u.id));

  const rows = await prisma.account.findMany({ select: { userId: true, provider: true, access_token: true, refresh_token: true, id_token: true } });
  const withToken = await prisma.account.findMany({ where: HAS_TOKEN, select: { userId: true, provider: true } });
  console.log(`모드: ${apply ? "APPLY" : "dry-run(쓰기 없음)"} · Account ${rows.length}행 · 토큰 칸이 남은 행 ${withToken.length}`);
  const byProvider = new Map<string, { all: number; customer: number }>();
  for (const r of withToken) {
    const s = byProvider.get(r.provider) ?? { all: 0, customer: 0 };
    s.all += 1;
    if (customer.has(r.userId)) s.customer += 1;
    byProvider.set(r.provider, s);
  }
  for (const [p, s] of [...byProvider.entries()].sort()) console.log(`  ${p}: ${s.all}행(그중 실고객 계정 ${s.customer})`);
  const kinds = { access: rows.filter((r) => r.access_token).length, refresh: rows.filter((r) => r.refresh_token).length, id: rows.filter((r) => r.id_token).length };
  console.log(`  칸별 — access_token ${kinds.access} · refresh_token ${kinds.refresh} · id_token ${kinds.id}`);
  if (!apply) {
    console.log("dry-run — 쓰기 없음. 적용은 성민 승인 뒤 --apply");
    return;
  }
  const r = await prisma.account.updateMany({
    where: HAS_TOKEN,
    data: { access_token: null, refresh_token: null, id_token: null, expires_at: null, token_type: null, scope: null, session_state: null },
  });
  console.log(`적용 — 토큰 칸 비움 ${r.count}행 · 남은 행 ${await prisma.account.count({ where: HAS_TOKEN })}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
