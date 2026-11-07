"use client";

// AI 시트(custom-graph 3a·3b) — 질문하기(읽기 전용)와 지도 고치기.
// 고치기 = 확인 카드(무엇을 할지 — 코드가 만든 문장) → [이대로 하기] → 결과 카드(한 일 · 지도에서 보기 · [되돌리기]). 카드 전에는 아무것도 안 바뀐다.
// 질문·요청·답은 이 화면 상태에만(저장 0). 글자 크기 18px 이상·터치 48px 이상.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { MAP_QUESTION_MAX } from "@/lib/map-agent-view";
import type { MapEditApplyResult, MapEditPlanResult } from "@/lib/map-edit";
import { planLine, type MapPlanItem } from "@/lib/map-edit-plan";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import type { SearchKind } from "@/lib/my-life-search";

import { applyMapEditAction, askMapAction, planMapEditAction, undoMapEditAction, type AskMapView } from "./actions";

const A = C.ask;

const KIND_LABEL: Record<SearchKind, string> = {
  event: C.kindEvent,
  story: C.kindStory,
  person: C.kindPerson,
  place: C.kindPlace,
  group: C.kindGroup,
  placeGroup: C.kindPlaceGroup,
  category: C.custom.kindCategory,
  customGroup: C.custom.kindGroup,
  item: C.custom.kindItem,
};

const CHIP = "min-h-[48px] rounded-full border-2 border-line bg-surface px-4 py-1 text-left text-lg text-ink hover:bg-banner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand";

export function AskSheet({ seed, onGo, onClose }: { seed: string; onGo: (key: string, eventId: string | null) => void; onClose: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState(seed);
  const [view, setView] = useState<AskMapView | null>(null);
  const [planView, setPlanView] = useState<MapEditPlanResult | null>(null);
  const [result, setResult] = useState<MapEditApplyResult | null>(null);
  const [undoState, setUndoState] = useState<"idle" | "done" | "failed">("idle");
  const [pending, start] = useTransition();

  function clear() {
    setView(null);
    setPlanView(null);
    setResult(null);
    setUndoState("idle");
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || pending) return;
    start(async () => {
      const r = await askMapAction(q).catch((): AskMapView => ({ ok: false, reason: "failed" }));
      clear();
      setView(r);
    });
  }

  function requestEdit() {
    if (!q.trim() || pending) return;
    start(async () => {
      const r = await planMapEditAction(q).catch((): MapEditPlanResult => ({ ok: false, reason: "failed" }));
      clear();
      setPlanView(r);
    });
  }

  function apply(plan: MapPlanItem[]) {
    start(async () => {
      const r = await applyMapEditAction(plan).catch((): MapEditApplyResult => ({ ok: false, error: A.errors.failed }));
      setPlanView(null);
      setResult(r);
      router.refresh();
    });
  }

  function undo(commandId: string, steps: unknown) {
    start(async () => {
      const r = await undoMapEditAction(commandId, steps).catch(() => ({ ok: false as const, error: "" }));
      setUndoState(r.ok ? "done" : "failed");
      router.refresh();
    });
  }

  const plan = planView?.ok ? planView.plan : [];

  return (
    <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <h2 id="mylife-ask-title" className="m-0">
        {A.title}
      </h2>
      <p className="m-0 text-lg text-ink-soft">{A.hint}</p>
      <form onSubmit={ask} className="flex flex-col gap-3">
        <input
          type="text"
          autoFocus
          value={q}
          maxLength={MAP_QUESTION_MAX}
          onChange={(e) => setQ(e.target.value)}
          placeholder={A.placeholder}
          aria-label={A.title}
          className="min-h-[56px] w-full rounded-md border-2 border-line bg-surface px-4 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
        />
        <Button type="submit" variant={plan.length > 0 ? "secondary" : "primary"} size="lg" disabled={pending || !q.trim()}>
          {pending ? A.pending : A.submit}
        </Button>
        <Button variant="secondary" size="lg" disabled={pending || !q.trim()} onClick={requestEdit}>
          {A.edit}
        </Button>
      </form>

      <div aria-live="polite" className="flex flex-col gap-4">
        {view && !view.ok && <p className="m-0 text-lg text-ink">{A.errors[view.reason]}</p>}
        {view?.ok && view.answer.asksChange && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-lg text-ink">{A.asksChange}</p>
            <Button variant="secondary" size="lg" disabled={pending} onClick={requestEdit}>
              {A.edit}
            </Button>
          </div>
        )}
        {view?.ok &&
          view.answer.claims.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-4">
              <p className="m-0 text-lg text-ink">{c.text}</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {c.nodes.map((n) => (
                  <li key={n.key}>
                    <button type="button" onClick={() => onGo(n.key, n.eventId)} className={CHIP}>
                      <span className="text-ink-soft">{KIND_LABEL[n.kind]} · </span>
                      {n.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        {view?.ok && view.answer.noRecord && (
          <p className="m-0 text-lg text-ink">
            {view.answer.noRecord.topic && view.answer.claims.length > 0 ? A.noRecordAbout(view.answer.noRecord.topic) : A.noRecord}
            {view.answer.noRecord.followUpQuestion ? ` ${view.answer.noRecord.followUpQuestion}` : ""}
          </p>
        )}

        {/* 고치기 — 확인 전에는 아무것도 안 바뀐다 */}
        {planView && !planView.ok && <p className="m-0 text-lg text-ink">{A.errors[planView.reason]}</p>}
        {planView?.ok && plan.length === 0 && <p className="m-0 text-lg text-ink">{planView.question ?? (planView.unsupported ? A.plan.unsupported : A.plan.empty)}</p>}
        {plan.length > 0 && (
          <div data-map-edit-card="plan" className="flex flex-col gap-3 rounded-md border-2 border-brand bg-banner p-4">
            <h3 className="m-0 text-xl font-bold text-ink">{A.plan.title}</h3>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {plan.map((item, i) => (
                <li key={i} className="text-lg text-ink">
                  {planLine(item, "will")}
                </li>
              ))}
            </ul>
            <Button variant="primary" size="lg" disabled={pending} onClick={() => apply(plan)}>
              {pending ? A.plan.applying : A.plan.apply}
            </Button>
            <Button variant="tertiary" size="lg" disabled={pending} onClick={clear}>
              {A.plan.cancel}
            </Button>
          </div>
        )}

        {result && !result.ok && <p className="m-0 text-lg text-danger">{result.error}</p>}
        {result?.ok && (
          <div data-map-edit-card="result" className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-4">
            {result.done.length > 0 && <h3 className="m-0 text-xl font-bold text-ink">{undoState === "done" ? A.plan.undone : A.plan.doneTitle}</h3>}
            {undoState !== "done" && (
              <ul className="m-0 flex list-none flex-col gap-3 p-0">
                {result.done.map((d, i) => (
                  <li key={i} className="flex flex-col items-start gap-2">
                    <span className="text-lg text-ink">{d.line}</span>
                    {d.key && (
                      <button type="button" onClick={() => onGo(d.key as string, d.eventId)} className={CHIP}>
                        {A.plan.go}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {result.failed && <p role="alert" className="m-0 text-lg text-danger">{A.plan.stopped(result.failed.line, result.failed.error)}</p>}
            {undoState === "failed" && <p role="alert" className="m-0 text-lg text-danger">{A.plan.undoFailed}</p>}
            {undoState !== "done" && result.undo.length > 0 && (
              <Button variant="secondary" size="lg" disabled={pending} onClick={() => undo(result.commandId, result.undo)}>
                {pending ? A.plan.undoing : A.plan.undo}
              </Button>
            )}
          </div>
        )}
      </div>

      <Button variant="tertiary" size="lg" onClick={onClose}>
        {C.close}
      </Button>
    </div>
  );
}
