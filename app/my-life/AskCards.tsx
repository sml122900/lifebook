"use client";

// AI 시트 카드(custom-graph 3a·3b·3c) — 답 · 확인 카드 · 결과 카드. AI 시트(./AskSheet)와 튜토리얼 연습 판(./Tutorial)이 같이 쓴다
// (같은 부품 — 연습이 실제와 달라 보이지 않게, docs/phase/tutorial.md T6). 서버 호출 없음 — 누르면 부르는 쪽 함수를 부른다.

import { Button } from "@/components/ui/Button";
import type { MapEditApplyResult, UndoStep } from "@/lib/map-edit";
import { isDestructive, planLine, planNotes, type MapPlanItem } from "@/lib/map-edit-plan";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import type { SearchKind } from "@/lib/my-life-search";

const A = C.ask;
const E = C.edit;

export const KIND_LABEL: Record<SearchKind, string> = {
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

export const CHIP = "min-h-[48px] rounded-full border-2 border-line bg-surface px-4 py-1 text-left text-lg text-ink hover:bg-banner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand";

export type AnswerClaim = { text: string; nodes: { key: string; eventId: string | null; kind: SearchKind; title: string }[] };

// 답 — 주장 하나마다 근거 노드 칩(누르면 지도에서 그 노드)
export function AnswerClaims({ claims, onGo }: { claims: AnswerClaim[]; onGo: (key: string, eventId: string | null) => void }) {
  return (
    <>
      {claims.map((c, i) => (
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
    </>
  );
}

// 확인 카드 — 고치기 전에 무엇을 할지(코드가 만든 문장). 지우기·합치기는 영향 수 + 되돌릴 수 없음(§6.10).
export function PlanCard({ plan, pending, apply, clear }: { plan: MapPlanItem[]; pending: boolean; apply: (plan: MapPlanItem[]) => void; clear: () => void }) {
  const destructive = plan.length === 1 && isDestructive(plan[0]); // 지우기·합치기(§6.10)
  return (
    <div data-map-edit-card="plan" className="flex flex-col gap-3 rounded-md border-2 border-brand bg-banner p-4">
      <h3 className="m-0 text-xl font-bold text-ink">{A.plan.title}</h3>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {plan.map((item, i) => (
          <li key={i} className="text-lg text-ink">
            {planLine(item, "will")}
          </li>
        ))}
      </ul>
      {/* 지우기·합치기 — 영향 수 + 되돌릴 수 없음(§6.10) */}
      {plan.flatMap(planNotes).map((note, i) => (
        <p key={i} className="m-0 text-lg text-ink">
          {note}
        </p>
      ))}
      {destructive && <p className="m-0 text-lg text-ink-soft">{A.plan.irreversible}</p>}
      <Button variant={destructive ? "destructive" : "primary"} size="lg" disabled={pending} onClick={() => apply(plan)}>
        {pending ? A.plan.applying : destructive ? (plan[0].tool === "delete_node" ? E.deleteDo : A.plan.mergeDo) : A.plan.apply}
      </Button>
      <Button variant="tertiary" size="lg" disabled={pending} onClick={clear}>
        {A.plan.cancel}
      </Button>
    </div>
  );
}

// 결과 카드 — 한 일 · [지도에서 보기] · [되돌리기](되돌릴 것이 있을 때만)
export function ResultCard({
  result,
  undoState,
  pending,
  onGo,
  undo,
}: {
  result: Extract<MapEditApplyResult, { ok: true }>;
  undoState: "idle" | "done" | "failed";
  pending: boolean;
  onGo: (key: string, eventId: string | null) => void;
  undo: (commandId: string, steps: UndoStep[]) => void;
}) {
  return (
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
  );
}
