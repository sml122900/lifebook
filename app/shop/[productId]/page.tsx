import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { getProduct, SHIPPING_KRW } from "@/lib/commerce/products";

// /shop/[productId] — 상품 상세. 이미지 슬롯(실사진 전 placeholder) + 규격 +
// 금액 분리 표기(상품 + 배송) + [주문하기] → /shop/[productId]/order.
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();

  const total = product.unitKrw + SHIPPING_KRW;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/shop" variant="tertiary" className="self-start">
        ← 상점으로
      </ButtonLink>

      {/* 상품 사진 슬롯 — 실사진 끼우기 전 placeholder */}
      <div
        data-slot={`product-${product.id}`}
        className="mt-6 flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-line bg-ph"
      >
        <span className="px-4 text-base text-ink-faint">{product.name} 사진</span>
      </div>

      <header className="mt-6">
        <h1 className="text-ink">{product.name}</h1>
        <p className="mt-2 text-base text-ink-soft">{product.spec}</p>
        <p className="mt-3 text-lg text-ink-soft">{product.blurb}</p>
      </header>

      {/* 금액 — 상품 + 배송 분리 노출 */}
      <dl className="mt-8 flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
        <div className="flex items-center justify-between">
          <dt className="text-ink-soft">상품</dt>
          <dd className="font-semibold text-ink">
            {product.unitKrw.toLocaleString()}원
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-soft">배송비</dt>
          <dd className="font-semibold text-ink">
            {SHIPPING_KRW.toLocaleString()}원
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-line pt-3">
          <dt className="font-bold text-ink">합계</dt>
          <dd className="text-xl font-bold text-action">
            {total.toLocaleString()}원
          </dd>
        </div>
      </dl>

      <div className="mt-8">
        <ButtonLink href={`/shop/${product.id}/order`} variant="primary" size="lg">
          주문하기
        </ButtonLink>
      </div>
    </main>
  );
}
