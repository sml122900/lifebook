"use server";

// v3 P6 — 인물 모드. 실제 로직은 lib/person-chat.ts(순수, auth 없음) — 검증
// 스크립트(db/test-*.ts)가 같은 함수를 그대로 호출해 재현본 드리프트를
// 막는다(lib/account-deletion.ts 와 같은 패턴). 이 파일은 auth 게이트만.

import { auth } from "@/auth";
import {
  submitPersonAnswer as submitPersonAnswerCore,
  getPersonEpisodeTarget as getPersonEpisodeTargetCore,
  type SubmitPersonAnswerResult,
  type PersonEpisodeTarget,
} from "@/lib/person-chat";

// docs/troubleshooting/use-server-class-export.md — "use server" 파일은
// export type {X} 재노출을 "import type + 로컬 export type" 두 단계로 하면
// Turbopack 이 action 참조로 오인해 빌드 실패(다른 화면이 이 타입을 이름으로
// import 할 때만 표면화). "export type {X} from 모듈" 한 문장 형태만 안전.
export type { SubmitPersonAnswerResult, PersonEpisodeTarget } from "@/lib/person-chat";

async function requireUserId(expected: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || userId !== expected) throw new Error("Unauthorized");
  return userId;
}

export async function submitPersonAnswer(
  userId: string,
  lifeEventId: string,
  question: string,
  answer: string,
): Promise<SubmitPersonAnswerResult> {
  await requireUserId(userId);
  return submitPersonAnswerCore(userId, lifeEventId, question, answer);
}

export async function getPersonEpisodeTarget(
  userId: string,
  lifeEventId: string,
  personId: string,
): Promise<PersonEpisodeTarget> {
  await requireUserId(userId);
  return getPersonEpisodeTargetCore(userId, lifeEventId, personId);
}
