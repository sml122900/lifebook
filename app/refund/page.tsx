import Link from "next/link";

import { Paper } from "@/components/ui/Paper";
import { BUSINESS_INFO } from "@/lib/commerce/business";
import { REFUND_POLICY_LINES, TOKEN_REFUND_LINES } from "@/lib/commerce/order-display";
import { activeNotice, NOTICE_ANCHOR } from "@/lib/policy-notice";
import { POLICY_NOTICE_COPY } from "@/lib/policy-notice-copy";

// 환불·교환 정책 — 독립 공개 페이지(PG 심사 대응). /account/orders
// 의 임베드 섹션과 문구를 REFUND_POLICY_LINES(lib/commerce/order-display.ts)
// 로 공유 — 여기서 새로 쓰지 않는다(단일 출처, 문구 드리프트 방지).
// v1.1(2026-11-09 — 약관 제15조·제16조에 맞춤, 공지 장치 등록 lib/policy-notice · 공지 당일 시행 leadException).
// v1.2(2026-11-10 — 토큰 충전 절 추가, TOKEN_REFUND_LINES = 약관 제25조·충전 화면·상점·고객센터와 같은 문장 · 공지 당일 시행 leadException).

export const metadata = {
  title: "환불·교환 정책 — Lifebook",
  description: "Lifebook 실물 상품(인쇄본 등)과 토큰 충전의 환불·교환 정책.",
};

export default function RefundPolicyPage() {
  const notice = activeNotice("refund");
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-12">
      <p className="text-base text-ink-soft">
        <Link href="/" className="underline hover:text-ink">
          ← Lifebook 홈으로
        </Link>
      </p>

{/* 긴 글 편지지 카드(밤 우주 2단계 — ui-night Q144 (b)): 제목부터 사업자 정보까지 밝은 종이 위 */}
      <Paper className="mt-4">
      <h1 className="m-0 text-ink">환불·교환 정책</h1>
      {notice && (
        // 처리방침·약관과 같은 "개정 안내" 줄 — 띠의 [환불·교환 보기]가 여기로 옴
        <p id={NOTICE_ANCHOR} role="note" className="mt-4 scroll-mt-4 rounded-md border-2 border-line bg-banner px-4 py-3 text-lg text-ink">
          {POLICY_NOTICE_COPY.pageLine(notice)}
        </p>
      )}
      <p className="mt-3 text-lg text-ink-soft">
        {/* 2026-11-08 (옛 "포스터 등") · 2026-11-10 토큰 충전 더함 */}
        실물 상품(인쇄본 등) 주문과 토큰 충전에 적용되는 환불·교환 기준이에요.
      </p>

      <h2 className="mt-8 text-ink">실물 상품(인쇄본)</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {REFUND_POLICY_LINES.map((line) => (
          <li
            key={line}
            className="rounded-md border border-line bg-surface px-5 py-4 text-lg text-ink"
          >
            {line}
          </li>
        ))}
      </ul>

      {/* 토큰 충전(v1.2 — 2026-11-10) */}
      <h2 className="mt-10 text-ink">토큰 충전</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {TOKEN_REFUND_LINES.map((line) => (
          <li
            key={line}
            className="rounded-md border border-line bg-surface px-5 py-4 text-lg text-ink"
          >
            {line}
          </li>
        ))}
      </ul>

      {/* 시행일·개정 이력(2026-11-09 v1.1 · 2026-11-10 v1.2 — 처리방침과 같은 꼴, 회귀 test-auth ③) */}
      <section className="mt-10 flex flex-col gap-1 text-lg text-ink-soft">
        <p>· 시행일: 2026년 11월 10일</p>
        <p>· 개정 이력</p>
        <ul className="flex flex-col gap-1 pl-4">
          <li>- v1.0 — 2026년 11월 8일 시행 (인쇄본 판매 준비 — 7일 청약철회·반품 배송비·반품 주소)</li>
          <li>- v1.1 — 2026년 11월 9일 시행 (청약철회 기산일·하자 재제작 기간·환불 시점을 이용약관에 맞춤)</li>
          <li>- v1.2 — 2026년 11월 10일 시행 (토큰 충전 환불 기준 추가 — 7일 안에 안 쓴 충전은 전액, 그 밖은 남은 유료 토큰만큼 · 무료 토큰 제외 · 쓰는 곳 Lifebook 한 곳)</li>
        </ul>
      </section>

      <section className="mt-12 border-t border-line pt-6 text-base text-ink-faint">
        <p>문의: {BUSINESS_INFO.csEmail} · {BUSINESS_INFO.csPhone}</p>
      </section>
      </Paper>
    </main>
  );
}
