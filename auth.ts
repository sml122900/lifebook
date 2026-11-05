// Auth.js v5 (NextAuth) — Node 런타임 인스턴스.
// Prisma 어댑터로 DB 의 User/Account/Session 을 관리하고, JWT 에 "동의 완료
// 여부"를 실어 Edge 미들웨어(proxy.ts)가 DB 접근 없이 리다이렉트를 판단하게
// 한다. Edge 전용 인스턴스는 proxy.ts 가 auth.config 만으로 따로 만든다
// (Edge 런타임에선 Prisma 를 못 쓰기 때문).
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { cache } from "react";

import authConfig from "./auth.config";
import { makeAuthAdapter } from "./lib/auth-adapter";
import { prisma } from "./lib/db";
import { readSignupConsentToken, signInGate, SIGNUP_CONSENT_COOKIE } from "./lib/signup-consent";
import { ensureWalletWithSignupGrant } from "./lib/tokens/wallet";

// 가입 전 동의(서명 쿠키 — /join 이 심음, 2026-11-03 docs/phase/my-life-restructure.md §16.3). 소셜 가입은 이 동의가 있어야
// 계정이 생긴다(로그인 콜백 signInGate + 어댑터 createUser 두 겹). 이미 있는 계정의 로그인은 쿠키를 보지 않는다.
async function readSignupConsent() {
  return readSignupConsentToken((await cookies()).get(SIGNUP_CONSENT_COOKIE)?.value);
}

const { handlers, auth: authEveryCall, signIn, signOut } = NextAuth({
  adapter: makeAuthAdapter(readSignupConsent), // 소셜 토큰 저장 안 함 · 동의 없이 계정 안 만듦(lib/auth-adapter)
  session: { strategy: "jwt" }, // DB 세션 대신 JWT — Edge 미들웨어가 읽기 쉬움
  ...authConfig,
  // Credentials 는 Node-only (bcrypt + Prisma) — auth.config.ts(Edge) 엔 넣지 않음.
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === "string" ? credentials.email : null;
        const password =
          typeof credentials?.password === "string"
            ? credentials.password
            : null;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
          },
        });
        if (!user?.passwordHash) return null; // OAuth 전용 계정
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  events: {
    // Auth.js 는 PrismaAdapter 가 사용자를 처음 insert 할 때 createUser 를
    // 정확히 한 번 발생시킨다. Phase 8.2 신규 가입 토큰 지급이 여기서 일어나며,
    // ensureWalletWithSignupGrant 는 idempotent 이라 계정 연결 같은 엣지로
    // 예기치 않게 또 불려도 지급은 한 번만 된다.
    async createUser({ user }) {
      // 가입 동의 쿠키는 한 번만 — 같은 기기에서 다음 사람이 그 동의로 가입하지 않게 지운다(남아도 20분 뒤 만료).
      try {
        (await cookies()).delete(SIGNUP_CONSENT_COOKIE);
      } catch (e) {
        console.error("[auth] 가입 동의 쿠키 지우기 실패(만료로 정리됨)", e);
      }
      if (user.id) {
        await ensureWalletWithSignupGrant(user.id);
        // v3 P17 — 소셜(카카오/네이버/구글) 신규 가입은 V3 파이프라인.
        // 이 업데이트가 실패해도 스키마 기본값(V2)으로 안전하게 떨어지므로
        // (fail-safe) throw 하지 않지만, 조용히 묻히면 원인 추적이 안 되므로
        // 실패 로그는 남긴다.
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { onboardingTrack: "V3" },
          });
        } catch (e) {
          console.error("[auth] onboardingTrack V3 지정 실패, V2로 유지됨", user.id, e);
        }
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // 소셜 로그인 — 계정을 만들기 전에 돈다(@auth/core callback: signIn 판정 → handleLoginOrRegister). 이미 있는 계정이면
    // 통과, 새 계정이면 가입 전 동의가 있어야 통과, 없으면 계정을 만들지 않고 /join?provider= 로(lib/signup-consent signInGate).
    async signIn({ account }) {
      return signInGate(account, await readSignupConsent());
    },
    // Node 전용: DB 의 동의 상태를 JWT 토큰에 실어둔다 → Edge 미들웨어가
    // Prisma 를 건드리지 않고 리다이렉트를 결정할 수 있게.
    async jwt({ token }) {
      if (token.sub) {
        const user = await prisma.user.findUnique({
          where: { id: token.sub },
          select: {
            privacyConsentAt: true,
            overseasTransferConsentAt: true,
            termsConsentAt: true,
            privacyConsentVersion: true,
          },
        });
        // 세 가지 동의(개인정보·국외이전·약관)가 모두 있어야 동의 완료.
        token.consentComplete = !!(
          user?.privacyConsentAt &&
          user?.overseasTransferConsentAt &&
          user?.termsConsentAt
        );
        // 버전 — null(신규 행 아직 없음) 이면 0으로 처리해 게이트에서 /consent 유도.
        token.consentVersion = user?.privacyConsentVersion ?? 0;

        // Phase 8.2 이전에 이미 존재하던 사용자 보정 (그들은 createUser 가
        // 이미 발생했으므로 지갑이 없을 수 있음). idempotent — 이미 지갑이
        // 있으면 SELECT 한 번으로 끝난다.
        await ensureWalletWithSignupGrant(token.sub);
      }
      return token;
    },
  },
});

export { handlers, signIn, signOut };

// auth() — 한 요청(서버 컴포넌트 그리기) 안에서는 한 번만 부르고 결과를 같이 쓴다(React cache). 위 jwt 콜백이 부를 때마다
// DB 를 읽어서(동의 상태 — Edge 미들웨어가 쿠키만 보고 판단하게 토큰을 늘 최신으로 · 옛 사용자 지갑 보정) 화면 하나에서
// 여러 번 부르면 왕복이 그만큼 늘었다(2026-11-05 측정: My Life 첫 화면 auth 조회 7~8 · 이야기 글 저장 11).
// 그리기 요청마다 새로 한 번은 읽으므로 그 요청이 보는 동의 상태는 지금과 같다. 세션 갱신(/api/auth/session — 동의 직후
// update()·ConsentSessionSync)은 handlers 가 따로 처리해 이 기억과 무관하다. 인자 없이 부르는 꼴만 쓴다.
// proxy.ts 는 auth.config 로 만든 Edge 인스턴스 — 이것과 무관.
export const auth = cache(authEveryCall);
