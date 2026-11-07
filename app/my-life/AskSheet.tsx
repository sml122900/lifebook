"use client";

// AI 시트(custom-graph 3a·3b) — 질문하기(읽기 전용)와 지도 고치기.
// 고치기 = 확인 카드(무엇을 할지 — 코드가 만든 문장) → [이대로 하기] → 결과 카드(한 일 · 지도에서 보기 · [되돌리기]). 카드 전에는 아무것도 안 바뀐다.
// 질문·요청·답은 이 화면 상태에만(저장 0). 글자 크기 18px 이상·터치 48px 이상.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { MAP_QUESTION_MAX } from "@/lib/map-agent-view";
import type { MapEditApplyResult, MapEditPlanResult } from "@/lib/map-edit";
import type { MapPlanItem } from "@/lib/map-edit-plan";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";

import { applyMapEditAction, askMapAction, planMapEditAction, undoMapEditAction, type AskMapView } from "./actions";
import { AnswerClaims, PlanCard, ResultCard } from "./AskCards";

const A = C.ask;

// hint = 이 계정이 AI 시트를 처음 연 때 한 줄 안내(튜토리얼 T2 — docs/phase/tutorial.md)
export function AskSheet({ seed, hint, onGo, onClose }: { seed: string; hint: boolean; onGo: (key: string, eventId: string | null) => void; onClose: () => void }) {
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
      {hint && <p className="m-0 rounded-md border-2 border-line bg-banner px-4 py-3 text-lg text-ink">{C.tutorial.askHint}</p>}
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
        {view?.ok && <AnswerClaims claims={view.answer.claims} onGo={onGo} />}
        {view?.ok && view.answer.noRecord && (
          <p className="m-0 text-lg text-ink">
            {view.answer.noRecord.topic && view.answer.claims.length > 0 ? A.noRecordAbout(view.answer.noRecord.topic) : A.noRecord}
            {view.answer.noRecord.followUpQuestion ? ` ${view.answer.noRecord.followUpQuestion}` : ""}
          </p>
        )}

        {/* 고치기 — 확인 전에는 아무것도 안 바뀐다 */}
        {planView && !planView.ok && <p className="m-0 text-lg text-ink">{A.errors[planView.reason]}</p>}
        {planView?.ok && plan.length === 0 && <p className="m-0 text-lg text-ink">{planView.question ?? (planView.unsupported ? (planView.note ?? A.plan.unsupported) : A.plan.empty)}</p>}
        {plan.length > 0 && <PlanCard plan={plan} pending={pending} apply={apply} clear={clear} />}

        {result && !result.ok && <p className="m-0 text-lg text-danger">{result.error}</p>}
        {result?.ok && <ResultCard result={result} undoState={undoState} pending={pending} onGo={onGo} undo={undo} />}
      </div>

      <Button variant="tertiary" size="lg" onClick={onClose}>
        {C.close}
      </Button>
    </div>
  );
}
