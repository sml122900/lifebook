"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

import { startTopup } from "./actions";

// Phase 8.5 — 한 패키지에 대해 토스 결제 위젯을 연다.
//
// 핵심: 서버엔 packageId "만" 보내고, 서버가 정본 krw·tokens 를 응답한다.
// 브라우저는 금액을 절대 결정하지 않는다(위변조 방지).

type Props = {
  packageId: string;
  label: string;
  clientKey: string;
  customerKey: string; // 사용자별 안정적 불투명 id (User.id 사용)
};

export function TopupButton({ packageId, label, clientKey, customerKey }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setSubmitting(true);
    setError(null);
    try {
      const order = await startTopup(packageId);

      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });

      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.krw },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/billing/success`,
        failUrl: `${window.location.origin}/billing/fail`,
        card: {
          useEscrow: false,
          flowMode: "DEFAULT",
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
      // requestPayment 는 성공 시 리다이렉트한다 — 아래 줄은 사용자가
      // 완료 전에 위젯을 닫은 경우에만 실행된다.
      setSubmitting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={submitting}
        className="rounded-md bg-emerald-700 px-6 py-4 text-lg font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        {submitting ? "결제 창 여는 중..." : `${label} 충전`}
      </button>
      {error && (
        <p className="max-w-xs text-right text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}
