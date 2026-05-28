// Auth.js v5 (NextAuth) — Node 런타임 인스턴스.
// Prisma 어댑터로 DB 의 User/Account/Session 을 관리하고, JWT 에 "동의 완료
// 여부"를 실어 Edge 미들웨어(proxy.ts)가 DB 접근 없이 리다이렉트를 판단하게
// 한다. Edge 전용 인스턴스는 proxy.ts 가 auth.config 만으로 따로 만든다
// (Edge 런타임에선 Prisma 를 못 쓰기 때문).
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";

import authConfig from "./auth.config";
import { prisma } from "./lib/db";
import { ensureWalletWithSignupGrant } from "./lib/tokens/wallet";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" }, // DB 세션 대신 JWT — Edge 미들웨어가 읽기 쉬움
  ...authConfig,
  events: {
    // Auth.js 는 PrismaAdapter 가 사용자를 처음 insert 할 때 createUser 를
    // 정확히 한 번 발생시킨다. Phase 8.2 신규 가입 토큰 지급이 여기서 일어나며,
    // ensureWalletWithSignupGrant 는 idempotent 이라 계정 연결 같은 엣지로
    // 예기치 않게 또 불려도 지급은 한 번만 된다.
    async createUser({ user }) {
      if (user.id) {
        await ensureWalletWithSignupGrant(user.id);
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
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
          },
        });
        // 세 가지 동의(개인정보·국외이전·약관)가 모두 있어야 동의 완료.
        token.consentComplete = !!(
          user?.privacyConsentAt &&
          user?.overseasTransferConsentAt &&
          user?.termsConsentAt
        );

        // Phase 8.2 이전에 이미 존재하던 사용자 보정 (그들은 createUser 가
        // 이미 발생했으므로 지갑이 없을 수 있음). idempotent — 이미 지갑이
        // 있으면 SELECT 한 번으로 끝난다.
        await ensureWalletWithSignupGrant(token.sub);
      }
      return token;
    },
  },
});
