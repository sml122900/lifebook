# 결정 — 다크모드를 CSS 변수 swap 으로 (컴포넌트 0건 수정)

## Problem

사용자 요청으로 라이트/다크 모드 토글이 필요. 기존 코드베이스에 100+ 군데에서
`bg-white`, `text-zinc-900`, `border-zinc-200`, `bg-amber-50` 같은 Tailwind
유틸이 산재. Tailwind 의 표준 다크 패턴은:

```tsx
<div className="bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
```

이걸 100+ 군데에 적용하면:
- 회귀 위험 큼 (한 곳 빠뜨리면 다크에서 흰 카드)
- 시간 많이 듦
- 향후 디자인 변경 시 두 색을 같이 관리해야

핵심 통찰: **Tailwind v4 의 모든 색 유틸은 `var(--color-*)` CSS 변수를 참조**.
변수 자체를 `.dark` scope 에서 redefine 하면 컴포넌트 파일 무수정으로 일괄
전환 가능.

## Action

### `app/globals.css` 한 파일만 수정

```css
@import "tailwindcss";

/* class-based dark mode */
@custom-variant dark (&:where(.dark, .dark *));

.dark {
  color-scheme: dark;

  /* 중립 토큰 — bg-white / text-zinc-900 등이 자동 반전 */
  --color-white: oklch(0.205 0 0);   /* 카드/페이지 표면 */
  --color-black: oklch(0.97 0 0);    /* 본문 텍스트 */
  --color-zinc-50: oklch(0.18 0 0);
  --color-zinc-100: oklch(0.22 0 0);
  --color-zinc-200: oklch(0.28 0 0); /* 보더 */
  --color-zinc-300: oklch(0.34 0 0);
  --color-zinc-400: oklch(0.5 0 0);
  --color-zinc-500: oklch(0.6 0 0);
  --color-zinc-600: oklch(0.72 0 0);
  --color-zinc-700: oklch(0.82 0 0);
  --color-zinc-800: oklch(0.9 0 0);
  --color-zinc-900: oklch(0.97 0 0);
}
```

### 의미색 50↔950 대칭 swap (1차 시도 후 발견한 빈 자리)

첫 시도는 zinc/white/black 만 뒤집고 끝. 사용자가 화면 캡처 보내옴: **회원 탈퇴
페이지의 `bg-rose-50` 카드 안에 글자가 안 보임**.

원인:
- `bg-rose-50` 의미색은 swap 안 했음 → 옅은 분홍 그대로
- 카드 안 `text-zinc-900` 은 swap 됨 → 옅은 회색
- 옅은 분홍 위 옅은 회색 = 안 보임

수정: 의미색 (rose/amber/emerald/sky/violet/blue) 도 **50↔950, 100↔900,
200↔800, 300↔700, 400↔600** 대칭 swap. 코드에서 실제 쓰는 shade만 enumerate.

```css
.dark {
  /* 의미색 — 카드 자체가 다크 톤이 되어 내부 text-zinc-900 (밝아진) 과
     대비 회복 */
  --color-rose-50: oklch(0.271 0.105 12.094);   /* deep dark rose */
  --color-rose-200: oklch(0.455 0.188 13.697);
  --color-rose-700: oklch(0.810 0.117 11.638);
  --color-rose-900: oklch(0.941 0.030 12.580);  /* pale rose */
  /* amber/emerald/sky/violet/blue 같은 패턴 */
}
```

### 토글 메커니즘

```ts
// app/components/theme-actions.ts (server action)
export async function setTheme(next: "light" | "dark") {
  const c = await cookies();
  c.set("lifebook-theme", next, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

// app/layout.tsx (server component)
const theme = await getTheme();  // 쿠키 읽음
return <html className={theme === "dark" ? "h-full antialiased dark" : "h-full antialiased"}>
```

쿠키 기반 + SSR `<html>` 주입 → **JS 없이도 작동 + 깜빡임 0**. ThemeToggle 은
form action 으로 server action 호출.

### input/textarea/select 강제 다크

`color-scheme: dark` 만으로는 Windows Chrome 의 일부 unstyled `<input>` 이 흰 배경 유지.
명시적 일괄 규칙 추가:

```css
.dark input[type="text"],
.dark input[type="email"],
.dark input[type="number"],
.dark textarea,
.dark select {
  background-color: oklch(0.22 0 0);
  color: oklch(0.97 0 0);
}
.dark input::placeholder,
.dark textarea::placeholder {
  color: oklch(0.65 0 0);
}
```

## Result

### 회귀 0건

전체 페이지 (홈/타임라인/가족 룸/탈퇴/회원정보/설정/타임머신) 가 라이트→다크
즉시 일관 톤. 컴포넌트 파일 한 줄도 안 건드림. `git diff --name-only`:

```
app/globals.css         (CSS 변수)
app/layout.tsx          (html className)
app/components/ThemeToggle.tsx + theme-actions.ts (신규)
```

### 컴파일 산출 검증

```
.bg-white      { background-color: var(--color-white) }       /* 그대로 */
.bg-rose-50    { background-color: var(--color-rose-50) }      /* 그대로 */
.text-zinc-900 { color: var(--color-zinc-900) }                /* 그대로 */

.dark {
  --color-white: #171717;
  --color-rose-50: #4d0218;   /* deep dark rose */
  --color-zinc-900: #f5f5f5;  /* light text */
}
```

### 트레이드오프

- **500 (채도 중심) 은 그대로** — 버튼 hover 색 등은 라이트/다크 동일. 적정.
- **동적 클래스 보간 금지** — `bg-${color}-50` 같이 쓰면 Tailwind 정적 분석이
  못 잡음. 모든 클래스를 리터럴 문자열로 enumerate 해야 (SongCard 의
  `ERA_PALETTES` 도 같은 원칙).
- **Turbopack CSS HMR 부재** — globals.css 변경이 자동 반영 안 됨. `.next`
  삭제 + 완전 재시작 필요. 별도 트러블슈팅 문서 참조
  (`docs/troubleshooting/turbopack-css-stale.md`).
- **반전 강도 100%** — 시각적으로 강한 다크. 추후 디자이너가 손대고 싶으면 OKLCH
  명도값만 조정.

### 일반화된 학습

**"디자인 토큰 = 변수, 컴포넌트 = 토큰 참조"** 패턴이 Tailwind v4 에서
실현 가능. 100+ 컴포넌트에 `dark:` prefix 가 아니라 변수 정의만 손대면
일괄 전환. 의미색까지 swap 하면 추가 케어 없이 카드 톤 일관성 유지.

다음 디자인 변경 (브랜드 컬러 변경, 시즌 테마 등) 도 같은 방식으로 0 churn
처리 가능.
