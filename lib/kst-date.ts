// 서버 렌더 날짜 표시 — 한국 시간(Asia/Seoul) 고정.
//
// 서버 컴포넌트는 Vercel(UTC)에서 그려져 timeZone 이 없으면 한국 시간 오전 9시
// 전의 시각이 전날로 보인다. 화면마다 쓰던 표기는 그대로 두고 시간대만 고정한다.
// 브라우저에서 그려지는 곳(클라이언트 컴포넌트)은 사용자 시간대가 적용돼 대상 아님.
// prisma·DOM 의존 0. 검증: db/test-kst-date.ts

function kst(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat("ko-KR", { ...options, timeZone: "Asia/Seoul" });
}

// 2026. 10. 25.
export const KST_DATE_FMT = kst({ year: "numeric", month: "2-digit", day: "2-digit" });

// 2026. 10. 25. 오전 08:30
export const KST_DATE_TIME_FMT = kst({
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// 2026. 1. 5. — toLocaleDateString("ko-KR") 기본 표기
export const KST_DATE_NUMERIC_FMT = kst({ year: "numeric", month: "numeric", day: "numeric" });

// 2026. 1. 5. 오전 8:30:00 — toLocaleString("ko-KR") 기본 표기
export const KST_DATE_TIME_FULL_FMT = kst({
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

// 2026년 10월 25일
export const KST_DATE_LONG_FMT = kst({ year: "numeric", month: "long", day: "numeric" });
