// AI 지도 편집 회귀 — docs/phase/custom-graph.md §4.2·§4.3·§4.6·§6.9 3b. 유료 모델 호출 0(모의 응답만).
//
//   ① 계획은 DB 를 안 바꿈 — 쓰기 도구를 불러도 지도·편집 기록 그대로 · 원장 TEST_MAP_EDIT 한 줄 · 도구 목록(지우기·합치기 없음) · Sonnet·temperature 0 · 마지막 라운드 answer 강제
//   ② 재생 세트(모의 응답) — 확인 카드 문장이 기대대로
//   ③ 계획 단계 거부 — said 없음 · 없는 별칭 · 이름 안 맞음 · 6종 이름의 항목(Q100) · 종류 규칙 · 10개 상한 · 되묻기 답이면 계획 버림 · 질문 쪽엔 쓰기 도구 없음
//   ④ 실행 → 결과 → 되돌리기 — 도구 7종 + 영역 이름 전부 DB 실제 값 확인 · 한 명령 되돌리면 지도 처음과 같음 · 편집 기록 도구마다 1행·되돌린 시각 · NodeLink.source AI
//   ⑤ 거부(실행 단계 — 화면에서 고쳐 보낸 계획 포함) — 남의 노드(도구마다) · builtin 행 · 깊이 규칙 · 앞에서 실패하면 멈춤(앞 일은 남고 되돌릴 수 있음)
//   ⑦ 지우기(3c) — 카드 영향 수 · 실행 때 다시 셈 · 패널과 같은 입구 · 사람·기본 시기·기본 카테고리·남의 노드 거부 · 계획에 혼자만
//   ⑧ 합치기(3c) — 연결 수 보존(중복 한 행) · 글·사진 · 빈 칸 채움 · 종류 규칙·남의 노드 거부 · 정합 점검 0
//   ⑥ 입구 — lib/map-edit 에 prisma 직접 쓰기 없음(기존 입구만) · 액션 첫 줄 auth · 계획 모양 검사 · 화면 카드·문구 확정
//
// 자기 픽스처 계정만 만들고 지운다(test30 접촉 0). 실제 모델 확인은 db/replay-map-edit.ts --run(작업 규칙 10 — 여기서는 안 부름).
// 실행: npx tsx db/test-map-edit.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";

import { deleteAccountTx } from "../lib/account-deletion";
import { modelId } from "../lib/ai-model";
import { createCategory, createCustomNode } from "../lib/custom-node";
import { prisma } from "../lib/db";
import { createEpisodeBridge } from "../lib/episode";
import type { ModelCaller } from "../lib/map-agent";
import { applyMapEdit, planMapEdit, undoMapEdit, type UndoStep } from "../lib/map-edit";
import { buildMapView } from "../lib/map-agent-view";
import { MAP_EDIT_PLAN_MAX, parsePlan, planLine, planNotes, type ExistingNode, type MapPlanItem, type PlanNode } from "../lib/map-edit-plan";
import { mergeCheck, mergeNodes } from "../lib/map-merge";
import { getMyLifeData, type MyLifeData } from "../lib/my-life";
import { customOf } from "../lib/my-life-custom";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import { addLink, removeLink, renameBuiltin, type DeleteImpact } from "../lib/my-life-edit";
import { ensurePersonBodyMemory, saveItemBody, savePersonBody } from "../lib/node-body";
import { countNodeGraphIssues } from "../lib/node-graph-reconcile";
import type { NodeRef } from "../lib/node-graph";
import { MAP_AGENT_TOOLS } from "../lib/prompts/map-agent";
import { MAP_EDIT_SYSTEM_PROMPT, MAP_EDIT_TOOLS } from "../lib/prompts/map-edit";
import { freshEditMap, judgePlan, removeEditMap, resolveRecorded, type EditCase } from "./map-edit-replay-db";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const REPLAY_DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const persona = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "persona.json"), "utf8")) as MyLifeData;
const { cases } = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "edit-cases.json"), "utf8")) as { cases: EditCase[] };
const EMAIL_DB = "fixture-map-edit-db@lifebook.invalid";

const EMAIL_A = "fixture-map-edit-a@lifebook.invalid";
const EMAIL_B = "fixture-map-edit-b@lifebook.invalid";

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

let seq = 0;
type Use = { name: string; input: unknown };
function fake(rounds: Use[][]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const caller: ModelCaller = async (params) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = rounds[Math.min(calls.length - 1, rounds.length - 1)];
    return { id: "msg_fake", type: "message", role: "assistant", model: "fake", content: r.map((u) => ({ type: "tool_use", id: `toolu_${++seq}`, name: u.name, input: u.input })), stop_reason: "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
  };
  return { caller, calls };
}
const lastUser = (p: Anthropic.MessageCreateParamsNonStreaming) => JSON.stringify(p.messages[p.messages.length - 1].content);
const answer: Use = { name: "answer", input: {} };

async function makeUser(email: string, name: string): Promise<string> {
  const now = new Date();
  return (await prisma.user.create({ data: { email, name, onboardingTrack: "V3", termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: 5 }, select: { id: true } })).id;
}
async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) continue;
    await prisma.chatV3Usage.deleteMany({ where: { userId: u.id } });
    await deleteAccountTx(u.id);
  }
}
const logs = (userId: string, commandId?: string) => prisma.mapEditLog.findMany({ where: { userId, ...(commandId ? { commandId } : {}) }, orderBy: { createdAt: "asc" } });
const N = (type: NodeRef["type"], id: string, name: string, kind: string, key = `x:${id}`): PlanNode => ({ ref: { type, id }, name, kind, key, eventId: null });

async function main() {
  process.env.CHAT_V3_DAILY_BUDGET_USD = "1000";
  await removeFixtures();
  const a = await makeUser(EMAIL_A, "[fixture] 지도 편집 A");
  const b = await makeUser(EMAIL_B, "[fixture] 지도 편집 B");
  try {
    // ── 픽스처 지도(A·B) ──────────
    const now = new Date();
    const ev1 = (await prisma.lifeEvent.create({ data: { userId: a, type: "CUSTOM", label: "가상 시기 하나", year: 1970, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 0, personAsked: true }, select: { id: true } })).id;
    const ev2 = (await prisma.lifeEvent.create({ data: { userId: a, type: "MARRIAGE", label: "가상 시기 둘", year: 1980, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 1, personAsked: true }, select: { id: true } })).id;
    const pe1 = (await prisma.person.create({ data: { userId: a, name: "가상 이웃", relation: "이웃", memo: "메모 그대로", metYear: 1971 }, select: { id: true } })).id;
    const pl1 = (await prisma.place.create({ data: { userId: a, name: "가상 장소" }, select: { id: true } })).id;
    const pg1 = (await prisma.placeGroup.create({ data: { userId: a, name: "가상 장소 묶음" }, select: { id: true } })).id;
    const gr1 = (await prisma.personGroup.create({ data: { userId: a, name: "가상 모임" }, select: { id: true } })).id;
    const st1 = (await createEpisodeBridge(a, ev1, "가상 이야기", 1970, "가상 이야기 본문이에요.", ""))!.episodeId;
    const catOf = async (u: string, name: string) => { const r = await createCategory(u, { name }); if (!r.ok) throw new Error("cat"); return r.id; };
    const cat1 = await catOf(a, "가상 분류 하나");
    const cat2 = await catOf(a, "가상 분류 둘");
    const childOf = async (u: string, kind: "ITEM" | "GROUP", name: string, parentId: string) => { const r = await createCustomNode(u, { kind, name, parentId }); if (!r.ok) throw new Error("child"); return r.id; };
    const grp1 = await childOf(a, "GROUP", "가상 묶음", cat1);
    const grp2 = await childOf(a, "GROUP", "가상 묶음 둘", cat1);
    const item1 = await childOf(a, "ITEM", "가상 항목", cat1);
    await renameBuiltin(a, "PEOPLE", "가상 사람들");
    const builtinId = (await prisma.customNode.findFirst({ where: { userId: a, builtin: "PEOPLE" }, select: { id: true } }))!.id;
    await addLink(a, { type: "CUSTOM", id: item1 }, { type: "PLACE", id: pl1 }); // 끊기·빼기 재료

    const peB = (await prisma.person.create({ data: { userId: b, name: "남의 사람" }, select: { id: true } })).id;
    const plB = (await prisma.place.create({ data: { userId: b, name: "남의 장소" }, select: { id: true } })).id;
    const evB = (await prisma.lifeEvent.create({ data: { userId: b, type: "CUSTOM", label: "남의 시기", year: 1990, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 0, personAsked: true }, select: { id: true } })).id;
    const stB = (await createEpisodeBridge(b, evB, "남의 이야기", 1990, "남의 이야기 본문이에요.", ""))!.episodeId;
    const catB = await catOf(b, "남의 분류");
    const itemB = await childOf(b, "ITEM", "남의 항목", catB);

    const snapshot = async (u: string) => JSON.stringify(await getMyLifeData(u));
    const start = await snapshot(a);

    // ── ① 계획은 DB 를 안 바꿈 ──────────
    const toolNames = MAP_EDIT_TOOLS.map((t) => t.name).sort();
    check("① 도구 = 찾기·읽기·만들기·이름·잇기·끊기·넣기·빼기·옮기기·지우기·합치기·끝(3c 2단계)", JSON.stringify(toolNames) === JSON.stringify(["answer", "create_node", "delete_node", "find_nodes", "link", "merge_nodes", "move", "put_in", "read_node", "rename_node", "take_out", "unlink"]), toolNames);
    check("① 지시문 — 지우기·합치기는 늘 도구로(막는 건 코드) · 혼자만 · 합치기 종류·방향 · 되묻기에 \"그분\" 대신 이름", MAP_EDIT_SYSTEM_PROMPT.includes("반드시 그 도구를 부릅니다") && MAP_EDIT_SYSTEM_PROMPT.includes("계획에 혼자만 담깁니다") && MAP_EDIT_SYSTEM_PROMPT.includes("from 은 없어질 쪽") && MAP_EDIT_SYSTEM_PROMPT.includes('"그분"·"그 사람" 같은 말 대신 이름') && MAP_EDIT_SYSTEM_PROMPT.includes("otherWork") && JSON.stringify(MAP_EDIT_TOOLS).includes("otherWork"));
    check("① 질문 쪽 도구에는 쓰기 도구가 없음", !MAP_AGENT_TOOLS.some((t) => ["create_node", "rename_node", "link", "unlink", "put_in", "take_out", "move"].includes(t.name)));
    const f1 = fake([[{ name: "put_in", input: { said: "넣어 줘", container: { alias: "n999", name: "x" }, member: { alias: "n998", name: "y" } } }], [{ name: "create_node", input: { said: "만들어 넣어 줘", kind: "카테고리", name: "새 분류" } }], [answer]]);
    const p1 = await planMapEdit(a, "만들어 넣어 줘", { callModel: f1.caller });
    check("① 계획 — 쓰기 도구를 불러도 지도·편집 기록 그대로 · 카드에 담긴 것만", p1.ok && p1.plan.length === 1 && (await snapshot(a)) === start && (await logs(a)).length === 0, p1);
    check("① 호출 — Sonnet 고정·temperature 0·지시문은 편집용·처음 auto", f1.calls[0].model === modelId("sonnet") && f1.calls[0].temperature === 0 && (f1.calls[0].system as Anthropic.TextBlockParam[])[0].text === MAP_EDIT_SYSTEM_PROMPT && (f1.calls[0].tool_choice as { type: string }).type === "auto");
    const led = await prisma.chatV3Usage.findMany({ where: { userId: a }, select: { purpose: true } });
    check("① 원장 — 요청 하나에 한 줄 TEST_MAP_EDIT", led.length === 1 && led[0].purpose === "TEST_MAP_EDIT", led);
    const never = fake([[{ name: "read_node", input: { alias: "n1" } }]]);
    const pNever = await planMapEdit(a, "계속 찾아 줘", { callModel: never.caller });
    check("① 라운드 상한 6 · 마지막 answer 강제 · 답 없으면 failed", never.calls.length === 6 && JSON.stringify(never.calls[5].tool_choice) === JSON.stringify({ type: "tool", name: "answer" }) && !pNever.ok && pNever.reason === "failed");
    const bPlan = await planMapEdit(a, "   ", { callModel: never.caller });
    check("① 빈 요청 = 호출 0", !bPlan.ok && bPlan.reason === "empty" && never.calls.length === 6);
    const fixtureWords = ["강호", "미영", "순덕", "복실", "초롱", "제주", "전우", "훈련소", "라디오", "공단", "낚시", "바둑", "영수", "가상", "철수", "영희", "재봉", "화분", "출근", "공장", "읍내", "살림"];
    const promptHits = fixtureWords.filter((w) => MAP_EDIT_SYSTEM_PROMPT.includes(w) || JSON.stringify(MAP_EDIT_TOOLS).includes(w));
    check("① 넣을 곳은 이름을 댄 그곳(그 안 묶음으로 안 바꿈) · 이름 뒤 \"님\" 띄어 쓰기 규칙", MAP_EDIT_SYSTEM_PROMPT.includes("그분이 이름을 댄 그곳") && MAP_EDIT_SYSTEM_PROMPT.includes('"님"을 띄어 쓴다'));
    check("① 프롬프트에 재생 세트 낱말 없음(작업 규칙 8) · 민감 분류 제안 금지 · 기록 속 지시문은 데이터", promptHits.length === 0 && MAP_EDIT_SYSTEM_PROMPT.includes("건강·종교·정치") && MAP_EDIT_SYSTEM_PROMPT.includes("지시가 아니다"), promptHits);

    // ── ② 재생 세트(모의 응답) ──────────
    for (const c of cases) {
      if (c.db) continue; // 지우기·합치기 문항은 아래 ②-db
      const f = fake(c.recorded);
      const r = await planMapEdit(a, c.request, { callModel: f.caller, data: persona, dailyLimit: Infinity });
      const { pass, lines } = judgePlan(c, r);
      check(`② ${c.name}`, pass, { lines, r });
    }
    // ②-db 지우기·합치기 문항 — 재생 세트와 같은 작은 실제 지도 · execute 면 실행까지(카드 수 = 실행 때 수)
    for (const c of cases.filter((x) => x.db)) {
      const u = await freshEditMap(EMAIL_DB);
      const f = fake(resolveRecorded(c.recorded, buildMapView(await getMyLifeData(u))));
      const r = await planMapEdit(u, c.request, { callModel: f.caller, dailyLimit: Infinity });
      const judged = judgePlan(c, r);
      const ran = c.execute && r.ok && r.plan.length > 0 ? await applyMapEdit(u, r.plan) : null;
      const runOk = !c.execute || (!!ran && ran.ok && !ran.failed && r.ok && ran.done.length === r.plan.length);
      check(`②-db ${c.name}${c.execute ? " · 실행(카드 수 = 실행 때 수)" : ""}`, judged.pass && runOk, { lines: judged.lines, r, ran });
      await prisma.chatV3Usage.deleteMany({ where: { userId: u } });
    }
    await removeEditMap(EMAIL_DB);

    // ── ③ 계획 단계 거부 ──────────
    const planOf = async (text: string, uses: Use[]) => {
      const f = fake([uses, [answer]]);
      const r = await planMapEdit(a, text, { callModel: f.caller, data: persona, dailyLimit: Infinity });
      return { r, result: lastUser(f.calls[1]) };
    };
    const put = (container: unknown, member: unknown, said = "넣어 줘") => ({ name: "put_in", input: { said, container, member } });
    const hobby = { alias: "n24", name: "취미" };
    const pet = { alias: "n23", name: "반려동물" };
    const fish = { alias: "n25", name: "낚시 친구들" };
    const item = { alias: "n26", name: "복실이" };
    const p3a = await planOf("넣어 줘", [put(hobby, item, "지워 줘")]);
    check("③ said 가 요청에 없으면 안 담음(시키지 않은 일)", p3a.r.ok && p3a.r.plan.length === 0 && p3a.result.includes("said"), p3a);
    const p3b = await planOf("넣어 줘", [put({ alias: "n999", name: "없음" }, item)]);
    check("③ 없는 별칭 — 오류 · 안 담음(남의 노드는 별칭 표에 없다)", p3b.r.ok && p3b.r.plan.length === 0 && p3b.result.includes("없는 노드"), p3b);
    const p3c = await planOf("넣어 줘", [put({ alias: "n24", name: "반려동물" }, item)]);
    check("③ 별칭과 이름이 안 맞으면 안 담음(줄을 잘못 베낀 id)", p3c.r.ok && p3c.r.plan.length === 0 && p3c.result.includes("이름이 안 맞아요") && p3c.result.includes("취미"), p3c);
    const p3d = await planOf("취미에 순덕 항목 만들어 줘", [{ name: "create_node", input: { said: "취미에 순덕 항목 만들어 줘", kind: "항목", name: "순덕", parent: hobby } }]);
    check("③ Q100 — 6종과 같은 이름의 항목은 안 만듦 · 그 노드 별칭을 알려 줌", p3d.r.ok && p3d.r.plan.length === 0 && p3d.result.includes("n15"), p3d);
    const p3e = await planOf("강호 새로 만들어 줘", [{ name: "create_node", input: { said: "강호 새로 만들어 줘", kind: "사람", name: "강호" } }]);
    const p3e2 = await planOf("강호 새로 만들어 줘", [{ name: "create_node", input: { said: "강호 새로 만들어 줘", kind: "사람", name: "강호", isNew: true } }]);
    check("③ 같은 이름 사람 — 후보 둘 알려 주고 안 만듦 · 새로라는 말이 있으면 새로(decision new)", p3e.r.ok && p3e.r.plan.length === 0 && p3e.result.includes("n12") && p3e.result.includes("n13") && p3e2.r.ok && p3e2.r.plan.length === 1 && (p3e2.r.plan[0] as { decision: string }).decision === "new", [p3e, p3e2]);
    const depthCases: [string, Use][] = [
      ["항목을 묶음 아래에 만들기", { name: "create_node", input: { said: "넣어 줘", kind: "항목", name: "새것", parent: fish } }],
      ["묶음 안에 묶음 넣기", put(fish, fish)],
      ["카테고리 안에 카테고리 넣기", put(hobby, pet)],
      ["모임에 장소 넣기", put({ alias: "n18", name: "전우회" }, { alias: "n21", name: "제주도" })],
      ["장소 묶음에 사람 넣기", put({ alias: "n22", name: "여행지" }, { alias: "n14", name: "미영" })],
      ["사람 안에 넣기", put({ alias: "n14", name: "미영" }, item)],
      ["항목을 묶음으로 옮기기", { name: "move", input: { said: "넣어 줘", node: item, to: fish } }],
      ["카테고리를 옮기기", { name: "move", input: { said: "넣어 줘", node: pet, to: hobby } }],
      ["이야기를 카테고리로 옮기기", { name: "move", input: { said: "넣어 줘", node: { alias: "n8", name: "훈련소 첫 밤" }, to: hobby } }],
    ];
    for (const [label, use] of depthCases) {
      const r = await planOf("넣어 줘", [use]);
      check(`③ 깊이·종류 규칙 — ${label} = 안 담음`, r.r.ok && r.r.plan.length === 0 && r.result.includes("error"), r);
    }
    const many = Array.from({ length: MAP_EDIT_PLAN_MAX + 2 }, (_, i): Use => ({ name: "create_node", input: { said: "넣어 줘", kind: "장소", name: `곳${i}` } }));
    const p3f = await planOf("넣어 줘", many);
    check(`③ 한 번에 ${MAP_EDIT_PLAN_MAX}개까지`, p3f.r.ok && p3f.r.plan.length === MAP_EDIT_PLAN_MAX && p3f.result.includes("개까지"), p3f.r);
    const f3g = fake([[{ name: "link", input: { said: "이어 줘", a: item, b: hobby } }], [{ name: "answer", input: { question: "어느 쪽을 이을까요?" } }]]);
    const p3g = await planMapEdit(a, "이어 줘", { callModel: f3g.caller, data: persona, dailyLimit: Infinity });
    check("③ 되묻는 답이면 담긴 계획은 안 보여 줌", p3g.ok && p3g.plan.length === 0 && p3g.question === "어느 쪽을 이을까요?", p3g);
    const f3h = fake([[{ name: "answer", input: { question: "복실이(n26)를 넣었어요" } }]]);
    const p3h = await planMapEdit(a, "넣어 줘", { callModel: f3h.caller, data: persona, dailyLimit: Infinity });
    check("③ 되묻기는 물음표 한 문장만 — 아니면 안 보여 줌(했다는 말 차단)", p3h.ok && p3h.question === null, p3h);

    await prisma.chatV3Usage.deleteMany({ where: { userId: b } });
    await prisma.chatV3Usage.createMany({ data: Array.from({ length: 29 }, (_, i) => ({ userId: b, purpose: i % 2 ? "MAP_ASK" : "TEST_MAP_EDIT", model: "x", costMicroUsd: 0 })) });
    const limit1 = fake([[answer]]);
    const under = await planMapEdit(b, "한 번 더", { callModel: limit1.caller, data: persona });
    const limit2 = fake([[answer]]);
    const overLimit = await planMapEdit(b, "또 한 번", { callModel: limit2.caller, data: persona });
    check("③ 하루 30회 — 질문·고치기 합쳐서 · 넘으면 호출 0", under.ok && !overLimit.ok && overLimit.reason === "limit" && limit2.calls.length === 0, overLimit);
    await prisma.chatV3Usage.deleteMany({ where: { userId: b } });

    // ── ④ 실행 → 결과 → 되돌리기 ──────────
    const run = async (plan: MapPlanItem[]) => {
      const r = await applyMapEdit(a, plan);
      if (!r.ok) throw new Error(r.error);
      return r;
    };
    const backToStart = async (r: { commandId: string; undo: UndoStep[] }) => {
      const u = await undoMapEdit(a, r.commandId, r.undo);
      return { u, same: (await snapshot(a)) === start, undone: (await logs(a, r.commandId)).every((l) => l.undoneAt !== null) };
    };
    const C = (id: string, name: string, kind: string, key = `cn:${id}`) => N("CUSTOM", id, name, kind, key);

    // 만들기 7종 + 항목·묶음 + 새로 만든 것을 같은 계획에서 넣기
    const created = await run([
      { tool: "create_node", newKey: "new1", kind: "사람", name: "새 분", relation: "새 친구", year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "put_in", container: C(cat1, "가상 분류 하나", "카테고리", `cat:${cat1}`), member: { newKey: "new1", name: "새 분", kind: "사람" } },
      { tool: "create_node", newKey: "new2", kind: "항목", name: "새 항목", relation: null, year: null, endYear: null, parent: C(cat2, "가상 분류 둘", "카테고리", `cat:${cat2}`), body: null, decision: null },
      { tool: "create_node", newKey: "new3", kind: "시기", name: "새 시기", relation: null, year: 1985, endYear: 1986, parent: null, body: null, decision: null },
      { tool: "create_node", newKey: "new4", kind: "이야기", name: "", relation: null, year: null, endYear: null, parent: { newKey: "new3", name: "새 시기", kind: "시기" }, body: "새 이야기 본문이에요.", decision: null },
      { tool: "create_node", newKey: "new5", kind: "장소", name: "새 장소", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "create_node", newKey: "new6", kind: "모임", name: "새 모임", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "create_node", newKey: "new7", kind: "장소 묶음", name: "새 장소 묶음", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "create_node", newKey: "new8", kind: "카테고리", name: "새 분류", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "create_node", newKey: "new9", kind: "묶음", name: "새 묶음", relation: null, year: null, endYear: null, parent: { newKey: "new8", name: "새 분류", kind: "카테고리" }, body: null, decision: null },
    ]);
    const afterCreate = await getMyLifeData(a);
    const cA = customOf(afterCreate);
    const newPerson = afterCreate.people.find((p) => p.name === "새 분");
    const inCat = cA.categories.find((c) => c.id === cat1)?.refs.some((r) => r.type === "PERSON" && r.id === newPerson?.id);
    check("④ 만들기 — 사람·항목·시기(연도)·이야기(새 시기 아래)·장소·모임·장소 묶음·카테고리·묶음 · 새 사람을 같은 계획에서 넣기", !created.failed && created.done.length === 10 && !!newPerson && newPerson.relation === "새 친구" && !!inCat && cA.items.some((i) => i.name === "새 항목" && i.categoryId === cat2) && afterCreate.events.some((e) => e.label === "새 시기" && e.year === 1985 && e.endYear === 1986 && e.stories.some((s) => s.content === "새 이야기 본문이에요.")) && afterCreate.places.some((p) => p.name === "새 장소") && afterCreate.groups.some((g) => g.name === "새 모임") && afterCreate.placeGroups.some((g) => g.name === "새 장소 묶음") && cA.groups.some((g) => g.name === "새 묶음"), created);
    const rowsC = await logs(a, created.commandId);
    const noText = JSON.stringify(rowsC);
    check("④ 편집 기록 — 도구 실행마다 1행(도구·노드 종류·id) · 이름·본문 없음", rowsC.length === 10 && rowsC.filter((l) => l.tool === "create_node").length === 9 && rowsC.filter((l) => l.tool === "put_in").length === 1 && rowsC.every((l) => l.undoneAt === null) && !noText.includes("새 분") && !noText.includes("본문"), rowsC.map((l) => l.tool));
    const putLink = await prisma.nodeLink.findFirst({ where: { userId: a, role: "MEMBER", OR: [{ fromId: newPerson?.id }, { toId: newPerson?.id }] }, select: { source: true } });
    check("④ AI 가 만든 연결은 NodeLink.source = AI", putLink?.source === "AI", putLink);
    check("④ 결과 카드 문장 · 지도에서 보기 키", created.done[0].line === "사람 ‘새 분’(새 친구)를 만들었어요." && created.done[0].key === `pe:${newPerson?.id}` && created.done[1].line === "‘새 분’을 ‘가상 분류 하나’에 넣었어요.", created.done.slice(0, 2));
    const uc = await backToStart(created);
    check("④ 되돌리기 — 한 명령 전부 역순 · 지도 처음과 같음 · 편집 기록에 되돌린 시각", uc.u.ok && uc.same && uc.undone, uc);

    // 이름 — 7종 + 영역(기본 카테고리)
    const memoBefore = await prisma.person.findUnique({ where: { id: pe1 }, select: { memo: true, metYear: true, relation: true } });
    const renames = await run([
      { tool: "rename_node", node: N("PERSON", pe1, "가상 이웃", "사람"), newName: "바뀐 이웃" },
      { tool: "rename_node", node: N("PLACE", pl1, "가상 장소", "장소"), newName: "바뀐 장소" },
      { tool: "rename_node", node: N("PERSON_GROUP", gr1, "가상 모임", "모임"), newName: "바뀐 모임" },
      { tool: "rename_node", node: N("PLACE_GROUP", pg1, "가상 장소 묶음", "장소 묶음"), newName: "바뀐 장소 묶음" },
      { tool: "rename_node", node: N("LIFE_EVENT", ev1, "가상 시기 하나", "시기"), newName: "바뀐 시기" },
      { tool: "rename_node", node: N("LIFE_EVENT", ev2, "가상 시기 둘", "시기"), newName: "바뀐 처음 시기" },
      { tool: "rename_node", node: N("EPISODE", st1, "가상 이야기", "이야기"), newName: "바뀐 이야기" },
      { tool: "rename_node", node: C(item1, "가상 항목", "항목"), newName: "바뀐 항목" },
      { tool: "rename_region", region: "PEOPLE", prevLabel: "가상 사람들", newName: "바뀐 사람들" },
      { tool: "rename_region", region: "PLACES", prevLabel: "장소록", newName: "바뀐 곳들" },
    ]);
    const afterRename = await getMyLifeData(a);
    const skeleton = await prisma.lifeEvent.findUnique({ where: { id: ev2 }, select: { label: true, correctedLabel: true } });
    const memoAfter = await prisma.person.findUnique({ where: { id: pe1 }, select: { memo: true, metYear: true, relation: true } });
    check("④ 이름 — 사람(다른 칸 그대로)·장소·모임·장소 묶음·직접 만든 시기·처음 시기(고친 이름 칸)·이야기·항목·영역 이름", !renames.failed && afterRename.people.some((p) => p.name === "바뀐 이웃") && JSON.stringify(memoBefore) === JSON.stringify(memoAfter) && afterRename.places.some((p) => p.name === "바뀐 장소") && afterRename.groups.some((g) => g.name === "바뀐 모임") && afterRename.placeGroups.some((g) => g.name === "바뀐 장소 묶음") && afterRename.events.some((e) => e.label === "바뀐 시기") && skeleton?.label === "가상 시기 둘" && skeleton?.correctedLabel === "바뀐 처음 시기" && afterRename.events.some((e) => e.stories.some((s) => s.title === "바뀐 이야기")) && customOf(afterRename).items.some((i) => i.name === "바뀐 항목") && customOf(afterRename).builtinNames.PEOPLE === "바뀐 사람들" && customOf(afterRename).builtinNames.PLACES === "바뀐 곳들", renames);
    const ur = await backToStart(renames);
    const placesRow = await prisma.customNode.count({ where: { userId: a, builtin: "PLACES" } });
    check("④ 이름 되돌리기 — 전부 처음과 같음(처음 시기 고친 이름 칸 = 다시 비움 · 처음 바꾼 영역 이름 = 행 지움)", ur.u.ok && ur.same && ur.undone && placesRow === 0 && (await prisma.lifeEvent.findUnique({ where: { id: ev2 }, select: { correctedLabel: true } }))?.correctedLabel === null, ur);

    // 잇기·끊기·넣기·빼기·옮기기
    const linked = await run([
      { tool: "link", a: C(item1, "가상 항목", "항목"), b: N("PERSON", pe1, "가상 이웃", "사람") },
      { tool: "put_in", container: N("PERSON_GROUP", gr1, "가상 모임", "모임"), member: N("PERSON", pe1, "가상 이웃", "사람") },
      { tool: "put_in", container: C(grp1, "가상 묶음", "묶음", `cgl:${grp1}`), member: N("PLACE", pl1, "가상 장소", "장소") },
      { tool: "unlink", a: C(item1, "가상 항목", "항목"), b: N("PLACE", pl1, "가상 장소", "장소") },
      { tool: "move", node: N("EPISODE", st1, "가상 이야기", "이야기", `st:${ev1}:${st1}`), to: N("LIFE_EVENT", ev2, "가상 시기 둘", "시기") },
      { tool: "move", node: C(grp2, "가상 묶음 둘", "묶음", `cgl:${grp2}`), to: C(cat2, "가상 분류 둘", "카테고리", `cat:${cat2}`) },
    ]);
    const afterLink = await getMyLifeData(a);
    const cL = customOf(afterLink);
    const it = cL.items.find((i) => i.id === item1);
    check("④ 잇기·넣기(모임·사용자 묶음)·끊기·옮기기(이야기·묶음) — 실제 값", !linked.failed && !!it?.related.some((r) => r.id === pe1) && !it?.related.some((r) => r.id === pl1) && !!afterLink.groups.find((g) => g.id === gr1)?.memberIds.includes(pe1) && !!cL.groups.find((g) => g.id === grp1)?.memberRefs.some((r) => r.id === pl1) && !!afterLink.events.find((e) => e.id === ev2)?.stories.some((s) => s.id === st1) && cL.groups.find((g) => g.id === grp2)?.categoryId === cat2, linked);
    check("④ 옮긴 이야기 키 = 새 시기 · 편집 기록 도구마다 1행", linked.done[4].key === `st:${ev2}:${st1}` && (await logs(a, linked.commandId)).length === 6, linked.done[4]);
    const ul = await backToStart(linked);
    check("④ 되돌리기 — 지도 처음과 같음(옮기기·끊기까지 역순)", ul.u.ok && ul.same && ul.undone, ul);

    // 이미 들어 있는 것 — 한 일로 말하지 않음
    const once = await run([{ tool: "put_in", container: N("PERSON_GROUP", gr1, "가상 모임", "모임"), member: N("PERSON", pe1, "가상 이웃", "사람") }]);
    const twice = await run([{ tool: "put_in", container: N("PERSON_GROUP", gr1, "가상 모임", "모임"), member: N("PERSON", pe1, "가상 이웃", "사람") }]);
    check("④ 이미 되어 있으면 그대로 — 결과 카드에 그렇게 말함 · 되돌릴 것·기록 없음", twice.done[0].line.includes("이미") && twice.undo.length === 0 && (await logs(a, twice.commandId)).length === 0, twice);
    await undoMapEdit(a, once.commandId, once.undo);
    const reusedPlace = await run([{ tool: "create_node", newKey: "new1", kind: "장소", name: "가상 장소", relation: null, year: null, endYear: null, parent: null, body: null, decision: null }]);
    check("④ 이미 있는 장소를 다시 쓰면 새로 안 만듦 · 되돌릴 것·기록 없음", reusedPlace.undo.length === 0 && reusedPlace.done[0]?.line === MY_LIFE_COPY.ask.plan.already && (await logs(a, reusedPlace.commandId)).length === 0 && (await snapshot(a)) === start, reusedPlace);
    const noLink = await run([{ tool: "unlink", a: N("PERSON", pe1, "가상 이웃", "사람"), b: N("PLACE", pl1, "가상 장소", "장소") }]);
    check("④ 끊을 연결이 없으면 멈추고 알림 · 기록 없음", !!noLink.failed && noLink.done.length === 0 && (await logs(a, noLink.commandId)).length === 0, noLink);
    check("④ 여기까지 지도 처음과 같음", (await snapshot(a)) === start);

    // ── ⑤ 거부(화면에서 고쳐 보낸 계획 포함) ──────────
    const rejected = async (label: string, item: MapPlanItem, otherSnapshot?: string) => {
      const before = await logs(a);
      const r = await applyMapEdit(a, [item]);
      const ok = r.ok && !!r.failed && r.done.length === 0 && r.undo.length === 0;
      const unchanged = (await snapshot(a)) === start && (await logs(a)).length === before.length && (otherSnapshot === undefined || (await snapshot(b)) === otherSnapshot);
      check(`⑤ ${label} = 거부 · 지도·기록 그대로`, !!ok && unchanged, { r, unchanged });
    };
    const bSnap = await snapshot(b);
    const mine = (id: string) => C(id, "x", "항목");
    await rejected("남의 사람을 잇기", { tool: "link", a: mine(item1), b: N("PERSON", peB, "남의 사람", "사람") }, bSnap);
    await rejected("남의 장소를 넣기", { tool: "put_in", container: mine(cat1), member: N("PLACE", plB, "남의 장소", "장소") }, bSnap);
    await rejected("남의 항목 안으로 넣기", { tool: "put_in", container: C(catB, "남의 분류", "카테고리"), member: N("PERSON", pe1, "가상 이웃", "사람") }, bSnap);
    await rejected("남의 장소 이름 바꾸기", { tool: "rename_node", node: N("PLACE", plB, "남의 장소", "장소"), newName: "빼앗음" }, bSnap);
    await rejected("남의 사람 이름 바꾸기", { tool: "rename_node", node: N("PERSON", peB, "남의 사람", "사람"), newName: "빼앗음" }, bSnap);
    await rejected("남의 시기 이름 바꾸기", { tool: "rename_node", node: N("LIFE_EVENT", evB, "남의 시기", "시기"), newName: "빼앗음" }, bSnap);
    await rejected("남의 이야기 제목 바꾸기", { tool: "rename_node", node: N("EPISODE", stB, "남의 이야기", "이야기"), newName: "빼앗음" }, bSnap);
    await rejected("남의 항목 이름 바꾸기", { tool: "rename_node", node: C(itemB, "남의 항목", "항목"), newName: "빼앗음" }, bSnap);
    await rejected("남의 이야기를 내 시기로 옮기기", { tool: "move", node: N("EPISODE", stB, "남의 이야기", "이야기"), to: N("LIFE_EVENT", ev1, "가상 시기 하나", "시기") }, bSnap);
    await rejected("내 이야기를 남의 시기로 옮기기", { tool: "move", node: N("EPISODE", st1, "가상 이야기", "이야기"), to: N("LIFE_EVENT", evB, "남의 시기", "시기") }, bSnap);
    await rejected("남의 항목을 내 카테고리로 옮기기", { tool: "move", node: C(itemB, "남의 항목", "항목"), to: C(cat1, "가상 분류 하나", "카테고리") }, bSnap);
    await rejected("내 항목을 남의 카테고리로 옮기기", { tool: "move", node: C(item1, "가상 항목", "항목"), to: C(catB, "남의 분류", "카테고리") }, bSnap);
    await rejected("남의 카테고리 아래에 항목 만들기", { tool: "create_node", newKey: "new1", kind: "항목", name: "침입", relation: null, year: null, endYear: null, parent: C(catB, "남의 분류", "카테고리"), body: null, decision: null }, bSnap);
    await rejected("남의 시기 아래에 이야기 만들기", { tool: "create_node", newKey: "new1", kind: "이야기", name: "침입", relation: null, year: null, endYear: null, parent: N("LIFE_EVENT", evB, "남의 시기", "시기"), body: "침입이에요.", decision: null }, bSnap);
    await rejected("남의 연결 끊기", { tool: "unlink", a: N("PERSON", peB, "남의 사람", "사람"), b: N("PLACE", plB, "남의 장소", "장소") }, bSnap);

    await rejected("builtin 행에 넣기", { tool: "put_in", container: C(builtinId, "가상 사람들", "카테고리"), member: N("PERSON", pe1, "가상 이웃", "사람") });
    await rejected("builtin 행을 넣기", { tool: "put_in", container: C(cat1, "가상 분류 하나", "카테고리"), member: C(builtinId, "가상 사람들", "카테고리") });
    await rejected("builtin 행 이름을 노드처럼 바꾸기", { tool: "rename_node", node: C(builtinId, "가상 사람들", "카테고리"), newName: "빼앗음" });
    await rejected("builtin 행 옮기기", { tool: "move", node: C(builtinId, "가상 사람들", "카테고리"), to: C(cat1, "가상 분류 하나", "카테고리") });
    await rejected("builtin 행 아래에 항목 만들기", { tool: "create_node", newKey: "new1", kind: "항목", name: "침입", relation: null, year: null, endYear: null, parent: C(builtinId, "가상 사람들", "카테고리"), body: null, decision: null });
    await rejected("항목을 builtin 행으로 옮기기", { tool: "move", node: C(item1, "가상 항목", "항목"), to: C(builtinId, "가상 사람들", "카테고리") });

    await rejected("깊이 — 묶음 안에 묶음", { tool: "put_in", container: C(grp1, "가상 묶음", "묶음"), member: C(grp2, "가상 묶음 둘", "묶음") });
    await rejected("깊이 — 카테고리 안에 카테고리", { tool: "put_in", container: C(cat1, "가상 분류 하나", "카테고리"), member: C(cat2, "가상 분류 둘", "카테고리") });
    await rejected("깊이 — 묶음 아래에 항목 만들기", { tool: "create_node", newKey: "new1", kind: "항목", name: "침입", relation: null, year: null, endYear: null, parent: C(grp1, "가상 묶음", "묶음"), body: null, decision: null });
    await rejected("깊이 — 항목을 묶음으로 옮기기", { tool: "move", node: C(item1, "가상 항목", "항목"), to: C(grp1, "가상 묶음", "묶음") });
    await rejected("깊이 — 카테고리를 옮기기", { tool: "move", node: C(cat2, "가상 분류 둘", "카테고리"), to: C(cat1, "가상 분류 하나", "카테고리") });
    await rejected("깊이 — 항목을 자기 카테고리에 또 넣기", { tool: "put_in", container: C(cat1, "가상 분류 하나", "카테고리"), member: C(item1, "가상 항목", "항목") });
    await rejected("6종과 같은 이름의 항목 — 실행 때도 막음", { tool: "create_node", newKey: "new1", kind: "항목", name: "가상 이웃", relation: null, year: null, endYear: null, parent: C(cat1, "가상 분류 하나", "카테고리"), body: null, decision: null });
    await rejected("같은 이름 사람 — 실행 때도 막음", { tool: "create_node", newKey: "new1", kind: "사람", name: "가상 이웃", relation: null, year: null, endYear: null, parent: null, body: null, decision: null });

    // 앞에서 실패하면 멈춤 — 앞 일은 남고 되돌릴 수 있음, 뒤 일은 안 함
    const partial = await run([
      { tool: "create_node", newKey: "new1", kind: "장소", name: "멈춤 앞 장소", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
      { tool: "link", a: mine(item1), b: N("PERSON", peB, "남의 사람", "사람") },
      { tool: "create_node", newKey: "new2", kind: "장소", name: "멈춤 뒤 장소", relation: null, year: null, endYear: null, parent: null, body: null, decision: null },
    ]);
    const afterPartial = await getMyLifeData(a);
    check("⑤ 앞에서 실패하면 멈춤 — 앞 일 남음 · 뒤 일 안 함 · 기록 1행 · 문구로 알림", !!partial.failed && partial.done.length === 1 && afterPartial.places.some((p) => p.name === "멈춤 앞 장소") && !afterPartial.places.some((p) => p.name === "멈춤 뒤 장소") && (await logs(a, partial.commandId)).length === 1, partial);
    const up = await backToStart(partial);
    check("⑤ 멈춘 뒤 되돌리기 — 지도 처음과 같음", up.u.ok && up.same, up);
    const notMine = await undoMapEdit(a, "nope", [{ t: "links", links: [{ a: { type: "PERSON", id: peB }, b: { type: "PLACE", id: plB } }] }]);
    check("⑤ 되돌리기 값으로 남의 연결은 못 건드림", (await snapshot(b)) === bSnap, notMine);

    // ── ⑥ 입구 ──────────
    const editSrc = read("lib/map-edit.ts");
    check("⑥ lib/map-edit — prisma 직접 쓰기 없음(기존 입구만) · AI 전용 쓰기 경로 없음", !/prisma[.]|from ".\/db"/.test(editSrc) && editSrc.includes("addLink(") && editSrc.includes("removeLink(") && !/prisma[.]|from ".\/db"/.test(read("lib/map-edit-plan.ts")));
    const actions = read("app/my-life/actions.ts");
    for (const fn of ["planMapEditAction", "applyMapEditAction", "undoMapEditAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${fn}`));
      check(`⑥ ${fn} 첫 줄 auth`, body.split("\n")[1].includes("await requireUserId()"), body.slice(0, 120));
    }
    check("⑥ \"use server\" 액션 파일에 type 재수출 없음(빌드는 통과하고 실행 때 ReferenceError — 2026-11-07 화면 확인에서 잡음)", !/export type \{/.test(actions));
    check("⑥ 화면에서 온 계획 — 없는 도구·지우기·상한 넘음·빈 계획·모양 틀림 거부", parsePlan([{ tool: "delete_node", node: {} }]) === null && parsePlan([]) === null && parsePlan("x") === null && parsePlan(Array.from({ length: MAP_EDIT_PLAN_MAX + 1 }, () => ({ tool: "rename_region", region: "PEOPLE", prevLabel: "x", newName: "y" }))) === null && parsePlan([{ tool: "link", a: { ref: { type: "PERSON", id: "x" }, name: "n", kind: "사람" }, b: {} }]) === null && parsePlan([{ tool: "rename_region", region: "EVIL", prevLabel: "x", newName: "y" }]) === null);
    const sheet = read("app/my-life/AskSheet.tsx") + read("app/my-life/AskCards.tsx") // 카드는 AI 시트·튜토리얼이 같이 쓰는 ./AskCards;
    check("⑥ 화면 — 확인 카드(이대로 하기·그만두기) → 결과 카드(지도에서 보기·되돌리기) · 카드 전 실행 없음 · 문구 확정(2026-11-10 — [임시] 표시 없음)", sheet.includes('data-map-edit-card="plan"') && sheet.includes('data-map-edit-card="result"') && sheet.includes("onClick={() => apply(plan)}") && sheet.includes("onClick={clear}") && sheet.includes("onClick={() => undo(result.commandId, result.undo)}") && /AI 지도 편집[^\n]*\n/.test(read("lib/my-life-copy.ts")) && !/AI 지도 편집[^\n]*\[임시/.test(read("lib/my-life-copy.ts")) && read("docs/navigation-map.md").includes("이대로 하기"));

    // ── ⑨ 넣을 곳 — 묶음을 골랐는데 요청엔 위 카테고리 이름만(고침안 2) · 되묻기 내부 용어(고침안 3) ──────────
    {
      const pv = buildMapView(persona);
      const al = (kind: string, name: string) => ({ alias: pv.nodes.find((x) => x.kind === kind && x.name === name)!.alias, name });
      const toGroup = { name: "put_in", input: { said: "취미에 순덕 넣어 줘", container: al("묶음", "낚시 친구들"), member: al("사람", "순덕") } };
      const toCat = { name: "put_in", input: { said: "취미에 순덕 넣어 줘", container: al("카테고리", "취미"), member: al("사람", "순덕") } };
      const once = fake([[toGroup], [toCat], [answer]]);
      const r1 = await planMapEdit(a, "취미에 순덕 넣어 줘", { callModel: once.caller, data: persona, dailyLimit: Infinity });
      const told = lastUser(once.calls[1]);
      check("⑨ 묶음을 고르면 모델에게 한 번 돌려보냄(도구 결과 — 위 카테고리 이름) → 카테고리로 다시 담음", r1.ok && r1.plan.length === 1 && planLine(r1.plan[0], "will") === "‘순덕’을 ‘취미’에 넣어요." && told.includes("사용자가 말한 곳은 ‘취미’ 카테고리") && !JSON.stringify(r1).includes("사용자가 말한 곳"), { r1, told });
      const twice = fake([[toGroup], [toGroup], [answer]]);
      const r2 = await planMapEdit(a, "취미에 순덕 넣어 줘", { callModel: twice.caller, data: persona, dailyLimit: Infinity });
      check("⑨ 두 번째도 묶음이면 계획을 버리고 코드가 되묻기(물음표 한 문장 · \"그분\" 없음)", r2.ok && r2.plan.length === 0 && r2.question === "‘순덕’을 ‘취미’에 바로 넣을까요, ‘낚시 친구들’ 묶음에 넣을까요?" && !/그분/.test(r2.question ?? ""), r2);
      const named = fake([[{ name: "put_in", input: { said: "낚시 친구들에 순덕 넣어 줘", container: al("묶음", "낚시 친구들"), member: al("사람", "순덕") } }], [answer]]);
      const r3 = await planMapEdit(a, "낚시 친구들에 순덕 넣어 줘", { callModel: named.caller, data: persona, dailyLimit: Infinity });
      check("⑨ 요청에 묶음 이름이 있으면 그대로 담음", r3.ok && r3.plan.length === 1 && planLine(r3.plan[0], "will") === "‘순덕’을 ‘낚시 친구들’에 넣어요.", r3);
      const inner = fake([[{ name: "answer", input: { question: "어느 노드를 말씀하시는 건가요?" } }]]);
      const r4 = await planMapEdit(a, "그거 바꿔 줘", { callModel: inner.caller, data: persona, dailyLimit: Infinity });
      check("⑨ 되묻기에 \"노드\"가 있으면 그 문장 대신 일반 안내 · 계획 없음(고침안 3)", r4.ok && r4.plan.length === 0 && r4.question === MY_LIFE_COPY.ask.plan.empty, r4);
      const visible = Object.values(MY_LIFE_COPY.ask.plan).map((v) => (typeof v === "function" ? (v as (...x: unknown[]) => string)("가", "나", "다", 1) : String(v))).join("\n");
      check("⑨ 지도 고치기 문구에 \"그분\" 없음", !/그분/.test(visible));
    }

    // ── ⑦ 지우기(3c — §6.10) ──────────
    const viewOf = async (u: string) => buildMapView(await getMyLifeData(u));
    const aliasOf = async (u: string, kind: string, name: string) => {
      const n = (await viewOf(u)).nodes.find((x) => x.kind === kind && x.name === name);
      if (!n) throw new Error(`별칭 없음 ${kind} ${name}`);
      return { alias: n.alias, name };
    };
    const planReal = async (u: string, text: string, rounds: Use[][]) => {
      const r = await planMapEdit(u, text, { callModel: fake(rounds).caller, dailyLimit: Infinity });
      if (!r.ok) throw new Error(`계획 실패 ${r.reason}`);
      return r;
    };
    const delPlan = async (text: string, kind: string, name: string) => planReal(a, text, [[{ name: "delete_node", input: { said: text, node: await aliasOf(a, kind, name) } }], [answer]]);

    const delItem = await childOf(a, "ITEM", "지울 항목", cat2);
    await addLink(a, { type: "CUSTOM", id: delItem }, { type: "PLACE", id: pl1 });
    const before7 = await snapshot(a);
    const logs7 = (await logs(a)).length;
    const d1 = await delPlan("지울 항목 지워 줘", "항목", "지울 항목");
    const d1Item = d1.plan[0];
    check("⑦ 지우기 계획 — 카드에 영향 수(연결 1곳) · 그때까지 지도·기록 그대로",
      d1.plan.length === 1 && d1Item.tool === "delete_node" && d1Item.impact.customLinks === 1 && planLine(d1Item, "will") === "‘지울 항목’을 지워요." && planNotes(d1Item).some((t) => t.includes("1곳")) && (await snapshot(a)) === before7 && (await logs(a)).length === logs7,
      d1);
    // 지도 패널과 같은 문장
    const sheetSrc = read("app/my-life/AskSheet.tsx") + read("app/my-life/AskCards.tsx") // 카드는 AI 시트·튜토리얼이 같이 쓰는 ./AskCards;
    check("⑦ 확인 카드 — 영향 줄 + 되돌릴 수 없음 + [지우기]·[합치기] destructive", sheetSrc.includes("planNotes") && sheetSrc.includes("A.plan.irreversible") && sheetSrc.includes('"destructive"') && sheetSrc.includes("E.deleteDo") && sheetSrc.includes("A.plan.mergeDo"));

    // 실행 때 다시 셈
    await addLink(a, { type: "CUSTOM", id: delItem }, { type: "PERSON", id: pe1 });
    const stale = await applyMapEdit(a, d1.plan);
    check("⑦ 카드 뒤 수가 바뀌면 안 함 — 항목 그대로 · 기록 없음", stale.ok && !!stale.failed && stale.failed.error === MY_LIFE_COPY.ask.plan.staleImpact && (await prisma.customNode.count({ where: { id: delItem } })) === 1 && (await logs(a)).length === logs7, stale);
    await removeLink(a, { type: "CUSTOM", id: delItem }, { type: "PERSON", id: pe1 });
    const tampered = await applyMapEdit(a, [{ ...d1Item, impact: { ...(d1Item as { impact: object }).impact, customLinks: 0 } }]);
    check("⑦ 화면이 수를 고쳐 보내도 안 함", tampered.ok && !!tampered.failed && (await prisma.customNode.count({ where: { id: delItem } })) === 1, tampered);
    const d1Done = await applyMapEdit(a, d1.plan);
    const d1Logs = d1Done.ok ? await logs(a, d1Done.commandId) : [];
    check("⑦ 실행 — 지워짐 · 되돌릴 것 없음 · [지도에서 보기] 없음 · 기록 1행(되돌린 시각 없음)",
      d1Done.ok && !d1Done.failed && d1Done.undo.length === 0 && d1Done.done[0].key === null && d1Done.done[0].line === "‘지울 항목’을 지웠어요." && (await prisma.customNode.count({ where: { id: delItem } })) === 0 && d1Logs.length === 1 && d1Logs[0].tool === "delete_node" && d1Logs[0].nodeId === delItem && d1Logs[0].undoneAt === null,
      { d1Done, d1Logs });

    // 이야기·직접 추가 시기·장소·모임·장소 묶음·카테고리 — 패널과 같은 입구
    const delEv = (await prisma.lifeEvent.create({ data: { userId: a, type: "CUSTOM", label: "지울 시기", year: 1999, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 50 }, select: { id: true } })).id;
    const delSt = (await createEpisodeBridge(a, delEv, "지울 시기의 이야기", 1999, "지울 시기의 이야기 본문이에요.", ""))!.episodeId;
    const dEv = await delPlan("지울 시기 지워 줘", "시기", "지울 시기");
    const dEvItem = dEv.plan[0];
    check("⑦ 시기 지우기 — 카드에 같이 지워지는 이야기 수", dEvItem?.tool === "delete_node" && dEvItem.impact.storiesDeleted && dEvItem.impact.stories === 1 && planNotes(dEvItem).some((t) => t.includes("이야기 1개")), dEv);
    const dEvDone = await applyMapEdit(a, dEv.plan);
    check("⑦ 시기 지우기 실행 — 시기·이야기 모두 지워짐", dEvDone.ok && !dEvDone.failed && (await prisma.lifeEvent.count({ where: { id: delEv } })) === 0 && (await prisma.episode.count({ where: { id: delSt } })) === 0, dEvDone);

    const delSt2 = (await createEpisodeBridge(a, ev1, "지울 이야기", 1970, "지울 이야기 본문이에요.", ""))!.episodeId;
    const dSt = await delPlan("지울 이야기 지워 줘", "이야기", "지울 이야기");
    const dStDone = await applyMapEdit(a, dSt.plan);
    check("⑦ 이야기 지우기 — 지워짐", dStDone.ok && !dStDone.failed && (await prisma.episode.count({ where: { id: delSt2 } })) === 0, dStDone);

    const delCat = await catOf(a, "지울 분류");
    await childOf(a, "ITEM", "분류 안 항목", delCat);
    await addLink(a, { type: "CUSTOM", id: delCat }, { type: "PERSON", id: pe1 });
    const dCat = await delPlan("지울 분류 지워 줘", "카테고리", "지울 분류");
    const dCatItem = dCat.plan[0];
    check("⑦ 카테고리 지우기 — 카드에 지워지는 항목 수·빠지기만 하는 수", dCatItem?.tool === "delete_node" && dCatItem.impact.customDeleted === 1 && dCatItem.impact.customOut === 1 && planNotes(dCatItem)[0] === MY_LIFE_COPY.custom.deleteCatNote(1, 1), dCat);
    const dCatDone = await applyMapEdit(a, dCat.plan);
    check("⑦ 카테고리 지우기 실행 — 안 항목 같이 · 넣어 둔 사람은 남음", dCatDone.ok && !dCatDone.failed && (await prisma.customNode.count({ where: { id: delCat } })) === 0 && (await prisma.person.count({ where: { id: pe1 } })) === 1, dCatDone);

    // 거부
    const dPerson = await delPlan("가상 이웃 지워 줘", "사람", "가상 이웃");
    check("⑦ 사람 지우기 = 안 담음 + 지도 패널 안내(Q87)", dPerson.plan.length === 0 && dPerson.unsupported && dPerson.note === MY_LIFE_COPY.ask.plan.personDelete("가상 이웃") && !dPerson.question, dPerson);
    const zero: DeleteImpact = { stories: 0, people: 0, places: 0, familyActivity: 0, storiesDeleted: false, placeGroups: 0, periods: 0, groups: 0, personBody: false, customKind: null, customDeleted: 0, customOut: 0, customLinks: 0 };
    const forced = async (node: PlanNode) => applyMapEdit(a, [{ tool: "delete_node", node, impact: zero } as MapPlanItem]);
    const fPerson = await forced(N("PERSON", pe1, "가상 이웃", "사람"));
    check("⑦ 고쳐 보낸 계획으로도 사람은 못 지움", fPerson.ok && !!fPerson.failed && (await prisma.person.count({ where: { id: pe1 } })) === 1, fPerson);
    const dSkeleton = await delPlan("가상 시기 둘 지워 줘", "시기", "가상 시기 둘");
    const fSkeleton = await forced(N("LIFE_EVENT", ev2, "가상 시기 둘", "시기"));
    check("⑦ 기본 시기 = 안 담음 · 모델 답과 관계없이 \"처음 정한 시기는 지울 수 없어요\"(고침안 1) · 고쳐 보내도 못 지움", dSkeleton.plan.length === 0 && dSkeleton.unsupported && dSkeleton.note === MY_LIFE_COPY.edit.deleteSkeletonNote && fSkeleton.ok && !!fSkeleton.failed && (await prisma.lifeEvent.count({ where: { id: ev2 } })) === 1, { dSkeleton, fSkeleton });
    const fBuiltin = await forced(N("CUSTOM", builtinId, "가상 사람들", "카테고리"));
    check("⑦ 기본 카테고리 행 = 못 지움", fBuiltin.ok && !!fBuiltin.failed && (await prisma.customNode.count({ where: { id: builtinId } })) === 1, fBuiltin);
    const fOthers = await Promise.all([forced(N("CUSTOM", itemB, "남의 항목", "항목")), forced(N("EPISODE", stB, "남의 이야기", "이야기")), forced(N("PLACE", plB, "남의 장소", "장소"))]);
    check("⑦ 남의 노드 = 못 지움(항목·이야기·장소)", fOthers.every((r) => r.ok && !!r.failed) && (await prisma.customNode.count({ where: { id: itemB } })) === 1 && (await prisma.episode.count({ where: { id: stB } })) === 1 && (await prisma.place.count({ where: { id: plB } })) === 1, fOthers);

    // 계획에 혼자만
    const mix1 = await planReal(a, "가상 묶음 지우고 가상 항목 이름 바꿔 줘", [
      [{ name: "delete_node", input: { said: "가상 묶음 지우고", node: await aliasOf(a, "묶음", "가상 묶음") } }],
      [{ name: "rename_node", input: { said: "가상 항목 이름 바꿔", node: await aliasOf(a, "항목", "가상 항목"), newName: "새 이름" } }],
      [answer],
    ]);
    const mix2 = await planReal(a, "가상 항목 이름 바꾸고 가상 묶음 지워 줘", [
      [{ name: "rename_node", input: { said: "가상 항목 이름 바꾸고", node: await aliasOf(a, "항목", "가상 항목"), newName: "새 이름" } }],
      [{ name: "delete_node", input: { said: "가상 묶음 지워", node: await aliasOf(a, "묶음", "가상 묶음") } }],
      [answer],
    ]);
    // C안(2026-11-08) — 모델이 지우기만 부르고 다른 일은 안 불러도: A = 담기는 순간 도구 결과 알림 · B = answer.otherWork 가 참이면 섞인 요청
    const onlyDel = fake([[{ name: "delete_node", input: { said: "가상 묶음 지우고", node: await aliasOf(a, "묶음", "가상 묶음") } }], [{ name: "answer", input: { otherWork: true } }]]);
    const mix3 = await planMapEdit(a, "가상 묶음 지우고 가상 항목 이름 바꿔 줘", { callModel: onlyDel.caller, dailyLimit: Infinity });
    check("⑦ C안 A — 지우기가 담기는 순간 도구 결과로 \"다른 일도 있으면 부르세요\"", lastUser(onlyDel.calls[1]).includes("요청에 다른 일도 있으면 그 일도 도구로 부르세요"), lastUser(onlyDel.calls[1]));
    check("⑦ C안 B — 지우기만 불렀어도 otherWork 참이면 아무것도 안 담음(지우기 카드도 없음) · 따로 부탁하라고 함", mix3.ok && mix3.plan.length === 0 && mix3.question === MY_LIFE_COPY.ask.plan.oneAtATime, mix3);
    const soloDel = fake([[{ name: "delete_node", input: { said: "가상 묶음 지워", node: await aliasOf(a, "묶음", "가상 묶음") } }], [{ name: "answer", input: { otherWork: false } }]]);
    const solo = await planMapEdit(a, "가상 묶음 지워 줘", { callModel: soloDel.caller, dailyLimit: Infinity });
    check("⑦ otherWork 거짓이면 지우기 카드 그대로", solo.ok && solo.plan.length === 1 && solo.plan[0].tool === "delete_node", solo);
    const notDestructive = fake([[{ name: "rename_node", input: { said: "가상 항목 이름 바꿔", node: await aliasOf(a, "항목", "가상 항목"), newName: "새 이름" } }], [{ name: "answer", input: { otherWork: true } }]]);
    const plain = await planMapEdit(a, "가상 항목 이름 바꿔 줘", { callModel: notDestructive.caller, dailyLimit: Infinity });
    check("⑦ 지우기·합치기를 안 불렀으면 otherWork 는 무시(보통 계획 그대로)", plain.ok && plain.plan.length === 1 && plain.question === null, plain);
    check("⑦ 다른 일과 같이 시키면 아무것도 안 담고 따로 부탁하라고 함(순서 무관)", mix1.plan.length === 0 && mix1.question === MY_LIFE_COPY.ask.plan.oneAtATime && mix2.plan.length === 0 && mix2.question === MY_LIFE_COPY.ask.plan.oneAtATime, { mix1, mix2 });
    const okDel: MapPlanItem = { tool: "delete_node", node: N("CUSTOM", grp1, "가상 묶음", "묶음") as ExistingNode, impact: zero };
    check("⑦ 화면에서 온 계획 — 지우기·합치기가 다른 일과 섞이면 거부 · 수 없으면 거부 · 새 노드 거부",
      parsePlan([okDel, { tool: "rename_node", node: N("CUSTOM", item1, "가상 항목", "항목"), newName: "x" }]) === null && parsePlan([{ tool: "delete_node", node: N("CUSTOM", grp1, "가상 묶음", "묶음") }]) === null && parsePlan([{ tool: "delete_node", node: { newKey: "new1", name: "x", kind: "항목" }, impact: zero }]) === null && parsePlan([okDel]) !== null);

    // ── ⑧ 합치기(3c — §6.10) ──────────
    const P8 = (text: string) => ({ v: 1 as const, blocks: [{ type: "paragraph" as const, text }] });
    const person = async (name: string, data: { relation?: string; memo?: string; metYear?: number; birthYear?: number } = {}) => (await prisma.person.create({ data: { userId: a, name, ...data }, select: { id: true } })).id;
    const pFrom = await person("합칠 분 하나", { relation: "친구", memo: "원본 메모", birthYear: 1950 });
    const pTo = await person("합칠 분 둘", { metYear: 1980 });
    const pEv = (await prisma.lifeEvent.create({ data: { userId: a, type: "CUSTOM", label: "합치기 시기", year: 1975, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 60 }, select: { id: true } })).id;
    const story = async (title: string) => (await createEpisodeBridge(a, pEv, title, 1975, `${title} 본문이에요.`, ""))!.episodeId;
    const sSubject = await story("대상 인물 이야기");
    await prisma.episode.update({ where: { id: sSubject }, data: { personId: pFrom } });
    const sLinked = await story("함께 나온 이야기");
    await addLink(a, { type: "EPISODE", id: sLinked }, { type: "PERSON", id: pFrom });
    const sBoth = await story("둘 다 나온 이야기");
    await addLink(a, { type: "EPISODE", id: sBoth }, { type: "PERSON", id: pFrom });
    await addLink(a, { type: "EPISODE", id: sBoth }, { type: "PERSON", id: pTo });
    const sToSubject = await story("대상의 이야기");
    await prisma.episode.update({ where: { id: sToSubject }, data: { personId: pTo } });
    await addLink(a, { type: "EPISODE", id: sToSubject }, { type: "PERSON", id: pFrom });
    await addLink(a, { type: "PERSON_GROUP", id: gr1 }, { type: "PERSON", id: pFrom });
    await addLink(a, { type: "PERSON", id: pFrom }, { type: "PLACE", id: pl1 });
    await addLink(a, { type: "CUSTOM", id: cat1 }, { type: "PERSON", id: pFrom });
    await addLink(a, { type: "LIFE_EVENT", id: ev2 }, { type: "PERSON", id: pFrom }); // DIRECT
    await addLink(a, { type: "LIFE_EVENT", id: ev2 }, { type: "PERSON", id: pTo });
    await prisma.personLifeEvent.updateMany({ where: { lifeEventId: ev2, personId: pTo }, data: { origin: "STORY" } });
    await savePersonBody(a, pFrom, P8("원본 글이에요."), 0);
    await savePersonBody(a, pTo, P8("대상 글이에요."), 0);
    const memFrom = await ensurePersonBodyMemory(a, pFrom);
    const memTo = await ensurePersonBodyMemory(a, pTo);
    const photo8 = (await prisma.photo.create({ data: { userId: a, memoryId: memFrom!, storagePath: `${a}/fixture-merge.jpg`, mimeType: "image/jpeg", fileBytes: 1 }, select: { id: true } })).id;
    const before8 = await snapshot(a);
    const logs8 = (await logs(a)).length;
    const mPlan = await planReal(a, "합칠 분 하나랑 합칠 분 둘은 같은 분이야 합쳐 줘", [[{ name: "merge_nodes", input: { said: "합쳐 줘", from: await aliasOf(a, "사람", "합칠 분 하나"), to: await aliasOf(a, "사람", "합칠 분 둘") } }], [answer]]);
    const mItem = mPlan.plan[0];
    check("⑧ 합치기 계획 — 카드에 옮겨지는 연결 수·글 · 확인 전 DB 변화 0",
      mItem?.tool === "merge_nodes" && mItem.impact.body === "kept" && mItem.impact.links === 8 && planLine(mItem, "will") === "‘합칠 분 하나’를 ‘합칠 분 둘’에 합쳐요." && planNotes(mItem).length === 2 && planNotes(mItem)[0].includes("8개") && (await snapshot(a)) === before8 && (await logs(a)).length === logs8,
      mPlan);
    await addLink(a, { type: "PERSON", id: pFrom }, { type: "CUSTOM", id: cat2 });
    const mStale = await applyMapEdit(a, mPlan.plan);
    check("⑧ 카드 뒤 수가 바뀌면 안 함", mStale.ok && !!mStale.failed && mStale.failed.error === MY_LIFE_COPY.ask.plan.staleImpact && (await prisma.person.count({ where: { id: pFrom } })) === 1, mStale);
    await removeLink(a, { type: "PERSON", id: pFrom }, { type: "CUSTOM", id: cat2 });
    const mDone = await applyMapEdit(a, mPlan.plan);
    const mLogs = mDone.ok ? await logs(a, mDone.commandId) : [];
    check("⑧ 실행 — 원본 지워짐 · 되돌릴 것 없음 · [지도에서 보기] = 대상 · 기록 1행", mDone.ok && !mDone.failed && mDone.undo.length === 0 && mDone.done[0].key !== null && (await prisma.person.count({ where: { id: pFrom } })) === 0 && mLogs.length === 1 && mLogs[0].tool === "merge_nodes" && mLogs[0].nodeId === pFrom, { mDone, mLogs });
    const linkCount = (where: object) => prisma.nodeLink.count({ where: { userId: a, ...where } });
    check("⑧ 대상 인물 칸·함께 나온 이야기 옮겨짐", (await prisma.episode.findUniqueOrThrow({ where: { id: sSubject }, select: { personId: true } })).personId === pTo && (await linkCount({ fromType: "EPISODE", fromId: sLinked, toType: "PERSON", toId: pTo })) === 1);
    check("⑧ 중복은 한 행 — 둘 다 나온 이야기 1행 · 대상이 대상 인물인 이야기엔 연결 안 둠", (await linkCount({ fromType: "EPISODE", fromId: sBoth, toType: "PERSON", toId: pTo })) === 1 && (await linkCount({ fromType: "EPISODE", fromId: sToSubject, toType: "PERSON", toId: pTo })) === 0);
    check("⑧ 모임·장소·카테고리 연결 옮겨짐", (await prisma.personGroupMember.count({ where: { groupId: gr1, personId: pTo } })) === 1 && (await linkCount({ fromType: "PERSON", fromId: pTo, toType: "PLACE", toId: pl1 })) === 1 && (await linkCount({ fromType: "PERSON", fromId: pTo, toType: "CUSTOM", toId: cat1, role: "MEMBER" })) === 1);
    const ple = await prisma.personLifeEvent.findMany({ where: { personId: pTo, lifeEventId: ev2 }, select: { origin: true } });
    check("⑧ 시기↔사람 = 한 행, DIRECT 우선", ple.length === 1 && ple[0].origin === "DIRECT", ple);
    check("⑧ 원본을 가리키는 연결 0", (await prisma.nodeLink.count({ where: { OR: [{ fromType: "PERSON", fromId: pFrom }, { toType: "PERSON", toId: pFrom }] } })) === 0);
    const pToRow = await prisma.person.findUniqueOrThrow({ where: { id: pTo }, select: { relation: true, memo: true, metYear: true, birthYear: true } });
    check("⑧ 대상의 빈 칸만 채움(있던 값 안 바꿈)", pToRow.relation === "친구" && pToRow.memo === "원본 메모" && pToRow.birthYear === 1950 && pToRow.metYear === 1980, pToRow);
    const bodyTo = await prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: "PERSON", nodeId: pTo } }, select: { plainText: true, memoryId: true } });
    const revs = await prisma.nodeBodyRevision.findMany({ where: { nodeType: "PERSON", nodeId: pTo }, select: { plainText: true } });
    check("⑧ 글 둘 다 있으면 대상 글 그대로 · 원본 글 = 대상의 이전 판(Q88)", bodyTo?.plainText === "대상 글이에요." && revs.some((r) => r.plainText === "원본 글이에요."), { bodyTo, revs });
    const photoRow = await prisma.photo.findUnique({ where: { id: photo8 }, select: { memoryId: true } });
    check("⑧ 원본 글 사진 = 대상 글 쪽으로(지우지 않음) · 원본 글 메모리 정리", photoRow?.memoryId === memTo && bodyTo?.memoryId === memTo && (await prisma.userMemory.count({ where: { id: memFrom! } })) === 0, { photoRow, memTo });

    // 대상에 글이 없으면 통째로
    const pA = await person("글 있는 분");
    const pB = await person("글 없는 분");
    await savePersonBody(a, pA, P8("옮길 글이에요."), 0);
    await savePersonBody(a, pA, P8("옮길 글 고침이에요."), 1);
    const mBody = await mergeCheck(a, { type: "PERSON", id: pA }, { type: "PERSON", id: pB });
    const mBodyOk = mBody.ok && mBody.impact.body === "moved" ? await mergeNodes(a, { type: "PERSON", id: pA }, { type: "PERSON", id: pB }, mBody.impact) : null;
    const moved = await prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: "PERSON", nodeId: pB } }, select: { plainText: true } });
    check("⑧ 대상에 글이 없으면 글·이전 판 통째로 옮김", mBodyOk?.ok === true && moved?.plainText === "옮길 글 고침이에요." && (await prisma.nodeBodyRevision.count({ where: { nodeType: "PERSON", nodeId: pB } })) === 1, { mBody, moved });

    // 대상 글에 사진 메모리가 없으면 원본 메모리를 그대로 넘겨받음(사진 안 잃음) · 빈 글은 글로 안 침
    const pC = await person("사진 있는 분");
    const pD = await person("사진 없는 분");
    await savePersonBody(a, pC, P8("사진 있는 글이에요."), 0);
    await savePersonBody(a, pD, P8("사진 없는 글이에요."), 0);
    const memC = await ensurePersonBodyMemory(a, pC);
    const photoC = (await prisma.photo.create({ data: { userId: a, memoryId: memC!, storagePath: `${a}/fixture-merge2.jpg`, mimeType: "image/jpeg", fileBytes: 1 }, select: { id: true } })).id;
    const cChk = await mergeCheck(a, { type: "PERSON", id: pC }, { type: "PERSON", id: pD });
    const cOk = cChk.ok ? await mergeNodes(a, { type: "PERSON", id: pC }, { type: "PERSON", id: pD }, cChk.impact) : null;
    const bodyD = await prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: "PERSON", nodeId: pD } }, select: { memoryId: true, plainText: true } });
    const photoCRow = await prisma.photo.findUnique({ where: { id: photoC }, select: { memoryId: true } });
    check("⑧ 대상 글에 사진 메모리가 없으면 원본 메모리를 넘겨받음 — 사진 안 잃음", cOk?.ok === true && bodyD?.memoryId === memC && photoCRow?.memoryId === memC && bodyD?.plainText === "사진 없는 글이에요.", { cChk, bodyD, photoCRow });
    const pE = await person("빈 글 분");
    const pF = await person("글 받을 분");
    await prisma.nodeBody.create({ data: { userId: a, nodeType: "PERSON", nodeId: pE, doc: { v: 1, blocks: [] }, plainText: "" } });
    const eChk = await mergeCheck(a, { type: "PERSON", id: pE }, { type: "PERSON", id: pF });
    check("⑧ 빈 글 행은 글로 안 침", eChk.ok && eChk.impact.body === "none", eChk);

    // 장소+장소
    const place = async (name: string, data: { address?: string; lat?: number; lng?: number; source?: string } = {}) => (await prisma.place.create({ data: { userId: a, name, ...data }, select: { id: true } })).id;
    const plFrom = await place("합칠 곳 하나", { address: "가상 주소", lat: 37.5, lng: 127.1, source: "naver" });
    const plTo = await place("합칠 곳 둘");
    const sP1 = await story("장소 이야기 하나");
    const sP2 = await story("장소 이야기 둘");
    await addLink(a, { type: "EPISODE", id: sP1 }, { type: "PLACE", id: plFrom });
    await addLink(a, { type: "EPISODE", id: sP2 }, { type: "PLACE", id: plFrom });
    await addLink(a, { type: "EPISODE", id: sP2 }, { type: "PLACE", id: plTo });
    await addLink(a, { type: "PLACE_GROUP", id: pg1 }, { type: "PLACE", id: plFrom });
    const pChk = await mergeCheck(a, { type: "PLACE", id: plFrom }, { type: "PLACE", id: plTo });
    const pMerged = pChk.ok ? await mergeNodes(a, { type: "PLACE", id: plFrom }, { type: "PLACE", id: plTo }, pChk.impact) : null;
    const memOf = async (id: string) => (await prisma.episode.findUniqueOrThrow({ where: { id }, select: { memoryId: true } })).memoryId;
    const rowsP1 = await prisma.memoryPlace.findMany({ where: { memoryId: await memOf(sP1) }, select: { placeId: true, placeName: true, placeAddress: true } });
    const rowsP2 = await prisma.memoryPlace.findMany({ where: { memoryId: await memOf(sP2) }, select: { placeId: true } });
    const plToRow = await prisma.place.findUniqueOrThrow({ where: { id: plTo }, select: { address: true, lat: true, source: true } });
    check("⑧ 장소 합치기 — 이야기 장소 행 옮김(이름·주소 대상 값) · 같은 이야기 한 행 · 묶음 옮김 · 빈 칸 채움 · 원본 지움",
      pMerged?.ok === true && rowsP1.length === 1 && rowsP1[0].placeId === plTo && rowsP1[0].placeName === "합칠 곳 둘" && rowsP1[0].placeAddress === "가상 주소" && rowsP2.length === 1 && rowsP2[0].placeId === plTo && (await prisma.placeGroupMember.count({ where: { groupId: pg1, placeId: plTo } })) === 1 && plToRow.address === "가상 주소" && plToRow.lat === 37.5 && plToRow.source === "naver" && (await prisma.place.count({ where: { id: plFrom } })) === 0,
      { pChk, rowsP1, rowsP2, plToRow });

    // 항목+항목 · 항목→사람 · 항목→장소
    const itFrom = await childOf(a, "ITEM", "합칠 항목 하나", cat1);
    const itTo = await childOf(a, "ITEM", "합칠 항목 둘", cat2);
    await addLink(a, { type: "CUSTOM", id: itFrom }, { type: "PLACE", id: pl1 });
    await saveItemBody(a, itFrom, P8("항목 글이에요."), 0);
    const iChk = await mergeCheck(a, { type: "CUSTOM", id: itFrom }, { type: "CUSTOM", id: itTo });
    const iMerged = iChk.ok ? await mergeNodes(a, { type: "CUSTOM", id: itFrom }, { type: "CUSTOM", id: itTo }, iChk.impact) : null;
    const itBody = await prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: "CUSTOM", nodeId: itTo } }, select: { plainText: true } });
    check("⑧ 항목+항목 — 연결 옮김 · 원본 자리 = 대상의 넣기 연결 · 글 옮김 · 원본 지움",
      iMerged?.ok === true && (await linkCount({ fromType: "PLACE", fromId: pl1, toType: "CUSTOM", toId: itTo })) === 1 && (await linkCount({ fromType: "CUSTOM", toType: "CUSTOM", role: "MEMBER", OR: [{ fromId: cat1, toId: itTo }, { fromId: itTo, toId: cat1 }] })) === 1 && itBody?.plainText === "항목 글이에요." && (await prisma.customNode.count({ where: { id: itFrom } })) === 0,
      { iChk, itBody });

    const itSame = await childOf(a, "ITEM", "같은 분류 항목", cat2);
    const sameChk = await mergeCheck(a, { type: "CUSTOM", id: itSame }, { type: "CUSTOM", id: itTo });
    check("⑧ 같은 카테고리 항목끼리 — 자리를 넣기로 안 옮김(수 0)", sameChk.ok && sameChk.impact.links === 0, sameChk);

    const itPerson = await childOf(a, "ITEM", "사람이던 항목", cat1);
    const sItem = await story("항목과 이어진 이야기");
    await addLink(a, { type: "EPISODE", id: sItem }, { type: "CUSTOM", id: itPerson });
    const ipChk = await mergeCheck(a, { type: "CUSTOM", id: itPerson }, { type: "PERSON", id: pTo });
    const ipMerged = ipChk.ok ? await mergeNodes(a, { type: "CUSTOM", id: itPerson }, { type: "PERSON", id: pTo }, ipChk.impact) : null;
    check("⑧ 항목→사람 — 이야기 연결·시기↔사람(STORY)·넣기 연결 · 항목 지움",
      ipMerged?.ok === true && (await linkCount({ fromType: "EPISODE", fromId: sItem, toType: "PERSON", toId: pTo })) === 1 && (await prisma.personLifeEvent.count({ where: { lifeEventId: pEv, personId: pTo } })) === 1 && (await linkCount({ fromType: "PERSON", fromId: pTo, toType: "CUSTOM", toId: cat1, role: "MEMBER" })) === 1 && (await prisma.customNode.count({ where: { id: itPerson } })) === 0,
      ipChk);

    const itPlace = await childOf(a, "ITEM", "장소이던 항목", cat1);
    const plChk = await mergeCheck(a, { type: "CUSTOM", id: itPlace }, { type: "PLACE", id: plTo });
    const plMerged = plChk.ok ? await mergeNodes(a, { type: "CUSTOM", id: itPlace }, { type: "PLACE", id: plTo }, plChk.impact) : null;
    check("⑧ 항목→장소 — 넣기 연결 · 항목 지움", plMerged?.ok === true && (await linkCount({ fromType: "PLACE", fromId: plTo, toType: "CUSTOM", toId: cat1, role: "MEMBER" })) === 1 && (await prisma.customNode.count({ where: { id: itPlace } })) === 0, plChk);
    const itBodyPlace = await childOf(a, "ITEM", "글 있는 항목", cat1);
    await saveItemBody(a, itBodyPlace, P8("이 글은 잃으면 안 돼요."), 0);
    const bpChk = await mergeCheck(a, { type: "CUSTOM", id: itBodyPlace }, { type: "PLACE", id: plTo });
    check("⑧ 글 있는 항목→장소 = 거부(글을 잃음) · 항목 그대로", !bpChk.ok && bpChk.error === MY_LIFE_COPY.ask.plan.mergeBodyPlace && (await prisma.customNode.count({ where: { id: itBodyPlace } })) === 1, bpChk);

    // 합칠 수 없는 것
    const refused = async (label: string, from: NodeRef, to: NodeRef) => {
      const r = await mergeCheck(a, from, to);
      const applied = await applyMapEdit(a, [{ tool: "merge_nodes", from: N(from.type, from.id, "x", "x") as ExistingNode, to: N(to.type, to.id, "y", "y") as ExistingNode, fromLabel: "x", toLabel: "y", impact: { links: 0, body: "none" } }]);
      check(`⑧ ${label} = 거부`, !r.ok && applied.ok && !!applied.failed && applied.done.length === 0, { r, applied });
    };
    await refused("자기 자신", { type: "PERSON", id: pTo }, { type: "PERSON", id: pTo });
    await refused("시기끼리", { type: "LIFE_EVENT", id: ev1 }, { type: "LIFE_EVENT", id: pEv });
    await refused("이야기끼리", { type: "EPISODE", id: sLinked }, { type: "EPISODE", id: sBoth });
    await refused("모임", { type: "PERSON_GROUP", id: gr1 }, { type: "PERSON_GROUP", id: gr1 + "x" });
    await refused("카테고리끼리", { type: "CUSTOM", id: cat1 }, { type: "CUSTOM", id: cat2 });
    await refused("묶음끼리", { type: "CUSTOM", id: grp1 }, { type: "CUSTOM", id: grp2 });
    await refused("기본 카테고리 행", { type: "CUSTOM", id: builtinId }, { type: "CUSTOM", id: cat1 });
    await refused("사람→장소(다른 종류)", { type: "PERSON", id: pTo }, { type: "PLACE", id: plTo });
    await refused("사람→항목(거꾸로)", { type: "PERSON", id: pTo }, { type: "CUSTOM", id: itTo });
    await refused("남의 사람에게", { type: "PERSON", id: pTo }, { type: "PERSON", id: peB });
    await refused("남의 사람을", { type: "PERSON", id: peB }, { type: "PERSON", id: pTo });
    await refused("남의 항목을", { type: "CUSTOM", id: itemB }, { type: "CUSTOM", id: itTo });
    check("⑧ 거부 뒤 남의 노드 그대로", (await prisma.person.count({ where: { id: peB } })) === 1 && (await prisma.customNode.count({ where: { id: itemB } })) === 1);

    const twoGang = [await person("같은 이름", { relation: "전우" }), await person("같은 이름", { relation: "사촌" })];
    const gv = await viewOf(a);
    const gA = gv.nodes.find((n) => n.name === "같은 이름" && n.relation === "전우")!.alias;
    const gB = gv.nodes.find((n) => n.name === "같은 이름" && n.relation === "사촌")!.alias;
    const gPlan = await planReal(a, "같은 이름 두 분 합쳐 줘", [[{ name: "merge_nodes", input: { said: "합쳐 줘", from: { alias: gA, name: "같은 이름" }, to: { alias: gB, name: "같은 이름" } } }], [answer]]);
    check("⑧ 같은 이름 두 분 — 카드에 관계로 가려 보임", gPlan.plan[0] && planLine(gPlan.plan[0], "will") === "‘전우 같은 이름’을 ‘사촌 같은 이름’에 합쳐요.", gPlan);
    await prisma.person.deleteMany({ where: { id: { in: twoGang } } });

    const issues = await countNodeGraphIssues({ userId: a });
    // directPeriodPeopleWithoutStory = 보고만(직접 넣은 시기↔사람 — 정상), oldestPendingDays = 날짜 값
    const issueTotal = Object.entries(issues).filter(([k, v]) => typeof v === "number" && k !== "directPeriodPeopleWithoutStory").reduce((s, [, v]) => s + (v as number), 0);
    const customTotal = Object.values(issues.custom).reduce((s: number, v) => s + (typeof v === "number" ? v : 0), 0);
    check("⑧ 지우기·합치기 뒤 정합 점검 전부 0", issueTotal === 0 && customTotal === 0, issues);
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
