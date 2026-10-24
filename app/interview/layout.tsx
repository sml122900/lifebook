import { requireInterviewPage } from "@/lib/interview/access";

// 오늘의 인터뷰 — 도그푸딩 허용 목록 계정만(INTERVIEW_ALLOWED_USER_IDS, lib/interview/gate.ts).
// 비허용 로그인 사용자는 없는 주소와 똑같은 404, 비로그인은 기존 proxy 로그인 게이트가
// 먼저 막는다. lab 게이트와 같은 패턴 — 레이아웃은 클라이언트 이동 때 다시 실행되지 않을
// 수 있어 page.tsx 도 직접 게이트를 부른다(db/test-interview.ts 가 정적 검사로 강제).
export default async function InterviewLayout({ children }: { children: React.ReactNode }) {
  await requireInterviewPage();
  return children;
}
