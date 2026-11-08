import Image from "next/image";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { getProduct, SHIPPING_KRW } from "@/lib/commerce/products";
import { SHIPPING_LEAD_TIME_LINE } from "@/lib/commerce/order-display";
import { PRINT_TIERS } from "@/lib/commerce/print-tiers";

// /shop/[productId] — 상품 상세. 이미지 슬롯(실사진 전 placeholder) + 규격 +
// 금액 분리 표기(상품 + 배송) + [주문하기] → /shop/[productId]/order.
export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  // 목록에서 숨긴 상품(orderable:false — 책·씨앗, 금액 정하기 전 My Life 인쇄본)은 상세도 없음(2026-11-08 — 주소로 열리던 것).
  if (!product || product.orderable === false) notFound();
  // My Life 인쇄본 = 장수 구간 표(상품 금액은 구간마다, 배송비 따로 — print-mylife.md §5.2).
  const tiers = product.id === "mylife-print" ? PRINT_TIERS : null;

  const total = product.unitKrw + SHIPPING_KRW;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/shop" variant="tertiary" className="self-start">
        ← 상점으로
      </ButtonLink>

      <div className="relative mt-6 aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-surface">
        <Image
          src={product.image}
          alt={product.imageAlt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 672px"
          priority
        />
      </div>

      <header className="mt-6">
        <h1 className="text-ink">{product.name}</h1>
        <p className="mt-2 text-base text-ink-soft">{product.spec}</p>
        <p className="mt-3 text-lg text-ink-soft">{product.blurb}</p>
      </header>

      {/* 금액 — 상품 + 배송 분리 노출 */}
      <dl className="mt-8 flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
        {tiers ? (
          tiers.map((t) => (
            <div key={t.id} className="flex items-center justify-between">
              <dt className="text-ink-soft">상품 · {t.name}</dt>
              <dd className="font-semibold text-ink">{(t.unitKrw ?? 0).toLocaleString()}원</dd>
            </div>
          ))
        ) : (
          <div className="flex items-center justify-between">
            <dt className="text-ink-soft">상품</dt>
            <dd className="font-semibold text-ink">
              {product.unitKrw.toLocaleString()}원
            </dd>
          </div>
        )}
        <div className="flex items-center justify-between">
          <dt className="text-ink-soft">배송비</dt>
          <dd className="font-semibold text-ink">
            {SHIPPING_KRW.toLocaleString()}원
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between border-t border-line pt-3">
          <dt className="font-bold text-ink">{tiers ? `합계(${tiers[0].name})` : "합계"}</dt>
          <dd className="text-xl font-bold text-action">
            {(tiers ? (tiers[0].unitKrw ?? 0) + SHIPPING_KRW : total).toLocaleString()}원
          </dd>
        </div>
      </dl>

      <p className="mt-3 text-base text-ink-soft">{SHIPPING_LEAD_TIME_LINE}</p>

      <div className="mt-8">
        <ButtonLink href={`/shop/${product.id}/order`} variant="primary" size="lg">
          주문하기
        </ButtonLink>
      </div>
    </main>
  );
}
