// 인증 회귀 — docs/phase/my-life-restructure.md §16.2(B)·§16.3(C). LLM 0.
//
//   ① 소셜 로그인 토큰 저장 안 함(B) — 어댑터 linkAccount 가 계정 식별(사업자·사업자 회원 식별값)만 저장,
//      access·refresh·id 토큰·만료·종류·범위·세션 상태 칸은 비움 · auth.ts 가 그 어댑터를 씀
//
// 자체 픽스처 계정만 만들고 지운다(test30·실고객 접촉 0). 실행: npx tsx db/test-auth.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { authAdapter } from "../lib/auth-adapter";

const EMAIL_A = "fixture-auth-a@lifebook.invalid";
const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

async function removeFixtures() {
  for (const email of [EMAIL_A]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function main() {
  await removeFixtures();
  try {
    // ── ① 소셜 로그인 토큰 저장 안 함(B) ─────────────────────────────────
    const a = (await prisma.user.create({ data: { email: EMAIL_A, name: "[fixture] 인증 A" }, select: { id: true } })).id;
    await authAdapter.linkAccount!({
      userId: a,
      type: "oauth",
      provider: "kakao",
      providerAccountId: "fixture-kakao-1",
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
      id_token: "fixture-id",
      expires_at: 1_900_000_000,
      token_type: "bearer",
      scope: "profile_nickname",
      session_state: "fixture-state",
    });
    const acc = await prisma.account.findUniqueOrThrow({ where: { provider_providerAccountId: { provider: "kakao", providerAccountId: "fixture-kakao-1" } } });
    check("① linkAccount — 계정 식별(사업자·회원 식별값·종류·사용자)만 저장",
      acc.userId === a && acc.type === "oauth" && acc.provider === "kakao" && acc.providerAccountId === "fixture-kakao-1", acc);
    check("① linkAccount — access·refresh·id 토큰·만료·종류·범위·세션 상태 칸 비움",
      acc.access_token === null && acc.refresh_token === null && acc.id_token === null && acc.expires_at === null &&
        acc.token_type === null && acc.scope === null && acc.session_state === null,
      acc);
    const user = await authAdapter.getUserByAccount!({ provider: "kakao", providerAccountId: "fixture-kakao-1" });
    check("① 다음 로그인 — 저장된 식별값으로 같은 사용자를 찾음(토큰 없이)", user?.id === a, user);
    const authTs = read("auth.ts");
    check("① auth.ts 가 토큰을 안 남기는 어댑터(lib/auth-adapter)를 씀 · Prisma 어댑터를 직접 만들지 않음",
      authTs.includes("adapter: authAdapter") && !authTs.includes("PrismaAdapter("));
    check("① 앱 안 토큰 칸 읽는 곳 0(access_token·refresh_token·id_token)",
      ["app", "lib"].every((d) => !walk(d).some((f) => /\b(access_token|refresh_token|id_token)\b/.test(read(f)) && f !== "lib/auth-adapter.ts")));
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

function walk(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? (d.name === "generated" ? [] : walk(`${dir}/${d.name}`)) : /\.(ts|tsx)$/.test(d.name) ? [`${dir}/${d.name}`] : [],
  );
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  process.exit(1);
});
