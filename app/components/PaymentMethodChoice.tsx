"use client";

import type { PaymentMethod } from "@/lib/commerce/orders";

// 결제수단 선택 — 포스터/굿즈 주문 폼 공용. 무통장입금(실작동)과 카드결제
// (PG 심사 전 테스트 모드)를 명확히 구분해 어르신이 헷갈리지 않게.

export function PaymentMethodChoice({
  value,
  onChange,
}: {
  value: PaymentMethod;
  onChange: (m: PaymentMethod) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-3 border-t-2 border-line pt-6">
      <legend className="text-xl font-bold text-ink">결제 방법</legend>
      <Choice
        checked={value === "bank_transfer"}
        onSelect={() => onChange("bank_transfer")}
        title="무통장입금 (계좌이체)"
        desc="주문 후 안내되는 계좌로 입금해 주세요. 입금이 확인되면 제작을 시작해요."
      />
      <Choice
        checked={value === "card"}
        onSelect={() => onChange("card")}
        title="카드결제"
        desc="지금은 테스트 모드예요 — 실제로 청구되지 않아요(준비 중)."
      />
    </fieldset>
  );
}

function Choice({
  checked,
  onSelect,
  title,
  desc,
}: {
  checked: boolean;
  onSelect: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={
        "flex cursor-pointer items-start gap-3 rounded-md border-2 px-4 py-3 " +
        (checked
          ? "border-action bg-banner"
          : "border-line bg-surface hover:bg-banner")
      }
    >
      <input
        type="radio"
        name="paymentMethod"
        checked={checked}
        onChange={onSelect}
        className="mt-1.5 h-5 w-5 accent-amber-500"
      />
      <span className="flex-1">
        <span className="block text-lg font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-sm text-ink-soft">{desc}</span>
      </span>
    </label>
  );
}
