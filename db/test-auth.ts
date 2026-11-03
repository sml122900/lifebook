// 인증 회귀 — docs/phase/my-life-restructure.md §16.2(B)·§16.3(C). LLM 0.
//
//   ① 소셜 로그인 토큰 저장 안 함(B) — 어댑터 linkAccount 가 계정 식별(사업자·사업자 회원 식별값)만 저장,
//      access·refresh·id 토큰·만료·종류·범위·세션 상태 칸은 비움 · auth.ts 가 그 어댑터를 씀
//   ② 가입 전 동의(C) — 서명 쿠키(유효·위조·만료·옛 버전) · 가입 수단별(카카오·네이버·구글·이메일):
//      동의 전 = 계정 미생성(소셜 = 로그인 콜백이 /join 으로 · 어댑터 createUser 거부 / 이메일 = 거부) ·
//      동의 후 = 동의 칸이 채워진 계정 · 기존 계정 로그인 = 동의 쿠키 없이 그대로(소셜·아이디) · 계정 만드는 곳 2곳뿐 ·
//      화면 연결(/join 공개 · 로그인 회원가입 링크 · /signup 은 동의 없으면 /join)
//
// 자체 픽스처 계정만 만들고 지운다(test30·실고객 접촉 0). 실행: npx tsx db/test-auth.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { makeAuthAdapter } from "../lib/auth-adapter";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEmailAccount } from "../lib/email-signup";
import {
  makeSignupConsentToken,
  readSignupConsentToken,
  signInGate,
  SIGNUP_CONSENT_TTL_SEC,
  SIGNUP_PROVIDERS,
  type SignupConsent,
} from "../lib/signup-consent";

const EMAIL_A = "fixture-auth-a@lifebook.invalid";
const EMAIL_SOCIAL = (p: string) => `fixture-auth-${p}@lifebook.invalid`;
const EMAIL_MAIL = "fixture-auth-mail@lifebook.invalid";
const ALL_EMAILS = [EMAIL_A, ...SIGNUP_PROVIDERS.map(EMAIL_SOCIAL), EMAIL_MAIL];
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
  for (const email of ALL_EMAILS) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

const consentNow = (): SignupConsent => readSignupConsentToken(makeSignupConsentToken())!;
const noConsentAdapter = makeAuthAdapter(async () => null);

async function main() {
  await removeFixtures();
  try {
    // ── ① 소셜 로그인 토큰 저장 안 함(B) ─────────────────────────────────
    const a = (await prisma.user.create({ data: { email: EMAIL_A, name: "[fixture] 인증 A" }, select: { id: true } })).id;
    await noConsentAdapter.linkAccount!({
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
    const user = await noConsentAdapter.getUserByAccount!({ provider: "kakao", providerAccountId: "fixture-kakao-1" });
    check("① 다음 로그인 — 저장된 식별값으로 같은 사용자를 찾음(토큰 없이)", user?.id === a, user);
    const authTs = read("auth.ts");
    check("① auth.ts 가 토큰을 안 남기는 어댑터(lib/auth-adapter)를 씀 · Prisma 어댑터를 직접 만들지 않음",
      authTs.includes("adapter: makeAuthAdapter(readSignupConsent)") && !authTs.includes("PrismaAdapter("));
    check("① 앱 안 토큰 칸 읽는 곳 0(access_token·refresh_token·id_token)",
      ["app", "lib"].every((d) => !walk(d).some((f) => /\b(access_token|refresh_token|id_token)\b/.test(read(f)))));

    // ── ② 가입 전 동의(C) ───────────────────────────────────────────────
    const now = new Date();
    const tok = makeSignupConsentToken(now);
    const ok = readSignupConsentToken(tok, now);
    const [v, t, sig] = tok.split(".");
    check("② 서명 쿠키 — 유효(버전·시각) · 위조(시각·서명 바꿈) 거부 · 만료(20분 넘음) 거부 · 옛 동의 버전 거부 · 빈 값·모양 틀림 거부",
      ok?.version === CURRENT_CONSENT_VERSION && ok.at.getTime() === now.getTime() &&
        readSignupConsentToken(`${v}.${Number(t) + 1}.${sig}`, now) === null && readSignupConsentToken(`${v}.${t}.${sig.slice(1)}x`, now) === null &&
        readSignupConsentToken(tok, new Date(now.getTime() + (SIGNUP_CONSENT_TTL_SEC + 1) * 1000)) === null &&
        readSignupConsentToken(makeSignupConsentToken(now, CURRENT_CONSENT_VERSION - 1), now) === null &&
        readSignupConsentToken("", now) === null && readSignupConsentToken("a.b", now) === null,
      { ok });

    for (const p of SIGNUP_PROVIDERS) {
      const pid = `fixture-${p}-new`;
      const account = { type: "oidc", provider: p, providerAccountId: pid };
      const usersBefore = await prisma.user.count();
      const gateNo = await signInGate(account, null);
      let refused = false;
      try {
        await noConsentAdapter.createUser!({ id: "x", email: EMAIL_SOCIAL(p), emailVerified: null, name: `[fixture] ${p}` });
      } catch {
        refused = true;
      }
      check(`② ${p} 동의 전 — 로그인 콜백 = /join?provider=${p}(계정 안 만듦) · 어댑터 createUser 거부 · 계정 수 그대로`,
        gateNo === `/join?provider=${p}` && refused && (await prisma.user.count()) === usersBefore && (await prisma.user.count({ where: { email: EMAIL_SOCIAL(p) } })) === 0,
        { gateNo, refused });
      const consent = consentNow();
      const gateYes = await signInGate(account, consent);
      const made = await makeAuthAdapter(async () => consent).createUser!({ id: "x", email: EMAIL_SOCIAL(p), emailVerified: null, name: `[fixture] ${p}` });
      const row = await prisma.user.findUniqueOrThrow({ where: { id: made.id }, select: { termsConsentAt: true, privacyConsentAt: true, overseasTransferConsentAt: true, privacyConsentVersion: true } });
      check(`② ${p} 동의 후 — 로그인 콜백 통과 · 계정 = 동의 칸 3개(동의 시각)·동의 버전 채움(새 계정은 /consent 안 거침)`,
        gateYes === true && row.termsConsentAt?.getTime() === consent.at.getTime() && row.privacyConsentAt?.getTime() === consent.at.getTime() &&
          row.overseasTransferConsentAt?.getTime() === consent.at.getTime() && row.privacyConsentVersion === CURRENT_CONSENT_VERSION,
        row);
      await noConsentAdapter.linkAccount!({ userId: made.id, type: "oidc", provider: p, providerAccountId: pid });
      check(`② ${p} 기존 계정 다음 로그인 — 동의 쿠키 없이 통과(재동의 강요 없음)`, (await signInGate(account, null)) === true);
    }
    check("② 아이디·비밀번호 로그인 — 동의 쿠키 없이 통과(기존 계정)", (await signInGate({ type: "credentials", provider: "credentials", providerAccountId: "x" }, null)) === true);

    const mailNo = await createEmailAccount({ email: EMAIL_MAIL, password: "fixture-pass-1234", name: "[fixture] 메일" }, null);
    check("② 이메일 동의 전 — 거부(동의 필요) · 계정 안 만듦", !mailNo.ok && mailNo.needConsent === true && (await prisma.user.count({ where: { email: EMAIL_MAIL } })) === 0, mailNo);
    const mailConsent = consentNow();
    const mailYes = await createEmailAccount({ email: ` ${EMAIL_MAIL.toUpperCase()} `, password: "fixture-pass-1234", name: "[fixture] 메일" }, mailConsent);
    const mailRow = mailYes.ok
      ? await prisma.user.findUnique({ where: { id: mailYes.userId }, select: { email: true, passwordHash: true, onboardingTrack: true, termsConsentAt: true, privacyConsentVersion: true, wallet: { select: { id: true } } } })
      : null;
    check("② 이메일 동의 후 — 계정(이메일 정리·비밀번호 해시·V3·가입 지갑) + 동의 칸·버전",
      mailYes.ok && mailRow?.email === EMAIL_MAIL && !!mailRow.passwordHash && mailRow.onboardingTrack === "V3" && !!mailRow.wallet &&
        mailRow.termsConsentAt?.getTime() === mailConsent.at.getTime() && mailRow.privacyConsentVersion === CURRENT_CONSENT_VERSION,
      { mailYes, mailRow });
    const dup = await createEmailAccount({ email: EMAIL_MAIL, password: "fixture-pass-1234", name: "x" }, consentNow());
    const short = await createEmailAccount({ email: "fixture-auth-short@lifebook.invalid", password: "short", name: "x" }, consentNow());
    check("② 이메일 — 같은 이메일·짧은 비밀번호는 옮기기 전과 같은 문구로 거부", !dup.ok && dup.error === "이미 사용 중인 이메일이에요." && !short.ok && short.error === "비밀번호는 8자 이상이어야 해요.");

    const creators = walk("app").concat(walk("lib")).filter((f) => /\buser\.(create|upsert)\(/.test(read(f)));
    check("② 계정 만드는 곳 = 이메일 가입(lib/email-signup) 하나 + 소셜 가입 어댑터(lib/auth-adapter createUser) — 둘 다 동의 확인",
      JSON.stringify(creators) === JSON.stringify(["lib/email-signup.ts"]) && read("lib/auth-adapter.ts").includes("if (!consent) throw"), creators);
    check("② auth.ts — 로그인 콜백 = signInGate(동의 쿠키) · 가입 뒤 동의 쿠키 지움",
      authTs.includes("return signInGate(account, await readSignupConsent());") && authTs.includes("(await cookies()).delete(SIGNUP_CONSENT_COOKIE);"));
    check("② 화면 연결 — /join 공개 경로 · 로그인 [회원가입] → /join · /signup 은 동의 없으면 /join · 동의 화면 → 쿠키 → 가입 방법",
      read("proxy.ts").includes(`"/join",`) && read("app/login/LoginCredentialsForm.tsx").includes(`href="/join"`) &&
        read("app/signup/page.tsx").includes(`redirect("/join?provider=email")`) && read("app/signup/actions.ts").includes(`redirect("/join?provider=email")`) &&
        read("app/join/actions.ts").includes("(await cookies()).set(SIGNUP_CONSENT_COOKIE, makeSignupConsentToken()"));
    check("② 기존 계정의 동의 게이트 그대로 — 동의 안 했거나 옛 버전이면 /consent(proxy)",
      read("proxy.ts").includes(`return NextResponse.redirect(new URL("/consent", req.url));`));
  } finally {
    await removeFixtures();
    await prisma.user.deleteMany({ where: { email: "fixture-auth-short@lifebook.invalid" } });
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: ALL_EMAILS } } }));
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
