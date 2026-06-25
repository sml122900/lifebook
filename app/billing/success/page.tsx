import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { findSettledOrder, settleOrderAfterToss } from "@/lib/tokens/orders";
import { TossConfirmError, confirmTossPayment } from "@/lib/tokens/toss";
import { SuccessScreen } from "./SuccessScreen";

// /billing/success — 사용자가 위젯에서 결제 확인 후 토스가 여기로
// 리다이렉트한다. 쿼리스트링은 힌트일 뿐, 실제 적립은 다음 두 단계
// 뒤에만 일어난다:
//   1. 서버가 토스 /v1/payments/confirm 호출
//   2. 토스가 보고한 금액이 우리 PENDING order.krw 와 일치
//
// 두 체크 모두 서버에서. 클라는 시크릿 키를 볼 수 없고 무엇을 적립할지
// 결정하지도 않는다.

type SP = Promise<{ paymentKey?: string; orderId?: string; amount?: string }>;

export default async function BillingSuccessPage({
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

  // 0. 재방문/새로고침 방어 — 이미 정산된 주문이면 토스 confirm 을 다시 부르지
  //    않는다(이미 처리된 결제엔 confirm 이 에러를 던져 멀쩡한 충전인데도 실패
  //    화면이 뜸). 적립은 첫 방문에서 이미 끝났으니 "이미 충전됐어요" 안내만.
  const already = await findSettledOrder(userId, orderId);
  if (already) {
    return <SuccessScreen tokensCredited={0} balanceAfter={already.balanceAfter} />;
  }

  // 1. 토스로 승인(서버에서만). 토스 측이 paymentKey+orderId+amount 의
  //    일관성을 검증하는 단계이기도 하다.
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

  // 2. 우리 주문과 서버 측 금액 대조 후 적립.
  const settle = await settleOrderAfterToss(
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
      tokensCredited={settle.tokensCredited}
      balanceAfter={settle.balanceAfter}
    />
  );
}

function FailureScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-bold text-rose-800">{title}</h1>
      <p className="text-lg text-ink">{body}</p>
      <Link
        href="/billing"
        className="self-start rounded-md border-2 border-line px-6 py-4 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        다시 시도하기
      </Link>
    </main>
  );
}
