// 처리방침·약관 개정 공지 문구 — 2026-11-04 성민 확정(4키). 클라이언트에서도 쓰는 순수 모듈(lib/policy-notice).
// 띠 = 등록의 short(짧은 요약) + 시행일 한 줄, 처리방침 맨 위 줄 = 등록의 detail.

import { formatNoticeDay, type ActiveNotice, type PolicyDoc } from "./policy-notice";

const DOC_NAME: Record<PolicyDoc, string> = { privacy: "개인정보 처리방침", terms: "이용약관" };

export const POLICY_NOTICE_COPY = {
  // 로그인한 화면 헤더 아래 띠 — "짧은 요약 · 11월 11일부터"
  bar: (n: ActiveNotice) =>
    n.phase === "before"
      ? `${n.short} · ${formatNoticeDay(n.effectiveDay, true)}부터`
      : `${n.short} · ${formatNoticeDay(n.effectiveDay, true)}부터 적용`,
  more: "처리방침 보기",
  close: "닫기",
  // 문서 맨 위 "개정 안내" 줄
  pageLine: (n: ActiveNotice) =>
    n.phase === "before"
      ? `개정 안내 — ${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 시행됩니다. ${n.detail}`
      : `개정 안내 — ${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 시행되었습니다. ${n.detail}`,
};
