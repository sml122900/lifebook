import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { settleOrderAfterToss } from "@/lib/tokens/orders";
import { TossConfirmError, confirmTossPayment } from "@/lib/tokens/toss";

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
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold text-zinc-900">충전 완료!</h1>
      <p className="text-2xl text-zinc-900">
        {settle.tokensCredited > 0 ? (
          <>
            <span className="font-bold">{settle.tokensCredited}개 토큰</span>이
            적립됐어요.
          </>
        ) : (
          <>이미 처리된 결제예요.</>
        )}
      </p>
      <p className="text-lg text-zinc-800">
        남은 토큰{" "}
        <span className="font-bold">{settle.balanceAfter.toLocaleString()}개</span>
      </p>
      <div className="flex gap-3">
        <Link
          href="/life-timeline"
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          인생 연혁으로
        </Link>
        <Link
          href="/billing"
          className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          충전 화면으로
        </Link>
      </div>
    </main>
  );
}

function FailureScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-bold text-rose-800">{title}</h1>
      <p className="text-lg text-zinc-800">{body}</p>
      <Link
        href="/billing"
        className="self-start rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        다시 시도하기
      </Link>
    </main>
  );
}
