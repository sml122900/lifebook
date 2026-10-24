// 오늘의 인터뷰 — 문항 키·날짜 유틸(순수). docs/phase/today-interview.md §2.2.
//
// itemKey 는 날짜를 넘어 같은 질문을 알아보는 영구 키다(InterviewItem.itemKey).

export type InterviewSource = "GAP_EPISODE" | "GAP_PERIOD" | "GAP_YEAR" | "POOL";

// InterviewItem.status 값.
export type InterviewItemStatus = "PLANNED" | "ANSWERED" | "SKIPPED" | "DROPPED";

const PREFIX: Record<InterviewSource, string> = {
  GAP_EPISODE: "gap:episode:",
  GAP_PERIOD: "gap:period:",
  GAP_YEAR: "gap:year:",
  POOL: "pool:",
};

export function itemKeyOf(source: InterviewSource, id: string): string {
  return PREFIX[source] + id;
}

export function parseItemKey(key: string): { source: InterviewSource; id: string } | null {
  for (const source of Object.keys(PREFIX) as InterviewSource[]) {
    const p = PREFIX[source];
    if (key.startsWith(p) && key.length > p.length) return { source, id: key.slice(p.length) };
  }
  return null;
}

const KST_MS = 9 * 60 * 60 * 1000;

// KST "YYYY-MM-DD" — 세션 키(InterviewItem.day).
export function kstDay(d: Date = new Date()): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

// 두 "YYYY-MM-DD" 사이 일수(to - from).
export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(`${toDay}T00:00:00Z`) - Date.parse(`${fromDay}T00:00:00Z`)) / 86_400_000);
}
