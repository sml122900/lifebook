import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ButtonLink } from "@/components/ui/Button";
import { getProduct, shippingKrwOf } from "@/lib/commerce/products";
import { REFUND_SUMMARY_LINES, SHIPPING_LEAD_TIME_LINE } from "@/lib/commerce/order-display";
import { PRINT_MAX_TOTAL_KRW, PRINT_MIN_PAGES } from "@/lib/commerce/print-price";
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
            {/* 2026-11-09 무료배송 표기 */}
            {shippingKrw === 0 ? "무료" : `${shippingKrw.toLocaleString()}원`}
          </dd>
        </div>
        <div className="mt-1 flex items-center justify-between gap-4 border-t border-line pt-3">
          <dt className="font-bold text-ink">합계</dt>
          <dd className="text-right text-xl font-bold text-action">
            {perPage ? `장수 × ${product.unitKrw.toLocaleString()}원` : `${total.toLocaleString()}원`}
          </dd>
        </div>
      </dl>
      {perPage && (
        <p className="mt-3 text-base text-ink-soft">
          {/* 2026-11-09 — 최소 2장(표지 + 1장, 성민 확정) */}
          표지를 포함해 최소 {PRINT_MIN_PAGES}장({(product.unitKrw * PRINT_MIN_PAGES).toLocaleString()}원)부터 최대 {PRINT.MAX_PAGES}장({PRINT_MAX_TOTAL_KRW.toLocaleString()}원)까지예요.
          장수와 결제 금액은 인쇄본 화면의 미리보기에서 확인하신 뒤 주문해요. 예: 7장이면 {(product.unitKrw * 7).toLocaleString()}원.
        </p>
      )}

      <p className="mt-3 text-base text-ink-soft">{SHIPPING_LEAD_TIME_LINE}</p>

      {/* 교환·반품·환불 요약(2026-11-09 성민) — 자세한 기준은 환불정책(푸터 링크도 그대로). 문구 = lib/commerce/order-display */}
      <section aria-labelledby="refund-summary" className="mt-6 rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 id="refund-summary" className="text-xl font-bold text-ink">
          교환·반품·환불
        </h2>
        <ul className="mt-2 flex flex-col gap-2 text-lg text-ink-soft">
          {REFUND_SUMMARY_LINES.map((line) => (
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
        <ButtonLink href={`/shop/${product.id}/order`} variant="primary" size="lg">
          주문하기
        </ButtonLink>
      </div>
    </main>
  );
}
