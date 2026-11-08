// 처리방침·약관 개정 공지 — 개정 정보 한 곳(2026-11-03, docs/phase/my-life-restructure.md §18). 순수 모듈.
//
// 규칙(CLAUDE.md 작업 규칙 11): 개정은 여기 POLICY_NOTICES 에 먼저 등록 → 시행일 = 공지일 + 7일 이상. 배포일 즉시 시행 금지
// (수집 축소 개정도 예외 없음 — 법령상 즉시 필요한 경우만 성민 승인). 회귀 test-auth ③ 이 등록값을 확인한다.
// 성민이 승인한 예외만 leadException(승인 날짜·사유)에 적어 7일 간격 검사를 건너뛴다 — 시행일이 공지일보다 이른 것은 예외 없이 거부.
//
// 보이는 곳: 공지일 0시(KST)부터 시행일 뒤 7일까지 —
//   - 로그인한 화면 헤더 아래 안내 띠(app/components/PolicyNoticeBar — 390 에서 한 줄(최대 두 줄): 짧은 요약 + 시행일 +
//     [자세히]·[닫기], 닫으면 그 기기에서 그 판은 숨김) — 등록의 short
//   - 해당 문서 맨 위 "개정 안내" 줄(/privacy · /terms, 띠 버튼 [처리방침 보기]·[약관 보기]가 이 줄로 감) — 등록의 detail
// 문구는 lib/policy-notice-copy.ts(임시).

export type PolicyDoc = "privacy" | "terms";
export const POLICY_DOCS: readonly PolicyDoc[] = ["privacy", "terms"];

export type PolicyNotice = {
  doc: PolicyDoc;
  version: string; // "v1.4"
  short: string; // 띠용 짧은 요약(SHORT_MAX 자 이내 — 390 에서 시행일·버튼과 두 줄 안에). 어르신이 아는 말, 기술 용어 금지(규칙 11)
  detail: string; // 처리방침 맨 위 "개정 안내" 줄의 상세(바뀌는 점)
  noticeDay: string; // 공지일(KST, YYYY-MM-DD) = 배포일
  effectiveDay: string; // 시행일(KST, YYYY-MM-DD) — 공지일 + 7일 이상
  leadException?: string; // 7일 간격 예외 — 성민 승인 날짜·사유(있을 때만 공지일 ~ 공지일 + 6일 시행 허용)
};

export type ActiveNotice = PolicyNotice & { phase: "before" | "after" };

export const NOTICE_LEAD_DAYS = 7; // 공지 → 시행 최소 간격
export const NOTICE_AFTER_DAYS = 7; // 시행 뒤에도 안내를 남기는 날 수
// 띠용 짧은 요약 글자 수 상한 — 2026-11-04 확정 문구("· 12월 31일부터 적용"·[처리방침 보기]·[닫기])로 390 재실측: 11자 이하는
// 긴 낱말("개인정보처리방침")이 있어도 두 줄, 12자는 긴 낱말이면·13자는 그렇지 않아도 세 줄(낱말 단위 줄바꿈). 넘치면 띠가 두 줄에서 말줄임.
export const SHORT_MAX = 11;

// 개정 등록 — 첫 사용은 v1.4 부터(2026-11-03 성민 결정: v1.3 은 개정 이력으로만). 새 개정을 맨 뒤에 더한다.
export const POLICY_NOTICES: readonly PolicyNotice[] = [
  {
    // 처리방침 v1.4 — 초안·결정 docs/phase/privacy-v1.4.md(2026-11-05 성민 확정: short·detail 초안 그대로, 공지일 = 확정 당일).
    doc: "privacy",
    version: "v1.4",
    short: "AI 보관 기간 바뀜",
    detail:
      "기록 지도에서 직접 만드신 분류와 항목, 모임·장소 묶음, 인물에 대해 적으신 글을 수집 항목에 적고, 인물의 관계 분류·처음 만난 해·메모, 장소 주소, 물건 기록도 빠짐없이 적었습니다. AI가 기록을 정리하거나 기록에 대한 질문에 답할 때 함께 보내는 정보(시기·모임·장소 묶음·분류·항목의 이름, 인물과 항목에 대해 적으신 글, 기록 사이의 연결, AI에게 하신 요청과 질문)를 국외 이전 항목에 더합니다. 또 Anthropic이 보관하는 기간을 업체 공식 안내에 맞춰 \"7일 이내\"에서 \"30일 이내\"로 바로잡습니다. 정보를 받는 곳(Anthropic, 미국)과 쓰는 목적은 그대로입니다.",
    noticeDay: "2026-11-05",
    // 2026-11-12 예정이던 시행을 앞당김 — 대기 해제(성민 2026-11-06, 실사용자 0). 동의 버전 5 와 같은 배포.
    effectiveDay: "2026-11-06",
    leadException: "2026-11-06 성민 결정 — 실사용자 0명이라 시행일(11-12) 대기 해제",
  },
  {
    // 처리방침 v1.5 — 1항 마에 AI 지도 편집 기록(custom-graph Q92 B안). 동의 버전 5 유지(근거 docs/phase/privacy-v1.4.md 끝 "v1.5").
    doc: "privacy",
    version: "v1.5",
    short: "AI 편집 기록 보관",
    detail:
      "AI에게 기록 지도를 고쳐 달라고 부탁하신 경우, 어떤 작업을 어느 기록에 언제 했는지를 90일 동안 보관합니다. 잘못 바뀐 것을 되짚고 기능을 고치는 데 씁니다. 부탁하신 말씀과 기록 내용은 이 기록에 남기지 않습니다. 그 밖의 수집 항목·업체·국가는 그대로입니다.",
    noticeDay: "2026-11-07",
    effectiveDay: "2026-11-07",
    leadException: "2026-11-07 성민 승인 — 실사용자 0명이라 공지 + 7일 대기 없이 오늘 시행",
  },
  {
    // 처리방침 v1.6 — 강물 포스터 판매 종료(docs/phase/print-mylife.md §9.4). short·detail [임시 — 성민 확정 필요] 2026-11-08.
    doc: "privacy",
    version: "v1.6",
    short: "포스터 대신 인쇄본",
    detail:
      "포스터 상품을 마치면서, 포스터 배경을 그리던 OpenAI로 정보를 보내는 일과 그 배경에 쓰던 취향 정보 수집을 그만둡니다. 새로 준비하는 My Life 인쇄본을 주문하실 때 받는 배송 정보(받는 분 이름·연락처·주소·배송 메모)와 인쇄본에 담기는 내용을 수집 항목에, 인쇄물 제작과 배송을 이용 목적에 적었습니다. 그 밖의 업체·국가·보유 기간은 그대로입니다.",
    noticeDay: "2026-11-09",
    effectiveDay: "2026-11-09",
    leadException: "2026-11-08 성민 승인 — 실사용자 0명이라 공지 + 7일 대기 없이 공지 당일 시행",
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const kstMidnight = (day: string) => Date.parse(`${day}T00:00:00+09:00`);

// 등록값 검사 — 문제가 있으면 이유, 없으면 null.
export function noticeProblem(n: PolicyNotice): string | null {
  // 문서 종류로 띠 버튼(처리방침 보기·약관 보기)·가는 곳을 고른다 — 빠졌거나 모르는 값이면 등록 오류(띠 안 보임).
  if (!POLICY_DOCS.includes(n.doc)) return "문서 종류(privacy·terms)";
  if (!DAY_RE.test(n.noticeDay) || !DAY_RE.test(n.effectiveDay) || Number.isNaN(kstMidnight(n.noticeDay)) || Number.isNaN(kstMidnight(n.effectiveDay))) {
    return "날짜 형식(YYYY-MM-DD)";
  }
  if (!/^v\d+(\.\d+)*$/.test(n.version)) return "판 번호 형식(v1.4)";
  if (!n.short.trim()) return "띠용 짧은 요약 비어 있음";
  if (n.short.length > SHORT_MAX) return `띠용 짧은 요약 ${SHORT_MAX}자 넘음`;
  if (!n.detail.trim()) return "처리방침 상단 상세 비어 있음";
  if (kstMidnight(n.effectiveDay) < kstMidnight(n.noticeDay)) return "시행일이 공지일보다 이름";
  if (!n.leadException?.trim() && kstMidnight(n.effectiveDay) - kstMidnight(n.noticeDay) < NOTICE_LEAD_DAYS * DAY_MS) return `시행일이 공지일 + ${NOTICE_LEAD_DAYS}일보다 이름`;
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

// "2026-11-10" → "2026년 11월 10일"(처리방침 줄) · short = "11월 10일"(띠 — 폭)
export function formatNoticeDay(day: string, short = false): string {
  const [y, m, d] = day.split("-").map(Number);
  return short ? `${m}월 ${d}일` : `${y}년 ${m}월 ${d}일`;
}

// 띠 버튼이 가는 곳 — 그 문서 맨 위 "개정 안내" 줄(id).
export const NOTICE_ANCHOR = "policy-notice";
export function noticeHref(n: Pick<PolicyNotice, "doc">): string {
  return `/${n.doc}#${NOTICE_ANCHOR}`;
}
