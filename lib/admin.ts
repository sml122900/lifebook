// 관리자 게이트 — ADMIN_EMAILS 환경변수 화이트리스트.
//
// role/isAdmin 컬럼 없이 이메일 일치로 판정(소수 운영자 가정). prisma·DOM
// 의존 0 이라 Edge(proxy.ts)·Node(서버 컴포넌트/액션) 양쪽에서 쓴다.
// ADMIN_EMAILS="a@x.com,b@y.com" (쉼표 구분). 미설정이면 아무도 관리자 아님.

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
