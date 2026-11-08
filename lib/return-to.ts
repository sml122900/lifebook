// 돌아갈 주소(returnTo) 검사 — 순수 모듈(Edge proxy·서버 컴포넌트·서버 액션·회귀 공용, 의존 0).
//
// open redirect 차단: 우리 사이트 안 상대 경로만 받는다. URL 객체로 정규화한 뒤 원본과 모양이 같은지 확인 —
// 백슬래시·다중 슬래시("//evil.com")·인코딩 우회는 정규화하면 원본과 달라지거나 origin 이 바뀌어 거부된다.
// (원래 app/people/new 의 safeReturnTo — 2026-11-08 로그인 뒤 돌아오기에도 쓰려고 여기로 옮김.)
//
// 로그인·가입·동의·분기 화면과 API 는 돌아갈 곳으로 받지 않는다(로그인 뒤 다시 로그인 화면 같은 고리 방지).

const NOT_RETURNABLE = new Set(["/login", "/signup", "/join", "/consent", "/enter"]);

export function safeReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // 최소 가드: / 로 시작 안 하면 무조건 거부 (relative 만 허용).
  if (!raw.startsWith("/")) return null;
  try {
    const dummy = "http://internal.local";
    const u = new URL(raw, dummy);
    if (u.origin !== dummy) return null; // 외부 호스트 우회 차단
    const reconstructed = u.pathname + u.search + u.hash;
    if (reconstructed !== raw) return null; // 정규화로 모양 바뀐 경우 거부
    return reconstructed;
  } catch {
    return null;
  }
}

// 로그인 뒤 돌아갈 주소 — safeReturnTo 를 통과하고 로그인·가입·동의·분기 화면·API 가 아닌 것만.
export function safeLoginReturnTo(raw: string | null | undefined): string | null {
  const path = safeReturnTo(raw);
  if (!path) return null;
  const pathname = path.split(/[?#]/)[0];
  if (pathname === "/" || NOT_RETURNABLE.has(pathname) || pathname.startsWith("/api/")) return null;
  return path;
}

// 로그인 성공 뒤 갈 곳 — 늘 /enter(동의·트랙 분기)를 거치고, 돌아갈 주소가 있으면 next 로 넘긴다.
export function enterAfterLogin(returnTo: string | null): string {
  return returnTo ? `/enter?next=${encodeURIComponent(returnTo)}` : "/enter";
}
