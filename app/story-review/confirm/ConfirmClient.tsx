"use client";

// 노드 그래프 2b-2 — 인물 확인 화면. 이야기별 묶음 + 행마다 [맞아요]·[고칠게요]·[아니에요],
// 화면 위 [모두 맞아요](남은 행 2개 이상일 때 — Q31 화면 전체). primary 는 화면당 1개:
// 남은 행이 2개 이상이면 [모두 맞아요], 다 확인하면 [확인 마치기].
// 처리 결과는 로컬 상태로 바로 반영한다(EpisodeCard 와 같은 이유 — 매번 router.refresh() 안 함).

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/components/ui/Button";
import { decidePeopleAction, type PersonDecision } from "@/app/actions/node-confirm";
import type { PendingStoryGroup } from "@/lib/node-confirm";
import { CONFIRM_COPY as C } from "@/lib/node-confirm-copy";

type RowDone = { kind: "confirmed" | "rejected"; name?: string; relation?: string | null };

const INPUT_CLASS =
  "min-h-[56px] w-full rounded-md border-2 border-line bg-canvas px-4 py-3 text-lg text-ink focus:border-brand focus:outline-none disabled:opacity-50";

export function ConfirmClient({ initialGroups }: { initialGroups: PendingStoryGroup[] }) {
  const router = useRouter();
  // 처음 받은 목록을 고정한다 — 액션의 revalidatePath 가 이 화면을 다시 그리면 처리한 행이 새
  // props 에서 빠져, "확인했어요" 표시 없이 사라지고 다 끝나면 빈 상태가 나온다(390px 실측에서 확인).
  const [groups] = useState(initialGroups);
  const [done, setDone] = useState<Record<string, RowDone>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", relation: "" });
  const [error, setError] = useState<{ linkId: string | null; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const openIds = groups.flatMap((g) => g.rows).map((r) => r.linkId).filter((id) => !done[id]);

  function submit(decisions: PersonDecision[]) {
    setError(null);
    const target = decisions.length === 1 ? decisions[0].linkId : null;
    startTransition(async () => {
      try {
        const res = await decidePeopleAction(decisions);
        if (res.invalid.length > 0) {
          setError({ linkId: target, message: C.editInvalid });
          return;
        }
        // skipped = 이미 다른 곳에서 처리된 행 — 더는 대기가 아니라 처리된 것으로 보여 준다.
        setDone((prev) => {
          const next = { ...prev };
          for (const d of decisions) {
            next[d.linkId] =
              d.kind === "no"
                ? { kind: "rejected" }
                : d.kind === "edit"
                  ? { kind: "confirmed", name: d.name.trim(), relation: d.relation.trim() || null }
                  : { kind: "confirmed" };
          }
          return next;
        });
        setEditing(null);
      } catch (e) {
        console.error("[node-confirm]", e);
        setError({ linkId: target, message: C.error });
        router.refresh();
      }
    });
  }

  if (groups.length === 0) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">{C.emptyTitle}</h1>
        <p className="text-lg text-ink-soft">{C.emptyDesc}</p>
        <ButtonLink href="/story-review" variant="primary" size="lg">
          {C.emptyButton}
        </ButtonLink>
      </section>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-ink">{C.title}</h1>
        <p className="text-lg text-ink-soft">{C.desc}</p>
        {openIds.length >= 2 && (
          <Button
            variant="primary"
            size="lg"
            disabled={isPending || editing !== null}
            onClick={() => submit(openIds.map((linkId) => ({ linkId, kind: "yes" })))}
          >
            {isPending ? C.saving : C.allYes}
          </Button>
        )}
        {error && error.linkId === null && (
          <p role="alert" className="text-lg text-danger">
            {error.message}
          </p>
        )}
      </header>

      {groups.map((g) => (
        <section key={g.episodeId} id={g.episodeId} className="flex scroll-mt-6 flex-col gap-3">
          <h2 className="text-2xl font-bold text-ink">
            {g.year ? `${g.year}년 ` : ""}
            {C.storyHeading(g.title)}
          </h2>
          <ul className="flex flex-col gap-3">
            {g.rows.map((row) => {
              const rowDone = done[row.linkId];
              const name = rowDone?.name ?? row.name;
              const relation = rowDone?.name !== undefined ? rowDone.relation : row.relation;
              const isEditing = editing === row.linkId;
              return (
                <li key={row.linkId} className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-lg font-semibold text-ink">{name}</p>
                    {relation && <p className="text-lg text-ink-soft">{relation}</p>}
                    {row.registered && !rowDone && (
                      <span className="rounded-full bg-banner px-3 py-1 text-lg text-action">{C.registered}</span>
                    )}
                  </div>

                  {rowDone ? (
                    <p role="status" className="text-lg text-ink-soft">
                      {rowDone.kind === "confirmed" ? C.rowConfirmed : C.rowRejected}
                    </p>
                  ) : isEditing ? (
                    <div className="flex flex-col gap-3">
                      <label className="flex flex-col gap-2 text-lg text-ink">
                        {C.nameLabel}
                        <input
                          value={draft.name}
                          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                          maxLength={50}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore
                          data-form-type="other"
                          disabled={isPending}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <label className="flex flex-col gap-2 text-lg text-ink">
                        {C.relationLabel}
                        <input
                          value={draft.relation}
                          onChange={(e) => setDraft((d) => ({ ...d, relation: e.target.value }))}
                          maxLength={30}
                          autoComplete="off"
                          data-lpignore="true"
                          data-1p-ignore
                          data-form-type="other"
                          disabled={isPending}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          variant="secondary"
                          size="lg"
                          disabled={isPending || !draft.name.trim()}
                          onClick={() =>
                            submit([{ linkId: row.linkId, kind: "edit", name: draft.name, relation: draft.relation }])
                          }
                        >
                          {isPending ? C.saving : C.editSave}
                        </Button>
                        <Button
                          variant="tertiary"
                          size="lg"
                          disabled={isPending}
                          onClick={() => {
                            setEditing(null);
                            setError(null);
                          }}
                        >
                          {C.editCancel}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <Button
                        variant="secondary"
                        size="lg"
                        disabled={isPending || editing !== null}
                        onClick={() => submit([{ linkId: row.linkId, kind: "yes" }])}
                      >
                        {C.yes}
                      </Button>
                      <Button
                        variant="tertiary"
                        size="lg"
                        disabled={isPending || editing !== null}
                        onClick={() => {
                          setError(null);
                          setDraft({ name: row.name, relation: row.relation ?? "" });
                          setEditing(row.linkId);
                        }}
                      >
                        {C.edit}
                      </Button>
                      <Button
                        variant="tertiary"
                        size="lg"
                        disabled={isPending || editing !== null}
                        onClick={() => submit([{ linkId: row.linkId, kind: "no" }])}
                      >
                        {C.no}
                      </Button>
                    </div>
                  )}

                  {error && error.linkId === row.linkId && (
                    <p role="alert" className="text-lg text-danger">
                      {error.message}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex flex-col gap-3">
        {openIds.length === 0 && (
          <p role="status" className="text-lg text-ink">
            {C.allDone}
          </p>
        )}
        <ButtonLink href="/story-review" variant={openIds.length === 0 ? "primary" : "secondary"} size="lg">
          {C.finish}
        </ButtonLink>
      </div>
    </>
  );
}
