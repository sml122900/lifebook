import Link from "next/link";

import { BUSINESS_INFO } from "@/lib/commerce/business";
import { REFUND_POLICY_LINES } from "@/lib/commerce/order-display";

// 환불·교환 정책 — 독립 공개 페이지(PG 심사 대응). /poster/order·/account/orders
// 의 임베드 섹션과 문구를 REFUND_POLICY_LINES(lib/commerce/order-display.ts)
// 로 공유 — 여기서 새로 쓰지 않는다(단일 출처, 문구 드리프트 방지).

export const metadata = {
  title: "환불·교환 정책 — 라이프북",
  description: "라이프북 실물 상품(포스터 등) 환불·교환 정책.",
};

export default function RefundPolicyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-12">
      <p className="text-base text-ink-soft">
        <Link href="/" className="underline hover:text-ink">
          ← 라이프북 홈으로
        </Link>
      </p>

      <h1 className="mt-4 text-ink">환불·교환 정책</h1>
      <p className="mt-3 text-lg text-ink-soft">
        실물 상품(포스터 등) 주문에 적용되는 환불·교환 기준이에요.
      </p>

      <ul className="mt-8 flex flex-col gap-3">
        {REFUND_POLICY_LINES.map((line) => (
          <li
            key={line}
            className="rounded-md border border-line bg-surface px-5 py-4 text-lg text-ink"
          >
            {line}
          </li>
        ))}
      </ul>

      <section className="mt-12 border-t border-line pt-6 text-base text-ink-faint">
        <p>문의: {BUSINESS_INFO.csEmail} · {BUSINESS_INFO.csPhone}</p>
      </section>
    </main>
  );
}
