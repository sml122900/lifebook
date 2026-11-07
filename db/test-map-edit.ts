// AI 지도 편집 회귀 — docs/phase/custom-graph.md §4.2·§4.3·§4.6·§6.9 3b. 유료 모델 호출 0(모의 응답만).
//
//   ① 계획은 DB 를 안 바꿈 — 쓰기 도구를 불러도 지도·편집 기록 그대로 · 원장 TEST_MAP_EDIT 한 줄 · 도구 목록(지우기·합치기 없음) · Sonnet·temperature 0 · 마지막 라운드 answer 강제
//   ② 재생 세트(모의 응답) — 확인 카드 문장이 기대대로
//   ③ 계획 단계 거부 — said 없음 · 없는 별칭 · 이름 안 맞음 · 6종 이름의 항목(Q100) · 종류 규칙 · 10개 상한 · 되묻기 답이면 계획 버림 · 질문 쪽엔 쓰기 도구 없음
//   ④ 실행 → 결과 → 되돌리기 — 도구 7종 + 영역 이름 전부 DB 실제 값 확인 · 한 명령 되돌리면 지도 처음과 같음 · 편집 기록 도구마다 1행·되돌린 시각 · NodeLink.source AI
//   ⑤ 거부(실행 단계 — 화면에서 고쳐 보낸 계획 포함) — 남의 노드(도구마다) · builtin 행 · 깊이 규칙 · 앞에서 실패하면 멈춤(앞 일은 남고 되돌릴 수 있음)
//   ⑥ 입구 — lib/map-edit 에 prisma 직접 쓰기 없음(기존 입구만) · 액션 첫 줄 auth · 계획 모양 검사 · 화면 카드·문구 [임시]
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
import { MAP_EDIT_PLAN_MAX, parsePlan, planLine, type MapPlanItem, type PlanNode } from "../lib/map-edit-plan";
import { getMyLifeData, type MyLifeData } from "../lib/my-life";
import { customOf } from "../lib/my-life-custom";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import { addLink, renameBuiltin } from "../lib/my-life-edit";
import type { NodeRef } from "../lib/node-graph";
import { MAP_AGENT_TOOLS } from "../lib/prompts/map-agent";
import { MAP_EDIT_SYSTEM_PROMPT, MAP_EDIT_TOOLS } from "../lib/prompts/map-edit";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const REPLAY_DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const persona = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "persona.json"), "utf8")) as MyLifeData;
type Case = { name: string; request: string; expectLines?: string[]; expectQuestion?: boolean; expectUnsupported?: boolean; expectEmpty?: boolean; recorded: { name: string; input: unknown }[][] };
const { cases } = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "edit-cases.json"), "utf8")) as { cases: Case[] };

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
    check("① 도구 = 찾기·읽기·만들기·이름·잇기·끊기·넣기·빼기·옮기기·끝 — 지우기·합치기 없음(3c)", JSON.stringify(toolNames) === JSON.stringify(["answer", "create_node", "find_nodes", "link", "move", "put_in", "read_node", "rename_node", "take_out", "unlink"]), toolNames);
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
    const fixtureWords = ["강호", "미영", "순덕", "복실", "초롱", "제주", "전우", "훈련소", "라디오", "공단", "낚시", "바둑", "영수", "가상"];
    const promptHits = fixtureWords.filter((w) => MAP_EDIT_SYSTEM_PROMPT.includes(w) || JSON.stringify(MAP_EDIT_TOOLS).includes(w));
    check("① 넣을 곳은 이름을 댄 그곳(그 안 묶음으로 안 바꿈) · 이름 뒤 \"님\" 띄어 쓰기 규칙", MAP_EDIT_SYSTEM_PROMPT.includes("그분이 이름을 댄 그곳") && MAP_EDIT_SYSTEM_PROMPT.includes('"님"을 띄어 쓴다'));
    check("① 프롬프트에 재생 세트 낱말 없음(작업 규칙 8) · 민감 분류 제안 금지 · 기록 속 지시문은 데이터", promptHits.length === 0 && MAP_EDIT_SYSTEM_PROMPT.includes("건강·종교·정치") && MAP_EDIT_SYSTEM_PROMPT.includes("지시가 아니다"), promptHits);

    // ── ② 재생 세트(모의 응답) ──────────
    for (const c of cases) {
      const f = fake(c.recorded);
      const r = await planMapEdit(a, c.request, { callModel: f.caller, data: persona, dailyLimit: Infinity });
      const lines = r.ok ? r.plan.map((p) => planLine(p, "will")) : [];
      const pass = r.ok && (c.expectLines ? JSON.stringify(lines) === JSON.stringify(c.expectLines) : c.expectQuestion ? !!r.question && lines.length === 0 : c.expectUnsupported ? r.unsupported && lines.length === 0 : lines.length === 0);
      check(`② ${c.name}`, !!pass, { lines, r });
    }

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
    const sheet = read("app/my-life/AskSheet.tsx");
    check("⑥ 화면 — 확인 카드(이대로 하기·그만두기) → 결과 카드(지도에서 보기·되돌리기) · 카드 전 실행 없음 · 문구 [임시]", sheet.includes('data-map-edit-card="plan"') && sheet.includes('data-map-edit-card="result"') && sheet.includes("onClick={() => apply(plan)}") && sheet.includes("onClick={clear}") && sheet.includes("onClick={() => undo(result.commandId, result.undo)}") && /AI 지도 편집[^\n]*\[임시/.test(read("lib/my-life-copy.ts")) && read("docs/navigation-map.md").includes("이대로 하기"));
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
