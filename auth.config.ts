import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";

// Edge-safe Auth.js 설정 — 여기엔 Prisma import 가 없어야 미들웨어(Edge)에서
// 돌 수 있다. auth.ts(Node)와 proxy.ts(Edge)가 공통으로 이 설정을 펼쳐 쓴다.
// Kakao/Naver 는 어르신용. 키는 환경변수(AUTH_<PROVIDER>_ID/SECRET)로 Auth.js
// 가 자동 인식한다. Naver 는 developers.naver.com 한 앱의 키를 place-search
// 검색 API 와 공유한다(AUTH_NAVER_ID/SECRET).
export default {
  providers: [Google, Kakao, Naver],
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
