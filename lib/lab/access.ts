// 기억 에이전트 연구 트랙 — 게이트의 auth() 래퍼(서버 전용).
//
// 판정은 전부 lib/lab/gate.ts(순수)에 있고, 여기선 세션의 userId 만 넘긴다.
// db/test-lab-gate.ts 가 판정 로직은 직접, 이 배선은 소스 정적 검사로 확인한다.

import { auth } from "@/auth";

import { assertLabSubject, assertLabUser, enforceLabPage } from "./gate";

async function sessionUserId(): Promise<string | undefined> {
  const session = await auth();
  return session?.user?.id;
}

// ① 화면 층 — app/lab/memory 의 layout.tsx 와 모든 page.tsx 가 부른다.
export async function requireLabPage(): Promise<string> {
  return enforceLabPage(await sessionUserId());
}

// ② 서버 액션 층 — 모든 lab 서버 액션의 첫 줄.
export async function requireLabUser(): Promise<string> {
  return assertLabUser(await sessionUserId());
}

// ② 대상(subjectId)을 받는 lab 서버 액션의 첫 줄 — 대상 제한까지 검사.
export async function requireLabSubject(
  subjectId: string,
): Promise<{ viewerId: string; subjectId: string }> {
  const viewerId = assertLabUser(await sessionUserId());
  assertLabSubject(viewerId, subjectId);
  return { viewerId, subjectId };
}
