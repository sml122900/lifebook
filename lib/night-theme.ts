// 밤 우주 단일 테마 — 1단계 허용 목록(docs/phase/ui-night.md §5 N1, Q145). 판정만(순수 — prisma·auth 의존 0).
//
// NIGHT_THEME_USER_IDS="id1,id2" (쉼표 구분, userId 그대로 비교). 미설정이면 아무도 밤이 아니다(전원 지금 밝은 화면).
// 루트 레이아웃(app/layout.tsx)이 서버에서 <html data-theme="night"> 를 그려 첫 그림부터 밤이다(깜빡임 0 — 클라이언트 스크립트 없음).
// 전원 전환(N4)에서 이 목록과 밝은 값을 함께 지운다. 호출마다 env 를 읽는다(회귀가 env 를 바꿔 가며 확인 — lib/lab/gate.ts 와 같은 방식).

function allowedIds(): string[] {
  return (process.env.NIGHT_THEME_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isNightThemeUser(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return allowedIds().includes(userId);
}
