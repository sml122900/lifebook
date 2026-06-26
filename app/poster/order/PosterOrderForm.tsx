"use client";

import { useState } from "react";
import { loadTossPayments } from "@tosspayments/tosspayments-sdk";

import { AddressSearch } from "@/app/components/AddressSearch";

import { startPosterOrder } from "./actions";

// 재질 선택 + 배송지 + 토스 결제. 금액은 서버가 결정(클라 불신) — 여기선
// 선택한 optionId 와 배송지만 보내고, 서버가 단가·스냅샷·총액을 박는다.

type OptionView = { id: string; name: string; spec: string; unitKrw: number };

type Props = {
  options: OptionView[];
  shippingKrw: number;
  clientKey: string;
  customerKey: string; // User.id
};

const FIELD =
  "w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2";

const won = (n: number) => n.toLocaleString("ko-KR");

export function PosterOrderForm({
  options,
  shippingKrw,
  clientKey,
  customerKey,
}: Props) {
  const [optionId, setOptionId] = useState(options[0]?.id ?? "");
  const [recipientName, setRecipientName] = useState("");
  const [recipientPhone, setRecipientPhone] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [address1, setAddress1] = useState(""); // 도로명(카카오 검색)
  const [jibunAddress, setJibunAddress] = useState(""); // 지번(카카오 검색)
  const [address2, setAddress2] = useState("");
  const [deliveryMemo, setDeliveryMemo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = options.find((o) => o.id === optionId) ?? options[0];
  const total = (selected?.unitKrw ?? 0) + shippingKrw;

  async function handlePay() {
    setError(null);
    if (!optionId) {
      setError("재질을 골라 주세요.");
      return;
    }
    if (
      recipientName.trim() === "" ||
      recipientPhone.trim() === "" ||
      postalCode.trim() === "" ||
      address1.trim() === ""
    ) {
      setError("받는 분, 연락처, 우편번호·주소를 입력해 주세요.");
      return;
    }
    setSubmitting(true);
    try {
      const order = await startPosterOrder(optionId, {
        recipientName,
        recipientPhone,
        postalCode: postalCode.trim() || null,
        address1,
        address2: address2.trim() || null,
        jibunAddress: jibunAddress.trim() || null,
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
      setSubmitting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* 재질 선택 */}
      <fieldset className="flex flex-col gap-3">
        <legend className="text-xl font-bold text-ink">재질 고르기</legend>
        {options.map((o) => (
          <label
            key={o.id}
            className={
              "flex cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3 " +
              (o.id === optionId
                ? "border-action bg-banner"
                : "border-line bg-surface hover:bg-banner")
            }
          >
            <input
              type="radio"
              name="material"
              value={o.id}
              checked={o.id === optionId}
              onChange={() => setOptionId(o.id)}
              className="mt-1.5 h-5 w-5 accent-amber-500"
            />
            <span className="flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold text-ink">{o.name}</span>
                <span className="text-lg font-bold text-ink">{won(o.unitKrw)}원</span>
              </span>
              <span className="mt-0.5 block text-sm text-ink-soft">{o.spec}</span>
            </span>
          </label>
        ))}
        <p className="text-sm text-ink-faint">
          액자·족자 옵션은 준비 중이에요. 표시가는 부가세가 포함된 금액이에요.
        </p>
      </fieldset>

      {/* 배송지 */}
      <div className="flex flex-col gap-5 border-t-2 border-line pt-6">
        <h2 className="text-xl font-bold text-ink">어디로 보내드릴까요?</h2>

        <Field label="받는 분" required>
          <input type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="예: 김복순" maxLength={40} autoComplete="name" className={FIELD} />
        </Field>
        <Field label="연락처" required>
          <input type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="예: 010-1234-5678" maxLength={20} autoComplete="tel" className={FIELD} />
        </Field>
        <AddressSearch
          postalCode={postalCode}
          roadAddress={address1}
          jibunAddress={jibunAddress}
          onComplete={(r) => {
            setPostalCode(r.postalCode);
            setAddress1(r.roadAddress);
            setJibunAddress(r.jibunAddress);
          }}
        />
        <Field label="상세 주소">
          <input type="text" value={address2} onChange={(e) => setAddress2(e.target.value)} placeholder="예: 101동 1203호" maxLength={120} autoComplete="address-line2" className={FIELD} />
        </Field>
        <Field label="배송 메모">
          <input type="text" value={deliveryMemo} onChange={(e) => setDeliveryMemo(e.target.value)} placeholder="예: 부재 시 경비실에 맡겨주세요" maxLength={100} className={FIELD} />
        </Field>
      </div>

      {/* 금액 요약 */}
      <div className="rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
        <div className="flex justify-between text-ink-soft">
          <span>포스터 ({selected?.name})</span>
          <span>{won(selected?.unitKrw ?? 0)}원</span>
        </div>
        <div className="mt-1 flex justify-between text-ink-soft">
          <span>배송비</span>
          <span>{won(shippingKrw)}원</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-line pt-2 text-xl font-bold text-ink">
          <span>합계</span>
          <span>{won(total)}원</span>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={submitting}
        className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-4 text-lg font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        {submitting ? "결제 창 여는 중…" : `${won(total)}원 결제하기`}
      </button>
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
