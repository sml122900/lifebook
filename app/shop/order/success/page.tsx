import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import {
  findSettledProductOrder,
  settleProductOrder,
} from "@/lib/commerce/orders";
import { TossConfirmError, confirmTossPayment } from "@/lib/tokens/toss";

// /shop/order/success — 토스가 결제 확인 후 리다이렉트. 적립이 아니라
// 주문 접수(status=paid) 기록. confirm(서버) + 금액 대조 후에만 확정.
// confirmTossPayment 는 토큰 결제와 공용(도메인 무관).
//
// v1 테스트: success 화면에 "실제 배송되지 않아요" 명시. /shop layout 의
// 상시 배너와 함께 이중 안내.

type SP = Promise<{ paymentKey?: string; orderId?: string; amount?: string }>;

export default async function ShopOrderSuccessPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const sp = await searchParams;
  const paymentKey = typeof sp.paymentKey === "string" ? sp.paymentKey : "";
  const orderId = typeof sp.orderId === "string" ? sp.orderId : "";
  const amountRaw = typeof sp.amount === "string" ? sp.amount : "";
  const amountFromUrl = Number(amountRaw);

  if (!paymentKey || !orderId || !Number.isFinite(amountFromUrl)) {
    return (
      <FailureScreen
        title="결제 정보가 부족해요"
        body="결제창에서 돌아오는 정보가 비어 있어요. 다시 시도해 주세요."
      />
    );
  }

  // 0. 재방문/새로고침 방어 — 이미 접수된 주문이면 confirm 재호출(에러) 없이
  //    안내. 첫 방문에서 이미 결제·접수가 끝났으니 "이미 접수됐어요"만.
  const already = await findSettledProductOrder(userId, orderId);
  if (already) {
    return (
      <SuccessScreen
        productName={already.productName}
        totalKrw={already.totalKrw}
        alreadySettled
      />
    );
  }

  // 1. 토스 승인(서버에서만).
  let confirmed;
  try {
    confirmed = await confirmTossPayment({
      paymentKey,
      orderId,
      amount: amountFromUrl,
    });
  } catch (err) {
    const message =
      err instanceof TossConfirmError ? err.message : String(err);
    return (
      <FailureScreen
        title="결제 승인에 실패했어요"
        body={`토스 서버 승인 단계에서 멈췄어요. (${message})`}
      />
    );
  }

  // 2. 우리 주문과 금액 대조 후 접수(paid).
  const settle = await settleProductOrder(
    userId,
    orderId,
    paymentKey,
    confirmed.totalAmount,
  );
  if (!settle.ok) {
    return (
      <FailureScreen
        title="주문 확인 중 문제가 생겼어요"
        body={`사유: ${settle.reason}`}
      />
    );
  }

  return (
    <SuccessScreen
      productName={settle.productName}
      totalKrw={settle.totalKrw}
      alreadySettled={settle.alreadySettled}
    />
  );
}

// 주문 접수 화면 — 정상 접수와 "이미 접수됨"(재방문) 공용.
function SuccessScreen({
  productName,
  totalKrw,
  alreadySettled,
}: {
  productName: string;
  totalKrw: number;
  alreadySettled: boolean;
}) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold text-ink">
        {alreadySettled ? "이미 접수된 주문이에요" : "주문이 접수됐어요!"}
      </h1>
      <p className="text-2xl text-ink">
        <span className="font-bold">{productName}</span> ·{" "}
        {totalKrw.toLocaleString()}원
      </p>
      <p
        role="note"
        className="rounded-md border-2 border-brand bg-banner px-5 py-4 text-lg font-semibold text-action"
      >
        테스트 주문이에요 — 실제로 배송되지 않고, 청구도 되지 않아요.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/account/orders" className={buttonClasses("tertiary", "lg")}>
          내 주문 보기
        </Link>
        <Link
          href="/life-timeline"
          className="rounded-md border-2 border-line px-6 py-4 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          인생 연혁으로
        </Link>
      </div>
    </main>
  );
}

function FailureScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-bold text-rose-800">{title}</h1>
      <p className="text-lg text-ink">{body}</p>
      <Link
        href="/shop"
        className="self-start rounded-md border-2 border-line px-6 py-4 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        상점으로 돌아가기
      </Link>
    </main>
  );
}
