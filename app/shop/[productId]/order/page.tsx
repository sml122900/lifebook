import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { getProduct, SHIPPING_KRW } from "@/lib/commerce/products";

import { OrderForm } from "./OrderForm";

// /shop/[productId]/order — 배송지 입력 + 토스 결제. 금액은 서버가 상수에서
// 다시 계산하므로 여기 표시는 안내용. TOSS_CLIENT_KEY 는 공개용(서버가 읽어
// 마크업에 내림 — billing 과 동일 패턴).
export default async function OrderPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;
  const product = getProduct(productId);
  if (!product) notFound();

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!clientKey) {
    throw new Error("TOSS_CLIENT_KEY is not set");
  }

  const total = product.unitKrw + SHIPPING_KRW;

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
      <ButtonLink
        href={`/shop/${product.id}`}
        variant="tertiary"
        className="self-start"
      >
        ← 상품으로
      </ButtonLink>

      <header className="mt-6">
        <h1 className="text-ink">주문하기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          <span className="font-bold text-ink">{product.name}</span> · {product.spec}
        </p>
      </header>

      {/* 금액 요약 — 상품 + 배송 분리 */}
      <dl className="mt-6 flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
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
          <dt className="font-bold text-ink">결제 금액</dt>
          <dd className="text-xl font-bold text-action">
            {total.toLocaleString()}원
          </dd>
        </div>
      </dl>

      <OrderForm
        productId={product.id}
        clientKey={clientKey}
        customerKey={session.user.id}
      />
    </main>
  );
}
