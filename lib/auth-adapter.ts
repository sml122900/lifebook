// Auth.js Prisma 어댑터 — auth.ts(Node)가 쿠키 읽는 함수를 넣어 만들고, 회귀(db/test-auth.ts)가 같은 함수로 만든다.
//
// ① 소셜 로그인 토큰 저장 최소화(2026-11-03 — docs/phase/my-life-restructure.md §16.2): 카카오·네이버·구글이 준
//    access·refresh·id 토큰(과 만료·종류·범위·세션 상태)은 쓰는 곳이 0이다(세션은 JWT, 탈퇴 때 각 사업자 연결 끊기
//    API 도 안 부름 — 탈퇴는 Account 행째 삭제). 그래서 Account 행에는 계정 식별(사업자·사업자 회원 식별값)만 남긴다.
//    Auth.js 는 이미 있는 계정의 토큰을 다시 쓰지 않으므로(로그인마다 updateAccount 없음) linkAccount 하나만 감싸면 된다.
// ② 동의 없이 계정을 만들지 않는다(2026-11-03 — §16.3): 소셜 가입의 계정 생성(createUser)은 가입 전 동의(서명 쿠키 —
//    lib/signup-consent)가 있을 때만, 동의 칸을 같은 insert 로 채워서. 없으면 던진다(계정 0). 정상 흐름에선 그 전에
//    로그인 콜백(signInGate)이 동의 화면으로 보내 여기까지 오지 않는다 — 이건 마지막 방어.

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount, AdapterUser } from "next-auth/adapters";

import { prisma } from "./db";
import { signupConsentFields, type SignupConsent } from "./signup-consent";

const base = PrismaAdapter(prisma);

export function makeAuthAdapter(readConsent: () => Promise<SignupConsent | null>): Adapter {
  return {
    ...base,
    createUser: async (user: AdapterUser) => {
      const consent = await readConsent();
      if (!consent) throw new Error("가입 전 동의 없음 — 계정을 만들지 않음(/join)");
      return base.createUser!({ ...user, ...signupConsentFields(consent) } as AdapterUser);
    },
    linkAccount: (account: AdapterAccount) =>
      base.linkAccount!({
        userId: account.userId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      } as AdapterAccount),
  };
}
