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
  providers: [
    Google,
    // 카카오 닉네임 동의항목은 kakao_account.profile.nickname(신규) 또는
    // properties.nickname(레거시)로 내려온다. 둘 다 폴백 후 "카카오 사용자".
    // (id 는 number 라 toString — 기본 구현과 동일)
    Kakao({
      profile(profile) {
        return {
          id: profile.id.toString(),
          name:
            profile.kakao_account?.profile?.nickname ??
            profile.properties?.nickname ??
            "카카오 사용자",
          email: profile.kakao_account?.email,
          image:
            profile.kakao_account?.profile?.profile_image_url ??
            profile.properties?.profile_image,
        };
      },
    }),
    // 네이버 기본 profile() 은 name 에 별명(nickname)을 넣는다. 어르신은
    // 실명 표시가 자연스러워 회원이름(response.name) 우선 → 별명 폴백 →
    // "네이버 사용자" 폴백으로 매핑. (필드는 모두 profile.response.* 아래)
    Naver({
      profile(profile) {
        return {
          id: profile.response.id,
          name:
            profile.response.name ??
            profile.response.nickname ??
            "네이버 사용자",
          email: profile.response.email,
          image: profile.response.profile_image,
        };
      },
    }),
  ],
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
