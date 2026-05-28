import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

// Edge-safe Auth.js 설정 — 여기엔 Prisma import 가 없어야 미들웨어(Edge)에서
// 돌 수 있다. auth.ts(Node)와 proxy.ts(Edge)가 공통으로 이 설정을 펼쳐 쓴다.
// 한국 사용자용 카카오/네이버 provider 는 추후 추가 가능.
export default {
  providers: [Google],
  callbacks: {
    // session() 은 Node 인스턴스(auth.ts)와 Edge 인스턴스(proxy.ts)가 함께
    // 재사용한다. 이미 발급된 JWT 만 읽으므로 여기선 Prisma 를 안 쓴다.
    session({ session, token }) {
      if (token.sub) {
        session.user.id = token.sub;
      }
      session.consentComplete = token.consentComplete === true;
      return session;
    },
  },
} satisfies NextAuthConfig;
