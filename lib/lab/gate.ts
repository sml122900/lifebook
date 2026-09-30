// 기억 에이전트 연구 트랙 — /lab/memory 접근 게이트(판정 로직만).
//
// LAB_ALLOWED_USER_IDS="id1,id2" (쉼표 구분, userId 는 대소문자 그대로 비교).
// 미설정이면 아무도 통과 못 한다(연구실 전체가 404). 호출마다 env 를 읽는다 —
// db/test-lab-gate.ts 가 env 를 바꿔 가며 요청 컨텍스트 없이 그대로 검증하기 위함.
// prisma·auth 의존 0. auth() 를 부르는 얇은 래퍼는 lib/lab/access.ts.
//
// 게이트 2중(phase/기억에이전트_R1-R4_기획.md 결정 5 — proxy.ts 는 PG 심사 기간 무수정):
//   ① 화면: app/lab/memory/layout.tsx + 각 page.tsx → requireLabPage() → notFound()
//   ② 서버 액션: 모든 lab 액션 첫 줄 → requireLabUser()/requireLabSubject() → throw
// 대상 제한(결정 4): 허용 목록 AND (본인 OR "lab_persona_" 로 시작하는 가상 페르소나).

import { notFound } from "next/navigation";

export const LAB_PERSONA_PREFIX = "lab_persona_";

function allowedIds(): string[] {
  return (process.env.LAB_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isLabUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return allowedIds().includes(userId);
}

// 뷰어가 이 대상의 기억을 다뤄도 되는가. 다른 운영자 계정은 대상이 될 수 없다
// (허용 목록에 실수로 들어간 실계정의 색인을 막는다).
export function canAccessSubject(
  viewerId: string | null | undefined,
  subjectId: string | null | undefined,
): boolean {
  if (!viewerId || !subjectId) return false;
  if (!isLabUser(viewerId) || !isLabUser(subjectId)) return false;
  return subjectId === viewerId || subjectId.startsWith(LAB_PERSONA_PREFIX);
}

// 뷰어가 고를 수 있는 대상 목록(허용 목록 순서 유지).
export function labSubjectsFor(viewerId: string): string[] {
  return allowedIds().filter((id) => canAccessSubject(viewerId, id));
}

// ② 서버 액션 층. 메시지는 연구실의 존재를 드러내지 않는 일반 문구.
export class LabAccessError extends Error {
  constructor() {
    super("찾을 수 없어요.");
    this.name = "LabAccessError";
  }
}

export function assertLabUser(userId: string | null | undefined): string {
  if (!userId || !isLabUser(userId)) throw new LabAccessError();
  return userId;
}

export function assertLabSubject(viewerId: string, subjectId: string): void {
  if (!canAccessSubject(viewerId, subjectId)) throw new LabAccessError();
}

// ① 화면 층. 비허용은 없는 주소와 구별되지 않게 일반 404.
export function enforceLabPage(userId: string | null | undefined): string {
  if (!userId || !isLabUser(userId)) notFound();
  return userId;
}
