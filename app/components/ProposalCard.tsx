"use client";

// My Life 개편 2단계 — "이 이야기를 남길까요?" 제안 카드. /chat-v3 자유 대화·오늘의 인터뷰가 함께 쓴다.
// docs/phase/my-life-restructure.md §3.3. [만들기]·[고치기]·[안 만들기] + 같은 이름 되묻기(2b-2 규칙 —
// 새 이름·고친 이름이 확정 인물과 같으면 [같은 분이에요]/[다른 분이에요], 답할 때까지 만들기 안 됨).
// 장소도 같은 방식 — 새 장소 이름이 기존 장소 이름을 품으면 [같은 곳이에요]/[따로 만들기].
// 저장 쪽(lib/node-proposal createFromCard)이 모든 값을 다시 확인한다 — 이 화면 값은 믿지 않는다.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { FREE_CHAT_COPY as C } from "@/lib/free-chat-copy";
import type { ProposalView } from "@/lib/free-chat";
import type { CardEdit, OverlapPlace, SameNamePerson } from "@/lib/node-proposal";
import { displayTitle } from "@/lib/story-title";

export type CreateOutcome =
  | { ok: true }
  | {
      ok: false;
      ask?: { index: number; candidates: SameNamePerson[] }[];
      placeAsk?: { index: number; candidates: OverlapPlace[] }[];
      message?: string;
    };

const INPUT =
  "min-h-[56px] w-full rounded-[10px] border-2 border-line bg-canvas px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none";

function toEdit(card: ProposalView["card"]): CardEdit {
  return {
    title: card.title,
    summary: card.summary,
    center: "id" in card.center ? { id: card.center.id } : { new: { ...card.center.new } },
    people: card.people.map((p) => ({ name: p.name, relation: p.relation, personId: p.personId })),
    places: card.places.map((p) => ({ name: p.name, placeId: p.placeId })),
  };
}

function initialAsks(card: ProposalView["card"]): Record<number, SameNamePerson[]> {
  const out: Record<number, SameNamePerson[]> = {};
  card.people.forEach((p, i) => {
    if (!p.personId && p.sameName.length > 0) out[i] = p.sameName;
  });
  return out;
}

function initialPlaceAsks(card: ProposalView["card"]): Record<number, OverlapPlace[]> {
  const out: Record<number, OverlapPlace[]> = {};
  card.places.forEach((p, i) => {
    if (!p.placeId && (p.overlap?.length ?? 0) > 0) out[i] = p.overlap!;
  });
  return out;
}

// 행을 하나 뺐을 때 뒤 행 번호를 당긴다.
function shiftAsks<T>(asks: Record<number, T>, removed: number): Record<number, T> {
  const next: Record<number, T> = {};
  for (const [k, v] of Object.entries(asks)) {
    const n = Number(k);
    if (n < removed) next[n] = v;
    else if (n > removed) next[n - 1] = v;
  }
  return next;
}

export function ProposalCard({
  view,
  onCreate,
  onDecline,
}: {
  view: ProposalView;
  onCreate: (edit: CardEdit) => Promise<CreateOutcome>;
  onDecline: () => Promise<void>;
}) {
  const { card, centers } = view;
  const [edit, setEdit] = useState<CardEdit>(() => toEdit(card));
  const [editing, setEditing] = useState(false);
  const [asks, setAsks] = useState<Record<number, SameNamePerson[]>>(() => initialAsks(card));
  const [placeAsks, setPlaceAsks] = useState<Record<number, OverlapPlace[]>>(() => initialPlaceAsks(card));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [full, setFull] = useState(false);

  // 카드가 떠 있는 동안 오른쪽 아래 비서 버튼 숨김(app/globals.css — 390 에서 [안 만들기]를 가렸다).
  useEffect(() => {
    document.body.setAttribute("data-proposal-card", "");
    return () => document.body.removeAttribute("data-proposal-card");
  }, []);

  const peopleUnanswered = Object.keys(asks).some((k) => {
    const p = edit.people[Number(k)];
    return p && !p.decision;
  });
  const placesUnanswered = Object.keys(placeAsks).some((k) => {
    const p = edit.places[Number(k)];
    return p && !p.decision;
  });
  const unanswered = peopleUnanswered || placesUnanswered;

  function setPerson(i: number, patch: Partial<CardEdit["people"][number]>) {
    setEdit((e) => ({ ...e, people: e.people.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }

  function setPlace(i: number, patch: Partial<CardEdit["places"][number]>) {
    setEdit((e) => ({ ...e, places: e.places.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));
  }

  async function create() {
    if (busy) return;
    if (unanswered) {
      setMessage(peopleUnanswered ? C.answerAskFirst : C.answerPlaceAskFirst);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const r = await onCreate(edit);
      if (!r.ok) {
        const ask = r.ask ?? [];
        const placeAsk = r.placeAsk ?? [];
        if (ask.length > 0 || placeAsk.length > 0) {
          const next: Record<number, SameNamePerson[]> = {};
          for (const a of ask) next[a.index] = a.candidates;
          const nextPlaces: Record<number, OverlapPlace[]> = {};
          for (const a of placeAsk) nextPlaces[a.index] = a.candidates;
          setAsks(next);
          setPlaceAsks(nextPlaces);
          setEditing(false);
          setMessage(ask.length > 0 ? C.answerAskFirst : C.answerPlaceAskFirst);
        } else {
          setMessage(r.message ?? C.createFailed);
        }
      }
    } catch (e) {
      console.error("[proposal-card]", e);
      setMessage(C.createFailed);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    if (busy) return;
    setBusy(true);
    try {
      await onDecline();
    } catch (e) {
      console.error("[proposal-card]", e);
      setMessage(C.createFailed);
    } finally {
      setBusy(false);
    }
  }

  const centerLabel = (() => {
    const c = edit.center;
    if ("id" in c) {
      const o = centers.find((x) => x.id === c.id) ?? ("id" in card.center && card.center.id === c.id ? card.center : null);
      return o ? C.centerText(o.label, o.year) : "";
    }
    return C.newCenter(c.new.label, c.new.year);
  })();

  return (
    <section aria-label={C.cardTitle} className="flex flex-col gap-4 rounded-2xl border-2 border-brand bg-banner p-5">
      <h2 className="m-0 text-xl font-bold text-ink">{C.cardTitle}</h2>

      {!editing ? (
        <dl className="flex flex-col gap-3 text-lg">
          <div>
            <dt className="font-semibold text-ink-soft">{C.fieldTitle}</dt>
            <dd className="m-0 line-clamp-2 text-xl font-bold text-ink">{displayTitle({ title: edit.title, content: edit.summary })}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">{C.fieldCenter}</dt>
            <dd className="m-0 text-ink">{centerLabel}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">{C.fieldPeople}</dt>
            <dd className="m-0 flex flex-col gap-2">
              {edit.people.length === 0 && <span className="text-ink-soft">{C.none}</span>}
              {edit.people.map((p, i) => (
                <div key={i} className="flex flex-col gap-2">
                  <span className="text-ink">
                    {p.name}
                    {p.relation ? ` · ${p.relation}` : ""}
                    <span className="text-ink-soft"> — {p.personId || p.decision === "same" ? C.existingPerson : C.newTag}</span>
                  </span>
                  {asks[i] && (
                    <div className="flex flex-col gap-2 rounded-[10px] border-2 border-line bg-surface p-3">
                      {asks[i].map((s) => (
                        <div key={s.id} className="flex flex-col gap-2">
                          <p className="m-0 text-lg text-ink">{C.sameNameQuestion(s.name, s.relation)}</p>
                          <Button
                            variant={p.decision === "same" && p.samePersonId === s.id ? "primary" : "secondary"}
                            size="lg"
                            aria-pressed={p.decision === "same" && p.samePersonId === s.id}
                            onClick={() => setPerson(i, { decision: "same", samePersonId: s.id })}
                          >
                            {C.same}
                          </Button>
                        </div>
                      ))}
                      <Button
                        variant={p.decision === "different" ? "primary" : "secondary"}
                        size="lg"
                        aria-pressed={p.decision === "different"}
                        onClick={() => setPerson(i, { decision: "different", samePersonId: undefined })}
                      >
                        {C.different}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">{C.fieldPlaces}</dt>
            <dd className="m-0 text-ink">
              {edit.places.length === 0
                ? <span className="text-ink-soft">{C.none}</span>
                : edit.places.map((p, i) => (
                    <div key={i} className="flex flex-col gap-2">
                      <span className="block">
                        {p.name}
                        <span className="text-ink-soft"> — {p.placeId || p.decision === "same" ? C.existingPlace : C.newTag}</span>
                      </span>
                      {placeAsks[i] && (
                        <div className="flex flex-col gap-2 rounded-[10px] border-2 border-line bg-surface p-3">
                          {placeAsks[i].map((s) => (
                            <div key={s.id} className="flex flex-col gap-2">
                              <p className="m-0 text-lg text-ink">{C.samePlaceQuestion(s.name)}</p>
                              <Button
                                variant={p.decision === "same" && p.samePlaceId === s.id ? "primary" : "secondary"}
                                size="lg"
                                aria-pressed={p.decision === "same" && p.samePlaceId === s.id}
                                onClick={() => setPlace(i, { decision: "same", samePlaceId: s.id })}
                              >
                                {C.samePlace}
                              </Button>
                            </div>
                          ))}
                          <Button
                            variant={p.decision === "separate" ? "primary" : "secondary"}
                            size="lg"
                            aria-pressed={p.decision === "separate"}
                            onClick={() => setPlace(i, { decision: "separate", samePlaceId: undefined })}
                          >
                            {C.separatePlace}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-soft">{C.fieldSummary}</dt>
            <dd className={`m-0 whitespace-pre-wrap text-ink ${full ? "" : "line-clamp-4"}`}>{edit.summary}</dd>
            {edit.summary.length > 90 && (
              <button
                type="button"
                onClick={() => setFull((v) => !v)}
                className="mt-1 min-h-[48px] text-lg text-action underline underline-offset-4"
              >
                {full ? C.showLess : C.showMore}
              </button>
            )}
          </div>
        </dl>
      ) : (
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-lg font-semibold text-ink-soft">
            {C.fieldTitle}
            <input
              className={INPUT}
              value={edit.title}
              maxLength={40}
              placeholder={C.titlePlaceholder}
              onChange={(e) => setEdit({ ...edit, title: e.target.value })}
            />
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-ink-soft">{C.fieldCenter}</span>
            {card.centerFixed ? (
              <p className="m-0 text-lg text-ink">{centerLabel}</p>
            ) : (
              <>
                <select
                  className={INPUT}
                  aria-label={C.fieldCenter}
                  value={"id" in edit.center ? `id:${edit.center.id}` : "new"}
                  onChange={(e) => {
                    const v = e.target.value;
                    setEdit({
                      ...edit,
                      center: v === "new" ? { new: { label: "new" in card.center ? card.center.new.label : "", year: null } } : { id: v.slice(3) },
                    });
                  }}
                >
                  {centers.map((c) => (
                    <option key={c.id} value={`id:${c.id}`}>
                      {C.centerText(c.label, c.year)}
                    </option>
                  ))}
                  <option value="new">{C.newCenterOption}</option>
                </select>
                {"new" in edit.center && (
                  <div className="flex flex-col gap-2">
                    <input
                      className={INPUT}
                      aria-label={C.newCenterLabel}
                      placeholder={C.newCenterLabel}
                      maxLength={30}
                      value={edit.center.new.label}
                      onChange={(e) => setEdit({ ...edit, center: { new: { label: e.target.value, year: "new" in edit.center ? edit.center.new.year : null } } })}
                    />
                    <input
                      className={INPUT}
                      aria-label={C.newCenterYear}
                      placeholder={C.newCenterYear}
                      inputMode="numeric"
                      value={"new" in edit.center && edit.center.new.year !== null ? String(edit.center.new.year) : ""}
                      onChange={(e) => {
                        const n = Number(e.target.value.replace(/\D/g, "").slice(0, 4));
                        setEdit({ ...edit, center: { new: { label: "new" in edit.center ? edit.center.new.label : "", year: n > 0 ? n : null } } });
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-ink-soft">{C.fieldPeople}</span>
            {edit.people.map((p, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-3">
                <input
                  className={INPUT}
                  aria-label={`${C.personName} ${i + 1}`}
                  placeholder={C.personName}
                  maxLength={50}
                  value={p.name}
                  onChange={(e) => {
                    setPerson(i, { name: e.target.value, decision: undefined, samePersonId: undefined });
                    setAsks((a) => {
                      const next = { ...a };
                      delete next[i];
                      return next;
                    });
                  }}
                />
                <input
                  className={INPUT}
                  aria-label={`${C.personRelation} ${i + 1}`}
                  placeholder={C.personRelation}
                  maxLength={30}
                  value={p.relation ?? ""}
                  onChange={(e) => setPerson(i, { relation: e.target.value || null })}
                />
                <Button
                  variant="tertiary"
                  size="lg"
                  onClick={() => {
                    setEdit({ ...edit, people: edit.people.filter((_, j) => j !== i) });
                    setAsks((a) => shiftAsks(a, i));
                  }}
                >
                  {C.remove}
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="lg" onClick={() => setEdit({ ...edit, people: [...edit.people, { name: "", relation: null, personId: null }] })}>
              {C.addPerson}
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-lg font-semibold text-ink-soft">{C.fieldPlaces}</span>
            {edit.places.map((p, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-3">
                <input
                  className={INPUT}
                  aria-label={`${C.placeName} ${i + 1}`}
                  placeholder={C.placeName}
                  maxLength={50}
                  value={p.name}
                  onChange={(e) => {
                    setEdit({ ...edit, places: edit.places.map((q, j) => (j === i ? { name: e.target.value, placeId: null } : q)) });
                    setPlaceAsks((a) => {
                      const next = { ...a };
                      delete next[i];
                      return next;
                    });
                  }}
                />
                <Button
                  variant="tertiary"
                  size="lg"
                  onClick={() => {
                    setEdit({ ...edit, places: edit.places.filter((_, j) => j !== i) });
                    setPlaceAsks((a) => shiftAsks(a, i));
                  }}
                >
                  {C.remove}
                </Button>
              </div>
            ))}
            <Button variant="secondary" size="lg" onClick={() => setEdit({ ...edit, places: [...edit.places, { name: "", placeId: null }] })}>
              {C.addPlace}
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-ink-soft">{C.fieldSummary}</span>
            <VoiceTextarea value={edit.summary} onChange={(v) => setEdit({ ...edit, summary: v })} rows={5} ariaLabel={C.fieldSummary} />
          </div>
        </div>
      )}

      {message && (
        <p role="status" className="m-0 text-lg text-danger">
          {message}
        </p>
      )}

      {busy ? (
        <p role="status" className="m-0 text-lg text-ink-soft">
          {C.saving}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" onClick={() => void create()} aria-disabled={unanswered}>
            {C.create}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              setEditing((v) => !v);
              setMessage(null);
            }}
          >
            {editing ? C.cancelEdit : C.edit}
          </Button>
          <Button variant="tertiary" size="lg" onClick={() => void decline()}>
            {C.decline}
          </Button>
        </div>
      )}
    </section>
  );
}
