// 이야기 제목 표시 — "제목 없음" 판정은 이 한 곳. 클라이언트·서버 공용 순수 모듈.
// 제목 칸(브릿지 UserMemory.title)이 비었으면(공백뿐 포함) 본문 첫 문장을 제목으로 보여 준다(Q46).
// 제목이 비는 곳: 옛 이야기 제목 정리(db/cleanup-legacy-story-titles.ts — 시기 이름 제목을 "" 로) ·
// 제안 카드 [고치기]에서 제목을 지우고 [만들기]. (UserMemory.title 은 NOT NULL 이라 "없음" = 빈 문자열.)
// 쓰는 곳: My Life 지도·목록·정보 패널·찾기·제안 카드 · /story-review · 인물 확인 · 포스터 구간 행 ·
// 오늘의 인터뷰 요약 · 자유 대화 "방금 남긴 이야기".

// 본문 첫 문장(마침표·물음표·느낌표까지). 끝맺음 부호가 없으면 본문 전체(공백 정리).
export function storyLead(content: string): string {
  const t = content.trim().replace(/\s+/g, " ");
  const m = t.match(/^(.+?[.!?。])(\s|$)/);
  return m ? m[1] : t;
}

// 화면에 보일 이야기 제목 — 제목이 있으면 제목(앞뒤 공백 정리), 없으면 본문 첫 문장.
export function displayTitle(story: { title: string | null; content: string }): string {
  return story.title?.trim() || storyLead(story.content);
}

// 앱 골격이 만드는 기본 시기 이름(app/actions/onboarding.ts 골격 — 국민학교·초등학교 둘 다). 회귀가 골격과 맞는지 본다.
export const DEFAULT_PERIOD_LABELS = [
  "출생",
  "국민학교 입학",
  "초등학교 입학",
  "중학교 입학",
  "고등학교 입학",
  "대학교 입학",
  "군 입대",
  "첫 직장",
  "결혼",
] as const;

// 제목이 시기 이름 자리 표시인지(공백 무시) — 그 계정의 시기 이름(고친 이름 포함)·기본 시기 이름과 같거나, 끝이 "이후"
// ("군 입대 이후" 같은 구간 이야기 자리 표시). 옛 저장 경로·갭 문항이 이런 값을 제목 칸에 넣었다(2026-11-02 정리).
export function isPeriodNameTitle(title: string, accountLabels: readonly (string | null)[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const t = norm(title);
  if (!t) return false;
  if (t.endsWith("이후")) return true;
  return [...accountLabels, ...DEFAULT_PERIOD_LABELS].some((l) => !!l && norm(l) === t);
}

// 저장할 이야기 제목 — 사용자가 직접 적은 제목([고치기])이 아니면 시기 이름 자리 표시는 빈 문자열(= 제목 없음).
// 이야기 저장(lib/episode createEpisodeBridge) 한 곳에서만 부른다.
export function storedStoryTitle(title: string, accountLabels: readonly (string | null)[], userSetTitle: boolean): string {
  const t = title.trim();
  return !userSetTitle && isPeriodNameTitle(t, accountLabels) ? "" : t;
}
