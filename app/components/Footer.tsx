import Link from "next/link";

import { BUSINESS_INFO } from "@/lib/commerce/business";

export function Footer() {
  const b = BUSINESS_INFO;
  return (
    <footer className="border-t border-line bg-surface px-6 py-8 text-sm text-ink-soft">
      <div className="mx-auto max-w-3xl space-y-1">
        <p className="font-semibold text-ink">{b.companyName}</p>
        <p>대표자: {b.ceoName} &nbsp;·&nbsp; 사업자등록번호: {b.bizRegNo}</p>
        <p>주소: {b.address}</p>
        <p>고객센터: {b.csPhone} &nbsp;·&nbsp; {b.csEmail}</p>
        <p>통신판매업 신고번호: {b.mailOrderRegNo}</p>
        <p>
          <Link href="/refund" className="underline hover:text-ink">
            환불정책
          </Link>
          &nbsp;·&nbsp;
          <Link href="/terms" className="underline hover:text-ink">
            이용약관
          </Link>
        </p>
      </div>
    </footer>
  );
}
