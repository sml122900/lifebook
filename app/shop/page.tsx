import Link from "next/link";

import { ButtonLink } from "@/components/ui/Button";
import { PRODUCTS, SHIPPING_KRW, shippingKrwOf } from "@/lib/commerce/products";

export const metadata = {
  title: "상점 — Lifebook",
};

// /shop — 실물 상품 카드. 클릭 → 상세(/shop/[productId]).
// 가격은 lib/commerce/products(서버 진실). 배송비는 균일 별도 고지.
// 2026-11-08 — 강물 포스터 판매 종료 · My Life 인쇄본은 금액 정하기 전 비공개 → 보이는 상품이 없으면 "곧 선보여요" 안내.
// 2026-11-09 — 인쇄본 금액 확정(장당 8,000원·배송비 포함)으로 공개.
export default function ShopPage() {
  const listed = PRODUCTS.filter((p) => p.orderable !== false);
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      {/* 처음 화면(/) — 로그인 전 = 랜딩, 로그인 뒤 = 트랙별 첫 화면(V3 = My Life). 2026-11-08(옛 → /life-timeline) */}
      <ButtonLink href="/" variant="tertiary" className="self-start">
        ← 처음 화면으로
      </ButtonLink>

      <header className="mt-6">
        <h1 className="text-ink">기록을 손에 잡히게</h1>
        <p className="mt-3 text-lg text-ink-soft">
          {/* 2026-11-08 #9(옛 "포스터·책·기념물로") */}
          My Life 지도를 시기마다 한 장씩 담은 인쇄본으로 남겨 드려요.
        </p>
      </header>

      <ul className="mt-8 flex flex-col gap-5">
        {/* PG 심사 대응(2026-09-11) — orderable:false(제작·배송 파이프라인
            없는 상품)는 목록에서만 제외. 상세 URL·주문 로직은 무수정. */}
        {listed.map((p) => (
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
                  {p.pricePrefix ? `${p.pricePrefix} ` : ""}
                  {p.unitKrw.toLocaleString()}원
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {listed.length === 0 ? (
        <p className="mt-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg text-ink">
          My Life 인쇄본을 준비하고 있어요. 곧 선보일게요.
        </p>
      ) : listed.every((p) => shippingKrwOf(p) === 0) ? (
        <p className="mt-6 text-lg text-ink-soft">
          {/* 2026-11-09 — 보이는 상품 = My Life 인쇄본(배송비 포함 가격)뿐 */}
          배송비는 따로 받지 않아요.
        </p>
      ) : (
        <p className="mt-6 text-lg text-ink-soft">
          모든 상품에 배송비 {SHIPPING_KRW.toLocaleString()}원이 더해져요.
        </p>
      )}
    </main>
  );
}
