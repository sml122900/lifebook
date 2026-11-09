import Image from "next/image";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { getProduct, shippingKrwOf } from "@/lib/commerce/products";
import { SHIPPING_LEAD_TIME_LINE } from "@/lib/commerce/order-display";
import { PRINT_MAX_TOTAL_KRW } from "@/lib/commerce/print-price";
import { PRINT } from "@/lib/print-layout";

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
  // My Life 인쇄본 = 장당 금액 × 장수, 배송비 포함(2026-11-09 — lib/commerce/print-price). 합계는 장수에 따라 — 인쇄본 화면에서 확정.
  const perPage = product.id === "mylife-print";
  const shippingKrw = shippingKrwOf(product);
  const total = product.unitKrw + shippingKrw;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/shop" variant="tertiary" className="self-start">
        ← 상점으로
      </ButtonLink>

      {/* #8(2026-11-08) — 세로 견본이 가로로 잘리지 않게 전체를 보임(object-contain) */}
      <div className="relative mt-6 aspect-[4/3] w-full overflow-hidden rounded-lg border border-line bg-surface">
        <Image
          src={product.image}
          alt={product.imageAlt}
          fill
          className="object-contain"
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
        <div className="flex items-center justify-between">
          <dt className="text-ink-soft">{perPage ? "상품 · 한 장" : "상품"}</dt>
          <dd className="font-semibold text-ink">
            {product.unitKrw.toLocaleString()}원
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-ink-soft">배송비</dt>
          <dd className="font-semibold text-ink">
            {/* [임시 — 성민 확정 필요] 2026-11-09 무료배송 표기 */}
            {shippingKrw === 0 ? "무료" : `${shippingKrw.toLocaleString()}원`}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-3">
          <dt className="font-bold text-ink">합계</dt>
          <dd className="text-right text-xl font-bold text-action">
            {/* [임시 — 성민 확정 필요] 2026-11-09 */}
            {perPage ? `장수 × ${product.unitKrw.toLocaleString()}원` : `${total.toLocaleString()}원`}
          </dd>
        </div>
      </dl>
      {perPage && (
        <p className="mt-3 text-base text-ink-soft">
          {/* [임시 — 성민 확정 필요] 2026-11-09 */}
          표지를 포함해 최대 {PRINT.MAX_PAGES}장({PRINT_MAX_TOTAL_KRW.toLocaleString()}원)까지예요. 장수와 결제 금액은 인쇄본 화면의
          미리보기에서 확인하신 뒤 주문해요. 예: 7장이면 {(product.unitKrw * 7).toLocaleString()}원.
        </p>
      )}

      <p className="mt-3 text-base text-ink-soft">{SHIPPING_LEAD_TIME_LINE}</p>

      <div className="mt-8">
        <ButtonLink href={`/shop/${product.id}/order`} variant="primary" size="lg">
          주문하기
        </ButtonLink>
      </div>
    </main>
  );
}
