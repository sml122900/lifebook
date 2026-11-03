// 처리방침·약관 개정 공지 문구 — 전부 [임시 — 성민 확정 필요](2026-11-03, lib/policy-notice). 클라이언트에서도 쓰는 순수 모듈.

import { formatNoticeDay, type ActiveNotice, type PolicyDoc } from "./policy-notice";

const DOC_NAME: Record<PolicyDoc, string> = { privacy: "개인정보 처리방침", terms: "이용약관" };

export const POLICY_NOTICE_COPY = {
  // 로그인한 화면 헤더 아래 띠
  bar: (n: ActiveNotice) =>
    n.phase === "before"
      ? `${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 바뀌어요. ${n.summary}`
      : `${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 바뀌었어요. ${n.summary}`,
  more: "자세히 보기",
  close: "닫기",
  // 문서 맨 위 "개정 안내" 줄
  pageLine: (n: ActiveNotice) =>
    n.phase === "before"
      ? `개정 안내 — ${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 시행됩니다. ${n.summary}`
      : `개정 안내 — ${DOC_NAME[n.doc]}(${n.version})은 ${formatNoticeDay(n.effectiveDay)}부터 시행되었습니다. ${n.summary}`,
};
