"use client";

// 사용자 카테고리 화면 부품(custom-graph 2단계 — docs/phase/custom-graph.md §3·§6.6). MyLifeView 가 부른다.
//   CategoryRegions — 지도: 카테고리마다 영역(제목 버튼 → 카테고리 패널 · [+ 항목][+ 묶음][+ 넣기] · 묶음 칩·이름표·성운 ·
//                     사용자 항목(진짜 칸 cn:) · 바로가기(ref: — 누르면 원래 노드 패널, Q99) · [N개 더 보기] · 제목 줄로 접힘)
//   customPanelInfo — 패널 정보(카테고리 cat: · 기본 카테고리 bcat: · 묶음 cgl:/cgc: · 항목 cn:). 고치기·넣기·빼기는 EditUI NodeEditor.
//   CategoryListSections — 목록 보기 절 · CategorySheet — 이동 줄 [다른 카테고리] 시트.
// 칸 크기·모양은 인물록 칸과 같다(120×124, 작은 행성 64 — §6.6 P2·P3). 클릭은 지도 한 곳(MyLifeView onWorldClick)이 data-* 로 나눈다.

import { Layers, MapPin, Plus, Users } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { Button, ButtonLink, buttonClasses } from "@/components/ui/Button";
import type { MyLifeData } from "@/lib/my-life";
import { customOf, type MyLifeRef } from "@/lib/my-life-custom";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { categoryEntries, yearText, type LayoutNode, type MyLifeLayout } from "@/lib/my-life-layout";
import { displayTitle, shortTitle } from "@/lib/story-title";

const C = MY_LIFE_COPY;
const X = MY_LIFE_COPY.custom;
const FOCUS = "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2";

// ── 바로가기가 가리키는 노드 ────────────────────────────────────────

export type RefInfo = { name: string; where: string; key: string; eventId: string | null; moon: "person" | "place" | "story" | "period" | "custom"; icon: "person" | "group" | "place" | "placeGroup" | "event" | "story" | "item" | "customGroup" };

export function refInfo(data: MyLifeData, r: MyLifeRef): RefInfo | null {
  const custom = customOf(data);
  const catName = (id: string) => custom.categories.find((c) => c.id === id)?.name ?? "";
  switch (r.type) {
    case "LIFE_EVENT": {
      const ev = data.events.find((e) => e.id === r.id);
      return ev ? { name: `${yearText(ev)} ${ev.label}`, where: X.where.LIFE_EVENT, key: `ev:${ev.id}`, eventId: ev.id, moon: "period", icon: "event" } : null;
    }
    case "EPISODE": {
      for (const ev of data.events) {
        const s = ev.stories.find((x) => x.id === r.id && x.primaryEventId === ev.id);
        if (s) return { name: shortTitle(displayTitle(s)), where: X.where.EPISODE, key: `st:${ev.id}:${s.id}`, eventId: ev.id, moon: "story", icon: "story" };
      }
      return null;
    }
    case "PERSON": {
      const p = data.people.find((x) => x.id === r.id);
      return p ? { name: p.name, where: X.where.PERSON, key: `pe:${p.id}`, eventId: null, moon: "person", icon: "person" } : null;
    }
    case "PLACE": {
      const p = data.places.find((x) => x.id === r.id);
      return p ? { name: p.name, where: X.where.PLACE, key: `pl:${p.id}`, eventId: null, moon: "place", icon: "place" } : null;
    }
    case "PERSON_GROUP": {
      const g = data.groups.find((x) => x.id === r.id);
      return g ? { name: g.name, where: X.where.PERSON_GROUP, key: `gl:${g.id}`, eventId: null, moon: "person", icon: "group" } : null;
    }
    case "PLACE_GROUP": {
      const g = data.placeGroups.find((x) => x.id === r.id);
      return g ? { name: g.name, where: X.where.PLACE_GROUP, key: `pgl:${g.id}`, eventId: null, moon: "place", icon: "placeGroup" } : null;
    }
    case "CUSTOM": {
      const it = custom.items.find((x) => x.id === r.id);
      if (it) return { name: it.name, where: catName(it.categoryId), key: `cn:${it.id}`, eventId: null, moon: "custom", icon: "item" };
      const g = custom.groups.find((x) => x.id === r.id);
      return g ? { name: g.name, where: catName(g.categoryId), key: `cgl:${g.id}`, eventId: null, moon: "custom", icon: "customGroup" } : null;
    }
  }
}

// 지도 키 → 그 노드의 NodeRef(사용자 카테고리·6종). 바로가기·기본 카테고리 키는 null.
export function refOfKey(key: string): MyLifeRef | null {
  const [k, a, b] = key.split(":");
  if (k === "ev") return { type: "LIFE_EVENT", id: a };
  if (k === "st") return { type: "EPISODE", id: b };
  if (k === "pe") return { type: "PERSON", id: a };
  if (k === "pl") return { type: "PLACE", id: a };
  if (k === "gl" || k === "gc") return { type: "PERSON_GROUP", id: a };
  if (k === "pgl" || k === "pgc") return { type: "PLACE_GROUP", id: a };
  if (k === "cat" || k === "cgl" || k === "cgc" || k === "cn") return { type: "CUSTOM", id: a };
  return null;
}

export function customName(key: string, data: MyLifeData): string | null {
  const custom = customOf(data);
  const [k, a] = key.split(":");
  if (k === "cat") return custom.categories.find((c) => c.id === a)?.name ?? "";
  if (k === "cgl" || k === "cgc") return custom.groups.find((g) => g.id === a)?.name ?? "";
  if (k === "cn") return custom.items.find((i) => i.id === a)?.name ?? "";
  if (k === "bcat") return builtinName(data, a === "PLACES" ? "PLACES" : "PEOPLE");
  return null;
}

export function builtinName(data: MyLifeData, b: "PEOPLE" | "PLACES"): string {
  return customOf(data).builtinNames[b] ?? (b === "PEOPLE" ? C.peopleTitle : C.placesTitle);
}

// ── 지도 영역 ─────────────────────────────────────────────────────

const MOON: Record<RefInfo["moon"], string> = {
  person: "moon-person border-person",
  place: "moon-place border-place",
  story: "planet-story border-planet-edge",
  period: "planet-period border-period-edge",
  custom: "moon-custom border-music",
};

function RefIcon({ info }: { info: RefInfo }) {
  if (info.icon === "place" || info.icon === "placeGroup") return <MapPin size={24} />;
  if (info.icon === "group") return <Users size={24} />;
  if (info.icon === "customGroup") return <Layers size={24} />;
  return <>{info.name.slice(0, 1)}</>;
}

export function CategoryRegions({
  data,
  layout,
  selected,
  mark,
  glow,
}: {
  data: MyLifeData;
  layout: MyLifeLayout;
  selected: string | null;
  mark: (key: string) => React.CSSProperties;
  glow: React.CSSProperties;
}) {
  const custom = customOf(data);
  if (custom.categories.length === 0) return null;
  const pos = (n: { x: number; y: number; w: number; h: number }) => ({ left: n.x, top: n.y, width: n.w, height: n.h });
  const itemById = new Map(custom.items.map((i) => [i.id, i]));
  const groupById = new Map(custom.groups.map((g) => [g.id, g]));
  const byCat = new Map<string, LayoutNode[]>();
  for (const n of layout.nodes) {
    if (!("categoryId" in n)) continue;
    const list = byCat.get(n.categoryId) ?? [];
    list.push(n);
    byCat.set(n.categoryId, list);
  }
  return (
    <>
      {custom.categories.map((cat) => {
        const nodes = byCat.get(cat.id) ?? [];
        const titleId = `mylife-cat-${cat.id}`;
        return (
          <section key={cat.id} aria-labelledby={titleId} className="relative" style={{ zIndex: 2 }}>
            {nodes.map((n): ReactNode => {
              switch (n.kind) {
                case "catTitle":
                  return (
                    <div key={n.key} className="absolute flex items-center gap-2" style={pos(n)}>
                      <h2 id={titleId} className="m-0 min-w-0 flex-1">
                        <button
                          type="button"
                          data-node-key={`cat:${cat.id}`}
                          data-node-kind="catTitle"
                          aria-label={X.titleName(cat.name, n.count)}
                          className={`flex min-h-[56px] w-full items-center gap-2 rounded-md px-1 text-left text-[26px] hover:bg-banner ${FOCUS}`}
                          style={mark(`cat:${cat.id}`)}
                        >
                          <span className="truncate">{cat.name}</span>
                          {n.collapsed && <span className="shrink-0 text-lg text-ink-soft">{X.count(n.count)}</span>}
                        </button>
                      </h2>
                      {n.foldable && (
                        <button
                          type="button"
                          data-node-key={`catfold:${cat.id}`}
                          data-node-kind="catFold"
                          data-category-id={cat.id}
                          aria-expanded={!n.collapsed}
                          aria-label={`${cat.name} ${n.collapsed ? X.unfold : X.fold}`}
                          className={buttonClasses("secondary", "lg", "shrink-0 px-3!")}
                        >
                          {n.collapsed ? X.unfold : X.fold}
                        </button>
                      )}
                    </div>
                  );
                case "catAdd":
                  return (
                    <div key={n.key} className="absolute flex gap-2" style={pos(n)}>
                      {(
                        [
                          ["item", X.addItem],
                          ["customGroup", X.addGroup],
                          ["putIn", X.putIn],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          data-node-key={`add:cat:${cat.id}:${k}`}
                          data-node-kind="catAdd"
                          data-create-kind={k}
                          data-category-id={cat.id}
                          aria-label={X.addName(label, cat.name)}
                          className={buttonClasses("secondary", "lg", "flex-1 px-2!")}
                        >
                          <Plus aria-hidden size={20} className="shrink-0" />
                          {label}
                        </button>
                      ))}
                    </div>
                  );
                case "catGroupChip": {
                  const g = groupById.get(n.groupId);
                  return (
                    <button
                      key={n.key}
                      type="button"
                      data-node-key={n.key}
                      data-node-kind="catGroupChip"
                      data-group-id={n.groupId}
                      aria-label={X.groupChipName(g?.name ?? "", n.shown)}
                      className={`absolute flex items-center justify-center gap-1 rounded-[10px] border-2 px-3 text-lg font-semibold ${n.shown ? "border-music bg-music-wash text-ink" : "border-line bg-surface text-ink-soft"} ${FOCUS}`}
                      style={{ ...pos(n), ...mark(n.key) }}
                    >
                      <span className="truncate">{g?.name}</span>
                      {n.shown && <span aria-hidden>{C.groupChipShown}</span>}
                    </button>
                  );
                }
                case "catGroupLabel": {
                  const g = groupById.get(n.groupId);
                  const count = categoryEntries(cat, custom).filter((e) => e.groupIds.includes(n.groupId)).length;
                  return (
                    <button
                      key={n.key}
                      type="button"
                      data-node-key={n.key}
                      data-node-kind="catGroupLabel"
                      aria-label={X.groupLabelName(g?.name ?? "", count)}
                      className={`absolute flex items-center gap-2 rounded-[10px] border-2 border-music bg-surface px-3 text-lg font-semibold text-ink hover:bg-banner ${FOCUS}`}
                      style={{ ...pos(n), ...mark(n.key) }}
                    >
                      <Layers aria-hidden size={20} className="shrink-0 text-music" />
                      <span className="truncate">{g?.name}</span>
                    </button>
                  );
                }
                case "catItem": {
                  const it = itemById.get(n.itemId);
                  if (!it) return null;
                  return (
                    <button
                      key={n.key}
                      type="button"
                      data-node-key={n.key}
                      data-node-kind="catItem"
                      aria-label={X.itemName(it.name, cat.name)}
                      className={`absolute flex flex-col items-center gap-1.5 rounded-md pt-1 text-center ${FOCUS}`}
                      style={{ ...pos(n), ...mark(n.key) }}
                    >
                      <span aria-hidden className="moon-custom relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-music text-[22px] font-bold" style={selected === n.key ? glow : undefined}>
                        {it.name.slice(0, 1)}
                        {n.hiddenGroups > 0 && (
                          <span className="absolute -right-3 -top-2 rounded-full border-2 border-music bg-surface px-1.5 text-lg font-semibold leading-6 text-ink">{C.otherGroups(n.hiddenGroups)}</span>
                        )}
                      </span>
                      <span className="line-clamp-2 w-full text-lg leading-6 text-ink">{it.name}</span>
                    </button>
                  );
                }
                case "catRef": {
                  const info = refInfo(data, n.ref);
                  if (!info) return null;
                  return (
                    <button
                      key={n.key}
                      type="button"
                      data-node-key={n.key}
                      data-node-kind="catRef"
                      data-target-key={info.key}
                      data-event-id={info.eventId ?? undefined}
                      data-category-id={cat.id}
                      aria-label={X.refName(info.name, info.where)}
                      className={`absolute flex flex-col items-center gap-1 rounded-md pt-1 text-center ${FOCUS}`}
                      style={{ ...pos(n), ...mark(n.key) }}
                    >
                      <span aria-hidden className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed text-[22px] font-bold ${MOON[info.moon]}`}>
                        <RefIcon info={info} />
                      </span>
                      <span className="line-clamp-1 w-full text-lg leading-6 text-ink">{info.name}</span>
                      <span className="line-clamp-1 w-full text-lg leading-6 text-ink-soft">{info.where}</span>
                    </button>
                  );
                }
                case "catMore":
                  return (
                    <button
                      key={n.key}
                      type="button"
                      data-node-key={n.key}
                      data-node-kind="catMore"
                      data-category-id={cat.id}
                      aria-expanded={n.open}
                      className={buttonClasses("secondary", "lg", "absolute px-3")}
                      style={pos(n)}
                    >
                      {n.open ? X.less : X.more(n.count)}
                    </button>
                  );
                case "catSub":
                  return (
                    <p key={n.key} className="absolute m-0 flex items-center text-lg font-semibold text-ink-soft" style={pos(n)}>
                      {X.noGroup}
                    </p>
                  );
                case "catEmpty":
                  return (
                    <p key={n.key} className="absolute m-0 flex items-center text-lg text-ink-soft" style={pos(n)}>
                      {X.empty}
                    </p>
                  );
                default:
                  return null;
              }
            })}
            {layout.shapes
              .filter((s) => s.region === "custom" && groupById.get(s.groupId)?.categoryId === cat.id && !categoryEntries(cat, custom).some((e) => e.groupIds.includes(s.groupId)))
              .map((s) => (
                <p key={`empty:${s.groupId}`} aria-hidden className="absolute m-0 flex items-center justify-center text-lg text-ink-soft" style={{ left: s.x, top: s.y, width: s.w, height: s.h }}>
                  {X.groupEmpty}
                </p>
              ))}
          </section>
        );
      })}
    </>
  );
}

// ── 패널 정보 ─────────────────────────────────────────────────────

export function customPanelInfo(nodeKey: string, data: MyLifeData): ReactNode | null {
  const custom = customOf(data);
  const [k, a] = nodeKey.split(":");
  const catName = (id: string) => custom.categories.find((c) => c.id === id)?.name ?? "";
  if (k === "cat") {
    const cat = custom.categories.find((c) => c.id === a);
    if (!cat) return null;
    const entries = categoryEntries(cat, custom);
    const groups = custom.groups.filter((g) => g.categoryId === cat.id).length;
    return (
      <>
        <p className="text-lg text-ink-soft">{X.kindCategory}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {cat.name}
        </h2>
        <p className="text-lg text-ink">
          {X.count(entries.length)}
          {groups > 0 ? ` · ${X.kindGroup} ${groups}` : ""}
        </p>
      </>
    );
  }
  if (k === "bcat") {
    return (
      <>
        <p className="text-lg text-ink-soft">{X.kindCategory}</p>
        <h2 id="mylife-panel-title" className="m-0">
          {builtinName(data, a === "PLACES" ? "PLACES" : "PEOPLE")}
        </h2>
        <p className="text-lg text-ink-soft">{X.builtinNote}</p>
      </>
    );
  }
  if (k === "cgl" || k === "cgc") {
    const g = custom.groups.find((x) => x.id === a);
    if (!g) return null;
    return (
      <>
        <p className="text-lg text-ink-soft">
          {X.kindGroup} · {catName(g.categoryId)}
        </p>
        <h2 id="mylife-panel-title" className="m-0">
          {g.name}
        </h2>
        {g.memberRefs.length === 0 && <p className="text-lg text-ink-soft">{X.groupEmpty}</p>}
      </>
    );
  }
  if (k === "cn") {
    const it = custom.items.find((x) => x.id === a);
    if (!it) return null;
    return (
      <>
        <p className="text-lg text-ink-soft">
          {X.kindItem} · {catName(it.categoryId)}
        </p>
        <h2 id="mylife-panel-title" className="m-0">
          {it.name}
        </h2>
        {it.body && <p className="line-clamp-3 whitespace-pre-line text-lg text-ink">{it.body}</p>}
        <ButtonLink href={`/my-life/item/${it.id}/edit`} variant="secondary" size="lg">
          {it.body ? X.itemEdit : X.itemWrite}
        </ButtonLink>
      </>
    );
  }
  return null;
}

// ── 목록 보기 절(접근성 대체 경로 — §3.1) ─────────────────────────────

const LIST_ROW = `flex min-h-[56px] w-full items-center gap-2 rounded-md border-2 bg-surface px-4 py-3 text-left text-lg text-ink hover:bg-banner ${FOCUS}`;

export function CategoryListSections({ data, openPanel }: { data: MyLifeData; openPanel: (key: string, fromSat?: boolean, fromCategory?: string) => void }) {
  const custom = customOf(data);
  return (
    <>
      {custom.categories.map((cat) => {
        const entries = categoryEntries(cat, custom);
        const groups = custom.groups.filter((g) => g.categoryId === cat.id);
        const row = (e: (typeof entries)[number]) => {
          if (e.itemId) {
            const it = custom.items.find((i) => i.id === e.itemId);
            return it ? (
              <li key={e.key}>
                <button type="button" className={`${LIST_ROW} border-music`} onClick={() => openPanel(`cn:${it.id}`)}>
                  {it.name}
                </button>
              </li>
            ) : null;
          }
          const info = e.ref ? refInfo(data, e.ref) : null;
          return info ? (
            <li key={e.key}>
              <button type="button" className={`${LIST_ROW} border-dashed border-line`} onClick={() => openPanel(info.key, false, cat.id)}>
                {info.name} — {info.where}
              </button>
            </li>
          ) : null;
        };
        const rest = entries.filter((e) => e.groupIds.length === 0);
        return (
          <section key={cat.id} aria-labelledby={`mylife-list-cat-${cat.id}`} className="flex flex-col gap-3">
            <h2 id={`mylife-list-cat-${cat.id}`} className="m-0">
              <button type="button" className={`${LIST_ROW} border-music text-[24px]`} onClick={() => openPanel(`cat:${cat.id}`)}>
                {cat.name}
              </button>
            </h2>
            {groups.map((g) => (
              <div key={g.id} className="flex flex-col gap-2 pl-4">
                <h3 className="m-0">
                  <button type="button" className={`${LIST_ROW} border-music`} onClick={() => openPanel(`cgl:${g.id}`)}>
                    <Layers aria-hidden size={20} className="shrink-0 text-music" />
                    {g.name}
                  </button>
                </h3>
                <ul className="flex flex-col gap-2 pl-4">{entries.filter((e) => e.groupIds.includes(g.id)).map(row)}</ul>
              </div>
            ))}
            {rest.length > 0 && <ul className="flex flex-col gap-2">{rest.map(row)}</ul>}
            {entries.length === 0 && groups.length === 0 && <p className="m-0 text-lg text-ink-soft">{X.empty}</p>}
          </section>
        );
      })}
    </>
  );
}

// ── 이동 줄 [다른 카테고리] 시트(§6.6 P14) ───────────────────────────────

export function CategorySheet({ open, data, onPick, onClose }: { open: boolean; data: MyLifeData; onPick: (categoryId: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const custom = customOf(data);
  return (
    <dialog
      ref={ref}
      aria-labelledby="mylife-cats-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) ref.current.close();
      }}
      className="inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[75dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim"
    >
      {open && (
        <div className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
          <h2 id="mylife-cats-title" className="m-0">
            {X.categoriesTitle}
          </h2>
          <ul className="flex flex-col gap-2">
            {custom.categories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`${LIST_ROW} border-line`}
                  onClick={() => {
                    ref.current?.close();
                    onPick(c.id);
                  }}
                >
                  <span className="min-w-0 truncate">{c.name}</span>
                  <span className="ml-auto shrink-0 text-ink-soft">{X.count(categoryEntries(c, custom).length)}</span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="tertiary" size="lg" onClick={() => ref.current?.close()}>
            {C.close}
          </Button>
        </div>
      )}
    </dialog>
  );
}
