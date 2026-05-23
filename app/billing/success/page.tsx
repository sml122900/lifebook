import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { settleOrderAfterToss } from "@/lib/tokens/orders";
import { TossConfirmError, confirmTossPayment } from "@/lib/tokens/toss";

// /billing/success — Toss redirects here after the user confirms in
// the widget. The query string is hint-only; the actual credit happens
// only after:
//   1. server calls Toss /v1/payments/confirm
//   2. the amount Toss reports back matches our PENDING order.krw
//
// Both checks run server-side. The client never sees the secret key
// and never decides what to credit.

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

  // 1. Confirm with Toss (server only). This is also where their side
  //    verifies paymentKey + orderId + amount are consistent.
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

  // 2. Server-side amount check against OUR order, then credit.
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
          href="/timeline"
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          타임라인으로
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
