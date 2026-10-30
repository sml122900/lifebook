// 오늘의 인터뷰 — 문항 키·날짜 유틸(순수). docs/phase/today-interview.md §2.2.
//
// itemKey 는 날짜를 넘어 같은 질문을 알아보는 영구 키다(InterviewItem.itemKey).

export type InterviewSource = "GAP_EPISODE" | "GAP_PERIOD" | "GAP_YEAR" | "POOL" | "SELF";

// InterviewItem.status 값.
export type InterviewItemStatus = "PLANNED" | "ANSWERED" | "SKIPPED" | "DROPPED";

const PREFIX: Record<InterviewSource, string> = {
  GAP_EPISODE: "gap:episode:",
  GAP_PERIOD: "gap:period:",
  GAP_YEAR: "gap:year:",
  POOL: "pool:",
  SELF: "self:",
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

// "관계별 나"(SELF) 문항 키의 id 부분 — 질문 id·대상 시기 사건 id·(실제 인물·그룹이면) 관계 대상.
//   <questionId>:<lifeEventId>                 일반 범주("선생님" 등)
//   <questionId>:<lifeEventId>:person:<id>     인물
//   <questionId>:<lifeEventId>:group:<id>      인물 그룹
export type SelfRelationRef = { type: "PERSON" | "PERSON_GROUP"; id: string };
export type SelfKey = { questionId: string; lifeEventId: string; relation: SelfRelationRef | null };

const RELATION_TOKEN = { PERSON: "person", PERSON_GROUP: "group" } as const;

export function selfKeyId(questionId: string, lifeEventId: string, relation: SelfRelationRef | null): string {
  const base = `${questionId}:${lifeEventId}`;
  return relation ? `${base}:${RELATION_TOKEN[relation.type]}:${relation.id}` : base;
}

export function parseSelfKeyId(id: string): SelfKey | null {
  const parts = id.split(":");
  if (parts.some((p) => p === "")) return null;
  if (parts.length === 2) return { questionId: parts[0], lifeEventId: parts[1], relation: null };
  if (parts.length !== 4) return null;
  const type = parts[2] === "person" ? "PERSON" : parts[2] === "group" ? "PERSON_GROUP" : null;
  return type ? { questionId: parts[0], lifeEventId: parts[1], relation: { type, id: parts[3] } } : null;
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
