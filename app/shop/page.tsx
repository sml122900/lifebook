import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { PRODUCTS, SHIPPING_KRW } from "@/lib/commerce/products";

export const metadata = {
  title: "상점 — 라이프북",
};

// /shop — 실물 상품 3종 카드. 클릭 → 상세(/shop/[productId]).
// 가격은 경영방 확정가(lib/commerce/products). 배송비는 균일 별도 고지.
export default function ShopPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/life-timeline" variant="tertiary" className="self-start">
        ← 인생 연혁으로
      </ButtonLink>

      <header className="mt-6">
        <h1 className="text-ink">기록을 손에 잡히게</h1>
        <p className="mt-3 text-lg text-ink-soft">
          화면 속 이야기를 포스터·책·기념물로 남겨드려요.
        </p>
      </header>

      <ul className="mt-8 flex flex-col gap-5">
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <Link
              href={`/shop/${p.id}`}
              className="block rounded-lg border-2 border-line bg-surface p-6 hover:border-brand hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xl font-bold text-ink">{p.name}</p>
                  <p className="mt-1 text-base text-ink-soft">{p.spec}</p>
                  <p className="mt-2 text-lg text-ink-soft">{p.blurb}</p>
                </div>
                <p className="shrink-0 text-xl font-bold text-action">
                  {p.unitKrw.toLocaleString()}원
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-base text-ink-soft">
        모든 상품에 배송비 {SHIPPING_KRW.toLocaleString()}원이 더해져요.
      </p>
    </main>
  );
}
