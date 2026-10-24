// 오늘의 인터뷰 — 도그푸딩 접근 게이트(판정 로직만). lib/lab/gate.ts 와 같은 패턴.
//
// INTERVIEW_ALLOWED_USER_IDS="id1,id2" (쉼표 구분, userId 는 대소문자 그대로 비교).
// 미설정이면 아무도 통과 못 한다(/interview 전체가 404, /story-review 진입 카드 미노출).
// 호출마다 env 를 읽는다 — db/test-interview.ts 가 env 를 바꿔 가며 요청 컨텍스트 없이
// 그대로 검증하기 위함. prisma·auth 의존 0. auth() 래퍼는 lib/interview/access.ts.
//
// 게이트 2중(proxy.ts 는 PG 심사 기간 무수정):
//   ① 화면: app/interview/layout.tsx + page.tsx → notFound()
//   ② 서버 액션: app/interview/actions.ts 의 모든 액션 첫 줄 → requireInterviewUser() → throw

import { notFound } from "next/navigation";

function allowedIds(): string[] {
  return (process.env.INTERVIEW_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isInterviewUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return allowedIds().includes(userId);
}

// ② 서버 액션 층. 메시지는 기능의 존재를 드러내지 않는 일반 문구.
export class InterviewAccessError extends Error {
  constructor() {
    super("찾을 수 없어요.");
    this.name = "InterviewAccessError";
  }
}

export function assertInterviewUser(userId: string | null | undefined): string {
  if (!userId || !isInterviewUser(userId)) throw new InterviewAccessError();
  return userId;
}

// ① 화면 층. 비허용은 없는 주소와 구별되지 않게 일반 404.
export function enforceInterviewPage(userId: string | null | undefined): string {
  if (!userId || !isInterviewUser(userId)) notFound();
  return userId;
}
