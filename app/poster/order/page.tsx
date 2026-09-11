import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { POSTER_PAYMENT_LIVE_ENABLED } from "@/lib/commerce/poster-payment";
import { HIDE_TEST_MODE_BANNER } from "@/lib/commerce/pg-review";
import { SHIPPING_KRW, getProduct } from "@/lib/commerce/products";
import { parseSelectionsFull } from "@/lib/poster/overrides";

import { PosterOrderForm } from "./PosterOrderForm";

// /poster/order — 재질 선택 + 배송지 + 결제. ProductOrder 경로 재사용.
// 결제 성공 → /shop/order/success(settleProductOrder 공용). 실결제 flag OFF=테스트.

export const metadata = { title: "포스터 주문" };

export default async function PosterOrderPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  // 빈 포스터 주문 차단 — 선택이 있어야 주문 화면 진입.
  const poster = await prisma.poster.findUnique({
    where: { userId },
    select: { selections: true },
  });
  const hasSelections = parseSelectionsFull(poster?.selections).length > 0;
  if (!hasSelections) redirect("/poster/select");

  const product = getProduct("poster")!;
  // PG 심사 대응 — hidden 옵션(프리미엄)은 주문 화면 선택 UI에서 제외.
  const options = (product.options ?? []).filter((o) => !o.hidden);
  const clientKey = process.env.TOSS_CLIENT_KEY ?? "";

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">포스터 주문</h1>
        <p className="mt-2 text-lg text-ink-soft">
          재질을 고르고 받으실 곳을 적어 주세요.
        </p>
      </header>

      {!POSTER_PAYMENT_LIVE_ENABLED && !HIDE_TEST_MODE_BANNER && (
        <p
          role="note"
          className="mb-5 rounded-md border-2 border-brand bg-banner px-4 py-3 text-base font-semibold text-action"
        >
          무통장입금(계좌이체)으로 실제 주문하실 수 있어요. 카드결제는 지금
          테스트 모드예요(실제 청구·배송 안 됨).
        </p>
      )}

      <PosterOrderForm
        options={options.map((o) => ({
          id: o.id,
          name: o.name,
          spec: o.spec,
          unitKrw: o.unitKrw,
        }))}
        shippingKrw={SHIPPING_KRW}
        clientKey={clientKey}
        customerKey={userId}
        hideTestModeBanner={HIDE_TEST_MODE_BANNER}
      />

      <div className="mt-6">
        <Link
          href="/poster/view"
          className="text-base font-semibold text-ink-soft underline hover:text-ink"
        >
          ← 포스터로 돌아가기
        </Link>
      </div>
    </main>
  );
}
