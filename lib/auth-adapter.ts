// Auth.js Prisma 어댑터 — auth.ts(Node)가 쓰고, 회귀(db/test-auth.ts)가 같은 객체를 부른다.
//
// 소셜 로그인 토큰 저장 최소화(2026-11-03 — docs/phase/my-life-restructure.md §16.2): 카카오·네이버·구글이 준
// access·refresh·id 토큰(과 만료·종류·범위·세션 상태)은 쓰는 곳이 0이다(세션은 JWT, 탈퇴 때 각 사업자 연결 끊기
// API 도 안 부름 — 탈퇴는 Account 행째 삭제). 그래서 Account 행에는 계정 식별(사업자·사업자 회원 식별값)만 남긴다.
// Auth.js 는 이미 있는 계정의 토큰을 다시 쓰지 않으므로(로그인마다 updateAccount 없음) linkAccount 하나만 감싸면 된다.

import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterAccount } from "next-auth/adapters";

import { prisma } from "./db";

const base = PrismaAdapter(prisma);

export const authAdapter: Adapter = {
  ...base,
  linkAccount: (account: AdapterAccount) =>
    base.linkAccount!({
      userId: account.userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
    } as AdapterAccount),
};
