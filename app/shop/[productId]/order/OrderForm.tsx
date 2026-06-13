"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

import { startProductOrder } from "../../actions";

// 배송지 입력 + 토스 결제. TopupButton 패턴을 따르되, 결제 전에 서버로
// 배송지를 보내 PENDING ProductOrder 를 만들고 그 총액으로 결제창을 연다.
// 금액은 서버가 결정 — 브라우저는 절대 금액을 정하지 않는다(위변조 방지).
//
// 시니어 친화: 큰 입력·큰 라벨·명확한 에러. 받는 분/연락처/주소가 필수.

type Props = {
  productId: string;
  clientKey: string;
  customerKey: string; // User.id
};

const FIELD =
  "w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2";

export function OrderForm({ productId, clientKey, customerKey }: Props) {
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [deliveryMemo, setDeliveryMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay() {
    setError(null);
    if (
      recipientName.trim() === "" ||
      recipientPhone.trim() === "" ||
      address1.trim() === ""
    ) {
      setError("받는 분, 연락처, 주소를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await startProductOrder(productId, {
        recipientName,
        recipientPhone,
        postalCode: postalCode.trim() || null,
        address1,
        address2: address2.trim() || null,
        deliveryMemo: deliveryMemo.trim() || null,
      });

      const tossPayments = await loadTossPayments(clientKey);
      const payment = tossPayments.payment({ customerKey });
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.totalKrw },
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/shop/order/success`,
        failUrl: `${window.location.origin}/shop/order/fail`,
        card: {
          useEscrow: false,
          flowMode: "DEFAULT",
          useCardPoint: false,
          useAppCardOnly: false,
        },
      });
      // 성공 시 토스가 리다이렉트 — 아래는 사용자가 창을 닫은 경우만 실행.
      setSubmitting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-5">
      <h2 className="text-2xl font-bold text-ink">어디로 보내드릴까요?</h2>

      <Field label="받는 분" required>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="예: 김복순"
          maxLength={40}
          autoComplete="name"
          className={FIELD}
        />
      </Field>

      <Field label="연락처" required>
        <input
          type="tel"
          value={recipientPhone}
          onChange={(e) => setRecipientPhone(e.target.value)}
          placeholder="예: 010-1234-5678"
          maxLength={20}
          autoComplete="tel"
          className={FIELD}
        />
      </Field>

      <Field label="우편번호">
        <input
          type="text"
          inputMode="numeric"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value)}
          placeholder="예: 04524"
          maxLength={10}
          autoComplete="postal-code"
          className={FIELD}
        />
      </Field>

      <Field label="주소" required>
        <input
          type="text"
          value={address1}
          onChange={(e) => setAddress1(e.target.value)}
          placeholder="예: 서울시 중구 세종대로 110"
          maxLength={120}
          autoComplete="address-line1"
          className={FIELD}
        />
      </Field>

      <Field label="상세 주소">
        <input
          type="text"
          value={address2}
          onChange={(e) => setAddress2(e.target.value)}
          placeholder="예: 101동 1203호"
          maxLength={120}
          autoComplete="address-line2"
          className={FIELD}
        />
      </Field>

      <Field label="배송 메모">
        <input
          type="text"
          value={deliveryMemo}
          onChange={(e) => setDeliveryMemo(e.target.value)}
          placeholder="예: 부재 시 경비실에 맡겨주세요"
          maxLength={100}
          className={FIELD}
        />
      </Field>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={submitting}
        className="mt-2 inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-4 text-lg font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {submitting ? "결제 창 여는 중…" : "결제하기"}
      </button>

      <p className="text-base text-ink-soft">
        테스트 결제예요 — 실제로 청구되거나 배송되지 않아요.
      </p>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-lg font-semibold text-ink">
        {label}
        {required && <span className="ml-1 text-action">*</span>}
      </span>
      {children}
    </label>
  );
}
