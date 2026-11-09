"use client";

// My Life 인쇄본 — 출력 편집 화면(2026-11-08 — print-mylife.md §2·§5.2). 한 화면에서 단계만 바뀜: 고치기(미리보기·빼기·보이는 방법·금액) → 주문(배송지·결제위젯).
// 배치는 lib/print-layout(순수 — 서버 주문과 같은 함수), 그림은 lib/print-render(Canvas). 실제 지도는 바꾸지 않는다(편집 상태만 PrintDraft 에 저장).

import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { loadTossPayments, type TossPaymentsWidgets } from "@tosspayments/tosspayments-sdk";

import { AddressSearch } from "@/app/components/AddressSearch";
import { Button } from "@/components/ui/Button";
import { printOnSale, printPrice } from "@/lib/commerce/print-price";
import type { MyLifeData } from "@/lib/my-life";
import { PRINT_COPY as T } from "@/lib/print-copy";
import { layoutPrint, PRINT, printKey, type PrintOptions, type PrintPage } from "@/lib/print-layout";
import { loadPrintFonts, pageLabel, type PrintFonts } from "@/lib/print-render";
import { displayTitle } from "@/lib/story-title";

import { savePrintDraftAction, startPrintOrderAction } from "./actions";
import { PageCanvas } from "./PageCanvas";

type Props = {
  data: MyLifeData;
  owner: string;
  initial: PrintOptions;
  widgetClientKey: string | null;
  customerKey: string;
  testMode: boolean;
};

const won = (n: number) => n.toLocaleString("ko-KR");
const FIELD =
  "w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2";
const ROW = "flex min-h-[56px] cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-lg text-ink hover:bg-banner";
const BOX = "h-6 w-6 shrink-0 accent-action";

export function PrintEditor({ data, owner, initial, widgetClientKey, customerKey, testMode }: Props) {
  const [opts, setOpts] = useState<PrintOptions>(initial);
  const [fonts, setFonts] = useState<PrintFonts | null>(null);
  const [big, setBig] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [step, setStep] = useState<"edit" | "order">("edit");
  const layout = useMemo(() => layoutPrint(data, owner, opts), [data, owner, opts]);
  // 금액 = 서버 주문과 같은 함수(lib/commerce/print-price — 장당 금액 × 장수, 배송비 포함). 서버가 주문 때 다시 계산한다.
  const onSale = printOnSale();
  const price = layout.overLimit ? null : printPrice(layout.pageCount);
  const excluded = useMemo(() => new Set(opts.excluded), [opts.excluded]);
  const canOrder = onSale && layout.pageCount > 1 && price != null;

  useEffect(() => {
    let alive = true;
    loadPrintFonts().then((f) => alive && setFonts(f));
    return () => {
      alive = false;
    };
  }, []);

  // 편집 상태 자동 저장(어르신이 중간에 나가도 남음 — Q10). 처음 그릴 때는 안 함.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      savePrintDraftAction(opts).then((r) => setSaveState(r.ok ? "saved" : "failed"));
    }, 800);
    return () => clearTimeout(t);
  }, [opts]);

  const toggle = (key: string, include: boolean) =>
    setOpts((o) => ({ ...o, excluded: include ? o.excluded.filter((k) => k !== key) : [...o.excluded, key] }));
  // 컴포넌트가 아니라 그리기 함수 — 매번 새 컴포넌트가 되면 체크 뒤 다시 그려져 키보드 위치를 잃는다.
  const check = (k: string, label: string, sub?: string | null, disabled?: boolean) => (
    <label key={k} className={`${ROW} ${disabled ? "cursor-not-allowed text-ink-soft" : ""}`}>
      <input type="checkbox" className={BOX} checked={!excluded.has(k) && !disabled} disabled={disabled} onChange={(e) => toggle(k, e.target.checked)} />
      <span>
        {label}
        {sub ? <span className="text-ink-soft"> · {sub}</span> : null}
      </span>
    </label>
  );
  const custom = data.custom;

  if (step === "order" && canOrder && price) {
    return (
      <OrderStep
        opts={opts}
        total={price.totalKrw}
        unit={price.unitKrw}
        shippingKrw={price.shippingKrw}
        pages={layout.pageCount}
        widgetClientKey={widgetClientKey}
        customerKey={customerKey}
        testMode={testMode}
        onBack={() => setStep("edit")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-40">
      <p className="rounded-md border-2 border-line bg-banner px-4 py-3 text-lg text-ink">{T.notice}</p>

      {/* 미리보기 */}
      <section aria-labelledby="print-preview" className="flex flex-col gap-3">
        <h2 id="print-preview" className="text-2xl font-bold text-ink">
          {T.previewTitle}
        </h2>
        <p className="text-lg text-ink-soft">{T.previewHint}</p>
        <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {layout.pages.map((p, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => setBig(i)}
                aria-label={T.pageAria(i + 1, pageLabel(p))}
                className="flex w-full flex-col items-center gap-2 rounded-md p-1 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              >
                <PageCanvas page={p} no={i + 1} total={layout.pageCount} width={150} fonts={fonts} />
                <span className="text-base text-ink-soft">{i + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      </section>

      {/* 보이는 방법 */}
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-2 text-2xl font-bold text-ink">{T.optionsTitle}</legend>
        {(
          [
            ["showPeopleEdges", T.peopleEdges],
            ["showPlaceEdges", T.placeEdges],
            ["initials", T.initials],
          ] as const
        ).map(([k, label]) => (
          <label key={k} className={ROW}>
            <input type="checkbox" className={BOX} checked={opts[k]} onChange={(e) => setOpts((o) => ({ ...o, [k]: e.target.checked }))} />
            {label}
          </label>
        ))}
      </fieldset>

      {/* 인쇄에 넣을 것(빼기 — 출력본에만) */}
      <section aria-labelledby="print-include" className="flex flex-col gap-3">
        <h2 id="print-include" className="text-2xl font-bold text-ink">
          {T.excludeTitle}
        </h2>
        <p className="text-lg text-ink-soft">{T.excludeHint}</p>
        {opts.excluded.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-lg text-ink">{T.excludedLine(opts.excluded.length)}</span>
            <Button variant="tertiary" onClick={() => setOpts((o) => ({ ...o, excluded: [] }))}>
              {T.restoreAll}
            </Button>
          </div>
        )}
        <details open className="rounded-md border border-line px-3 py-2">
          <summary className="min-h-[48px] cursor-pointer py-2 text-xl font-bold text-ink">{T.secPeriods}</summary>
          {data.events.map((e) => {
            const own = e.stories.filter((s) => s.primaryEventId === e.id);
            const off = excluded.has(printKey.event(e.id));
            return (
              <div key={e.id} className="border-t border-line py-1">
                {check(printKey.event(e.id), e.label, e.year != null ? String(e.year) : null)}
                {off && own.length > 0 && <p className="px-3 pb-2 text-base text-ink-soft">{T.storyCascade(own.length)}</p>}
                <div className="pl-8">
                  {own.map((s) => check(printKey.story(s.id), displayTitle(s), null, off))}
                </div>
              </div>
            );
          })}
        </details>
        {(
          [
            [T.secPeople, data.people.map((p) => ({ k: printKey.person(p.id), label: p.name, sub: p.relation }))],
            [T.secGroups, data.groups.map((g) => ({ k: printKey.group(g.id), label: g.name, sub: null }))],
            [T.secPlaces, data.places.map((p) => ({ k: printKey.place(p.id), label: p.name, sub: null }))],
            [T.secPlaceGroups, data.placeGroups.map((g) => ({ k: printKey.placeGroup(g.id), label: g.name, sub: null }))],
          ] as const
        )
          .filter(([, rows]) => rows.length > 0)
          .map(([title, rows]) => (
            <details key={title} className="rounded-md border border-line px-3 py-2">
              <summary className="min-h-[48px] cursor-pointer py-2 text-xl font-bold text-ink">{title}</summary>
              {rows.map((r) => check(r.k, r.label, r.sub))}
            </details>
          ))}
        {custom && custom.categories.length > 0 && (
          <details className="rounded-md border border-line px-3 py-2">
            <summary className="min-h-[48px] cursor-pointer py-2 text-xl font-bold text-ink">{T.secCustom}</summary>
            {custom.categories.map((c) => {
              const off = excluded.has(printKey.category(c.id));
              return (
                <div key={c.id} className="border-t border-line py-1">
                  {check(printKey.category(c.id), c.name)}
                  <div className="pl-8">
                    {custom.items
                      .filter((it) => it.categoryId === c.id)
                      .map((it) => check(printKey.item(it.id), it.name, null, off))}
                  </div>
                </div>
              );
            })}
          </details>
        )}
      </section>

      {/* 금액 줄(늘 보임 — §5.2) */}
      {/* 오른쪽 여백 = 오른쪽 아래 AI 비서 버튼(64px) 자리 — 390 에서 [주문하기]가 가리지 않게 */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-line bg-surface py-4 pl-6 pr-24">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite" className="flex flex-col gap-1">
            <p className="text-lg font-bold text-ink">{T.pagesLine(layout.pageCount)}</p>
            {layout.overLimit ? (
              <p className="text-lg text-danger">{T.overLimit(PRINT.MAX_PAGES)}</p>
            ) : !onSale || price == null ? (
              <p className="text-lg text-ink-soft">{T.priceTbd}</p>
            ) : (
              <p className="text-lg text-ink">{T.sumLine(won(price.unitKrw), price.quantity, won(price.totalKrw))}</p>
            )}
            <p className="text-base text-ink-soft">
              {saveState === "saving" ? T.saving : saveState === "saved" ? T.saved : saveState === "failed" ? T.saveFailed : " "}
            </p>
          </div>
          <Button variant="primary" size="lg" disabled={!canOrder} onClick={() => setStep("order")}>
            {T.order}
          </Button>
        </div>
      </div>

      {big !== null && (
        <BigView pages={layout.pages} index={big} fonts={fonts} onIndex={setBig} onClose={() => setBig(null)} />
      )}
    </div>
  );
}

function BigView({ pages, index, fonts, onIndex, onClose }: { pages: PrintPage[]; index: number; fonts: PrintFonts | null; onIndex: (i: number) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  // 크게 보기는 누른 뒤에만 그려지므로(브라우저) 창 크기로 바로 정함
  const [width] = useState(() => Math.min(800, window.innerWidth - 48, ((window.innerHeight - 180) * PRINT.PAGE_W) / PRINT.PAGE_H));
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const p = pages[index];
  return (
    <dialog ref={ref} onClose={onClose} aria-label={T.pageAria(index + 1, pageLabel(p))} className="m-auto max-h-none rounded-lg border-2 border-line bg-surface p-4 backdrop:bg-scrim">
      <div className="flex flex-col items-center gap-3">
        <PageCanvas page={p} no={index + 1} total={pages.length} width={width} fonts={fonts} />
        <div className="flex w-full flex-wrap justify-between gap-2">
          <Button variant="secondary" disabled={index === 0} onClick={() => onIndex(index - 1)}>
            {T.bigPrev}
          </Button>
          <Button variant="tertiary" onClick={() => ref.current?.close()}>
            {T.bigClose}
          </Button>
          <Button variant="secondary" disabled={index === pages.length - 1} onClick={() => onIndex(index + 1)}>
            {T.bigNext}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

function OrderStep(props: {
  opts: PrintOptions;
  total: number;
  unit: number;
  shippingKrw: number;
  pages: number;
  widgetClientKey: string | null;
  customerKey: string;
  testMode: boolean;
  onBack: () => void;
}) {
  const { opts, total, unit, shippingKrw, pages, widgetClientKey, customerKey, testMode, onBack } = props;
  const [ship, setShip] = useState({ recipientName: "", recipientPhone: "", postalCode: "", address1: "", jibunAddress: "", address2: "", deliveryMemo: "" });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(widgetClientKey ? null : T.widgetMissing);
  const widgets = useRef<TossPaymentsWidgets | null>(null);

  // 결제위젯 v2 — 금액을 먼저 정하고 결제수단·약관을 그린다(테스트 키 — 실결제 꺼 둠).
  useEffect(() => {
    if (!widgetClientKey) return;
    let alive = true;
    (async () => {
      const tp = await loadTossPayments(widgetClientKey);
      const w = tp.widgets({ customerKey });
      await w.setAmount({ currency: "KRW", value: total });
      await Promise.all([
        w.renderPaymentMethods({ selector: "#print-pay-methods", variantKey: "DEFAULT" }),
        w.renderAgreement({ selector: "#print-pay-agreement", variantKey: "AGREEMENT" }),
      ]);
      if (alive) {
        widgets.current = w;
        setReady(true);
      }
    })().catch((e) => {
      console.error("[print] 결제위젯", e);
      if (alive) setError(T.widgetMissing);
    });
    return () => {
      alive = false;
    };
  }, [widgetClientKey, customerKey, total]);

  async function pay() {
    setError(null);
    if (!ship.recipientName.trim() || !ship.recipientPhone.trim() || !ship.postalCode.trim() || !ship.address1.trim()) {
      setError(T.needShipping);
      return;
    }
    const w = widgets.current;
    if (!w) return;
    setBusy(true);
    // 1) 주문(대기) — 서버가 같은 사용자의 미결제 대기 주문을 다시 씀(여러 번 눌러도 하나)
    let order: { orderId: string; orderName: string; totalKrw: number };
    try {
      const res = await startPrintOrderAction(opts, {
        recipientName: ship.recipientName,
        recipientPhone: ship.recipientPhone,
        postalCode: ship.postalCode.trim() || null,
        address1: ship.address1,
        address2: ship.address2.trim() || null,
        jibunAddress: ship.jibunAddress.trim() || null,
        deliveryMemo: ship.deliveryMemo.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      order = res.order;
    } catch (e) {
      console.error("[print] 주문", e);
      setError(T.orderFailed);
      setBusy(false);
      return;
    }
    // 2) 결제창 — 위젯이 거절하면(결제 수단·카드사 안 고름 등) 주문 실패가 아니라 결제 수단 안내. 사용자가 창을 닫으면 안내 없음.
    try {
      await w.setAmount({ currency: "KRW", value: order.totalKrw }); // 서버가 다시 센 금액
      await w.requestPayment({
        orderId: order.orderId,
        orderName: order.orderName,
        successUrl: `${window.location.origin}/shop/order/success`,
        failUrl: `${window.location.origin}/shop/order/fail`,
      });
    } catch (e) {
      const code = (e as { code?: unknown } | null)?.code;
      if (code !== "USER_CANCEL") console.error("[print] 결제 요청", e);
      setError(code === "USER_CANCEL" ? null : T.pickMethod);
      setBusy(false);
    }
  }

  const field = (k: keyof typeof ship, label: string, extra: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-2 text-lg text-ink">
      {label}
      <input className={FIELD} value={ship[k]} onChange={(e) => setShip((s) => ({ ...s, [k]: e.target.value }))} {...extra} />
    </label>
  );

  return (
    <div className="flex flex-col gap-6">
      <Button variant="tertiary" className="self-start" onClick={onBack}>
        {T.backToEdit}
      </Button>
      <h2 className="text-2xl font-bold text-ink">{T.orderTitle}</h2>
      <dl className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4 text-lg">
        <div className="flex justify-between">
          <dt className="text-ink-soft">{T.rowItem(won(unit), pages)}</dt>
          <dd className="font-semibold text-ink">{won(unit * pages)}원</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-soft">{T.rowShipping}</dt>
          <dd className="font-semibold text-ink">{shippingKrw === 0 ? T.shippingFree : `${won(shippingKrw)}원`}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-3">
          <dt className="font-bold text-ink">{T.rowTotal}</dt>
          <dd className="text-xl font-bold text-action">{won(total)}원</dd>
        </div>
      </dl>
      <section className="flex flex-col gap-4" aria-labelledby="print-ship">
        <h3 id="print-ship" className="text-xl font-bold text-ink">
          {T.shippingTitle}
        </h3>
        {field("recipientName", "받는 분", { maxLength: 40, autoComplete: "name" })}
        {field("recipientPhone", "연락처", { type: "tel", maxLength: 20, autoComplete: "tel" })}
        <AddressSearch
          postalCode={ship.postalCode}
          roadAddress={ship.address1}
          jibunAddress={ship.jibunAddress}
          onComplete={(r) => setShip((s) => ({ ...s, postalCode: r.postalCode, address1: r.roadAddress, jibunAddress: r.jibunAddress }))}
        />
        {field("address2", "상세 주소", { maxLength: 120, autoComplete: "address-line2" })}
        {field("deliveryMemo", "배송 메모", { maxLength: 100 })}
      </section>
      <section className="flex flex-col gap-2" aria-labelledby="print-pay">
        <h3 id="print-pay" className="text-xl font-bold text-ink">
          {T.payTitle}
        </h3>
        {testMode && <p className="text-lg text-ink-soft">{T.testMode}</p>}
        <div id="print-pay-methods" className="rounded-md bg-paper" />
        <div id="print-pay-agreement" className="rounded-md bg-paper" />
      </section>
      {error && (
        <p role="alert" className="rounded-md border-2 border-danger bg-danger-wash px-4 py-3 text-lg text-danger">
          {error}
        </p>
      )}
      <Button variant="primary" size="lg" disabled={!ready || busy} onClick={pay}>
        {busy ? T.paying : T.pay}
      </Button>
    </div>
  );
}
