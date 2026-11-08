// AI 지도 편집(custom-graph 3b — docs/phase/custom-graph.md §4.1~§4.6·§6.9). 시킨 말 → 계획 → 확인 카드 → 실행 → 결과 카드 [되돌리기].
//
// 쓰기는 전부 기존 입구만 거친다 — 넣기·잇기 addLink(→ saveNodeLink) · 빼기·끊기 removeLink(→ removeNodeLink) · 만들기 lib/my-life-edit create* ·
// 이름 renameNode·renameBuiltin · 옮기기 moveEpisodeToLifeEvent·moveCustom · 되돌리기 undoLinks·undoRemove·undoMoveEpisode. AI 전용 쓰기 경로 없음.
// 소유·builtin·깊이 규칙은 그 입구들이 사용자 직접 편집과 똑같이 막는다. 화면에서 다시 오는 계획은 믿지 않는다(parsePlan + 입구 재확인).
// 모델은 계획만 만든다 — 쓰기 도구를 불러도 DB 는 안 바뀐다. 실행은 사용자가 카드에서 누를 때(applyMapEdit)만.
// 지우기·합치기(3c — §6.10) = 카드에 영향 수 · 실행 때 다시 셈 · 계획에 혼자만 · 되돌리기 없음. 요청 문장은 저장 안 함(원장 = 토큰·원가, 편집 기록 = 도구·노드 종류·id·시각 — lib/map-edit-log).

import { randomUUID } from "node:crypto";

import { moveEpisodeToLifeEvent, undoMoveEpisode, type MoveUndo } from "./episode-move";
import { buildMapView, mapListText, MAP_QUESTION_MAX, type MapView } from "./map-agent-view";
import { budgetReason, firstMapMessage, mapGate, runMapLoop, runReadTool, stripAlias, type MapFailReason, type MapUsage, type ModelCaller } from "./map-agent";
import { markMapEditUndone, recordMapEdit, type MapEditTool } from "./map-edit-log";
import { CREATE_KINDS, isDestructive, MAP_EDIT_PLAN_MAX, parsePlan, planLine, type BuiltinRegion, type CreateKind, type ExistingNode, type MapPlanItem, type PlanNode } from "./map-edit-plan";
import { mergeCheck, mergeNodes } from "./map-merge";
import { getMyLifeData, type MyLifeData } from "./my-life";
import { MY_LIFE_COPY } from "./my-life-copy";
import {
  addLink,
  createCategoryNode,
  createCustomChild,
  createGroupNode,
  createPeriodNode,
  createPersonNode,
  createPlaceGroupNode,
  createPlaceNode,
  createStoryNode,
  deleteImpact,
  deleteNode,
  moveCustom,
  removeLink,
  renameAny,
  renameBuiltin,
  undoBuiltinName,
  undoCreatedNode,
  undoLinks,
  undoRemove,
  undoRename,
  type CreatedLink,
  type CreatedNode,
  type RemovedLink,
} from "./my-life-edit";
import { normalizeForSearch } from "./my-life-search";
import type { NodeRef } from "./node-graph";
import { MAP_EDIT_SYSTEM_PROMPT, MAP_EDIT_TOOLS } from "./prompts/map-edit";

const A = MY_LIFE_COPY.ask;
const E = MY_LIFE_COPY.edit;
const QUESTION_MAX = 80;

type PlanCtx = {
  text: string;
  view: MapView;
  shown: Set<string>;
  plan: MapPlanItem[];
  created: Map<string, { name: string; kind: string }>;
  mixed: boolean; // 지우기·합치기를 다른 일과 같이 시켰음(§6.10 ③)
  destructiveCalled: boolean; // 지우기·합치기 도구를 불렀음(막혔어도) — 그 뒤 다른 일 = 섞임
  personDelete: string | null; // 사람 지우기를 시켰음(Q87) — 그 사람 이름(안내 문장)
  refused: string | null; // 처음 정한 시기·기본 카테고리 지우기가 막힘 — 안내 문장(모델 답과 관계없이 "못 함")
  groupRedirects: number; // 넣을 곳 묶음 → 카테고리로 돌려보낸 수
  askWhere: string | null; // 두 번째도 묶음이면 코드가 되묻는 문장
};

const same = (a: string, b: string) => normalizeForSearch(a) === normalizeForSearch(b);
const saidOk = (ctx: PlanCtx, said: unknown) => {
  const s = typeof said === "string" ? normalizeForSearch(said) : "";
  return s !== "" && normalizeForSearch(ctx.text).includes(s);
};
const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const SIX_KINDS = new Set(["시기", "이야기", "사람", "장소", "모임", "장소 묶음"]);

// 별칭 + 지금 이름 확인(§4.6 — 줄을 잘못 베낀 id 방어). 남의 노드는 별칭 표에 없다.
function resolve(ctx: PlanCtx, raw: unknown): PlanNode | { error: string } {
  const o = (raw ?? {}) as { alias?: unknown; name?: unknown };
  const alias = typeof o.alias === "string" ? o.alias.trim() : "";
  const name = typeof o.name === "string" ? o.name : "";
  const fresh = ctx.created.get(alias);
  if (fresh) return same(fresh.name, name) ? { newKey: alias, name: fresh.name, kind: fresh.kind } : { error: `이름이 안 맞아요 — ${alias} 는 "${fresh.name}" 이에요.` };
  const node = ctx.shown.has(alias) ? ctx.view.byAlias.get(alias) : undefined;
  const ref = ctx.view.refs.get(alias);
  const screen = ctx.view.screen.get(alias);
  if (!node || !ref || !screen) return { error: "없는 노드예요. find_nodes 로 찾아 주세요." };
  if (!same(node.name, name)) return { error: `이름이 안 맞아요 — ${alias} 는 "${node.name}" 이에요.` };
  return { ref, name: node.name, kind: node.kind, key: screen.key, eventId: screen.eventId };
}
const isErr = (v: PlanNode | { error: string }): v is { error: string } => "error" in v;

function push(ctx: PlanCtx, item: MapPlanItem, extra: Record<string, unknown> = {}) {
  ctx.plan.push(item);
  return { ok: true, 계획: planLine(item, "will"), ...extra };
}

// 담는 쪽·넣는 것 종류 규칙(화면 넣기와 같은 뜻 — 실행 때 saveNodeLink·customPairRole 이 다시 본다).
function containerRule(container: PlanNode, member: PlanNode): string | null {
  const rule: Record<string, (k: string) => boolean> = {
    모임: (k) => k === "사람",
    "장소 묶음": (k) => k === "장소",
    카테고리: (k) => k !== "카테고리",
    묶음: (k) => k !== "카테고리" && k !== "묶음",
  };
  const ok = rule[container.kind];
  if (!ok) return `${container.kind} 에는 넣을 수 없어요. 담는 쪽은 모임·장소 묶음·카테고리·묶음이에요.`;
  if (!ok(member.kind)) return `${container.kind} 에 ${member.kind} 는 넣을 수 없어요.`;
  return null;
}

// 쓰기 도구 하나 → 계획 한 줄 또는 오류(모델에게 돌려줌). DB 쓰기 0.
// 넣을 곳(2026-11-07 성민): 묶음을 골랐는데 요청엔 그 묶음 이름이 없고 위 카테고리 이름만 있으면 — 모델에게 한 번 돌려보낸다(도구 결과 — 사용자에게 안 보임).
// 두 번째도 같으면 계획을 버리고 코드가 되묻는다(물음표 한 문장).
function groupRedirect(ctx: PlanCtx, container: PlanNode, member: PlanNode): { error: string } | null {
  if (container.kind !== "묶음" || !("ref" in container)) return null;
  const row = ctx.view.nodes.find((x) => x.kind === "묶음" && ctx.view.refs.get(x.alias)?.id === container.ref.id);
  const cat = row?.links["자리"]?.[0] ? ctx.view.byAlias.get(row.links["자리"][0]) : undefined;
  const said = (s: string) => normalizeForSearch(ctx.text).includes(normalizeForSearch(s));
  if (!cat || said(container.name) || !said(cat.name)) return null;
  ctx.groupRedirects += 1;
  if (ctx.groupRedirects >= 2) {
    ctx.askWhere = A.plan.askWhere(member.name, cat.name, container.name);
    return { error: "더 담지 말고 answer 를 부르세요." };
  }
  return { error: `사용자가 말한 곳은 ‘${cat.name}’ 카테고리(${cat.alias})예요. 그 안 묶음 ‘${container.name}’이 아니라 ‘${cat.name}’에 넣는 계획으로 다시 부르세요.` };
}

function planTool(ctx: PlanCtx, name: string, input: Record<string, unknown>): unknown {
  if (ctx.plan.some(isDestructive) || ctx.destructiveCalled) {
    ctx.mixed = true;
    return { error: "지우기·합치기는 다른 일과 같이 담을 수 없어요. 더 담지 말고 answer 를 부르세요." };
  }
  if (ctx.plan.length >= MAP_EDIT_PLAN_MAX) return { error: `한 번에 ${MAP_EDIT_PLAN_MAX}개까지예요. 더 담지 말고 answer 를 부르세요.` };
  if (!saidOk(ctx, input.said)) return { error: "said 가 요청에 없어요. 시키지 않은 일은 담지 않아요." };

  if (name === "create_node") {
    const kind = input.kind as CreateKind;
    if (!CREATE_KINDS.includes(kind)) return { error: "만들 수 없는 종류예요." };
    const newName = clean(input.name, 60);
    const body = clean(input.body, 3000);
    if (!newName && kind !== "이야기") return { error: "이름이 없어요." };
    let parent: PlanNode | null = null;
    if (kind === "항목" || kind === "묶음" || kind === "이야기") {
      const p = resolve(ctx, input.parent);
      if (isErr(p)) return p;
      const want = kind === "이야기" ? "시기" : "카테고리";
      if (p.kind !== want) return { error: `${kind} 의 parent 는 ${want}여야 해요.` };
      parent = p;
    }
    if (kind === "이야기" && (!body || !normalizeForSearch(ctx.text).includes(normalizeForSearch(body)))) return { error: "이야기 본문은 요청에 있는 말 그대로만 적어요." };
    let decision: "new" | null = null;
    if (kind === "항목" || kind === "묶음" || kind === "사람") {
      // Q100 — 6종과 같은 이름이면 새로 만들지 않는다. 그래도 새로라는 말이 있었을 때만 isNew. 여기는 지도 목록으로 미리 알려 주는 것이고,
      // 최종 판정은 실행 때 기존 입구(createCustomChild sameNameNodes · createPersonNode findSameNamePeople)가 다시 한다.
      const dup = ctx.view.nodes.filter((n) => (kind === "사람" ? n.kind === "사람" : SIX_KINDS.has(n.kind)) && same(n.name, newName));
      if (dup.length > 0 && input.isNew !== true) {
        const list = dup.map((n) => ({ 별칭: n.alias, 이름: n.name, 종류: n.kind }));
        return { error: `지도에 이름이 같은 것이 이미 있어요. 하나면 그 노드를 쓰고(넣기는 put_in), 여럿이면 question 으로 되물으세요.`, 같은이름: list };
      }
      if (input.isNew === true) decision = "new";
    }
    if (kind === "카테고리" && ctx.view.nodes.some((n) => n.kind === "카테고리" && same(n.name, newName))) return { error: "이름이 같은 카테고리가 이미 있어요." };
    const newKey = `new${ctx.created.size + 1}`;
    ctx.created.set(newKey, { name: newName || body.slice(0, 20), kind });
    return push(
      ctx,
      {
        tool: "create_node",
        newKey,
        kind,
        name: newName,
        relation: kind === "사람" ? clean(input.relation, 30) || null : null,
        year: kind === "시기" && typeof input.year === "number" ? input.year : null,
        endYear: kind === "시기" && typeof input.endYear === "number" ? input.endYear : null,
        parent,
        body: kind === "이야기" ? body : null,
        decision,
      },
      { 새별칭: newKey },
    );
  }

  if (name === "rename_node") {
    const newName = clean(input.newName, 60);
    if (!newName) return { error: "새 이름이 없어요." };
    if (input.region === "인물록" || input.region === "장소록") {
      const region: BuiltinRegion = input.region === "인물록" ? "PEOPLE" : "PLACES";
      const prevLabel = (region === "PEOPLE" ? ctx.view.regionNames.people : ctx.view.regionNames.places) ?? input.region;
      return push(ctx, { tool: "rename_region", region, prevLabel, newName });
    }
    const n = resolve(ctx, input.node);
    if (isErr(n)) return n;
    return push(ctx, { tool: "rename_node", node: n, newName });
  }

  if (name === "link" || name === "unlink") {
    const a = resolve(ctx, input.a);
    if (isErr(a)) return a;
    const b = resolve(ctx, input.b);
    if (isErr(b)) return b;
    return push(ctx, name === "link" ? { tool: "link", a, b } : { tool: "unlink", a, b });
  }

  if (name === "put_in" || name === "take_out") {
    const container = resolve(ctx, input.container);
    if (isErr(container)) return container;
    const member = resolve(ctx, input.member);
    if (isErr(member)) return member;
    const bad = containerRule(container, member);
    if (bad) return { error: bad };
    if (name === "put_in") {
      const redirect = groupRedirect(ctx, container, member);
      if (redirect) return redirect;
    }
    return push(ctx, name === "put_in" ? { tool: "put_in", container, member } : { tool: "take_out", container, member });
  }

  if (name === "move") {
    const n = resolve(ctx, input.node);
    if (isErr(n)) return n;
    const to = resolve(ctx, input.to);
    if (isErr(to)) return to;
    const ok = (n.kind === "이야기" && to.kind === "시기") || ((n.kind === "항목" || n.kind === "묶음") && to.kind === "카테고리");
    if (!ok) return { error: "옮기기는 이야기 → 시기, 항목·묶음 → 카테고리만 돼요." };
    return push(ctx, { tool: "move", node: n, to });
  }

  return { error: `없는 도구예요: ${name}` };
}

// 사람 구별용 이름 — 같은 이름 두 분을 합칠 때 카드에서 가려 보이게(전우 강호·사촌 강호). 다른 종류는 이름 그대로.
function labelOf(ctx: PlanCtx, n: ExistingNode): string {
  const same = ctx.view.nodes.filter((x) => x.kind === n.kind && x.name === n.name);
  const row = ctx.view.nodes.find((x) => ctx.view.refs.get(x.alias)?.id === n.ref.id);
  return same.length > 1 && row?.relation ? `${row.relation} ${n.name}` : n.name;
}

// 섞인 요청 C안(2026-11-08 성민) — A: 지우기·합치기가 담기는 순간 이 알림(도구 결과 — 사용자에게 안 보임) · B: 끝낼 때 answer.otherWork.
// 어느 쪽이든 섞인 요청이면 아무것도 담지 않는다(일부만 실행되는 일 0).
const OTHER_WORK_NOTE = "요청에 다른 일도 있으면 그 일도 도구로 부르세요(같이 담을 수 없으면 코드가 알려 줘요). 없으면 answer 를 부르세요.";

// 지우기·합치기 — 영향 수를 세므로 DB 를 읽는다(쓰기 0). 수를 못 세면 카드를 만들지 않는다(§6.10 ①).
async function planDestructive(userId: string, ctx: PlanCtx, name: "delete_node" | "merge_nodes", input: Record<string, unknown>): Promise<unknown> {
  if (!saidOk(ctx, input.said)) return { error: "said 가 요청에 없어요. 시키지 않은 일은 담지 않아요." };
  ctx.destructiveCalled = true;
  if (ctx.plan.length > 0) {
    ctx.mixed = true;
    return { error: "지우기·합치기는 다른 일과 같이 담을 수 없어요. 더 담지 말고 answer 를 부르세요." };
  }
  if (name === "delete_node") {
    const n = resolve(ctx, input.node);
    if (isErr(n)) return n;
    if ("newKey" in n) return { error: "없는 노드예요. find_nodes 로 찾아 주세요." };
    if (n.ref.type === "PERSON") {
      ctx.personDelete = n.name;
      return { error: "사람은 여기서 지울 수 없어요(코드가 안내를 보여 줘요). 더 담지 말고 answer 를 부르세요." };
    }
    const impact = await deleteImpact(userId, n.ref);
    if (!impact) {
      ctx.refused = n.ref.type === "LIFE_EVENT" ? E.deleteSkeletonNote : A.plan.unsupported;
      return { error: "지울 수 없는 것이에요(처음 정한 시기·기본 카테고리 — 코드가 안내를 보여 줘요). 더 담지 말고 answer 를 부르세요." };
    }
    return push(ctx, { tool: "delete_node", node: n, impact }, { 알림: OTHER_WORK_NOTE });
  }
  const from = resolve(ctx, input.from);
  if (isErr(from)) return from;
  const to = resolve(ctx, input.to);
  if (isErr(to)) return to;
  if ("newKey" in from || "newKey" in to) return { error: "없는 노드예요. find_nodes 로 찾아 주세요." };
  const c = await mergeCheck(userId, from.ref, to.ref);
  if (!c.ok) return { error: c.error };
  return push(ctx, { tool: "merge_nodes", from, to, fromLabel: labelOf(ctx, from), toLabel: labelOf(ctx, to), impact: c.impact }, { 알림: OTHER_WORK_NOTE });
}

export type MapEditPlanResult =
  | { ok: true; plan: MapPlanItem[]; question: string | null; unsupported: boolean; note: string | null; usage: MapUsage }
  | { ok: false; reason: MapFailReason };

// ownBudget = 재생 스크립트(db/replay-map-edit — 시작 때 따로 한도) — 예산 확인 건너뜀(lib/map-agent mapGate).
export async function planMapEdit(userId: string, textRaw: string, opts: { callModel?: ModelCaller; data?: MyLifeData; dailyLimit?: number; ownBudget?: boolean } = {}): Promise<MapEditPlanResult> {
  const text = textRaw.replace(/\s+/g, " ").trim().slice(0, MAP_QUESTION_MAX);
  if (!text) return { ok: false, reason: "empty" };
  const gate = await mapGate(userId, opts.dailyLimit, opts.ownBudget);
  if (gate) return { ok: false, reason: gate };

  const view = buildMapView(opts.data ?? (await getMyLifeData(userId)));
  const list = mapListText(view);
  const ctx: PlanCtx = { text, view, shown: new Set(list.shown), plan: [], created: new Map(), mixed: false, destructiveCalled: false, personDelete: null, refused: null, groupRedirects: 0, askWhere: null };
  const loop = await runMapLoop({
    userId,
    purpose: "MAP_EDIT",
    system: MAP_EDIT_SYSTEM_PROMPT,
    tools: MAP_EDIT_TOOLS,
    finishTool: "answer",
    messages: [firstMapMessage(list.text, "요청", text)],
    callModel: opts.callModel,
    ownBudget: opts.ownBudget,
    onTool: async (u) => {
      const input = (u.input && typeof u.input === "object" ? u.input : {}) as Record<string, unknown>;
      if (u.name === "find_nodes" || u.name === "read_node") return runReadTool(view, ctx.shown, u.name, input);
      if (u.name === "delete_node" || u.name === "merge_nodes") return planDestructive(userId, ctx, u.name, input);
      return planTool(ctx, u.name, input);
    },
  });
  if (loop.overBudget) return { ok: false, reason: budgetReason(loop.overBudget) };
  if (loop.failed || loop.raw === null) return { ok: false, reason: "failed" };

  const finish = loop.raw as { question?: unknown; unsupported?: unknown; otherWork?: unknown };
  if (ctx.destructiveCalled && finish.otherWork === true) ctx.mixed = true; // C안 B — 모델이 다른 일도 있었다고 하면 섞인 요청
  const q = typeof finish.question === "string" ? stripAlias(finish.question).text.replace(/\s+/g, " ").trim() : "";
  // 되묻기 문장에 내부 용어가 들어가면 그 문장 대신 일반 안내(고침안 3 — 계획은 여전히 안 보임).
  const question = q && /\?$/.test(q) && q.length <= QUESTION_MAX ? (/노드|별칭/.test(q) ? A.plan.empty : q) : null;
  // 지우기·합치기를 다른 일과 같이 시켰으면 아무것도 담지 않는다 — 한쪽만 조용히 하지 않게(§6.10 ③).
  if (ctx.mixed) return { ok: true, plan: [], question: A.plan.oneAtATime, unsupported: false, note: null, usage: loop.usage };
  // 넣을 곳을 두 번 묶음으로 골랐으면 계획을 버리고 코드가 되묻는다.
  if (ctx.askWhere) return { ok: true, plan: [], question: ctx.askWhere, unsupported: false, note: null, usage: loop.usage };
  // 사람·처음 정한 시기 지우기 — 안내는 코드가 고른다(모델이 무엇이라고 답했든 — 고침안 1).
  const note = ctx.personDelete ? A.plan.personDelete(ctx.personDelete) : ctx.refused;
  if (note) return { ok: true, plan: [], question: null, unsupported: true, note, usage: loop.usage };
  // 되묻는 답이면 담긴 계획은 안 보여 준다(어느 것인지 모르는 채 실행하지 않게).
  return { ok: true, plan: question ? [] : ctx.plan, question, unsupported: finish.unsupported === true, note: null, usage: loop.usage };
}

// ── 실행 — 사용자가 확인 카드에서 누른 뒤 ─────────────────────────

export type UndoStep =
  | { t: "node"; node: CreatedNode }
  | { t: "links"; links: CreatedLink[] }
  | { t: "removed"; links: RemovedLink[] }
  | { t: "moveStory"; undo: MoveUndo }
  | { t: "moveCustom"; nodeId: string; categoryId: string }
  | { t: "rename"; node: NodeRef; prev: string | null }
  | { t: "region"; region: BuiltinRegion; prev: string | null };

export type MapEditDone = { line: string; key: string | null; eventId: string | null };
export type MapEditApplyResult =
  | { ok: true; commandId: string; done: MapEditDone[]; failed: { line: string; error: string } | null; undo: UndoStep[] }
  | { ok: false; error: string };

type Made = { ref: NodeRef; key: string; eventId: string | null };
type StepOk = { ok: true; tool: MapEditTool; node: NodeRef | null; key: string | null; eventId: string | null; undo: UndoStep | null; line?: string };
type StepResult = StepOk | { ok: false; error: string };

function refOf(n: PlanNode, made: Map<string, Made>): Made | null {
  if ("newKey" in n) return made.get(n.newKey) ?? null;
  return { ref: n.ref, key: n.key, eventId: n.eventId };
}

async function createStep(userId: string, item: Extract<MapPlanItem, { tool: "create_node" }>, made: Map<string, Made>): Promise<StepResult> {
  const parent = item.parent ? refOf(item.parent, made) : null;
  if (item.parent && !parent) return { ok: false, error: E.notFound };
  const done = (ref: NodeRef, key: string, eventId: string | null, node: CreatedNode | null): StepResult => {
    made.set(item.newKey, { ref, key, eventId });
    // 이미 있던 것을 다시 쓴 경우(같은 이름·주소 장소) — 바뀐 것 없음, 기록·되돌리기 없음.
    return { ok: true, tool: "create_node", node: node ? ref : null, key, eventId, undo: node ? { t: "node", node } : null, ...(node ? {} : { line: A.plan.already }) };
  };
  switch (item.kind) {
    case "시기": {
      const r = await createPeriodNode(userId, { label: item.name, year: item.year, endYear: item.endYear });
      return r.ok ? done({ type: "LIFE_EVENT", id: r.eventId }, `ev:${r.eventId}`, r.eventId, { kind: "period", id: r.eventId }) : r;
    }
    case "이야기": {
      const r = await createStoryNode(userId, { lifeEventId: parent!.ref.id, kind: "STORY", title: item.name, content: item.body ?? "" });
      return r.ok ? done({ type: "EPISODE", id: r.episodeId }, `st:${r.eventId}:${r.episodeId}`, r.eventId, { kind: "story", id: r.episodeId }) : r;
    }
    case "사람": {
      const r = await createPersonNode(userId, { name: item.name, relation: item.relation, decision: item.decision === "new" ? "different" : undefined });
      if (!r.ok) return "ask" in r ? { ok: false, error: A.plan.askSame } : r;
      return done({ type: "PERSON", id: r.personId }, `pe:${r.personId}`, null, r.reused ? null : { kind: "person", id: r.personId });
    }
    case "장소": {
      const r = await createPlaceNode(userId, { name: item.name });
      return r.ok ? done({ type: "PLACE", id: r.placeId }, `pl:${r.placeId}`, null, r.reused ? null : { kind: "place", id: r.placeId }) : r;
    }
    case "모임": {
      const r = await createGroupNode(userId, { name: item.name });
      return r.ok ? done({ type: "PERSON_GROUP", id: r.groupId }, `gl:${r.groupId}`, null, { kind: "group", id: r.groupId }) : r;
    }
    case "장소 묶음": {
      const r = await createPlaceGroupNode(userId, { name: item.name });
      return r.ok ? done({ type: "PLACE_GROUP", id: r.groupId }, `pgl:${r.groupId}`, null, { kind: "placeGroup", id: r.groupId }) : r;
    }
    case "카테고리": {
      const r = await createCategoryNode(userId, item.name);
      return r.ok ? done({ type: "CUSTOM", id: r.id }, `cat:${r.id}`, null, { kind: "custom", id: r.id }) : r;
    }
    case "항목":
    case "묶음": {
      const r = await createCustomChild(userId, { kind: item.kind === "항목" ? "ITEM" : "GROUP", name: item.name, categoryId: parent?.ref.id, decision: item.decision ?? undefined });
      if (!r.ok) return "askSame" in r ? { ok: false, error: A.plan.askSame } : r;
      return done({ type: "CUSTOM", id: r.id }, `${item.kind === "항목" ? "cn" : "cgl"}:${r.id}`, null, { kind: "custom", id: r.id });
    }
  }
}

// 지우기·합치기 — 되돌리기 없음(§6.10 ④). 카드에 보인 수와 지금 수가 다르면 안 한다(②).
async function deleteStep(userId: string, item: Extract<MapPlanItem, { tool: "delete_node" }>): Promise<StepResult> {
  const ref = item.node.ref;
  if (ref.type === "PERSON") return { ok: false, error: A.plan.personDelete(item.node.name) }; // Q87 — 고쳐 보낸 계획도
  const now = await deleteImpact(userId, ref);
  if (!now) return { ok: false, error: E.notFound };
  if (JSON.stringify(now) !== JSON.stringify(item.impact)) return { ok: false, error: A.plan.staleImpact };
  const r = await deleteNode(userId, ref);
  if (!r.ok) return r;
  return { ok: true, tool: "delete_node", node: ref, key: null, eventId: null, undo: null };
}

async function mergeStep(userId: string, item: Extract<MapPlanItem, { tool: "merge_nodes" }>): Promise<StepResult> {
  const r = await mergeNodes(userId, item.from.ref, item.to.ref, item.impact);
  if (!r.ok) return r;
  return { ok: true, tool: "merge_nodes", node: item.from.ref, key: item.to.key, eventId: item.to.eventId, undo: null };
}

async function applyStep(userId: string, item: MapPlanItem, made: Map<string, Made>): Promise<StepResult> {
  if (item.tool === "delete_node") return deleteStep(userId, item);
  if (item.tool === "merge_nodes") return mergeStep(userId, item);
  if (item.tool === "create_node") return createStep(userId, item, made);
  if (item.tool === "rename_region") {
    const r = await renameBuiltin(userId, item.region, item.newName);
    if (!r.ok) return r;
    return { ok: true, tool: "rename_node", node: { type: "CUSTOM", id: `builtin:${item.region}` }, key: null, eventId: null, undo: { t: "region", region: item.region, prev: r.prev } };
  }
  if (item.tool === "rename_node") {
    const n = refOf(item.node, made);
    if (!n) return { ok: false, error: E.notFound };
    const r = await renameAny(userId, n.ref, item.newName);
    if (!r.ok) return r;
    return { ok: true, tool: "rename_node", node: n.ref, key: n.key, eventId: n.eventId, undo: { t: "rename", node: n.ref, prev: r.prev } };
  }
  if (item.tool === "link" || item.tool === "put_in") {
    const a = refOf(item.tool === "link" ? item.a : item.container, made);
    const b = refOf(item.tool === "link" ? item.b : item.member, made);
    if (!a || !b) return { ok: false, error: E.notFound };
    const r = await addLink(userId, a.ref, b.ref, { source: "AI" });
    if (!r.ok) return r;
    const shown = item.tool === "put_in" ? b : a;
    // 이미 이어져 있었으면 바뀐 것 없음 — 한 일로 말하지 않고 기록도 안 남긴다.
    if (r.created.length === 0) return { ok: true, tool: item.tool, node: null, key: shown.key, eventId: shown.eventId, undo: null, line: A.plan.already };
    return { ok: true, tool: item.tool, node: shown.ref, key: shown.key, eventId: shown.eventId, undo: { t: "links", links: r.created } };
  }
  if (item.tool === "unlink" || item.tool === "take_out") {
    const a = refOf(item.tool === "unlink" ? item.a : item.member, made);
    const b = refOf(item.tool === "unlink" ? item.b : item.container, made);
    if (!a || !b) return { ok: false, error: E.notFound };
    const r = await removeLink(userId, a.ref, b.ref);
    if (!r.ok) return r;
    if (r.removed === 0 || !r.undo) return { ok: false, error: A.plan.notLinked };
    return { ok: true, tool: item.tool, node: a.ref, key: a.key, eventId: a.eventId, undo: { t: "removed", links: r.undo } };
  }
  // move
  const n = refOf(item.node, made);
  const to = refOf(item.to, made);
  if (!n || !to) return { ok: false, error: E.notFound };
  if (n.ref.type === "EPISODE" && to.ref.type === "LIFE_EVENT") {
    const r = await moveEpisodeToLifeEvent(userId, n.ref.id, to.ref.id);
    if (!r.ok) return { ok: false, error: E.notFound };
    return { ok: true, tool: "move", node: n.ref, key: `st:${r.toEventId}:${n.ref.id}`, eventId: r.toEventId, undo: r.undo ? { t: "moveStory", undo: r.undo } : null };
  }
  if (n.ref.type === "CUSTOM" && to.ref.type === "CUSTOM") {
    const r = await moveCustom(userId, n.ref.id, to.ref.id);
    if (!r.ok) return r;
    return { ok: true, tool: "move", node: n.ref, key: n.key, eventId: null, undo: r.undo ? { t: "moveCustom", nodeId: r.undo.nodeId, categoryId: r.undo.categoryId } : null };
  }
  return { ok: false, error: A.plan.cannotMove };
}

// 차례대로 실행 — 앞에서 실패하면 멈춘다(뒤 일이 앞 일에 기대는 경우가 있어서 — 넣기는 만들기 뒤). 성공한 것은 남고 되돌릴 수 있다(§4.2).
export async function applyMapEdit(userId: string, rawPlan: unknown): Promise<MapEditApplyResult> {
  const plan = parsePlan(rawPlan);
  if (!plan) return { ok: false, error: E.failed };
  const commandId = randomUUID();
  const made = new Map<string, Made>();
  const done: MapEditDone[] = [];
  const undo: UndoStep[] = [];
  for (const item of plan) {
    const r = await applyStep(userId, item, made);
    if (!r.ok) return { ok: true, commandId, done, failed: { line: planLine(item, "will"), error: r.error }, undo };
    if (r.node) await recordMapEdit(userId, { commandId, tool: r.tool, node: r.node }); // Q92 — 도구 실행 1번 = 1행(바뀐 것이 있을 때)
    if (r.undo) undo.push(r.undo);
    done.push({ line: r.line ?? planLine(item, "did"), key: r.key, eventId: r.eventId });
  }
  return { ok: true, commandId, done, failed: null, undo };
}

// [되돌리기] — 한 일을 역순으로. 값은 화면에서 다시 오므로 기존 되돌리기 함수들이 소유·형식을 다시 본다.
export async function undoMapEdit(userId: string, commandId: unknown, steps: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof commandId !== "string" || !commandId || !Array.isArray(steps) || steps.length === 0 || steps.length > MAP_EDIT_PLAN_MAX) return { ok: false, error: E.cannotUndo };
  for (const raw of [...steps].reverse() as UndoStep[]) {
    const r = await undoStep(userId, raw);
    if (!r.ok) return r;
  }
  await markMapEditUndone(userId, commandId);
  return { ok: true };
}

async function undoStep(userId: string, s: UndoStep): Promise<{ ok: true } | { ok: false; error: string }> {
  switch (s?.t) {
    case "node":
      return undoCreatedNode(userId, s.node);
    case "links":
      return undoLinks(userId, s.links);
    case "removed": {
      const r = await undoRemove(userId, s.links);
      return r.ok ? { ok: true } : r;
    }
    case "moveStory": {
      const r = await undoMoveEpisode(userId, s.undo);
      return r.ok ? { ok: true } : { ok: false, error: E.cannotUndo };
    }
    case "moveCustom": {
      const r = await moveCustom(userId, s.nodeId, s.categoryId);
      return r.ok ? { ok: true } : r;
    }
    case "rename":
      return undoRename(userId, s.node, s.prev);
    case "region":
      return undoBuiltinName(userId, s.region, s.prev);
    default:
      return { ok: false, error: E.cannotUndo };
  }
}
