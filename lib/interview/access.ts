// 오늘의 인터뷰 — 게이트의 auth() 래퍼(서버 전용). 판정은 lib/interview/gate.ts(순수).

import { auth } from "@/auth";

import { assertInterviewUser, enforceInterviewPage } from "./gate";

async function sessionUserId(): Promise<string | undefined> {
  const session = await auth();
  return session?.user?.id;
}

// ① 화면 층 — app/interview/layout.tsx 가 부른다.
export async function requireInterviewPage(): Promise<string> {
  return enforceInterviewPage(await sessionUserId());
}

// ② 서버 액션 층 — app/interview/actions.ts 의 모든 액션 첫 줄.
export async function requireInterviewUser(): Promise<string> {
  return assertInterviewUser(await sessionUserId());
}
