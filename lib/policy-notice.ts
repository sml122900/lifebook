// 처리방침·약관 개정 공지 — 개정 정보 한 곳(2026-11-03, docs/phase/my-life-restructure.md §18). 순수 모듈.
//
// 규칙(CLAUDE.md 작업 규칙 11): 개정은 여기 POLICY_NOTICES 에 먼저 등록 → 시행일 = 공지일 + 7일 이상. 배포일 즉시 시행 금지
// (수집 축소 개정도 예외 없음 — 법령상 즉시 필요한 경우만 성민 승인). 회귀 test-auth ③ 이 등록값을 확인한다.
//
// 보이는 곳: 공지일 0시(KST)부터 시행일 뒤 7일까지 —
//   - 로그인한 화면 헤더 아래 안내 띠(app/components/PolicyNoticeBar — 닫으면 그 기기에서 그 판은 숨김)
//   - 해당 문서 맨 위 "개정 안내" 줄(지금은 /privacy)
// 시행일 전 = "바뀌어요", 시행일부터 = "시행됐어요". 문구는 lib/policy-notice-copy.ts(임시).

export type PolicyDoc = "privacy" | "terms";

export type PolicyNotice = {
  doc: PolicyDoc;
  version: string; // "v1.4"
  summary: string; // 바뀌는 점 한 줄
  noticeDay: string; // 공지일(KST, YYYY-MM-DD) = 배포일
  effectiveDay: string; // 시행일(KST, YYYY-MM-DD) — 공지일 + 7일 이상
};

export type ActiveNotice = PolicyNotice & { phase: "before" | "after" };

export const NOTICE_LEAD_DAYS = 7; // 공지 → 시행 최소 간격
export const NOTICE_AFTER_DAYS = 7; // 시행 뒤에도 안내를 남기는 날 수

// 개정 등록 — 첫 사용은 v1.4 부터(2026-11-03 성민 결정: v1.3 은 개정 이력으로만). 새 개정을 맨 뒤에 더한다.
export const POLICY_NOTICES: readonly PolicyNotice[] = [];

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const kstMidnight = (day: string) => Date.parse(`${day}T00:00:00+09:00`);

// 등록값 검사 — 문제가 있으면 이유, 없으면 null.
export function noticeProblem(n: PolicyNotice): string | null {
  if (!DAY_RE.test(n.noticeDay) || !DAY_RE.test(n.effectiveDay) || Number.isNaN(kstMidnight(n.noticeDay)) || Number.isNaN(kstMidnight(n.effectiveDay))) {
    return "날짜 형식(YYYY-MM-DD)";
  }
  if (!/^v\d+(\.\d+)*$/.test(n.version)) return "판 번호 형식(v1.4)";
  if (!n.summary.trim()) return "바뀌는 점 비어 있음";
  if (kstMidnight(n.effectiveDay) - kstMidnight(n.noticeDay) < NOTICE_LEAD_DAYS * DAY_MS) return `시행일이 공지일 + ${NOTICE_LEAD_DAYS}일보다 이름`;
  return null;
}

// 지금 보여 줄 공지(문서를 주면 그 문서만) — 여럿이면 가장 늦게 공지한 것.
export function activeNotice(doc?: PolicyDoc, now: Date = new Date(), list: readonly PolicyNotice[] = POLICY_NOTICES): ActiveNotice | null {
  const t = now.getTime();
  const hits = list.filter(
    (n) =>
      (!doc || n.doc === doc) &&
      noticeProblem(n) === null &&
      t >= kstMidnight(n.noticeDay) &&
      t < kstMidnight(n.effectiveDay) + NOTICE_AFTER_DAYS * DAY_MS,
  );
  if (hits.length === 0) return null;
  const n = hits.reduce((a, b) => (kstMidnight(b.noticeDay) >= kstMidnight(a.noticeDay) ? b : a));
  return { ...n, phase: t < kstMidnight(n.effectiveDay) ? "before" : "after" };
}

// 안내 띠를 닫았다는 기록(그 기기 localStorage) — 판마다 따로.
export function noticeClosedKey(n: Pick<PolicyNotice, "doc" | "version">): string {
  return `policy-notice-closed:${n.doc}:${n.version}`;
}

// "2026-11-10" → "2026년 11월 10일"
export function formatNoticeDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일`;
}
