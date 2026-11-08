import Link from "next/link";

import { BUSINESS_INFO } from "@/lib/commerce/business";

// #6(2026-11-08) — 글자 18px(text-lg)·링크 누르는 곳 48px(시니어 접근성 기준).
export function Footer() {
  const b = BUSINESS_INFO;
  return (
    <footer className="border-t border-line bg-surface px-6 py-8 text-lg text-ink-soft">
      <div className="mx-auto max-w-3xl space-y-1">
        <p className="font-semibold text-ink">{b.companyName}</p>
        <p>대표자: {b.ceoName} &nbsp;·&nbsp; 사업자등록번호: {b.bizRegNo}</p>
        <p>주소: {b.address}</p>
        <p>고객센터: {b.csPhone} &nbsp;·&nbsp; {b.csEmail}</p>
        <p>통신판매업 신고번호: {b.mailOrderRegNo}</p>
        <p className="flex flex-wrap items-center gap-x-2">
          <Link href="/privacy" className="inline-flex min-h-[48px] items-center font-semibold text-ink underline hover:text-ink">
            개인정보 처리방침
          </Link>
          <span aria-hidden>·</span>
          <Link href="/refund" className="inline-flex min-h-[48px] items-center underline hover:text-ink">
            환불정책
          </Link>
          <span aria-hidden>·</span>
          <Link href="/terms" className="inline-flex min-h-[48px] items-center underline hover:text-ink">
            이용약관
          </Link>
        </p>
      </div>
    </footer>
  );
}
