"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";

import { Button } from "@/components/ui/Button";
import { SELECTED } from "@/components/ui/chip";

import { startTopup } from "./actions";

// 토큰 충전 — 결제위젯 v2(2026-11-10 — 인쇄본 주문과 같은 위젯·같은 키, 옛 결제창 방식 대체).
// 순서: 상품(패키지) 고르기 → 위젯 금액 = 그 패키지 → [충전하기] → 서버가 대기 주문(정본 금액) → 위젯 금액을 서버 금액으로 → 결제창.
// 브라우저는 금액을 정하지 않는다 — 서버엔 packageId 만 보내고, 성공 화면에서 서버가 토스 승인 금액과 주문 금액을 맞춰 본 뒤 적립.

type Pkg = { id: string; krw: number; tokens: number; bonus: number; label: string };

const T = {
  pickTitle: "충전할 토큰",
  bonus: (n: number) => `+${n}토큰 더!`,
  payTitle: "결제 방법",
  pay: (krw: number) => `${krw.toLocaleString()}원 충전하기`,
  paying: "결제창을 여는 중…",
  widgetMissing: "결제 준비가 아직 안 됐어요. 잠시 뒤 다시 해 주세요.",
  pickMethod: "결제 수단을 골라 주세요. 카드는 카드사까지 골라 주세요.",
  orderFailed: "충전 주문을 만들지 못했어요. 잠시 뒤 다시 해 주세요.",
  testMode: "카드결제는 지금 테스트 모드예요. 실제로 돈이 나가지 않아요.",
};

export function TopupCheckout({
  packages,
  widgetClientKey,
  customerKey,
  testMode,
}: {
  packages: readonly Pkg[];
  widgetClientKey: string | null;
  customerKey: string;
  testMode: boolean;
}) {
  const [pkgId, setPkgId] = useState(packages[0].id);
  const pkg = packages.find((p) => p.id === pkgId) ?? packages[0];
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(widgetClientKey ? null : T.widgetMissing);
  const widgets = useRef<TossPaymentsWidgets | null>(null);
  const firstKrw = useRef(pkg.krw);

  // 위젯은 한 번만 그리고(금액 먼저), 패키지를 바꾸면 금액만 바꾼다.
  useEffect(() => {
    if (!widgetClientKey) return;
    let alive = true;
    (async () => {
      const tp = await loadTossPayments(widgetClientKey);
      const w = tp.widgets({ customerKey });
      await w.setAmount({ currency: "KRW", value: firstKrw.current });
      await Promise.all([
        w.renderPaymentMethods({ selector: "#topup-pay-methods", variantKey: "DEFAULT" }),
        w.renderAgreement({ selector: "#topup-pay-agreement", variantKey: "AGREEMENT" }),
      ]);
      if (alive) {
        widgets.current = w;
        setReady(true);
      }
    })().catch((e) => {
      console.error("[topup] 결제위젯", e);
      if (alive) setError(T.widgetMissing);
    });
    return () => {
      alive = false;
    };
  }, [widgetClientKey, customerKey]);

  useEffect(() => {
    widgets.current?.setAmount({ currency: "KRW", value: pkg.krw }).catch((e) => console.error("[topup] 금액", e));
  }, [pkg.krw, ready]);

  async function pay() {
    const w = widgets.current;
    if (!w) return;
    setError(null);
    setBusy(true);
    let order: { orderId: string; orderName: string; krw: number };
    try {
      order = await startTopup(pkg.id);
    } catch (e) {
      console.error("[topup] 주문", e);
      setError(T.orderFailed);
      setBusy(false);
      return;
    }
    // 위젯이 거절하면(결제 수단·카드사 안 고름 등) 결제 수단 안내, 창을 닫으면 안내 없음 — 인쇄본과 같음.
    try {
      await w.setAmount({ currency: "KRW", value: order.krw }); // 서버가 정한 금액
      await w.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/billing/success`,
        failUrl: `${window.location.origin}/billing/fail`,
      });
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code !== "USER_CANCEL") console.error("[topup] 결제 요청", e);
      setError(code === "USER_CANCEL" ? null : T.pickMethod);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-3 text-2xl font-bold text-ink">{T.pickTitle}</legend>
        {packages.map((p) => {
          const on = p.id === pkgId;
          return (
            <label
              key={p.id}
              className={
                "flex min-h-[64px] cursor-pointer items-center gap-3 rounded-md px-5 py-4 focus-within:ring-4 focus-within:ring-brand " +
                (on ? SELECTED : "border-2 border-line bg-surface hover:bg-banner")
              }
            >
              <input type="radio" name="topup-package" value={p.id} checked={on} onChange={() => setPkgId(p.id)} className="h-6 w-6 shrink-0 accent-action" />
              {/* 더 드리는 토큰은 이름 아래(390 에서 한 줄 — 2026-11-10 실측) */}
              <span className="flex flex-col">
                <span className="text-xl font-bold text-ink">{p.label}</span>
                {p.bonus > 0 && <span className="text-base font-bold text-action">{T.bonus(p.bonus)}</span>}
              </span>
            </label>
          );
        })}
      </fieldset>

      <section className="flex flex-col gap-2" aria-labelledby="topup-pay">
        <h2 id="topup-pay" className="text-2xl font-bold text-ink">
          {T.payTitle}
        </h2>
        {testMode && <p className="text-lg text-ink-soft">{T.testMode}</p>}
        <div id="topup-pay-methods" className="rounded-md bg-paper" />
        <div id="topup-pay-agreement" className="rounded-md bg-paper" />
      </section>

      {error && (
        <p role="alert" className="rounded-md border-2 border-danger bg-danger-wash px-4 py-3 text-lg text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" disabled={!ready || busy} onClick={pay}>
        {busy ? T.paying : T.pay(pkg.krw)}
      </Button>
    </div>
  );
}
