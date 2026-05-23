"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

import { startTopup } from "./actions";

// Phase 8.5 — opens the Toss payment widget for one package.
//
// Critical: we send only packageId to the server; the server replies
// with the canonical krw and tokens. The browser never decides the
// amount.

type Props = {
  packageId: string;
  label: string;
  clientKey: string;
  customerKey: string; // stable per-user opaque id (we use User.id)
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
      // requestPayment redirects on success — the line below only runs
      // if the user closed the widget before completing.
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
        className="rounded-md bg-emerald-700 px-6 py-4 text-lg font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        {submitting ? "결제 창 여는 중..." : `${label} 충전`}
      </button>
      {error && (
        <p className="max-w-xs text-right text-sm text-rose-700">{error}</p>
      )}
    </div>
  );
}
