import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { TOKEN_REFUND_LINES } from "@/lib/commerce/order-display";
import { TOPUP_DAILY_LIMIT_KRW, TOPUP_PACKAGES, TOPUP_PRODUCT } from "@/lib/tokens/policy";

export const metadata = {
  title: "토큰 충전 — Lifebook",
};

// /shop/tokens — 토큰 충전 상품 소개(2026-11-10 — 토스 포인트충전 업종 심사). 로그인 없이 보임(proxy: /shop/<한 단계>).
// 상품·가격 = lib/tokens/policy TOPUP_PACKAGES(서버 진실 — 주문도 같은 값), 환불·쓰는 곳 = TOKEN_REFUND_LINES(환불정책·약관·충전 화면·고객센터와 같은 문장).
// [충전하러 가기] → /billing(로그인 — returnTo 로 돌아옴) → 상품 고르기 + 결제위젯 v2 → 결제창.
export default function TokenProductPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/shop" variant="tertiary" className="self-start">
        ← 상점으로
      </ButtonLink>

      <header className="mt-6">
        <h1 className="text-ink">{TOPUP_PRODUCT.name}</h1>
        <p className="mt-3 text-lg text-ink-soft">{TOPUP_PRODUCT.blurb}</p>
      </header>

      {/* 충전 상품 — 금액·받는 토큰(더 드리는 토큰 포함) */}
      <dl className="mt-8 flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
        {TOPUP_PACKAGES.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4">
            <dt className="font-semibold text-ink">{p.krw.toLocaleString()}원</dt>
            <dd className="text-right text-ink">
              {p.tokens.toLocaleString()}토큰
              {p.bonus > 0 && <span className="ml-2 text-base text-ink-soft">({p.bonus}토큰 더)</span>}
            </dd>
          </div>
        ))}
      </dl>
      {/* 하루 충전 한도(2026-11-10 — 문구 확정 2026-11-10 성민) */}
      <p className="mt-3 text-base text-ink-soft">하루에 {TOPUP_DAILY_LIMIT_KRW.toLocaleString()}원까지 충전하실 수 있어요.</p>

      <section aria-labelledby="token-refund" className="mt-6 rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 id="token-refund" className="text-xl font-bold text-ink">
          환불과 쓰는 곳
        </h2>
        <ul className="mt-2 flex flex-col gap-2 text-lg text-ink-soft">
          {TOKEN_REFUND_LINES.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
        <Link
          href="/refund"
          className="mt-3 inline-flex min-h-[48px] items-center text-lg font-semibold text-ink underline hover:text-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          환불·교환 정책 자세히 보기
        </Link>
      </section>

      <div className="mt-8">
        <ButtonLink href="/billing" variant="primary" size="lg">
          충전하러 가기
        </ButtonLink>
      </div>
    </main>
  );
}
