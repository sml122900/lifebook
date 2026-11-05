"use client";

// My Life 개편 3단계 — 지도에서 직접 만들기·넣기·빼기·되돌리기·옮기기·지우기 화면. docs/phase/my-life-restructure.md §4.
//
// CreateForm   — 노드 7종 입력(시기·이야기·그때의 나·사람·장소·모임·장소 묶음) + 같은 이름 되묻기. 만들기 시트·패널 공용.
// NodeEditor   — 노드 패널의 고치기 부분: 이어진 것 목록([빼기] → 패널 안 확인), [넣기](고르기 목록 + 새로 만들기),
//                이야기 [다른 시절로 옮기기], [이 노드 지우기](이어진 이야기·사람·장소 수를 보여 주는 확인 단계).
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
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import type { MoveUndo } from "@/lib/episode-move";
import type { CreatedLink, DeleteImpact, SameNamePerson } from "@/lib/my-life-edit";
import { eventPeoplePlaceList, yearText, type PeriodRef } from "@/lib/my-life-layout";
import type { NodeRef } from "@/lib/node-graph";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";
import { displayTitle, shortTitle } from "@/lib/story-title";

import { beginPress, dragJustEnded, type DropResult } from "./drag";

import {
  addLinkAction,
  createNodeAction,
  deleteImpactAction,
  deleteNodeAction,
  moveStoryAction,
  removeLinkAction,
  undoCreateAction,
  undoLinksAction,
  undoRemoveAction,
  type CreateInput,
  type CreatedNode,
} from "./actions";

const C = MY_LIFE_COPY;
const E = MY_LIFE_COPY.edit;

export type CreateKind = "period" | "story" | "self" | "person" | "place" | "group" | "placeGroup";
export const CREATE_KINDS: CreateKind[] = ["period", "story", "self", "person", "place", "group", "placeGroup"];

// 패널 맨 위 알림(되돌리기는 다음 동작 전까지) — 부모(MyLifeView)가 들고 있다.
// undoFail — 되돌리기가 안 됐을 때 문구(없으면 넣기·만들기 되돌리기 문구 cannotUnlink).
export type Notice = { key: string; text: string; undo?: () => Promise<{ ok: boolean }>; undoFail?: string };
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

export type CreatePreset = { eventId?: string; groupIds?: string[]; contextEventId?: string | null };

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
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const kindLabel = E.kinds[kind];
  const fixedEvent = preset?.eventId ? data.events.find((e) => e.id === preset.eventId) : undefined;

  function input(decision?: "same" | "different", samePersonId?: string): CreateInput {
    const num = (s: string) => (s.trim() === "" ? null : Number(s.trim()));
    switch (kind) {
      case "period":
        return { kind, label: name, year: num(year), endYear: num(endYear) };
      case "story":
      case "self":
        return { kind, lifeEventId: eventId, title, content: body, personIds, groupIds: kind === "self" ? groupIds : [], placeIds: kind === "story" ? placeIds : [] };
      case "person":
        return { kind, name, relation, groupIds, decision, samePersonId, contextEventId: preset?.contextEventId ?? null };
      case "place":
        return placeMode === "search" && place.placeName
          ? { kind, name: place.placeName, address: place.placeAddress, lat: place.lat, lng: place.lng, source: place.placeSource }
          : { kind, name, address: null, lat: null, lng: null, source: null };
      case "group":
        return { kind, name, memberIds: personIds };
      case "placeGroup":
        return { kind, name, placeIds };
    }
  }

  function submit(decision?: "same" | "different", samePersonId?: string) {
    setError(null);
    start(async () => {
      const r = await createNodeAction(input(decision, samePersonId));
      if ("ask" in r) {
        setAsk(r.ask);
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

      {(kind === "period" || kind === "person" || kind === "group" || kind === "placeGroup" || (kind === "place" && placeMode === "name")) && (
        <Field label={E.fieldName} htmlFor={id("name")}>
          <input id={id("name")} className={INPUT} value={name} onChange={(e) => setName(e.target.value)} maxLength={kind === "period" || kind === "group" || kind === "placeGroup" ? 30 : 50} autoComplete="off" />
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
  onDone,
  onClose,
  onSuggest,
}: {
  data: MyLifeData;
  initialKind: CreateKind | null;
  onDone: (r: Created) => void;
  onClose: () => void;
  onSuggest?: () => void;
}) {
  const [kind, setKind] = useState<CreateKind | null>(initialKind);
  return (
    <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
      {kind ? (
        <CreateForm kind={kind} data={data} titleId="mylife-create-title" onDone={onDone} onBack={initialKind ? onClose : () => setKind(null)} backLabel={initialKind ? E.cancel : E.back} />
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

type PickWhat = "person" | "place" | "group" | "placeGroup" | "member" | "placeMember";
type Mode =
  | { t: "view" }
  | { t: "addStory" }
  | { t: "write"; kind: "story" | "self" }
  | { t: "pick"; what: PickWhat }
  | { t: "new"; what: PickWhat }
  | { t: "remove"; other: NodeRef; name: string }
  | { t: "move" }
  | { t: "moveConfirm"; target: MyLifeEvent }
  | { t: "delete"; impact: DeleteImpact | null; loading: boolean };

// fromStory = 시기 패널에서 이야기에서만 나온 분·곳(시기에 바로 잇지 않음 — [넣기] 후보에서 안 뺌).
type LinkItem = { ref: NodeRef; name: string; sub?: string; go: { key: string; eventId: string | null }; removable: boolean; note?: string; fromStory?: boolean };

// 지우기 확인 — 이어진 것 중 0 이 아닌 것만(시기는 함께 지워질 이야기를 따로 적으므로 이야기 수는 빼고).
function deleteLinkedText(im: DeleteImpact): string {
  const parts = [
    ...(!im.storiesDeleted && im.stories > 0 ? [E.linkStories(im.stories)] : []),
    ...(im.people > 0 ? [E.linkPeople(im.people)] : []),
    ...(im.places > 0 ? [E.linkPlaces(im.places)] : []),
  ];
  return parts.length > 0 ? E.deleteLinked(parts) : E.deleteNoLinks;
}

const PICK_CREATE_KIND: Record<PickWhat, CreateKind> = { person: "person", member: "person", place: "place", placeMember: "place", group: "group", placeGroup: "placeGroup" };

export function NodeEditor({
  nodeKey,
  data,
  info,
  notice,
  setNotice,
  onGo,
  onReopen,
  onDeleted,
}: {
  nodeKey: string;
  data: MyLifeData;
  info: ReactNode;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  onGo: (key: string, eventId: string | null) => void;
  onReopen: (r: Created) => void; // 새 노드(옮긴 이야기·직접 쓴 이야기)로 이동·패널
  onDeleted: (name: string) => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>({ t: "view" });
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const [showRow, setShowRow] = useState(false); // 행성 패널 "넣을 것" 줄(U3 — Q116)
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
    }),
    [data],
  );

  // 이 노드 = 연결의 한 끝.
  const self: NodeRef | null =
    kind === "ev" ? { type: "LIFE_EVENT", id: a } : kind === "st" ? { type: "EPISODE", id: b } : kind === "pe" ? { type: "PERSON", id: a } : kind === "pl" ? { type: "PLACE", id: a } : kind === "gl" || kind === "gc" ? { type: "PERSON_GROUP", id: a } : kind === "pgl" || kind === "pgc" ? { type: "PLACE_GROUP", id: a } : null;
  const ev = kind === "ev" || kind === "st" ? look.event.get(a) : undefined;
  const story: MyLifeStory | undefined = kind === "st" ? ev?.stories.find((s) => s.id === b) : undefined;
  const person = kind === "pe" ? look.person.get(a) : undefined;
  const place = kind === "pl" ? look.place.get(a) : undefined;
  const group = kind === "gl" || kind === "gc" ? look.group.get(a) : undefined;
  const placeGroup = kind === "pgl" || kind === "pgc" ? look.placeGroup.get(a) : undefined;
  if (!self) return <>{info}</>;

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
  }

  // 고르기 목록 — 아직 이어지지 않은 것만(확정 인물만).
  function candidates(what: PickWhat): { id: string; label: string; sub?: string; ref: NodeRef }[] {
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

  // "넣을 것" 줄에서 길게 눌러 위 행성(이 패널의 행성 — 펼쳐져 패널 위에 있음)으로 끌어 올리기. 다른 행성엔 안 놓임.
  function startRowDrag(e: React.PointerEvent<HTMLButtonElement>, c: { label: string; ref: NodeRef }) {
    if (!e.isPrimary) return;
    const dialog = e.currentTarget.closest("dialog");
    const box = document.querySelector<HTMLElement>(".space-map");
    const planetEl = (k: string) => box?.querySelector<HTMLElement>(`button[data-node-key="${CSS.escape(k)}"]`) ?? null;
    const planet = planetEl(nodeKey);
    if (!dialog || !box || !planet) return; // 목록 보기에서 연 패널 — 누르기만
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
      onDrop: () => linkNow(c.ref),
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
  const nodeName = ev && kind === "ev" ? ev.label : story ? shortTitle(displayTitle(story)) : person?.name ?? place?.name ?? group?.name ?? placeGroup?.name ?? "";

  // ── 단계별 화면 ──
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
        <Button variant="secondary" size="lg" disabled={pending} onClick={() => setMode({ t: "new", what: mode.what })}>
          {E.pickNew}
        </Button>
        {back}
      </>
    );
  }
  if (mode.t === "new") {
    const ck = PICK_CREATE_KIND[mode.what];
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
            <p className="text-lg text-ink">{deleteLinkedText(im)}</p>
            {im.placeGroups > 0 && <p className="text-lg text-ink">{E.deletePlaceGroups(im.placeGroups)}</p>}
            {im.familyActivity > 0 && <p className="text-lg text-ink">{E.deleteFamily(im.familyActivity)}</p>}
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

  // ── 기본(정보 + 고치기) ──
  const canDelete = (kind === "ev" && ev?.type === "CUSTOM") || !!story || !!place || !!group || !!placeGroup;
  return (
    <>
      {notice && notice.key === nodeKey && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-brand bg-banner px-4 py-2">
          <p className="text-lg text-ink">{notice.text}</p>
          {notice.undo && (
            <Button
              variant="secondary"
              size="lg"
              disabled={pending}
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
      {info}
      {(kind === "ev" || kind === "st") && (
        <>
          <Button variant="secondary" size="lg" aria-expanded={showRow} onClick={() => setShowRow((v) => !v)}>
            {showRow ? C.space.addRowHide : C.space.addRowShow}
          </Button>
          {showRow && <AddRow items={[...candidates("person"), ...candidates("group"), ...candidates("place")]} pending={pending} onPress={startRowDrag} onAdd={(ref) => start(async () => void (await linkNow(ref)))} />}
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
      <ErrorLine text={error} />
      {person && (
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <p className="text-lg text-ink-soft">{E.personDeleteNote}</p>
          <ButtonLink href={`/people/${person.id}`} variant="tertiary" size="lg">
            {E.personDeleteLink}
          </ButtonLink>
        </div>
      )}
      {canDelete && (
        <div className="border-t border-line pt-4">
          <Button variant="destructive" size="lg" className="w-full" onClick={openDelete}>
            {E.deleteNode}
          </Button>
        </div>
      )}
    </>
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
