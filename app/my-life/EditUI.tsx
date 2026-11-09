"use client";

// My Life 개편 3단계 — 지도에서 직접 만들기·넣기·빼기·되돌리기·옮기기·지우기 화면. docs/phase/my-life-restructure.md §4.
//
// CreateForm   — 노드 7종 입력(시기·이야기·그때의 나·사람·장소·모임·장소 묶음) + 같은 이름 되묻기. 만들기 시트·패널 공용.
// NodeEditor   — 노드 패널의 고치기 부분: 이어진 것 목록([빼기] → 패널 안 확인), [넣기](고르기 목록 + 새로 만들기),
//                이야기 [다른 시기로 옮기기], [이 ○○ 지우기](종류별 이름 — 이어진 이야기·사람·장소 수를 보여 주는 확인 단계).
//                한 패널 안에서 단계를 바꾸고 위에 [뒤로](node-graph-self.md §6 2b.1 의 5). 단계마다 primary 1개.
// 되돌리기 = 넣기·만들기 직후 패널 맨 위 알림의 [되돌리기] — 다음 동작 전까지(부모가 알림을 들고 있다).
// 저장은 전부 ./actions(서버 액션) → router.refresh() — 지도 위치·배율·접힘은 그대로(MapMode 상태 유지).

import { MapPin, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { Button, ButtonLink } from "@/components/ui/Button";
import type { MyLifeData, MyLifeEvent, MyLifeStory } from "@/lib/my-life";
import { customOf, type MyLifeRef } from "@/lib/my-life-custom";
import { deleteLinkedText } from "@/lib/map-edit-plan";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import type { MoveUndo } from "@/lib/episode-move";
import type { SameNameNode } from "@/lib/custom-node";
import type { CreatedLink, DeleteImpact, SameNamePerson } from "@/lib/my-life-edit";
import { categoryEntries, eventPeoplePlaceList, yearText, type PeriodRef } from "@/lib/my-life-layout";
import type { NodeRef } from "@/lib/node-graph";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";
import { decorName } from "@/lib/space-decor";
import { displayTitle, shortTitle } from "@/lib/story-title";

import { builtinName, refInfo } from "./Custom";
import { DecorPicker } from "./Decor";
import { beginPress, dragJustEnded, type DropResult, type OptLinks } from "./drag";

import {
  addLinkAction,
  createNodeAction,
  deleteImpactAction,
  deleteNodeAction,
  moveCustomAction,
  moveStoryAction,
  removeLinkAction,
  renameBuiltinAction,
  renameNodeAction,
  takeOutAction,
  undoCreateAction,
  undoLinksAction,
  undoRemoveAction,
  updatePersonInfoAction,
  type CreateInput,
  type CreatedNode,
} from "./actions";

const C = MY_LIFE_COPY;
const E = MY_LIFE_COPY.edit;
const X = MY_LIFE_COPY.custom; // 사용자 카테고리(custom-graph 2단계)

// category·item·customGroup = 사용자 카테고리(custom-graph 2단계). 항목·묶음은 카테고리 안에서만 만든다(preset.categoryId) — 시트 목록엔 카테고리만.
export type CreateKind = "period" | "story" | "self" | "person" | "place" | "group" | "placeGroup" | "category" | "item" | "customGroup";
export const CREATE_KINDS: CreateKind[] = ["period", "story", "self", "person", "place", "group", "placeGroup", "category"];

// 패널 맨 위 알림(되돌리기는 다음 동작 전까지) — 부모(MyLifeView)가 들고 있다.
// undoFail — 되돌리기가 안 됐을 때 문구(없으면 넣기·만들기 되돌리기 문구 cannotUnlink).
// saving = 끌어 넣은 뒤 저장 응답 전 — [되돌리기]는 보이되 못 누름(U3 낙관적 반영).
export type Notice = { key: string; text: string; undo?: () => Promise<{ ok: boolean }>; undoFail?: string; saving?: boolean };
// 만든 뒤 — 부모가 새 노드로 이동·선택·패널(+ 되돌리기 알림).
// undoMove — 다른 시절로 옮긴 직후 [되돌리기] 값(3단계 E2E 2026-11-02, lib/episode-move undoMoveEpisode).
export type Created = { key: string; eventId: string | null; text: string; undo: CreatedNode | null; undoMove?: MoveUndo };

const INPUT = "min-h-[56px] w-full rounded-md border-2 border-line bg-surface px-4 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none";
const ROW = "flex min-h-[56px] w-full items-center gap-3 rounded-md border-2 bg-surface px-4 py-2 text-left text-lg text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2";

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {htmlFor ? (
        <label htmlFor={htmlFor} className="text-lg font-semibold text-ink">
          {label}
        </label>
      ) : (
        <p className="text-lg font-semibold text-ink">{label}</p>
      )}
      {children}
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  return text ? (
    <p role="alert" className="rounded-md border-2 border-line bg-canvas px-3 py-2 text-lg text-danger">
      {text}
    </p>
  ) : null;
}

// 여러 개 고르기(체크) — 56px 행.
function MultiPick({ items, value, onChange, label }: { items: { id: string; label: string; sub?: string }[]; value: string[]; onChange: (v: string[]) => void; label: string }) {
  if (items.length === 0) return null;
  return (
    <Field label={label}>
      <ul className="flex max-h-[40dvh] flex-col gap-2 overflow-y-auto">
        {items.map((it) => {
          const on = value.includes(it.id);
          return (
            <li key={it.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onChange(on ? value.filter((x) => x !== it.id) : [...value, it.id])}
                className={`${ROW} ${on ? "border-brand bg-banner" : "border-line"}`}
              >
                <span aria-hidden className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border-2 ${on ? "border-brand bg-action text-on-action" : "border-line"}`}>
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block truncate">{it.label}</span>
                  {it.sub && <span className="block truncate text-ink-soft">{it.sub}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Field>
  );
}

// ── 만들기 입력 ──────────────────────────────────────────────────

export type CreatePreset = { eventId?: string; groupIds?: string[]; contextEventId?: string | null; categoryId?: string };

export function CreateForm({
  kind,
  data,
  preset,
  onDone,
  onBack,
  backLabel,
  titleId,
}: {
  kind: CreateKind;
  data: MyLifeData;
  preset?: CreatePreset;
  onDone: (r: Created) => void;
  onBack: () => void;
  backLabel?: string;
  titleId: string;
}) {
  const [name, setName] = useState("");
  const [relation, setRelation] = useState("");
  const [year, setYear] = useState("");
  const [endYear, setEndYear] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [eventId, setEventId] = useState(preset?.eventId ?? "");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>(preset?.groupIds ?? []);
  const [placeIds, setPlaceIds] = useState<string[]>([]);
  const [placeMode, setPlaceMode] = useState<"name" | "search">("name");
  const [place, setPlace] = useState<PlaceInfo>(EMPTY_PLACE);
  const [ask, setAsk] = useState<SameNamePerson[] | null>(null);
  const [askSame, setAskSame] = useState<SameNameNode[] | null>(null); // 사용자 항목·묶음 — 6종과 같은 이름(Q98)
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const kindLabel = E.kinds[kind];
  const fixedEvent = preset?.eventId ? data.events.find((e) => e.id === preset.eventId) : undefined;

  function input(decision?: "same" | "different" | "new", samePersonId?: string): CreateInput {
    const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
    switch (kind) {
      case "period":
        return { kind, label: name, year: num(year), endYear: num(endYear) };
      case "story":
      case "self":
        return { kind, lifeEventId: eventId, title, content: body, personIds, groupIds: kind === "self" ? groupIds : [], placeIds: kind === "story" ? placeIds : [] };
      case "person":
        return { kind, name, relation, groupIds, decision: decision === "new" ? undefined : decision, samePersonId, contextEventId: preset?.contextEventId ?? null };
      case "place":
        return placeMode === "search" && place.placeName
          ? { kind, name: place.placeName, address: place.placeAddress, lat: place.lat, lng: place.lng, source: place.placeSource }
          : { kind, name, address: null, lat: null, lng: null, source: null };
      case "group":
        return { kind, name, memberIds: personIds };
      case "placeGroup":
        return { kind, name, placeIds };
      case "category":
        return { kind, name };
      case "item":
      case "customGroup":
        return { kind, name, categoryId: preset?.categoryId ?? "", decision: decision === "new" ? "new" : undefined };
    }
  }

  function submit(decision?: "same" | "different" | "new", samePersonId?: string) {
    setError(null);
    start(async () => {
      const r = await createNodeAction(input(decision, samePersonId));
      if ("ask" in r) {
        setAsk(r.ask);
        return;
      }
      if ("askSame" in r) {
        setAskSame(r.askSame);
        return;
      }
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const shown = kind === "place" && placeMode === "search" && place.placeName ? place.placeName : kind === "story" || kind === "self" ? kindLabel : name || kindLabel;
      onDone({ key: r.key, eventId: r.eventId, text: r.reused ? E.reused(shown) : E.created(kindLabel), undo: r.undo });
    });
  }

  // 사용자 항목·묶음 — 지도에 같은 이름이 있으면(6종) 그것을 이 카테고리에 넣을지·새로 만들지(§3.4 · §6.6 P15).
  if (askSame && preset?.categoryId) {
    const catRef: NodeRef = { type: "CUSTOM", id: preset.categoryId };
    return (
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="m-0 text-2xl">
          {X.sameNameTitle(name.trim())}
        </h2>
        <p className="m-0 text-lg text-ink-soft">{X.sameNameHint}</p>
        <ul className="flex flex-col gap-2">
          {askSame.map((n) => (
            <li key={`${n.type}:${n.id}`}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await addLinkAction(catRef, { type: n.type, id: n.id });
                    if (!r.ok) {
                      setError(r.error);
                      return;
                    }
                    onDone({ key: `cat:${preset.categoryId}`, eventId: null, text: E.linked, undo: null });
                  })
                }
                className={`${ROW} border-line`}
              >
                <span className="min-w-0">
                  <span className="block truncate">{n.name}</span>
                  <span className="block text-ink-soft">{X.kindOf[n.type]}</span>
                </span>
                <span className="ml-auto shrink-0 text-action">{X.putThis}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="lg" disabled={pending} onClick={() => submit("new")}>
          {kind === "customGroup" ? X.makeNewGroup : X.makeNewItem}
        </Button>
        <ErrorLine text={error} />
        <Button variant="tertiary" size="lg" disabled={pending} onClick={() => setAskSame(null)}>
          {E.back}
        </Button>
      </div>
    );
  }

  if (ask) {
    return (
      <div className="flex flex-col gap-4">
        <h2 id={titleId} className="m-0 text-2xl">
          {E.sameNameQuestion(name.trim())}
        </h2>
        <ul className="flex flex-col gap-2">
          {ask.map((p) => (
            <li key={p.id}>
              <button type="button" disabled={pending} onClick={() => submit("same", p.id)} className={`${ROW} border-line`}>
                <span className="min-w-0">
                  <span className="block">{p.name}</span>
                  {p.relation && <span className="block text-ink-soft">{p.relation}</span>}
                </span>
                <span className="ml-auto shrink-0 text-action">{E.samePerson}</span>
              </button>
            </li>
          ))}
        </ul>
        <Button variant="secondary" size="lg" disabled={pending} onClick={() => submit("different")}>
          {E.differentPerson}
        </Button>
        <ErrorLine text={error} />
        <Button variant="tertiary" size="lg" disabled={pending} onClick={() => setAsk(null)}>
          {E.back}
        </Button>
      </div>
    );
  }

  const id = (s: string) => `${titleId}-${s}`;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h2 id={titleId} className="m-0 text-2xl">
        {kindLabel}
      </h2>

      {(kind === "period" || kind === "person" || kind === "group" || kind === "placeGroup" || kind === "category" || kind === "item" || kind === "customGroup" || (kind === "place" && placeMode === "name")) && (
        <Field label={E.fieldName} htmlFor={id("name")}>
          <input id={id("name")} className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={kind === "person" || kind === "place" ? 50 : 30} autoComplete="off" />
        </Field>
      )}

      {kind === "period" && (
        <>
          <Field label={E.fieldYear} htmlFor={id("year")}>
            <input id={id("year")} className={INPUT} inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} />
          </Field>
          <Field label={E.fieldEndYear} htmlFor={id("end")}>
            <input id={id("end")} className={INPUT} inputMode="numeric" value={endYear} onChange={(e) => setEndYear(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))} />
          </Field>
        </>
      )}

      {(kind === "story" || kind === "self") && (
        <>
          {fixedEvent ? (
            <p className="text-lg text-ink">
              {yearText(fixedEvent)} {fixedEvent.label}
            </p>
          ) : (
            <Field label={E.fieldPeriod}>
              <ul className="flex max-h-[30dvh] flex-col gap-2 overflow-y-auto">
                {data.events.map((ev) => (
                  <li key={ev.id}>
                    <button type="button" role="radio" aria-checked={eventId === ev.id} onClick={() => setEventId(ev.id)} className={`${ROW} ${eventId === ev.id ? "border-brand bg-banner" : "border-line"}`}>
                      <span className="shrink-0 text-ink-soft">{yearText(ev)}</span>
                      <span className="min-w-0 truncate">{ev.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Field>
          )}
          <Field label={E.fieldTitle} htmlFor={id("title")}>
            <input id={id("title")} className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={40} autoComplete="off" />
          </Field>
          <Field label={kind === "self" ? E.fieldSelfBody : E.fieldBody}>
            <VoiceTextarea value={body} onChange={setBody} rows={5} ariaLabel={kind === "self" ? E.fieldSelfBody : E.fieldBody} />
          </Field>
          <MultiPick
            label={kind === "self" ? E.fieldSelfPeople : E.fieldPeople}
            items={data.people.map((p) => ({ id: p.id, label: p.name, sub: p.relation ?? undefined }))}
            value={personIds}
            onChange={setPersonIds}
          />
          {kind === "self" && <MultiPick label={E.fieldGroups} items={data.groups.map((g) => ({ id: g.id, label: g.name }))} value={groupIds} onChange={setGroupIds} />}
          {kind === "story" && <MultiPick label={E.fieldPlaces} items={data.places.map((p) => ({ id: p.id, label: p.name, sub: p.address ?? undefined }))} value={placeIds} onChange={setPlaceIds} />}
        </>
      )}

      {kind === "person" && (
        <>
          <Field label={E.fieldRelation} htmlFor={id("rel")}>
            <input id={id("rel")} className={INPUT} value={relation} onChange={(e) => setRelation(e.target.value)} maxLength={30} autoComplete="off" />
          </Field>
          <MultiPick label={E.fieldGroups} items={data.groups.map((g) => ({ id: g.id, label: g.name }))} value={groupIds} onChange={setGroupIds} />
        </>
      )}

      {kind === "place" && (
        <>
          <div className="flex gap-2" role="radiogroup">
            {(["name", "search"] as const).map((m) => (
              <Button key={m} type="button" variant={placeMode === m ? "secondary" : "tertiary"} size="lg" className="flex-1 px-3!" aria-pressed={placeMode === m} onClick={() => setPlaceMode(m)}>
                {m === "name" ? E.placeByName : E.placeBySearch}
              </Button>
            ))}
          </div>
          {placeMode === "search" && <PlaceSearchInput value={place} onChange={setPlace} />}
        </>
      )}

      {kind === "group" && <MultiPick label={E.fieldMembers} items={data.people.map((p) => ({ id: p.id, label: p.name, sub: p.relation ?? undefined }))} value={personIds} onChange={setPersonIds} />}
      {kind === "placeGroup" && <MultiPick label={E.fieldPlaceMembers} items={data.places.map((p) => ({ id: p.id, label: p.name, sub: p.address ?? undefined }))} value={placeIds} onChange={setPlaceIds} />}

      <ErrorLine text={error} />
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? E.saving : E.save}
      </Button>
      <Button type="button" variant="tertiary" size="lg" disabled={pending} onClick={onBack}>
        {backLabel ?? E.back}
      </Button>
    </form>
  );
}

// 만들기 시트 — 종류 고르기 → 입력.
// onSuggest — [이야기 거리](오늘의 인터뷰·더 들어볼까요? 시트). 지도 머리 줄에서 옮겨 와 종류 고르기 맨 아래에(우주 개편 U1, ui-space §6.2).
export function CreateSheet({
  data,
  initialKind,
  preset,
  onDone,
  onClose,
  onSuggest,
}: {
  data: MyLifeData;
  initialKind: CreateKind | null;
  preset?: CreatePreset; // 카테고리 영역 [+ 항목]·[+ 묶음] = 그 카테고리(custom-graph 2단계)
  onDone: (r: Created) => void;
  onClose: () => void;
  onSuggest?: () => void;
}) {
  const [kind, setKind] = useState<CreateKind | null>(initialKind);
  return (
    <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      {kind ? (
        <CreateForm kind={kind} data={data} preset={preset} titleId="mylife-create-title" onDone={onDone} onBack={initialKind ? onClose : () => setKind(null)} backLabel={initialKind ? E.cancel : E.back} />
      ) : (
        <>
          <h2 id="mylife-create-title" className="m-0">
            {E.createTitle}
          </h2>
          <ul className="flex flex-col gap-2">
            {CREATE_KINDS.map((k) => (
              <li key={k}>
                <button type="button" onClick={() => setKind(k)} className={`${ROW} border-line`}>
                  <span className="min-w-0">
                    <span className="block font-semibold">{E.kinds[k]}</span>
                    <span className="block text-ink-soft">{E.kindHints[k]}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {onSuggest && (
            <Button variant="secondary" size="lg" onClick={onSuggest}>
              {C.suggest}
            </Button>
          )}
          <Button variant="tertiary" size="lg" onClick={onClose}>
            {C.close}
          </Button>
        </>
      )}
    </div>
  );
}

// ── 노드 패널의 고치기 부분 ──────────────────────────────────────────

// putIn = 카테고리·묶음에 넣기(6종 + 다른 카테고리 항목·묶음) · relate = 항목과 잇기 · intoGroup·intoCategory = 항목·묶음을 넣을 곳(custom-graph 2단계)
type PickWhat = "person" | "place" | "group" | "placeGroup" | "member" | "placeMember" | "putIn" | "relate" | "intoGroup" | "intoCategory";
type Mode =
  | { t: "view" }
  | { t: "addStory" }
  | { t: "write"; kind: "story" | "self" }
  | { t: "pick"; what: PickWhat }
  | { t: "new"; what: PickWhat }
  | { t: "remove"; other: NodeRef; name: string }
  | { t: "move" }
  | { t: "moveConfirm"; target: MyLifeEvent }
  | { t: "delete"; impact: DeleteImpact | null; loading: boolean }
  | { t: "editInfo" } // 인물록 통합 — 사람 [이름·정보 고치기] · 장소·모임 [이름 고치기] · 사용자 카테고리·묶음·항목 [이름 바꾸기]
  | { t: "newIn"; kind: "item" | "customGroup" } // 카테고리 패널 [+ 항목]·[+ 묶음]
  | { t: "moveCat" }; // 묶음·항목 [다른 카테고리로 옮기기]

// fromStory = 시기 패널에서 이야기에서만 나온 분·곳(시기에 바로 잇지 않음 — [넣기] 후보에서 안 뺌).
type LinkItem = { ref: NodeRef; name: string; sub?: string; go: { key: string; eventId: string | null }; removable: boolean; note?: string; fromStory?: boolean };

// 지우기 확인 — 이어진 것 중 0 이 아닌 것만(시기는 함께 지워질 이야기를 따로 적으므로 이야기 수는 빼고).
const PICK_CREATE_KIND: Partial<Record<PickWhat, CreateKind>> = { person: "person", member: "person", place: "place", placeMember: "place", group: "group", placeGroup: "placeGroup" };

export function NodeEditor({
  nodeKey,
  data,
  info,
  notice,
  setNotice,
  links,
  onGo,
  onReopen,
  onDeleted,
  startEdit = false,
  startPick = false,
  fromCategory = null,
}: {
  nodeKey: string;
  data: MyLifeData;
  info: ReactNode;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  links: OptLinks; // 끌어 넣기 낙관적 항목(MyLifeView)
  onGo: (key: string, eventId: string | null) => void;
  onReopen: (r: Created) => void; // 새 노드(옮긴 이야기·직접 쓴 이야기)로 이동·패널
  onDeleted: (name: string) => void;
  startEdit?: boolean; // 옛 /people/[id]/edit 로 온 사람 패널 — [이름·정보 고치기]로 시작(인물록 통합)
  startPick?: boolean; // 카테고리 영역 [+ 넣기]로 연 카테고리 패널 — 넣기 고르기로 시작(custom-graph 2단계)
  fromCategory?: string | null; // 카테고리 영역의 바로가기로 연 원래 노드 패널 — 그 카테고리 id(Q99 — [원래 자리로 가기]·[이 카테고리에서 빼기])
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(startEdit ? { t: "editInfo" } : startPick ? { t: "pick", what: "putIn" } : { t: "view" });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const [showRow, setShowRow] = useState(false); // 행성 패널 "넣을 것" 줄(U3 — Q116)
  const [showDecor, setShowDecor] = useState(false); // 행성 패널 꾸미기 고르기(U4 — ui-space §5.1)
  const [takenOut, setTakenOut] = useState(false); // 바로가기 패널 — 이 카테고리에서 뺀 뒤(안내 줄 숨김)
  const [kind, a, b] = nodeKey.split(":");

  // 단계가 바뀌면 패널을 맨 위로(앞 단계 스크롤이 남아 새 단계 제목·첫 항목이 가려지던 것 — 390 실측) +
  // 새 단계 제목으로 포커스(화면 낭독기가 바뀐 단계를 읽게). 기본 단계는 스크롤만.
  useEffect(() => {
    const d = document.querySelector<HTMLDialogElement>("dialog[open]");
    if (!d) return;
    d.scrollTop = 0;
    if (mode.t === "view") return;
    const h = d.querySelector<HTMLElement>("#mylife-panel-title");
    if (h) {
      h.tabIndex = -1;
      h.focus({ preventScroll: true });
    }
  }, [mode]);

  const look = useMemo(
    () => ({
      event: new Map(data.events.map((e) => [e.id, e])),
      person: new Map(data.people.map((p) => [p.id, p])),
      place: new Map(data.places.map((p) => [p.id, p])),
      group: new Map(data.groups.map((g) => [g.id, g])),
      placeGroup: new Map(data.placeGroups.map((g) => [g.id, g])),
      category: new Map(customOf(data).categories.map((c) => [c.id, c])),
      customGroup: new Map(customOf(data).groups.map((g) => [g.id, g])),
      item: new Map(customOf(data).items.map((i) => [i.id, i])),
    }),
    [data],
  );

  // 이 노드 = 연결의 한 끝.
  const self: NodeRef | null =
    kind === "ev" ? { type: "LIFE_EVENT", id: a } : kind === "st" ? { type: "EPISODE", id: b } : kind === "pe" ? { type: "PERSON", id: a } : kind === "pl" ? { type: "PLACE", id: a } : kind === "gl" || kind === "gc" ? { type: "PERSON_GROUP", id: a } : kind === "pgl" || kind === "pgc" ? { type: "PLACE_GROUP", id: a } : kind === "cat" || kind === "cgl" || kind === "cgc" || kind === "cn" ? { type: "CUSTOM", id: a } : null;
  const ev = kind === "ev" || kind === "st" ? look.event.get(a) : undefined;
  const story: MyLifeStory | undefined = kind === "st" ? ev?.stories.find((s) => s.id === b) : undefined;
  const person = kind === "pe" ? look.person.get(a) : undefined;
  const place = kind === "pl" ? look.place.get(a) : undefined;
  const group = kind === "gl" || kind === "gc" ? look.group.get(a) : undefined;
  const placeGroup = kind === "pgl" || kind === "pgc" ? look.placeGroup.get(a) : undefined;
  // 사용자 카테고리(custom-graph 2단계) · 기본 카테고리(인물록·장소록 — 이름 바꾸기만)
  const category = kind === "cat" ? look.category.get(a) : undefined;
  const cgroup = kind === "cgl" || kind === "cgc" ? look.customGroup.get(a) : undefined;
  const item = kind === "cn" ? look.item.get(a) : undefined;
  const builtin = kind === "bcat" && (a === "PEOPLE" || a === "PLACES") ? (a as "PEOPLE" | "PLACES") : null;
  const custom = customOf(data);
  if (!self && !builtin) return <>{info}</>;

  const personItem = (id: string, removable = true, note?: string): LinkItem | null => {
    const p = look.person.get(id);
    return p ? { ref: { type: "PERSON", id }, name: p.name, sub: p.relation ?? undefined, go: { key: `pe:${id}`, eventId: null }, removable, note } : null;
  };
  const placeItem = (id: string, removable = true, note?: string): LinkItem | null => {
    const p = look.place.get(id);
    return p ? { ref: { type: "PLACE", id }, name: p.name, sub: p.address ?? undefined, go: { key: `pl:${id}`, eventId: null }, removable, note } : null;
  };
  const groupItem = (id: string): LinkItem | null => {
    const g = look.group.get(id);
    return g ? { ref: { type: "PERSON_GROUP", id }, name: g.name, go: { key: `gl:${id}`, eventId: null }, removable: true } : null;
  };
  const placeGroupItem = (id: string): LinkItem | null => {
    const g = look.placeGroup.get(id);
    return g ? { ref: { type: "PLACE_GROUP", id }, name: g.name, go: { key: `pgl:${id}`, eventId: null }, removable: true } : null;
  };
  const nn = <T,>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);
  // 사용자 카테고리 목록 줄 — 넣어 둔 것·이어진 것(바로가기 대상). 이름 아래 = 원래 자리.
  const refItem = (r: MyLifeRef): LinkItem | null => {
    const info = refInfo(data, r);
    return info ? { ref: { type: r.type, id: r.id }, name: info.name, sub: info.where, go: { key: info.key, eventId: info.eventId }, removable: true } : null;
  };

  // 이어진 것(빼기 목록)과 넣기 버튼 — 노드 종류별.
  const sections: { title: string; items: LinkItem[] }[] = [];
  const adds: { what: PickWhat; label: string }[] = [];
  if (ev && kind === "ev") {
    // 사람·장소 = 시기 노드 "사람·장소 N"과 같은 목록(eventPeoplePlaceList — 이야기에 나온 분·곳 포함, 3단계 최종 E2E 2026-11-02).
    // 시기에 바로 이은 것만 [빼기], 이야기에서만 나온 것은 그 이야기 이름.
    const list = eventPeoplePlaceList(ev);
    const inStory = (storyId: string | null) => {
      const s = ev.stories.find((x) => x.id === storyId);
      return C.inStory(s ? shortTitle(displayTitle(s)) : "");
    };
    const periodItem = (r: PeriodRef, kind: "person" | "place"): LinkItem | null => {
      const make = kind === "person" ? personItem : placeItem;
      if (r.direct) return make(r.id);
      const it = make(r.id, false, inStory(r.storyId));
      return it && { ...it, fromStory: true };
    };
    sections.push({ title: C.panelPeriodPeople, items: nn(list.people.map((r) => periodItem(r, "person"))) });
    sections.push({ title: C.panelPeriodPlaces, items: nn(list.places.map((r) => periodItem(r, "place"))) });
    sections.push({ title: C.panelGroups, items: nn(ev.groupIds.map(groupItem)) });
    adds.push({ what: "person", label: E.addPerson }, { what: "place", label: E.addPlace });
  } else if (story) {
    const ppl = story.chips.filter((c) => c.kind === "person");
    sections.push({
      title: C.panelWithPeople,
      items: nn(ppl.map((c) => (c.id === story.subjectPersonId ? personItem(c.id, false, E.subjectNote) : personItem(c.id)))),
    });
    sections.push({ title: C.panelGroups, items: nn(story.chips.filter((c) => c.kind === "group").map((c) => groupItem(c.id))) });
    sections.push({ title: C.panelWithPlaces, items: nn(story.chips.filter((c) => c.kind === "place").map((c) => placeItem(c.id))) });
    adds.push({ what: "person", label: E.addPerson }, { what: "place", label: E.addPlace }, { what: "group", label: E.addGroup });
  } else if (person) {
    sections.push({ title: C.panelGroups, items: nn(person.groupIds.map(groupItem)) });
    adds.push({ what: "group", label: E.addToGroup });
  } else if (place) {
    sections.push({ title: C.panelPlaceGroups, items: nn(place.groupIds.map(placeGroupItem)) });
    adds.push({ what: "placeGroup", label: E.addToPlaceGroup });
  } else if (group) {
    sections.push({ title: C.panelMembers, items: nn(group.memberIds.map((id) => personItem(id))) });
    adds.push({ what: "member", label: E.addMember });
  } else if (placeGroup) {
    sections.push({ title: C.panelPlaceMembers, items: nn(placeGroup.memberIds.map((id) => placeItem(id))) });
    adds.push({ what: "placeMember", label: E.addPlace });
  } else if (cgroup) {
    sections.push({ title: X.sectionContains, items: nn(cgroup.memberRefs.map(refItem)) });
    adds.push({ what: "putIn", label: X.putIn });
    if (custom.categories.length > 1) adds.push({ what: "intoCategory", label: X.intoCategory });
  } else if (item) {
    sections.push({ title: X.sectionRelated, items: nn(item.related.map(refItem)) });
    adds.push({ what: "relate", label: X.relate });
    if (custom.groups.length > 0) adds.push({ what: "intoGroup", label: X.intoGroup });
    if (custom.categories.length > 1) adds.push({ what: "intoCategory", label: X.intoCategory });
  } else if (category) {
    adds.push({ what: "putIn", label: X.putIn });
  }
  // 넣어 둔 카테고리·묶음(바로가기가 있는 곳) — [빼기] = 그 넣기 연결만(§6.6 P13). 사용자 항목·묶음은 자리(자기 카테고리) 말고 다른 곳.
  if (self && !category) {
    const inCats = custom.categories.filter((c) => c.refs.some((r) => r.type === self.type && r.id === self.id));
    const inGroups = custom.groups.filter((g) => g.memberRefs.some((r) => r.type === self.type && r.id === self.id));
    const catName = (id: string) => look.category.get(id)?.name ?? "";
    sections.push({
      title: item || cgroup ? X.sectionIn : X.sectionCats,
      items: [
        ...inCats.map((c): LinkItem => ({ ref: { type: "CUSTOM", id: c.id }, name: c.name, sub: X.kindCategory, go: { key: `cat:${c.id}`, eventId: null }, removable: true })),
        ...inGroups.map((g): LinkItem => ({ ref: { type: "CUSTOM", id: g.id }, name: g.name, sub: `${X.kindGroup} · ${catName(g.categoryId)}`, go: { key: `cgl:${g.id}`, eventId: null }, removable: true })),
      ],
    });
  }
  // 이어진 항목(관련 — 시기·이야기·사람·장소, §6.6 P1·P13)
  if (self && (self.type === "LIFE_EVENT" || self.type === "EPISODE" || self.type === "PERSON" || self.type === "PLACE")) {
    const rel = custom.items.filter((i) => i.related.some((r) => r.type === self.type && r.id === self.id));
    sections.push({ title: X.sectionItems, items: nn(rel.map((i) => refItem({ type: "CUSTOM", id: i.id }))) });
  }

  // 고르기 목록 — 아직 이어지지 않은 것만(확정 인물만).
  function candidates(what: PickWhat): { id: string; label: string; sub?: string; ref: NodeRef }[] {
    if (what === "putIn" || what === "relate" || what === "intoGroup" || what === "intoCategory") return customCandidates(what);
    const linked = new Set(sections.flatMap((s) => s.items.filter((i) => !i.fromStory).map((i) => `${i.ref.type}:${i.ref.id}`)));
    if (story?.subjectPersonId) linked.add(`PERSON:${story.subjectPersonId}`);
    if (what === "person" || what === "member") {
      return data.people.filter((p) => !linked.has(`PERSON:${p.id}`)).map((p) => ({ id: p.id, label: p.name, sub: p.relation ?? undefined, ref: { type: "PERSON", id: p.id } }));
    }
    if (what === "place" || what === "placeMember") {
      return data.places.filter((p) => !linked.has(`PLACE:${p.id}`)).map((p) => ({ id: p.id, label: p.name, sub: p.address ?? undefined, ref: { type: "PLACE", id: p.id } }));
    }
    if (what === "group") return data.groups.filter((g) => !linked.has(`PERSON_GROUP:${g.id}`)).map((g) => ({ id: g.id, label: g.name, ref: { type: "PERSON_GROUP", id: g.id } }));
    return data.placeGroups.filter((g) => !linked.has(`PLACE_GROUP:${g.id}`)).map((g) => ({ id: g.id, label: g.name, ref: { type: "PLACE_GROUP", id: g.id } }));
  }

  // 사용자 카테고리 고르기(custom-graph 2단계 — §6.6 P9·P11): 넣기 = 6종 + 다른 카테고리 항목(카테고리면 다른 카테고리 묶음도) ·
  // 잇기 = 시기·이야기·사람·장소·다른 항목 · 묶음에 넣기 = 사용자 묶음 · 다른 카테고리에 넣기 = 자리 말고 다른 카테고리. 이미 든 것은 뺀다.
  function customCandidates(what: "putIn" | "relate" | "intoGroup" | "intoCategory"): { id: string; label: string; sub?: string; ref: NodeRef }[] {
    const catName = (id: string) => look.category.get(id)?.name ?? "";
    const c = (type: NodeRef["type"], id: string, label: string, sub?: string) => ({ id: `${type}:${id}`, label, sub, ref: { type, id } });
    const sixes = (withGroups: boolean) => [
      ...data.events.map((e) => c("LIFE_EVENT", e.id, `${yearText(e)} ${e.label}`, X.kindOf.LIFE_EVENT)),
      ...data.events.flatMap((e) => e.stories.filter((s) => s.primaryEventId === e.id).map((s) => c("EPISODE", s.id, shortTitle(displayTitle(s)), `${X.kindOf.EPISODE} · ${e.label}`))),
      ...data.people.map((p) => c("PERSON", p.id, p.name, p.relation ?? X.kindOf.PERSON)),
      ...data.places.map((p) => c("PLACE", p.id, p.name, p.address ?? X.kindOf.PLACE)),
      ...(withGroups ? [...data.groups.map((g) => c("PERSON_GROUP", g.id, g.name, X.kindOf.PERSON_GROUP)), ...data.placeGroups.map((g) => c("PLACE_GROUP", g.id, g.name, X.kindOf.PLACE_GROUP))] : []),
    ];
    const items = (except: (i: { id: string; categoryId: string }) => boolean) =>
      custom.items.filter((i) => !except(i)).map((i) => c("CUSTOM", i.id, i.name, `${X.kindItem} · ${catName(i.categoryId)}`));
    let all: ReturnType<typeof c>[] = [];
    let has = new Set<string>();
    if (what === "putIn" && category) {
      has = new Set(categoryEntries(category, custom).map((e) => (e.itemId ? `CUSTOM:${e.itemId}` : `${e.ref!.type}:${e.ref!.id}`)));
      all = [...sixes(true), ...items((i) => i.categoryId === category.id), ...custom.groups.filter((g) => g.categoryId !== category.id).map((g) => c("CUSTOM", g.id, g.name, `${X.kindGroup} · ${catName(g.categoryId)}`))];
    } else if (what === "putIn" && cgroup) {
      has = new Set(cgroup.memberRefs.map((r) => `${r.type}:${r.id}`));
      all = [...sixes(true), ...items(() => false)];
    } else if (what === "relate" && item) {
      has = new Set([...item.related.map((r) => `${r.type}:${r.id}`), `CUSTOM:${item.id}`]);
      all = [...sixes(false), ...items(() => false)];
    } else if (what === "intoGroup" && item) {
      all = custom.groups.filter((g) => !g.memberRefs.some((r) => r.type === "CUSTOM" && r.id === item.id)).map((g) => c("CUSTOM", g.id, g.name, `${X.kindGroup} · ${catName(g.categoryId)}`));
    } else if (what === "intoCategory" && (item || cgroup)) {
      const me = (item ?? cgroup)!;
      all = custom.categories.filter((k) => k.id !== me.categoryId && !k.refs.some((r) => r.type === "CUSTOM" && r.id === me.id)).map((k) => c("CUSTOM", k.id, k.name, X.kindCategory));
    }
    return all.filter((x) => !has.has(x.id));
  }

  // 묶음·항목 자리 옮기기 — 옮긴 뒤 [되돌리기] = 원래 카테고리로 다시(같은 액션).
  function moveTo(target: { id: string; name: string }) {
    run(async () => {
      const r = await moveCustomAction(a, target.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode({ t: "view" });
      router.refresh();
      const u = r.undo;
      setNotice({
        key: nodeKey,
        text: X.moved(target.name),
        undo: u
          ? async () => {
              const x = await moveCustomAction(u.nodeId, u.categoryId);
              router.refresh();
              return { ok: x.ok };
            }
          : undefined,
        undoFail: E.cannotUndo,
      });
    });
  }

  // 바로가기로 연 패널 [이 카테고리에서 빼기](Q99 — 그 카테고리와 그 안 묶음의 넣기 연결을 모두) + [되돌리기].
  function takeOut() {
    run(async () => {
      const r = await takeOutAction(fromCategory!, self!);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setTakenOut(true);
      router.refresh();
      const u = r.undo;
      setNotice({
        key: nodeKey,
        text: X.takenOut,
        undo: async () => {
          const x = await undoRemoveAction(u);
          router.refresh();
          if (x.ok) setTakenOut(false);
          return x;
        },
        undoFail: E.cannotUndo,
      });
    });
  }

  // 모든 저장 — 앞 알림(되돌리기)은 지운다(다음 동작 전까지).
  function run(fn: () => Promise<void>) {
    setError(null);
    setNotice(null);
    start(async () => {
      try {
        await fn();
      } catch {
        setError(E.failed);
      }
    });
  }

  function link(other: NodeRef, alsoUndoCreate: CreatedNode | null = null) {
    run(async () => {
      const r = await addLinkAction(self!, other);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      const created: CreatedLink[] = r.created;
      setMode({ t: "view" });
      setFilter("");
      router.refresh();
      if (created.length === 0 && !alsoUndoCreate) {
        setNotice({ key: nodeKey, text: E.alreadyLinked });
        return;
      }
      setNotice({
        key: nodeKey,
        text: E.linked,
        undo: async () => {
          const u = await undoLinksAction(created);
          if (u.ok && alsoUndoCreate) await undoCreateAction(alsoUndoCreate);
          router.refresh();
          return u;
        },
      });
    });
  }

  async function linkNow(other: NodeRef): Promise<DropResult> {
    setError(null);
    setNotice(null);
    try {
      const r = await addLinkAction(self!, other);
      if (!r.ok) {
        setError(r.error);
        return "failed";
      }
      router.refresh();
      if (r.created.length === 0) {
        setNotice({ key: nodeKey, text: E.alreadyLinked });
        return "already";
      }
      const created = r.created;
      setNotice({
        key: nodeKey,
        text: E.linked,
        undo: async () => {
          const u = await undoLinksAction(created);
          router.refresh();
          return u;
        },
      });
      return "added";
    } catch {
      setError(E.failed);
      return "failed";
    }
  }

  // 행성 꾸미기(U4) — 고르는 순간 행성에 보이고(낙관적 — MyLifeView links.decorate) 저장은 뒤에서. [되돌리기]는 저장이 끝난 뒤에만
  // 눌림(그 전엔 보이되 비활성 — U3 낙관적 반영과 같음) · 되돌리기 = 서버가 알려 준 바꾸기 전 모양으로 다시 · 실패면 원래대로 + 알림.
  function decorate(shape: string | null) {
    setError(null);
    const text = shape ? C.space.decorSet(decorName(shape)) : C.space.decorCleared;
    setNotice({ key: nodeKey, text, saving: true });
    void links.decorate(self!, shape).then((r) => {
      if (!r.ok) {
        setNotice({ key: nodeKey, text: C.space.decorFailed });
        return;
      }
      const prev = r.previous;
      setNotice({ key: nodeKey, text, undo: async () => ({ ok: (await links.decorate(self!, prev)).ok }) });
    });
  }

  // "넣을 것" 줄에서 길게 눌러 위 행성(이 패널의 행성 — 펼쳐져 패널 위에 있음)으로 끌어 올리기. 다른 행성엔 안 놓임.
  function startRowDrag(e: React.PointerEvent<HTMLButtonElement>, c: { label: string; ref: NodeRef }) {
    if (!e.isPrimary) return;
    const dialog = e.currentTarget.closest("dialog");
    const box = document.querySelector<HTMLElement>(".space-map");
    const planetEl = (k: string) => box?.querySelector<HTMLElement>(`button[data-node-key="${CSS.escape(k)}"]`) ?? null;
    const planet = planetEl(nodeKey);
    if (!dialog || !box || !planet) return; // 목록 보기에서 연 패널 — 누르기만
    let optId = 0; // 궤도에 든 위성(낙관적 항목)
    let created: CreatedLink[] = [];
    beginPress({
      kind: c.ref.type === "PLACE" ? "place" : c.ref.type === "PERSON_GROUP" ? "group" : "person",
      name: c.label,
      origin: e.currentTarget,
      pointer: { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp },
      ghostHost: dialog,
      edgeBox: null,
      planets: () => {
        const r = planet.getBoundingClientRect();
        return [{ key: nodeKey, cx: r.left + r.width / 2, cy: r.top + r.height / 2, rx: r.width, ry: r.width * 0.75 }];
      },
      allowed: new Set([nodeKey]),
      planetEl,
      onGrab: () => {
        dialog.setAttribute("data-dragging", "");
        box.setAttribute("data-dragging", "");
        planet.setAttribute("data-drop-ok", "");
      },
      onAutoPan: () => {},
      // 저장(서버만) → 나선이 끝나면 위성 바로 보임(onLand) → 결과(onSettled). 지도 끌기와 같은 흐름.
      onDrop: async (): Promise<DropResult> => {
        const r = await addLinkAction(self!, c.ref);
        if (!r.ok) return "failed";
        created = r.created;
        return r.created.length === 0 ? "already" : "added";
      },
      onLand: () => {
        setError(null);
        optId = links.show({ op: "add", planet: self!, sat: c.ref, alsoPeriod: kind === "st" && c.ref.type === "PERSON" });
        setNotice({ key: nodeKey, text: E.linked, saving: true });
      },
      onSettled: (_key, r) => {
        if (r === "failed") {
          if (optId) links.hide(optId);
          setNotice({ key: nodeKey, text: C.space.dropFailed });
          return;
        }
        if (optId) links.saved(optId);
        links.refresh();
        if (r === "already") {
          setNotice({ key: nodeKey, text: E.alreadyLinked });
          return;
        }
        const done = created;
        setNotice({ key: nodeKey, text: E.linked, undo: () => links.undo(self!, c.ref, done) });
      },
      onBounce: (why) => {
        if (why === "far") setNotice({ key: nodeKey, text: C.space.dropFar });
        else if (why === "cancel") setNotice({ key: nodeKey, text: C.space.dropCancel });
      },
      onEnd: () => {
        dialog.removeAttribute("data-dragging");
        box.removeAttribute("data-dragging");
        planet.removeAttribute("data-drop-ok");
      },
    });
  }

  function remove(other: NodeRef) {
    run(async () => {
      const r = await removeLinkAction(self!, other);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode({ t: "view" });
      router.refresh();
      // 빼기 직후에도 [되돌리기](만들기·넣기와 같은 방식, 다음 동작 전까지 — Q50 보완 2026-11-02). 확인 단계는 그대로.
      const u = r.undo;
      setNotice({
        key: nodeKey,
        text: E.removed,
        undo: u
          ? async () => {
              const x = await undoRemoveAction(u);
              router.refresh();
              return x;
            }
          : undefined,
        undoFail: E.cannotUndo,
      });
    });
  }

  function move(target: MyLifeEvent) {
    run(async () => {
      const r = await moveStoryAction(b, target.id);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setMode({ t: "view" });
      router.refresh();
      onReopen({ key: r.key, eventId: target.id, text: E.moved, undo: null, undoMove: r.undo ?? undefined });
    });
  }

  function openDelete() {
    setError(null);
    setNotice(null);
    setMode({ t: "delete", impact: null, loading: true });
    start(async () => {
      const impact = await deleteImpactAction(self!);
      setMode({ t: "delete", impact, loading: false });
    });
  }

  function doDelete() {
    run(async () => {
      const r = await deleteNodeAction(self!);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
      onDeleted(nodeName);
    });
  }

  const back = (
    <Button variant="tertiary" size="lg" disabled={pending} onClick={() => setMode({ t: "view" })}>
      {E.back}
    </Button>
  );
  const nodeName = ev && kind === "ev" ? ev.label : story ? shortTitle(displayTitle(story)) : person?.name ?? place?.name ?? group?.name ?? placeGroup?.name ?? category?.name ?? cgroup?.name ?? item?.name ?? "";

  // ── 단계별 화면 ──
  // 기본 카테고리(인물록·장소록) — 이름 바꾸기만(Q76, §6.6 P7)
  if (builtin) {
    if (mode.t === "editInfo") {
      return (
        <InfoEditForm
          key={nodeKey}
          person={null}
          name={builtinName(data, builtin)}
          title={X.rename}
          nameMax={30}
          pending={pending}
          error={error}
          onBack={() => {
            setError(null);
            setMode({ t: "view" });
          }}
          onSave={(v) =>
            run(async () => {
              const r = await renameBuiltinAction(builtin, v.name);
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setMode({ t: "view" });
              router.refresh();
              setNotice({ key: nodeKey, text: E.infoSaved });
            })
          }
        />
      );
    }
    return (
      <>
        {notice && notice.key === nodeKey && (
          <p role="status" className="rounded-md border-2 border-brand bg-banner px-4 py-2 text-lg text-ink">
            {notice.text}
          </p>
        )}
        {info}
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "editInfo" })}>
          {X.rename}
        </Button>
        <ErrorLine text={error} />
      </>
    );
  }
  if (mode.t === "newIn" && category) {
    return <CreateForm kind={mode.kind} data={data} preset={{ categoryId: category.id }} titleId="mylife-panel-title" onDone={onReopen} onBack={() => setMode({ t: "view" })} />;
  }
  if (mode.t === "moveCat" && (item || cgroup)) {
    const home = (item ?? cgroup)!.categoryId;
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {X.moveTitle}
        </h2>
        <ul className="flex flex-col gap-2">
          {custom.categories.map((c) => (
            <li key={c.id}>
              <button type="button" disabled={pending || c.id === home} onClick={() => moveTo(c)} className={`${ROW} border-line disabled:cursor-not-allowed disabled:opacity-60`}>
                <span className="min-w-0 truncate">{c.name}</span>
                {c.id === home && <span className="ml-auto shrink-0 text-ink-soft">{E.hereNow}</span>}
              </button>
            </li>
          ))}
        </ul>
        <ErrorLine text={error} />
        {back}
      </>
    );
  }
  if (mode.t === "addStory" && ev) {
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.addStory}
        </h2>
        <ButtonLink href={`/chat-v3?gapEventId=${encodeURIComponent(ev.id)}&gapType=episode`} variant="primary" size="lg">
          {E.talkStory}
        </ButtonLink>
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "write", kind: "story" })}>
          {E.writeStory} — {E.kinds.story}
        </Button>
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "write", kind: "self" })}>
          {E.writeStory} — {E.kinds.self}
        </Button>
        {back}
      </>
    );
  }
  if (mode.t === "write" && ev) {
    return <CreateForm kind={mode.kind} data={data} preset={{ eventId: ev.id }} titleId="mylife-panel-title" onDone={onReopen} onBack={() => setMode({ t: "addStory" })} />;
  }
  if (mode.t === "pick") {
    const all = candidates(mode.what);
    const q = filter.normalize("NFC").replace(/\s+/g, "").toLowerCase();
    const list = q ? all.filter((c) => c.label.normalize("NFC").replace(/\s+/g, "").toLowerCase().includes(q)) : all;
    const label = adds.find((x) => x.what === mode.what)?.label ?? "";
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.pickTitle(label)}
        </h2>
        {mode.what === "putIn" && <p className="m-0 text-lg text-ink-soft">{X.putInHint}</p>}
        {all.length > 10 && <input className={INPUT} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={E.pickSearch} aria-label={E.pickSearch} />}
        {list.length === 0 ? (
          <p className="text-lg text-ink-soft">{E.pickNone}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" disabled={pending} onClick={() => link(c.ref)} className={`${ROW} border-line`}>
                  <span className="min-w-0">
                    <span className="block truncate">{c.label}</span>
                    {c.sub && <span className="block truncate text-ink-soft">{c.sub}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <ErrorLine text={error} />
        {PICK_CREATE_KIND[mode.what] && (
          <Button variant="secondary" size="lg" disabled={pending} onClick={() => setMode({ t: "new", what: mode.what })}>
            {E.pickNew}
          </Button>
        )}
        {back}
      </>
    );
  }
  if (mode.t === "new" && PICK_CREATE_KIND[mode.what]) {
    const ck = PICK_CREATE_KIND[mode.what]!;
    const contextEventId = ev?.id ?? null;
    return (
      <CreateForm
        kind={ck}
        data={data}
        preset={{ contextEventId, groupIds: group && ck === "person" ? [group.id] : undefined }}
        titleId="mylife-panel-title"
        onBack={() => setMode({ t: "pick", what: mode.what })}
        onDone={(r) => {
          // 새로 만든 노드를 이 노드에 잇는다(모임 [사람 넣기]의 새 분은 만들 때 이미 모임에 들어감).
          const [k, id] = r.key.split(":");
          const type = k === "pe" ? "PERSON" : k === "pl" ? "PLACE" : k === "gl" ? "PERSON_GROUP" : "PLACE_GROUP";
          link({ type, id }, r.undo);
        }}
      />
    );
  }
  if (mode.t === "remove") {
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.remove}
        </h2>
        <p className="text-lg text-ink">{E.removeConfirm(mode.name)}</p>
        <ErrorLine text={error} />
        <Button variant="destructive" size="lg" disabled={pending} onClick={() => remove(mode.other)}>
          {E.removeDo}
        </Button>
        {back}
      </>
    );
  }
  if (mode.t === "move" && story && ev) {
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.moveTitle}
        </h2>
        <ul className="flex flex-col gap-2">
          {data.events.map((t) => (
            <li key={t.id}>
              <button type="button" disabled={t.id === story.primaryEventId} onClick={() => setMode({ t: "moveConfirm", target: t })} className={`${ROW} border-line disabled:cursor-not-allowed disabled:opacity-60`}>
                <span className="shrink-0 text-ink-soft">{yearText(t)}</span>
                <span className="min-w-0 truncate">{t.label}</span>
                {t.id === story.primaryEventId && <span className="ml-auto shrink-0 text-ink-soft">{E.hereNow}</span>}
              </button>
            </li>
          ))}
        </ul>
        {back}
      </>
    );
  }
  if (mode.t === "moveConfirm" && story) {
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.moveStory}
        </h2>
        <p className="text-lg text-ink">{E.moveConfirm(shortTitle(displayTitle(story)), `${yearText(mode.target)} ${mode.target.label}`)}</p>
        <ErrorLine text={error} />
        <Button variant="primary" size="lg" disabled={pending} onClick={() => move(mode.target)}>
          {E.moveDo}
        </Button>
        <Button variant="tertiary" size="lg" disabled={pending} onClick={() => setMode({ t: "move" })}>
          {E.back}
        </Button>
      </>
    );
  }
  if (mode.t === "delete") {
    const im = mode.impact;
    return (
      <>
        <h2 id="mylife-panel-title" className="m-0 text-2xl">
          {E.deleteTitle(nodeName)}
        </h2>
        {mode.loading ? (
          <p className="text-lg text-ink-soft">{E.saving}</p>
        ) : im ? (
          <>
            {im.storiesDeleted && im.stories > 0 && <p className="text-lg font-semibold text-ink">{E.deleteStoriesToo(im.stories)}</p>}
            {im.customKind === "CATEGORY" && <p className="text-lg text-ink">{X.deleteCatNote(im.customDeleted, im.customOut)}</p>}
            {im.customKind === "GROUP" && <p className="text-lg text-ink">{X.deleteGroupNote(im.customOut)}</p>}
            {im.customKind === "ITEM" && <p className="text-lg text-ink">{X.deleteItemNote(im.customLinks)}</p>}
            {im.customKind === "ITEM" && im.personBody && <p className="text-lg text-ink">{X.deleteItemBody}</p>}
            {!im.customKind && <p className="text-lg text-ink">{deleteLinkedText(im)}</p>}
            {im.placeGroups > 0 && <p className="text-lg text-ink">{E.deletePlaceGroups(im.placeGroups)}</p>}
            {im.familyActivity > 0 && <p className="text-lg text-ink">{E.deleteFamily(im.familyActivity)}</p>}
            {!im.customKind && im.personBody && <p className="text-lg text-ink">{E.deletePersonBody}</p>}
            <p className="text-lg text-ink-soft">{E.deleteIrreversible}</p>
          </>
        ) : (
          <p className="text-lg text-ink">{E.deleteSkeletonNote}</p>
        )}
        <ErrorLine text={error} />
        {im && (
          <Button variant="destructive" size="lg" disabled={pending || mode.loading} onClick={doDelete}>
            {E.deleteDo}
          </Button>
        )}
        {back}
      </>
    );
  }

  if (mode.t === "editInfo" && (person || place || group || category || cgroup || item)) {
    return (
      <InfoEditForm
        key={nodeKey}
        person={person ?? null}
        name={person?.name ?? place?.name ?? group?.name ?? category?.name ?? cgroup?.name ?? item?.name ?? ""}
        title={person ? E.editInfo : place || group ? E.editName : X.rename}
        nameMax={person || place ? 50 : 30}
        pending={pending}
        error={error}
        onBack={() => {
          setError(null);
          setMode({ t: "view" });
        }}
        onSave={(v) =>
          run(async () => {
            const r = person ? await updatePersonInfoAction(person.id, v) : await renameNodeAction(self!, v.name);
            if (!r.ok) {
              setError(r.error);
              return;
            }
            setMode({ t: "view" });
            router.refresh();
            setNotice({ key: nodeKey, text: E.infoSaved });
          })
        }
      />
    );
  }

  // ── 기본(정보 + 고치기) ──
  const canDelete = (kind === "ev" && ev?.type === "CUSTOM") || !!story || !!person || !!place || !!group || !!placeGroup || !!category || !!cgroup || !!item;
  return (
    <>
      {notice && notice.key === nodeKey && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-brand bg-banner px-4 py-2">
          <p className="text-lg text-ink">{notice.text}</p>
          {(notice.undo || notice.saving) && (
            <Button
              variant="secondary"
              size="lg"
              disabled={pending || !notice.undo}
              onClick={() => {
                const u = notice.undo!;
                const fail = notice.undoFail ?? E.cannotUnlink;
                setNotice(null);
                start(async () => {
                  const r = await u();
                  setNotice({ key: nodeKey, text: r.ok ? E.undone : fail });
                });
              }}
            >
              {E.undo}
            </Button>
          )}
        </div>
      )}
      {/* 카테고리 영역의 바로가기로 연 패널(Q99 — §6.6 P12) */}
      {fromCategory && !takenOut && (
        <div className="flex flex-col gap-2 rounded-md border-2 border-dashed border-music px-4 py-3">
          <p className="m-0 text-lg text-ink">{X.refIn(look.category.get(fromCategory)?.name ?? "")}</p>
          <Button variant="secondary" size="lg" onClick={() => onGo(nodeKey, kind === "ev" || kind === "st" ? a : null)}>
            {X.goOrigin}
          </Button>
          <Button variant="secondary" size="lg" disabled={pending} onClick={takeOut}>
            {X.takeOut}
          </Button>
        </div>
      )}
      {info}
      {category && (
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1 px-3!" onClick={() => setMode({ t: "newIn", kind: "item" })}>
            + {X.addItem}
          </Button>
          <Button variant="secondary" size="lg" className="flex-1 px-3!" onClick={() => setMode({ t: "newIn", kind: "customGroup" })}>
            + {X.addGroup}
          </Button>
        </div>
      )}
      {(kind === "ev" || kind === "st") && (
        <>
          <Button variant="secondary" size="lg" aria-expanded={showRow} onClick={() => setShowRow((v) => !v)}>
            {showRow ? C.space.addRowHide : C.space.addRowShow}
          </Button>
          {showRow && <AddRow items={[...candidates("person"), ...candidates("group"), ...candidates("place")]} pending={pending} onPress={startRowDrag} onAdd={(ref) => start(async () => void (await linkNow(ref)))} />}
          <Button variant="secondary" size="lg" aria-expanded={showDecor} onClick={() => setShowDecor((v) => !v)}>
            {showDecor ? C.space.decorateHide : C.space.decorate}
          </Button>
          {showDecor && (
            <DecorPicker
              current={(kind === "ev" ? ev?.decor : story?.decor) ?? null}
              planetClass={kind === "ev" ? "planet-period border-period-edge" : "planet-story border-planet-edge"}
              onPick={decorate}
            />
          )}
        </>
      )}
      {kind === "ev" && ev && (
        <Button variant="primary" size="lg" onClick={() => setMode({ t: "addStory" })}>
          {E.addStory}
        </Button>
      )}
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <div key={s.title} className="flex flex-col gap-2">
            <p className="text-lg font-semibold text-ink">{s.title}</p>
            <ul className="flex flex-col gap-2">
              {s.items.map((it) => (
                <li key={`${it.ref.type}:${it.ref.id}`} className="flex items-stretch gap-2">
                  <button type="button" onClick={() => onGo(it.go.key, it.go.eventId)} className={`${ROW} min-w-0 flex-1 border-line`}>
                    <span className="min-w-0">
                      <span className="block truncate">{it.name}</span>
                      {(it.note ?? it.sub) && <span className="block truncate text-ink-soft">{it.note ?? it.sub}</span>}
                    </span>
                    <span className="ml-auto shrink-0 text-action">{C.goThere}</span>
                  </button>
                  {it.removable && (
                    <Button variant="tertiary" size="lg" className="shrink-0 px-4!" aria-label={`${it.name} ${E.remove}`} onClick={() => setMode({ t: "remove", other: it.ref, name: it.name })}>
                      {E.remove}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      {adds.map((x) => (
        <Button key={x.what} variant="secondary" size="lg" onClick={() => setMode({ t: "pick", what: x.what })}>
          {x.label}
        </Button>
      ))}
      {story && (
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "move" })}>
          {E.moveStory}
        </Button>
      )}
      {(person || place || group || category || cgroup || item) && (
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "editInfo" })}>
          {person ? E.editInfo : place || group ? E.editName : X.rename}
        </Button>
      )}
      {(item || cgroup) && custom.categories.length > 1 && (
        <Button variant="secondary" size="lg" onClick={() => setMode({ t: "moveCat" })}>
          {X.moveTo}
        </Button>
      )}
      <ErrorLine text={error} />
      {canDelete && (
        <div className="border-t border-line pt-4">
          <Button variant="destructive" size="lg" className="w-full" onClick={openDelete}>
            {E.deleteNode[story ? "story" : person ? "person" : place ? "place" : group ? "group" : placeGroup ? "placeGroup" : category ? "category" : cgroup ? "customGroup" : item ? "item" : "period"]}
          </Button>
        </div>
      )}
    </>
  );
}

// 인물록 통합(2026-11-06) — 사람: 이름·관계·태어난 해·처음 만난 해·메모(옛 /people 고치기 칸, 분류는 V3 화면에서 안 씀) ·
// 장소·모임: 이름만. 저장 검사는 서버(lib/my-life-edit updatePersonInfo·renameNode)가 한다 — 여기는 길이·숫자만 막는다.
type InfoValues = { name: string; relation: string; birthYear: string; metYear: string; memo: string };
function InfoEditForm({
  person,
  name: initialName,
  title,
  nameMax,
  pending,
  error,
  onBack,
  onSave,
}: {
  person: { relation: string | null; birthYear: number | null; metYear: number | null; memo: string | null } | null;
  name: string;
  title: string;
  nameMax: number;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (v: InfoValues) => void;
}) {
  const [v, setV] = useState<InfoValues>(() => ({
    name: initialName,
    relation: person?.relation ?? "",
    birthYear: person?.birthYear != null ? String(person.birthYear) : "",
    metYear: person?.metYear != null ? String(person.metYear) : "",
    memo: person?.memo ?? "",
  }));
  const set = (k: keyof InfoValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setV((x) => ({ ...x, [k]: k === "birthYear" || k === "metYear" ? e.target.value.replace(/[^0-9]/g, "").slice(0, 4) : e.target.value }));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(v);
      }}
    >
      <h2 id="mylife-panel-title" className="m-0 text-2xl">
        {title}
      </h2>
      <Field label={E.fieldName} htmlFor="mylife-info-name">
        <input id="mylife-info-name" className={INPUT} value={v.name} onChange={set("name")} maxLength={nameMax} autoComplete="off" />
      </Field>
      {person && (
        <>
          <Field label={E.fieldRelation} htmlFor="mylife-info-rel">
            <input id="mylife-info-rel" className={INPUT} value={v.relation} onChange={set("relation")} maxLength={30} autoComplete="off" />
          </Field>
          <Field label={E.fieldBirthYear} htmlFor="mylife-info-birth">
            <input id="mylife-info-birth" className={INPUT} inputMode="numeric" value={v.birthYear} onChange={set("birthYear")} autoComplete="off" />
          </Field>
          <Field label={E.fieldMetYear} htmlFor="mylife-info-met">
            <input id="mylife-info-met" className={INPUT} inputMode="numeric" value={v.metYear} onChange={set("metYear")} autoComplete="off" />
          </Field>
          <Field label={E.fieldMemo} htmlFor="mylife-info-memo">
            <textarea id="mylife-info-memo" className={`${INPUT} min-h-[120px] py-3`} rows={4} value={v.memo} onChange={set("memo")} />
          </Field>
        </>
      )}
      <ErrorLine text={error} />
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending ? E.saving : E.saveInfo}
      </Button>
      <Button variant="tertiary" size="lg" disabled={pending} onClick={onBack}>
        {E.back}
      </Button>
    </form>
  );
}

// "넣을 것" 줄(U3 — ui-space §4.2 Q116) — 이 행성에 아직 없는 사람·모임·장소를 작은 위성 모양 버튼으로.
// 누르면(Enter·Space 포함) 바로 넣기 = 버튼 경로(2.5.7 대체), 길게 누르면 위 행성으로 끌어 올리기(./drag). 줄은 꺾여 내려가 가로 스크롤 없음.
function AddRow({
  items,
  pending,
  onPress,
  onAdd,
}: {
  items: { id: string; label: string; ref: NodeRef }[];
  pending: boolean;
  onPress: (e: React.PointerEvent<HTMLButtonElement>, c: { label: string; ref: NodeRef }) => void;
  onAdd: (ref: NodeRef) => void;
}) {
  return (
    <section aria-labelledby="mylife-addrow-title" className="flex flex-col gap-2">
      <p id="mylife-addrow-title" className="text-lg font-semibold text-ink">
        {C.space.addRowTitle}
      </p>
      <p className="text-lg text-ink-soft">{C.space.addRowHint}</p>
      {items.length === 0 ? (
        <p className="text-lg text-ink-soft">{E.pickNone}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {items.map((c) => {
            const k = c.ref.type === "PLACE" ? "place" : c.ref.type === "PERSON_GROUP" ? "group" : "person";
            return (
              <li key={`${c.ref.type}:${c.id}`}>
                <button
                  type="button"
                  data-drag={`${c.ref.type}:${c.id}`}
                  data-drag-name={c.label}
                  aria-label={C.space.addRowItem(c.label)}
                  disabled={pending}
                  onPointerDown={(e) => onPress(e, c)}
                  onClick={() => {
                    if (dragJustEnded()) return; // 끌어 올리고 손을 뗄 때 생긴 클릭
                    onAdd(c.ref);
                  }}
                  className="flex min-h-[56px] w-[104px] flex-col items-center gap-1 rounded-md py-1 hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <span
                    aria-hidden
                    className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-lg font-bold ${k === "place" ? "moon-place border-place" : "moon-person border-person"} ${k === "group" ? "border-dashed" : ""}`}
                  >
                    {k === "place" ? <MapPin size={22} /> : k === "group" ? <Users size={22} /> : c.label.slice(0, 1)}
                  </span>
                  <span className="line-clamp-2 w-full text-center text-lg leading-6 text-ink">{c.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
