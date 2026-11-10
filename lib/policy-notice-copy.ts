// 처리방침·약관 개정 공지 문구 — 2026-11-04 성민 확정(4키 — 같은 날 more 를 문서별로). 클라이언트에서도 쓰는 순수 모듈(lib/policy-notice).
// 띠 = 등록의 short(짧은 요약) + 시행일 한 줄, 문서 맨 위 "개정 안내" 줄 = 등록의 detail.
// 약관(terms) 쪽 맨 위 줄은 처리방침과 같은 pageLine 을 쓴다 — 약관에 쓰일 때의 글도 2026-11-10 확정.

import { withJosa } from "./josa";
import { formatNoticeDay, type ActiveNotice, type PolicyDoc } from "./policy-notice";

const DOC_NAME: Record<PolicyDoc, string> = { privacy: "개인정보 처리방침", terms: "이용약관", refund: "환불·교환 정책" };

export const POLICY_NOTICE_COPY = {
  // 로그인한 화면 헤더 아래 띠 — "짧은 요약 · 11월 11일부터"
  bar: (n: ActiveNotice) =>
    n.phase === "before"
      ? `${n.short} · ${formatNoticeDay(n.effectiveDay, true)}부터`
      : `${n.short} · ${formatNoticeDay(n.effectiveDay, true)}부터 적용`,
  // 띠 버튼 — 등록의 문서 종류로(그 문서 맨 위 "개정 안내" 줄로 감 — noticeHref). "약관 보기"가 더 짧아 띠 요약 11자 상한 그대로.
  more: { privacy: "처리방침 보기", terms: "약관 보기", refund: "환불·교환 보기" } satisfies Record<PolicyDoc, string>, // refund 2026-11-10 성민 "환불·교환 보기"(390 버튼 119px — 가장 긴 띠 요약도 두 줄 · "환불·교환 정책 보기"는 세 줄로 잘려 안 씀 — docs/temp-copy-inventory.md 부록 D)
  close: "닫기",
  // 문서 맨 위 "개정 안내" 줄 — 조사는 괄호(판) 앞 문서 이름으로 고름(2026-11-10 — lib/josa)
  pageLine: (n: ActiveNotice) => {
    const name = DOC_NAME[n.doc];
    const head = `개정 안내 — ${name}(${n.version})${withJosa(name, "은/는")} ${formatNoticeDay(n.effectiveDay)}부터`;
    return n.phase === "before" ? `${head} 시행됩니다. ${n.detail}` : `${head} 시행되었습니다. ${n.detail}`;
  },
};
