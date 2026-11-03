"use client";

// 이전 판 목록 — 바뀐 시각·첫 문장·글자 수, [보기]로 펼침, [이 판으로 되돌리기](화면 안 확인). 2b-3c(2026-11-03 — lib/node-body).
// 되돌리기도 보통 저장이라 지금 글이 이전 판으로 남는다(다시 되돌릴 수 있음). 사진 캡션은 지금 값 그대로(D3).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { restoreRevisionAction } from "@/app/actions/node-body";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import type { BodyDoc } from "@/lib/node-body-doc";

import { BodyView, type PhotoMap } from "./BodyView";

const C = MY_LIFE_COPY.body;

export type RevisionItem = { id: string; when: string; lead: string; chars: number; doc: BodyDoc };

export function RevisionList({ items, version, photos, doneHref }: { items: RevisionItem[]; version: number; photos: PhotoMap; doneHref: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string; conflict: boolean } | null>(null);
  const [pending, start] = useTransition();

  function restore(id: string) {
    setError(null);
    start(async () => {
      try {
        const r = await restoreRevisionAction(id, version);
        if (r.ok) {
          router.push(doneHref);
          return;
        }
        setError({ id, text: r.reason === "conflict" ? C.errConflict : r.reason === "empty" ? C.errEmpty : C.errFailed, conflict: r.reason === "conflict" });
      } catch (e) {
        console.error("[node-body] restore", e);
        setError({ id, text: C.errFailed, conflict: false });
      }
    });
  }

  if (items.length === 0) return <p className="m-0 text-lg text-ink-soft">{C.historyEmpty}</p>;
  return (
    <ol className="m-0 flex list-none flex-col gap-4 p-0">
      {items.map((it) => (
        <li key={it.id} className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-4">
          <p className="m-0 text-lg font-semibold text-ink">{C.historyWhen(it.when)}</p>
          <p className="m-0 text-lg text-ink">
            {it.lead} <span className="text-ink-soft">· {C.historyChars(it.chars)}</span>
          </p>
          <Button variant="secondary" size="lg" aria-expanded={open === it.id} onClick={() => setOpen(open === it.id ? null : it.id)}>
            {open === it.id ? C.historyHide : C.historyShow}
          </Button>
          {open === it.id && (
            <div className="rounded-md border border-line bg-canvas p-3">
              <BodyView doc={it.doc} photos={photos} />
            </div>
          )}
          {asking === it.id ? (
            <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-line bg-banner p-3">
              <p className="m-0 text-lg text-ink">{C.restoreAsk}</p>
              <Button variant="primary" size="lg" disabled={pending} onClick={() => restore(it.id)}>
                {pending ? C.restoring : C.restoreYes}
              </Button>
              <Button variant="tertiary" size="lg" disabled={pending} onClick={() => setAsking(null)}>
                {C.restoreNo}
              </Button>
            </div>
          ) : (
            <Button variant="secondary" size="lg" disabled={pending} onClick={() => setAsking(it.id)}>
              {C.restore}
            </Button>
          )}
          {error?.id === it.id && (
            <div role="alert" className="flex flex-col gap-2">
              <p className="m-0 text-lg text-danger">{error.text}</p>
              {error.conflict && (
                <Button variant="secondary" size="lg" onClick={() => window.location.reload()}>
                  {C.reload}
                </Button>
              )}
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
