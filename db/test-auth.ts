// 인증 회귀 — docs/phase/my-life-restructure.md §16.2(B)·§16.3(C). LLM 0.
//
//   ① 소셜 로그인 토큰 저장 안 함(B) — 어댑터 linkAccount 가 계정 식별(사업자·사업자 회원 식별값)만 저장,
//      access·refresh·id 토큰·만료·종류·범위·세션 상태 칸은 비움 · auth.ts 가 그 어댑터를 씀
//   ② 가입 전 동의(C) — 서명 쿠키(유효·위조·만료·옛 버전) · 가입 수단별(카카오·네이버·구글·이메일):
//      동의 전 = 계정 미생성(소셜 = 로그인 콜백이 /join 으로 · 어댑터 createUser 거부 / 이메일 = 거부) ·
//      동의 후 = 동의 칸이 채워진 계정 · 기존 계정 로그인 = 동의 쿠키 없이 그대로(소셜·아이디) · 계정 만드는 곳 2곳뿐 ·
//      화면 연결(/join 공개 · 로그인 회원가입 링크 · /signup 은 동의 없으면 /join)
//   ③ 처리방침·약관 개정 공지(lib/policy-notice) — 공지 기간 경계(KST) · 시행일 = 공지일 + 7일 미만 거부 · 등록된 개정 규칙 통과 ·
//      닫기 기록 판마다 · 문구 · 화면 연결(헤더 아래 띠·처리방침 맨 위 줄)
//   ④ auth() 요청 단위 재사용(2026-11-05) — React cache 로 감싼 Node 인스턴스 · jwt 콜백은 그대로 DB 동의 상태를 읽음 ·
//      proxy 는 따로(Edge) 인스턴스 · 앱 호출은 전부 인자 없이 · 동의 흐름 코드(폼 → update() → /enter · ConsentSessionSync · /enter 게이트) 그대로.
//      화면 흐름(게이트·동의 직후 세션 갱신·쿠키만 옛 값·/enter)은 브라우저 실측으로 전후 같음 확인(docs 기록).
//   ⑤ 동의 화면 준비 전 잠금(2026-11-06) — 서버 그림의 체크칸 4개가 잠겨 있음(준비 전 클릭 무시) · /consent 준비 = 첫 세션 응답 뒤(update() 가
//      첫 세션을 받는 중이면 아무것도 안 함) · /join 준비 = 하이드레이션 뒤. 0초 제출 3회는 브라우저 실측(회귀 세트에 브라우저가 없어 docs 기록).
//      제출 뒤 실패(2026-11-07) — 세션 갱신 실패 = 오류 문구 + [다시 시도](갱신만 — 다시 저장 안 함) · 저장 실패 = 오류 문구 + 다시 제출. 네트워크를 끊은 경우는 브라우저 실측.
//   ⑥ 로그인 뒤 돌아가기(2026-11-08) — 돌아갈 주소 검사(우리 사이트 안 경로만 · 외부·//·백슬래시·로그인·가입·동의·/enter·API 거부) ·
//      proxy = 비로그인 GET 에 ?returnTo= · 로그인(소셜 3·이메일) = /enter?next= · /enter = 동의 확인 뒤 next 로. 체크칸 줄어듦·포커스 고리(shrink-0·공통 고리).
//   ⑦ 없는 주소(#11, 2026-11-08) — 로그인 전에도 로그인 화면 대신 404 안내: proxy 가 모르는 맨 위 경로는 그대로 보냄 ·
//      아는 경로 목록(lib/app-routes) = app/ 맨 위 폴더(코드 폴더 actions·components·fonts 제외)와 같음 · app/not-found 있음.
//
// 자체 픽스처 계정만 만들고 지운다(test30·실고객 접촉 0). 실행: npx tsx db/test-auth.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ConsentChecklist } from "../app/consent/ConsentChecklist";
import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { makeAuthAdapter } from "../lib/auth-adapter";
import { enterAfterLogin, safeLoginReturnTo, safeReturnTo } from "../lib/return-to";
import { APP_TOP_SEGMENTS } from "../lib/app-routes";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEmailAccount } from "../lib/email-signup";
import { activeNotice, formatNoticeDay, noticeClosedKey, noticeHref, noticeProblem, POLICY_NOTICES, SHORT_MAX, type PolicyNotice } from "../lib/policy-notice";
import { POLICY_NOTICE_COPY } from "../lib/policy-notice-copy";
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

    // ── ③ 처리방침·약관 개정 공지(2026-11-03 — lib/policy-notice, CLAUDE.md 작업 규칙 11) ──────
    const sample: PolicyNotice = { doc: "privacy", version: "v9.9", short: "예시 개정", detail: "예시 개정의 자세한 내용.", noticeDay: "2030-03-01", effectiveDay: "2030-03-08" };
    const at = (iso: string) => activeNotice(undefined, new Date(iso), [sample]);
    check("③ 공지 기간 — 공지일 0시(KST) 전 없음 · 공지일~시행일 전 '바뀌어요' · 시행일~7일 '바뀌었어요' · 그 뒤 없음",
      at("2030-02-28T23:59:59+09:00") === null && at("2030-03-01T00:00:00+09:00")?.phase === "before" && at("2030-03-07T23:59:59+09:00")?.phase === "before" &&
        at("2030-03-08T00:00:00+09:00")?.phase === "after" && at("2030-03-14T23:59:59+09:00")?.phase === "after" && at("2030-03-15T00:00:00+09:00") === null);
    const tooSoon = { ...sample, effectiveDay: "2030-03-07" };
    check("③ 시행일 = 공지일 + 7일 미만·띠용 짧은 요약 상한 넘음·상세 비어 있음·문서 종류 빠짐/모름 → 등록 오류 · 보이지 않음 · 문서별·여럿이면 가장 늦게 공지한 것",
      noticeProblem(tooSoon) !== null && noticeProblem(sample) === null &&
        noticeProblem({ ...sample, short: "가".repeat(SHORT_MAX + 1) }) !== null && noticeProblem({ ...sample, short: "가".repeat(SHORT_MAX) }) === null &&
        noticeProblem({ ...sample, detail: " " }) !== null &&
        noticeProblem({ ...sample, doc: undefined } as unknown as PolicyNotice) !== null && noticeProblem({ ...sample, doc: "faq" } as unknown as PolicyNotice) !== null &&
        activeNotice(undefined, new Date("2030-03-02T00:00:00+09:00"), [{ ...sample, doc: "faq" } as unknown as PolicyNotice]) === null && activeNotice(undefined, new Date("2030-03-02T00:00:00+09:00"), [tooSoon]) === null &&
        activeNotice("terms", new Date("2030-03-02T00:00:00+09:00"), [sample]) === null &&
        activeNotice(undefined, new Date("2030-03-03T00:00:00+09:00"), [sample, { ...sample, version: "v9.10", noticeDay: "2030-03-02", effectiveDay: "2030-03-09" }])?.version === "v9.10");
    check("③ 7일 간격 예외 — 성민 승인 사유(leadException)가 있을 때만 7일 미만 허용 · 빈 사유 = 예외 아님 · 시행일 < 공지일은 예외여도 거부 · 예외 등록 = 사유 있음",
      noticeProblem({ ...tooSoon, leadException: "예시 승인" }) === null && noticeProblem({ ...sample, effectiveDay: "2030-03-01", leadException: "예시 승인" }) === null &&
        noticeProblem({ ...tooSoon, leadException: " " }) !== null && noticeProblem({ ...sample, effectiveDay: "2030-02-28", leadException: "예시 승인" }) !== null &&
        POLICY_NOTICES.filter((n) => Date.parse(`${n.effectiveDay}T00:00:00+09:00`) - Date.parse(`${n.noticeDay}T00:00:00+09:00`) < 7 * 86400000).every((n) => (n.leadException ?? "").includes("성민")));
    check("③ 등록된 개정(POLICY_NOTICES) 전부 규칙 통과 · 처리방침 개정이면 개정 이력에 그 판·시행일",
      POLICY_NOTICES.every((n) => noticeProblem(n) === null) &&
        POLICY_NOTICES.filter((n) => n.doc === "privacy").every((n) => read("app/privacy/page.tsx").includes(`${n.version} — ${formatNoticeDay(n.effectiveDay)} 시행`)),
      POLICY_NOTICES.map((n) => [n.version, noticeProblem(n)]));
    check("③ 닫기 기록은 판마다 따로 · 띠 = 짧은 요약 + 시행일(상세 없음) · 처리방침 줄 = 문서 이름(판)·시행일·상세 · 버튼·가는 곳 = 문서별(처리방침 보기 → /privacy · 약관 보기 → /terms 맨 위 줄)",
      noticeClosedKey(sample) !== noticeClosedKey({ ...sample, version: "v9.10" }) &&
        POLICY_NOTICE_COPY.bar({ ...sample, phase: "before" }) === "예시 개정 · 3월 8일부터" && POLICY_NOTICE_COPY.bar({ ...sample, phase: "after" }) === "예시 개정 · 3월 8일부터 적용" &&
        POLICY_NOTICE_COPY.pageLine({ ...sample, phase: "before" }).includes("개인정보 처리방침(v9.9)은 2030년 3월 8일부터 시행됩니다. 예시 개정의 자세한 내용.") &&
        noticeHref(sample) === "/privacy#policy-notice" && read("app/privacy/page.tsx").includes("<p id={NOTICE_ANCHOR}") &&
        POLICY_NOTICE_COPY.more[sample.doc] === "처리방침 보기" && POLICY_NOTICE_COPY.more.terms === "약관 보기" && noticeHref({ doc: "terms" }) === "/terms#policy-notice" &&
        read("app/components/PolicyNoticeBar.tsx").includes("{C.more[notice.doc]}"));
    check("③ 화면 연결 — 로그인한 화면 헤더 아래 띠(root layout) · 처리방침·약관 맨 위 줄",
      read("app/layout.tsx").includes("const notice = session?.user ? activeNotice() : null;") && read("app/layout.tsx").includes("{notice && <PolicyNoticeBar notice={notice} />}") &&
        read("app/privacy/page.tsx").includes(`const notice = activeNotice("privacy");`) &&
        read("app/terms/page.tsx").includes(`const notice = activeNotice("terms");`) && read("app/terms/page.tsx").includes("<p id={NOTICE_ANCHOR}"));

    // ── ④ auth() 요청 단위 재사용(2026-11-05) — 한 그리기 요청 안에서는 jwt 콜백(DB 동의 상태·지갑)을 한 번만 ──────
    const authSrc = read("auth.ts");
    check("④ auth() = React cache 로 감싼 Node 인스턴스 auth(한 그리기 요청에 한 번) · 세션 갱신 경로(handlers — /api/auth/session)는 같은 인스턴스 그대로",
      authSrc.includes(`import { cache } from "react";`) && authSrc.includes("const { handlers, auth: authEveryCall, signIn, signOut } = NextAuth({") &&
        authSrc.includes("export { handlers, signIn, signOut };") && authSrc.includes("export const auth = cache(authEveryCall);") &&
        read("app/api/auth/[...nextauth]/route.ts").includes(`import { handlers } from "@/auth";`));
    check("④ jwt 콜백은 그대로 매번 DB 에서 동의 상태를 읽어 토큰에 실음(Edge 미들웨어가 쿠키만 보고 판단) · proxy 는 auth.config 로 만든 따로 인스턴스(auth.ts 안 씀)",
      authSrc.includes("async jwt({ token }) {") && authSrc.includes("const user = await prisma.user.findUnique({") &&
        authSrc.includes("token.consentVersion = user?.privacyConsentVersion ?? 0;") && authSrc.includes("await ensureWalletWithSignupGrant(token.sub);") &&
        !/from "\.\/auth"/.test(read("proxy.ts")) && read("proxy.ts").includes(`import authConfig from "./auth.config";`));
    // 앱의 auth() 는 모두 인자 없이(cache 기억 열쇠 = 인자 — 미들웨어·핸들러 감싸기 꼴은 쓰지 않음)
    const withArgs = ["app", "lib", "components"].flatMap(walk).filter((f) => /from "@\/auth"/.test(read(f)) && /[^.\w]auth\([^)]/.test(read(f)));
    check("④ 앱의 auth() 호출은 전부 인자 없이(cache 열쇠가 하나) · 동의 흐름 코드 그대로(동의 폼 = 저장 → update() → /enter · 쿠키가 옛 값이면 ConsentSessionSync = update() → /enter · /enter = 세션 동의 버전 < 지금 → /consent)",
      withArgs.length === 0 &&
        read("app/consent/ConsentForm.tsx").includes("await saveConsent(formData);") && read("app/consent/ConsentForm.tsx").includes("const session = await update();") && read("app/consent/ConsentForm.tsx").includes(`router.push("/enter");`) &&
        read("app/consent/ConsentSessionSync.tsx").includes(`void update().finally(() => router.replace("/enter"));`) &&
        read("app/enter/page.tsx").includes(`if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");`),
      withArgs);

    // ── ⑤ 동의 화면 준비 전 잠금 ──────
    const countDisabled = (ready: boolean) =>
      (renderToStaticMarkup(createElement(ConsentChecklist, { checked: {}, onChange: () => {}, ready })).match(/<input[^>]*type="checkbox"[^>]*>/g) ?? []).filter((t) => t.includes(` disabled=""`)).length;
    check("⑤ 준비 전 그림 — 체크칸 4개 전부 잠김(브라우저가 클릭을 받지 않음) · 준비 뒤 0개", countDisabled(false) === 4 && countDisabled(true) === 0, [countDisabled(false), countDisabled(true)]);
    const consentSrc = read("app/consent/ConsentForm.tsx");
    check("⑤ /consent — 준비 = 첫 세션 응답 뒤 · 제출 가능 = 준비 + 모두 동의 · 체크칸에 전달", consentSrc.includes(`const ready = status !== "loading";`) && consentSrc.includes("const canSubmit = ready && allConsentChecked(checked);") && consentSrc.includes(`ready={ready && phase !== "syncFailed"}`));
    check("⑤ /consent 제출 뒤 실패 — 세션 갱신 실패 = syncFailed(저장은 한 번만, 다시 시도 = syncSession 만) · 저장 실패 = saveFailed · 멈춤 없음 · 문구 [임시]",
      (consentSrc.match(/saveConsent\(/g) ?? []).length === 1 && consentSrc.includes("if (!session) {") && consentSrc.includes('setPhase("syncFailed");') && consentSrc.includes('setPhase("saveFailed");') &&
        consentSrc.includes("onClick={syncSession}") && consentSrc.includes("{JOIN_COPY.retry}") &&
        read("lib/join-copy.ts").split("\n").filter((l) => /^  (saveFailed|syncFailed|retry):/.test(l) && l.includes("[임시")).length === 3);
    const joinSrc = read("app/join/JoinForm.tsx");
    check("⑤ /join — 준비 = 하이드레이션 뒤(서버 그림 false) · 체크칸에 전달 · 안내 문구", joinSrc.includes("const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);") && joinSrc.includes("ready={ready}") && joinSrc.includes("C.preparing"));
    const boxes = renderToStaticMarkup(createElement(ConsentChecklist, { checked: {}, onChange: () => {}, ready: true })).match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
    check("⑤ 체크칸 4개 — 줄어들지 않음(shrink-0) · 공통 포커스 고리", boxes.length === 4 && boxes.every((t) => t.includes("shrink-0") && t.includes("focus-visible:ring-4 focus-visible:ring-brand")), boxes.length);

    // ── ⑥ 로그인 뒤 돌아가기 ──────
    const okPaths = ["/shop/poster/order", "/my-life?focus=pe:abc", "/invite/tok123", "/interview"];
    const badPaths = ["https://evil.com", "//evil.com", String.raw`/\evil.com`, String.raw`/\/evil.com`, String.raw`\\evil.com`,"javascript:alert(1)", "evil.com", "", "/login", "/login?returnTo=/x", "/join", "/signup", "/consent", "/enter?next=/x", "/api/auth/session", "/"];
    check("⑥ 돌아갈 주소 — 우리 사이트 안 경로는 그대로", okPaths.every((p) => safeLoginReturnTo(p) === p), okPaths.map((p) => safeLoginReturnTo(p)));
    check("⑥ 돌아갈 주소 — 외부·프로토콜 상대(//)·백슬래시·로그인·가입·동의·/enter·API·첫 화면은 거부", badPaths.every((p) => safeLoginReturnTo(p) === null), badPaths.filter((p) => safeLoginReturnTo(p) !== null));
    check("⑥ safeReturnTo(인물 새로 만들기 returnTo 와 공용) — 외부 거부·내부 통과", safeReturnTo("//evil.com") === null && safeReturnTo("/life-record") === "/life-record");
    check("⑥ 로그인 뒤 갈 곳 = /enter(+ next 인코딩)", enterAfterLogin(null) === "/enter" && enterAfterLogin("/shop/poster/order?x=1") === "/enter?next=%2Fshop%2Fposter%2Forder%3Fx%3D1");
    const proxySrc = read("proxy.ts"), loginSrc = read("app/login/page.tsx"), enterSrc = read("app/enter/page.tsx");
    check("⑥ 연결 — proxy(비로그인 GET → ?returnTo=) · 로그인 소셜 3·이메일 = afterLogin · /enter = 동의 확인 뒤 next",
      proxySrc.includes(`req.method === "GET" ? safeLoginReturnTo(pathname + req.nextUrl.search) : null`) && proxySrc.includes(`login.searchParams.set("returnTo", back)`) &&
        (loginSrc.match(/redirectTo: afterLogin/g) ?? []).length === 3 && loginSrc.includes("safeLoginReturnTo(sp.returnTo ?? sp.callbackUrl)") && loginSrc.includes("<LoginCredentialsForm returnTo={returnTo} />") &&
        read("app/login/actions.ts").includes(`enterAfterLogin(safeLoginReturnTo(formData.get("returnTo") as string | null))`) &&
        enterSrc.indexOf("redirect(\"/consent\")") < enterSrc.indexOf("if (next) redirect(next);") && enterSrc.includes("const next = safeLoginReturnTo((await searchParams).next);"));

    // ⑦ 없는 주소(#11)
    const appDirs = fs
      .readdirSync(path.resolve(__dirname, "..", "app"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !["actions", "components", "fonts"].includes(d.name) && !/^[_(]/.test(d.name))
      .map((d) => d.name)
      .sort();
    const proxy7 = read("proxy.ts");
    check("⑦ 없는 주소 — 아는 맨 위 경로 목록 = app/ 맨 위 폴더 · proxy 가 로그인 전 모르는 경로는 그대로(로그인 화면 아님) · app/not-found",
      JSON.stringify([...APP_TOP_SEGMENTS].sort()) === JSON.stringify(appDirs) &&
        proxy7.includes(`if (!APP_TOP_SEGMENTS.has(pathname.split("/")[1] ?? "")) return;`) &&
        proxy7.indexOf("APP_TOP_SEGMENTS.has(") < proxy7.indexOf('new URL("/login", req.url)') &&
        fs.existsSync(path.resolve(__dirname, "..", "app/not-found.tsx")),
      { only목록: [...APP_TOP_SEGMENTS].filter((x) => !appDirs.includes(x)), only폴더: appDirs.filter((x) => !APP_TOP_SEGMENTS.has(x)) });
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
