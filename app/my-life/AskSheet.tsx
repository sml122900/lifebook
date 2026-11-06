"use client";

// 지도 질문 답하기(custom-graph 3a) — 시트 내용. 지도를 바꾸지 않는다. 답의 칩을 누르면 지도에서 그 노드로(찾기 결과와 같은 goTo).
// 질문·답은 이 화면 상태에만(저장 0). 글자 크기 18px 이상·터치 56px.

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { MAP_QUESTION_MAX } from "@/lib/map-agent-view";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import type { SearchKind } from "@/lib/my-life-search";

import { askMapAction, type AskMapView } from "./actions";

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

export function AskSheet({ seed, onGo, onClose }: { seed: string; onGo: (key: string, eventId: string | null) => void; onClose: () => void }) {
  const [q, setQ] = useState(seed);
  const [view, setView] = useState<AskMapView | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || pending) return;
    start(async () => {
      setView(await askMapAction(q).catch((): AskMapView => ({ ok: false, reason: "failed" })));
    });
  }

  return (
    <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      <h2 id="mylife-ask-title" className="m-0">
        {A.title}
      </h2>
      <p className="m-0 text-lg text-ink-soft">{A.hint}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
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
        <Button type="submit" variant="primary" size="lg" disabled={pending || !q.trim()}>
          {pending ? A.pending : A.submit}
        </Button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-4">
        {view && !view.ok && <p className="m-0 text-lg text-ink">{A.errors[view.reason]}</p>}
        {view?.ok && view.answer.asksChange && <p className="m-0 text-lg text-ink">{A.asksChange}</p>}
        {view?.ok &&
          view.answer.claims.map((c, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-4">
              <p className="m-0 text-lg text-ink">{c.text}</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {c.nodes.map((n) => (
                  <li key={n.key}>
                    <button
                      type="button"
                      onClick={() => onGo(n.key, n.eventId)}
                      className="min-h-[48px] rounded-full border-2 border-line bg-surface px-4 py-1 text-left text-lg text-ink hover:bg-banner focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand"
                    >
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
      </div>
      <Button variant="tertiary" size="lg" onClick={onClose}>
        {C.close}
      </Button>
    </div>
  );
}
