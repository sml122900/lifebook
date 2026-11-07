// 지도 질문 답하기 회귀 — docs/phase/custom-graph.md §4.4~§4.6·§6.3 3a · docs/phase/privacy-v1.4.md §1.3(Q137). 유료 모델 호출 0(모의 응답만).
//
//   ① 보내는 칸 계약 — 칸·종류·연결 이름 집합이 문서 표와 같음 · 보내면 안 되는 값(만난 해·태어난 해·메모·주소·좌표·출처·꾸미기)이 모델 요청 어디에도 없음 ·
//      그때의 나 구분 없음 · 목록에 본문 없음 · 발췌 길이 · 이름 속 "|"·줄바꿈 · 처리방침 3항 낱말
//   ② 별칭·큰 지도(Q94) — 같은 지도 = 같은 별칭 · 400개 넘으면 요약 + find_nodes · 안 본 별칭은 읽기·근거 거부
//   ③ 루프 — 도구 3개뿐(읽기 전용) · Sonnet·temperature 0·캐시 표시 · 지도 뒤에 질문 · 마지막 라운드 answer 강제 · 도구 결과 포장 · 없는 도구 · 말로만 답하면 다시 요청
//   ④ 답 검증 — 없는 별칭·근거 0 버림 · 남는 게 없으면 기록 없음 · 바꿔 달라는 말 = 주장 무시 · 모델 실패 = failed · 빈 질문 호출 0 · 프롬프트 예시에 픽스처 낱말 없음
//   ⑤ 재생 세트(모의 응답) — db/test-fixtures/map-agent-replay 전부 기대대로
//   ⑥ 원장·상한·예산 — 질문당 한 줄 TEST_MAP_ASK · 하루 30회 · 예산 넘음 = 호출 0 · 라운드 중 넘으면 멈춤
//   ⑦ 읽기 전용·남의 노드 — 실제 DB 지도로 돌려 전후 같음 · 다른 사용자 이름 안 나옴 · 쓰기 코드 없음 · 액션 첫 줄 auth
//   ⑧ 화면 연결 — 찾기 시트 입구 · 시간 상한 · 이동 지도 · 문구 [임시]
//   ⑨ AI 편집 기록(Q92 B안) — 칸 = 명령·도구·노드 종류·노드 id·시각만 · 90일 지난 행은 쓸 때 삭제(내 행만) · 되돌린 시각(내 행만) · 처리방침 v1.5·공지 예외·동의 버전 유지
//
// 자기 픽스처 계정만 만들고 지운다(test30 접촉 0). 실제 모델 확인은 db/replay-map-agent.ts --run(작업 규칙 10 — 여기서는 안 부름).
// 실행: npx tsx db/test-map-agent.ts

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import type Anthropic from "@anthropic-ai/sdk";

import { deleteAccountTx } from "../lib/account-deletion";
import { prisma } from "../lib/db";
import { askMap, MAP_AGENT_MAX_ROUNDS, MAP_AGENT_MODEL, MAP_ASK_DAILY_LIMIT, type AskMapResult, type ModelCaller } from "../lib/map-agent";
import { buildMapView, EXCERPT_MAX, findNodes, LIST_NODE_LIMIT, mapListText, nodeLine, readNodeData, SENT_FIELDS, SENT_KINDS, SENT_LINKS } from "../lib/map-agent-view";
import { modelId } from "../lib/ai-model";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { MAP_EDIT_LOG_DAYS, markMapEditUndone, recordMapEdit } from "../lib/map-edit-log";
import { noticeProblem, POLICY_NOTICES } from "../lib/policy-notice";
import { getMyLifeData, type MyLifeData } from "../lib/my-life";
import { MAP_AGENT_SYSTEM_PROMPT, MAP_AGENT_TOOLS } from "../lib/prompts/map-agent";
import { saveNodeLink } from "../lib/node-graph";

const ROOT = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");
const REPLAY_DIR = path.join(__dirname, "test-fixtures", "map-agent-replay");
const persona = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "persona.json"), "utf8")) as MyLifeData;
type Case = { name: string; question: string; expectNodes?: string[]; expectNodeCount?: number; allowNodes?: string[]; forbidNodes?: string[]; forbidText?: string[]; expectNoRecord?: boolean; expectChange?: boolean; recorded: { name: string; input: unknown }[][] };
const { cases } = JSON.parse(fs.readFileSync(path.join(REPLAY_DIR, "cases.json"), "utf8")) as { cases: Case[] };

const EMAIL_A = "fixture-map-agent-a@lifebook.invalid";
const EMAIL_B = "fixture-map-agent-b@lifebook.invalid";
const SECRETS = ["1901", "1902", "메모비밀값", "주소비밀값", "37.123456", "127.654321", "naver", "decor-secret", "bodyVersion", "metYear", "birthYear"];

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().join("\u0000") === [...b].sort().join("\u0000");

// ── 모의 모델 ──────────
let seq = 0;
type Use = { name: string; input: unknown };
function fake(rounds: (Use[] | string)[]) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const caller: ModelCaller = async (params) => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = rounds[Math.min(calls.length - 1, rounds.length - 1)];
    const content = typeof r === "string" ? [{ type: "text", text: r, citations: null }] : r.map((u) => ({ type: "tool_use", id: `toolu_${++seq}`, name: u.name, input: u.input }));
    return { id: "msg_fake", type: "message", role: "assistant", model: "fake", content, stop_reason: typeof r === "string" ? "end_turn" : "tool_use", stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } as unknown as Anthropic.Message;
  };
  return { caller, calls };
}
const lastUser = (p: Anthropic.MessageCreateParamsNonStreaming) => JSON.stringify(p.messages[p.messages.length - 1].content);
const okOf = (r: AskMapResult) => (r.ok ? r.answer : null);

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

async function main() {
  process.env.CHAT_V3_DAILY_BUDGET_USD = "1000"; // 오늘 운영 사용량과 무관하게(⑥ 에서만 바꿈)
  await removeFixtures();
  const userA = await makeUser(EMAIL_A, "[fixture] 지도 질문 A");
  const userB = await makeUser(EMAIL_B, "[fixture] 지도 질문 B");
  try {
    const view = buildMapView(persona);
    const list = mapListText(view);

    // ── ① 보내는 칸 계약 ──────────
    const reads = view.nodes.map(readNodeData);
    const fieldsSeen = [...new Set(reads.flatMap((r) => Object.keys(r)))];
    check("① read_node 칸 이름 집합 = 계약(privacy-v1.4 §1.2 — 별칭·종류·이름·연도·관계·발췌·연결)", sameSet(fieldsSeen, SENT_FIELDS) && sameSet(SENT_FIELDS, ["alias", "kind", "name", "years", "relation", "excerpt", "links"]), fieldsSeen);
    check("① 종류 집합 = 계약(그때의 나 구분 없음 — 이야기로)", sameSet([...new Set(view.nodes.map((n) => n.kind))], SENT_KINDS) && !list.text.includes("그때의 나"), [...new Set(view.nodes.map((n) => n.kind))]);
    const linksSeen = [...new Set(view.nodes.flatMap((n) => Object.keys(n.links)))];
    check("① 연결 이름 집합 = 계약", sameSet(linksSeen, SENT_LINKS), linksSeen);
    const everything = [list.text, ...reads.map((r) => JSON.stringify(r)), ...view.nodes.map(nodeLine), ...findNodes(view, {}).map(nodeLine)].join("\n");
    const leaks = SECRETS.filter((s) => everything.includes(s));
    check("① 보내면 안 되는 값(만난 해·태어난 해·메모·주소·좌표·출처·꾸미기)이 목록·read_node·find_nodes 어디에도 없음", leaks.length === 0, leaks);
    const run0 = fake([[{ name: "find_nodes", input: { query: "강호" } }], [{ name: "read_node", input: { alias: "n21" } }], [{ name: "answer", input: { claims: [] } }]]);
    await askMap(userA, "제주도 주소가 어디야?", { callModel: run0.caller, data: persona });
    const reqAll = JSON.stringify(run0.calls);
    const reqLeaks = SECRETS.filter((s) => reqAll.includes(s));
    check("① 실제 모델 요청 전체(지시문·목록·도구 결과)에도 없음", reqLeaks.length === 0 && run0.calls.length === 3, reqLeaks);
    check("① 지도 목록에 본문 없음(발췌는 read_node 만) · 인물 글·항목 글도", !list.text.includes("본문끝표시") && !list.text.includes("고무줄") && !list.text.includes("진돗개") && JSON.stringify(reads).includes("본문끝표시") && JSON.stringify(reads).includes("진돗개"));
    const longData: MyLifeData = { ...persona, places: [], placeGroups: [], groups: [], custom: undefined, events: [], people: [{ id: "x", name: "이름|가\n운데", relation: "관|계", metYear: null, birthYear: null, memo: null, groupIds: [], body: "가".repeat(5000) }] };
    const longView = buildMapView(longData);
    check("① 발췌 상한 · 이름·관계의 \"|\"·줄바꿈은 칸·줄을 만들지 않음", longView.nodes[0].excerpt!.length === EXCERPT_MAX + 1 && nodeLine(longView.nodes[0]) === "n1|사람|이름 가 운데|관 계", nodeLine(longView.nodes[0]));
    check("① 예시 목록 꼴", list.text.includes("n12|사람|강호|전우") && list.text.includes("n3|시기|군 입대|1977~1980|사람:n12") && list.text.includes("n9|이야기|전우를 다시 만난 날|시기:n3,n4|사람:n12") && list.text.includes("n18|모임|전우회|구성원:n12") && list.text.includes("인물록 표시 이름: 우리 사람들"), list.text);
    const privacy = read("app/privacy/page.tsx");
    check("① 처리방침 3항이 보내는 칸을 적고 있음(인생 시기 이름·연도 · 인물 이름·관계 · 장소 이름 · 모임·장소 묶음 이름 · 직접 만든 분류 · 기록 사이의 연결 · 질문 · 인물·항목 글) · 30일 · 학습 미사용",
      ["인생 시기 이름·연도", "인물 이름·관계", "장소 이름", "모임·장소 묶음 이름", "직접 만든 분류와 그 안의 묶음·항목 이름", "기록 사이의 연결", "AI에게 하신 기록 정리 요청과 질문", "인물·항목에 대해 적으신 글", "30일 이내", "모델 학습 미사용"].every((w) => privacy.includes(w)));

    // ── ② 별칭·큰 지도 ──────────
    const again = buildMapView(JSON.parse(JSON.stringify(persona)) as MyLifeData);
    check("② 같은 지도 = 같은 별칭(앞부분 캐시가 그대로 맞음) · 실제 id 는 목록에 없음", mapListText(again).text === list.text && !list.text.includes("p-hoa") && !list.text.includes("s-well"));
    const big: MyLifeData = { ...persona, people: Array.from({ length: LIST_NODE_LIMIT + 5 }, (_, i) => ({ id: `big${i}`, name: `사람${i}`, relation: null, metYear: null, birthYear: null, memo: null, groupIds: [], body: "" })) };
    const bigList = mapListText(buildMapView(big));
    check("② 400개 넘으면 요약(개수 + 카테고리 줄만) — 사람 줄 없음", bigList.text.startsWith("[지도 요약]") && !bigList.text.includes("사람7") && bigList.text.includes("사람 405개") && bigList.text.includes("|카테고리|취미|"), bigList.text.slice(0, 300));
    const bigRun = fake([
      [{ name: "read_node", input: { alias: "n40" } }],
      [{ name: "find_nodes", input: { query: "사람7" } }],
      [{ name: "answer", input: { claims: [{ text: "안 본 노드예요", cardIds: ["n300"] }, { text: "본 노드예요", cardIds: [] }] } }],
    ]);
    const bigR = await askMap(userA, "사람7 누구야?", { callModel: bigRun.caller, data: big });
    check("② 안 본 별칭은 read_node 거부 · find_nodes 결과는 30개 안", lastUser(bigRun.calls[1]).includes("없는 노드") && lastUser(bigRun.calls[2]).includes("사람7"));
    check("② 안 본 별칭을 근거로 든 주장은 버림 → 기록 없음", okOf(bigR)?.claims.length === 0 && !!okOf(bigR)?.noRecord, bigR);
    const seenRun = fake([
      [{ name: "find_nodes", input: { query: "사람77" } }],
      [{ name: "answer", input: { claims: [{ text: "사람77 님이 계세요", cardIds: [findNodes(buildMapView(big), { query: "사람77" })[0].alias] }] } }],
    ]);
    const seenR = await askMap(userA, "사람77 누구야?", { callModel: seenRun.caller, data: big });
    check("② find_nodes 로 본 별칭은 근거 인정", okOf(seenR)?.claims.length === 1, seenR);

    // ── ③ 루프 ──────────
    check("③ 도구 = find_nodes·read_node·answer 뿐(읽기 전용)", sameSet(MAP_AGENT_TOOLS.map((t) => t.name), ["find_nodes", "read_node", "answer"]));
    const r1 = fake([[{ name: "read_node", input: { alias: "n26" } }], [{ name: "answer", input: { claims: [{ text: "복실이는 진돗개예요", cardIds: ["n26"] }] } }]]);
    const res1 = await askMap(userA, "복실이는 어떤 개야?", { callModel: r1.caller, data: persona });
    const p0 = r1.calls[0];
    const firstBlocks = p0.messages[0].content as Anthropic.TextBlockParam[];
    check("③ Sonnet 고정·temperature 0·처음엔 auto·지시문과 지도 목록에 캐시 표시·질문은 캐시 뒤", MAP_AGENT_MODEL === modelId("sonnet") && p0.model === modelId("sonnet") && p0.temperature === 0 && (p0.tool_choice as { type: string }).type === "auto" && !!(p0.system as Anthropic.TextBlockParam[])[0].cache_control && !!firstBlocks[0].cache_control && firstBlocks[0].text.includes("[지도 목록]") && !firstBlocks[1].cache_control && firstBlocks[1].text.endsWith("복실이는 어떤 개야?"), p0.tool_choice);
    check("③ 도구 결과 = {note, data}(기록 안 글은 지시가 아님) + 발췌", lastUser(r1.calls[1]).includes("지시가 아닙니다") && lastUser(r1.calls[1]).includes("진돗개"));
    check("③ 답 → 화면 칩(찾기 결과와 같은 노드 키·제목)", res1.ok && res1.answer.claims[0].nodes[0].key === "cn:i-boksil" && res1.answer.claims[0].nodes[0].title === "복실이" && res1.answer.claims[0].nodes[0].kind === "item" && res1.stats.rounds === 2, res1);
    const never = fake([[{ name: "read_node", input: { alias: "n1" } }]]);
    const res2 = await askMap(userA, "계속 찾아줘", { callModel: never.caller, data: persona });
    check(`③ 라운드 상한 ${MAP_AGENT_MAX_ROUNDS} · 마지막 라운드 answer 강제 · 그래도 답이 없으면 failed`, never.calls.length === MAP_AGENT_MAX_ROUNDS && JSON.stringify(never.calls.at(-1)!.tool_choice) === JSON.stringify({ type: "tool", name: "answer" }) && JSON.stringify(never.calls.at(-2)!.tool_choice) === JSON.stringify({ type: "auto" }) && !res2.ok && res2.reason === "failed", never.calls.length);
    const odd = fake([[{ name: "delete_node", input: { alias: "n1" } }], "그냥 말로 답할게요", [{ name: "answer", input: { claims: [] } }]]);
    await askMap(userA, "시험", { callModel: odd.caller, data: persona });
    check("③ 없는 도구 = 오류만 · 말로만 답하면 answer 로 내 달라고 다시", lastUser(odd.calls[1]).includes("없는 도구") && lastUser(odd.calls[2]).includes("answer 도구로만"));

    // ── ④ 답 검증 ──────────
    const v1 = fake([[{ name: "answer", input: { claims: [{ text: "있는 근거", cardIds: ["n1", "n999"] }, { text: "없는 근거뿐", cardIds: ["n999"] }, { text: "근거 없음", cardIds: [] }] } }]]);
    const rv1 = await askMap(userA, "출생 언제야?", { callModel: v1.caller, data: persona });
    check("④ 없는 별칭은 근거에서 빠지고, 근거 0인 주장은 버림(화면에 안 나옴)", rv1.ok && rv1.answer.claims.length === 1 && rv1.answer.claims[0].nodes.length === 1 && rv1.stats.submittedClaims === 3 && rv1.stats.droppedClaims === 2, rv1);
    const v2 = fake([[{ name: "answer", input: { claims: [{ text: "지어낸 말", cardIds: ["n999"] }] } }]]);
    const rv2 = await askMap(userA, "아무거나", { callModel: v2.caller, data: persona });
    check("④ 남는 게 없으면 기록 없음", rv2.ok && rv2.answer.claims.length === 0 && !!rv2.answer.noRecord, rv2);
    const v3 = fake([[{ name: "answer", input: { claims: [{ text: "지웠어요", cardIds: ["n27"] }], asksChange: true } }]]);
    const rv3 = await askMap(userA, "초롱이 지워 줘", { callModel: v3.caller, data: persona });
    check("④ 바꿔 달라는 말 — \"했다\"는 주장이 와도 화면에 안 나감", rv3.ok && rv3.answer.asksChange && rv3.answer.claims.length === 0 && !rv3.answer.noRecord, rv3);
    const v4 = fake([[{ name: "answer", input: { claims: [], noRecord: { topic: "이것", followUpQuestion: "1999년에 어떠셨나요? 그리고 또요?" } } }]]);
    const rv4 = await askMap(userA, "없는 얘기", { callModel: v4.caller, data: persona });
    check("④ 후속 질문 규칙(한 문장·지도에 없는 연도) 어기면 그 질문만 버림", rv4.ok && rv4.answer.noRecord?.followUpQuestion === null, rv4);
    const v5 = fake([[{ name: "answer", input: { claims: [{ text: "복실이(n26)와 초롱이(n27, n26)가 있어요", cardIds: ["n26", "n27"] }, { text: "n95 마스크 이야기예요", cardIds: ["n1"] }] } }]]);
    const rv5b = await askMap(userA, "별칭 시험", { callModel: v5.caller, data: persona });
    check("④ 문장에 적힌 별칭은 화면에 안 나감(괄호 꼴 — 실제 모델에서 나온 것) · 괄호 없는 낱말은 그대로 · 지운 문장 수 기록", rv5b.ok && rv5b.answer.claims[0].text === "복실이와 초롱이가 있어요." && rv5b.answer.claims[1].text === "n95 마스크 이야기예요." && rv5b.stats.aliasInText === 1, rv5b);
    const boom: ModelCaller = async () => {
      throw new Error("모의 실패");
    };
    const rv5 = await askMap(userA, "실패 시험", { callModel: boom, data: persona });
    check("④ 모델 실패 = failed(기록 없다고 말하지 않음)", !rv5.ok && rv5.reason === "failed");
    let calledEmpty = 0;
    const rv6 = await askMap(userA, "   ", { callModel: async () => { calledEmpty += 1; throw new Error("no"); }, data: persona });
    check("④ 빈 질문 = 호출 0", !rv6.ok && rv6.reason === "empty" && calledEmpty === 0);
    const fixtureWords = ["강호", "미영", "순덕", "복실", "초롱", "제주", "전우", "훈련소", "라디오", "공단", "낚시", "유럽"];
    const promptHits = fixtureWords.filter((w) => MAP_AGENT_SYSTEM_PROMPT.includes(w) || JSON.stringify(MAP_AGENT_TOOLS).includes(w));
    check("④ 프롬프트에 재생 세트 낱말 없음(작업 규칙 8)", promptHits.length === 0, promptHits);
    check("④ 도구 결과 안내문에 내부 용어 \"화자\" 없음 · 이름 뒤 \"님\" 띄어 쓰기 규칙", !read("lib/map-agent.ts").includes("화자") && MAP_AGENT_SYSTEM_PROMPT.includes('"님"을 띄어 쓴다'));
    check("④ 답 문장 규칙 — \"화자\"는 금지 목록에만 · \"-요\" 말투 · 번호는 cardIds 에만", (MAP_AGENT_SYSTEM_PROMPT.match(/화자/g) ?? []).length === 1 && MAP_AGENT_SYSTEM_PROMPT.includes('모든 문장을 "-요"로 끝낸다') && MAP_AGENT_SYSTEM_PROMPT.includes("번호는 cardIds 에만 넣는다"));

    // ── ⑤ 재생 세트(모의 응답 — 코드 경로만) ──────────
    for (const c of cases) {
      const f = fake(c.recorded);
      const r = await askMap(userA, c.question, { callModel: f.caller, data: persona });
      const cited = r.ok ? r.answer.claims.flatMap((cl) => cl.nodes.map((n) => `${kindLabel(n.kind)}:${n.title}`)) : [];
      const pass =
        r.ok &&
        (c.expectNodes ?? []).every((n) => cited.includes(n)) &&
        (c.expectNodeCount === undefined || cited.filter((n) => n === c.expectNodes![0]).length === c.expectNodeCount) &&
        !(c.forbidNodes ?? []).some((n) => cited.includes(n)) &&
        cited.every((n) => (c.expectNodes ?? []).includes(n) || (c.allowNodes ?? []).includes(n)) &&
        (!c.expectNoRecord || !!r.answer.noRecord) &&
        (!c.expectChange || r.answer.asksChange) &&
        !(c.forbidText ?? []).some((w) => JSON.stringify(r.answer).includes(w));
      check(`⑤ ${c.name}`, !!pass, { cited, r });
    }

    // ── ⑥ 원장·상한·예산 ──────────
    await prisma.chatV3Usage.deleteMany({ where: { userId: userB } });
    const led = fake([[{ name: "read_node", input: { alias: "n1" } }], [{ name: "answer", input: { claims: [] } }]]);
    await askMap(userB, "원장 시험", { callModel: led.caller, data: persona });
    const rows = await prisma.chatV3Usage.findMany({ where: { userId: userB }, select: { purpose: true, model: true } });
    check("⑥ 질문 하나에 원장 한 줄(라운드 2번이어도) · 테스트 계정 = TEST_MAP_ASK · Sonnet", rows.length === 1 && rows[0].purpose === "TEST_MAP_ASK" && rows[0].model === modelId("sonnet"), rows);
    const none = fake([]);
    const failCall: ModelCaller = async () => {
      throw new Error("x");
    };
    await askMap(userB, "실패는 안 셈", { callModel: failCall, data: persona });
    check("⑥ 모델을 한 번도 못 불렀으면 원장 없음(상한에 안 들어감)", (await prisma.chatV3Usage.count({ where: { userId: userB } })) === 1 && none.calls.length === 0);
    await prisma.chatV3Usage.createMany({ data: Array.from({ length: MAP_ASK_DAILY_LIMIT - 1 }, () => ({ userId: userB, purpose: "MAP_ASK", model: "x", costMicroUsd: 0 })) });
    let calledLimit = 0;
    const rLimit = await askMap(userB, "31번째", { callModel: async () => { calledLimit += 1; throw new Error("no"); }, data: persona });
    check(`⑥ 사용자당 하루 ${MAP_ASK_DAILY_LIMIT}회 — 넘으면 호출 0(MAP_ASK·TEST_MAP_ASK 합산)`, !rLimit.ok && rLimit.reason === "limit" && calledLimit === 0, rLimit);
    await prisma.chatV3Usage.deleteMany({ where: { userId: userB } });
    process.env.CHAT_V3_DAILY_BUDGET_USD = "0";
    let calledBudget = 0;
    const rBudget = await askMap(userB, "예산", { callModel: async () => { calledBudget += 1; throw new Error("no"); }, data: persona });
    check("⑥ 전역 하루 예산을 넘으면 호출 0", !rBudget.ok && rBudget.reason === "budget" && calledBudget === 0, rBudget);
    process.env.CHAT_V3_DAILY_BUDGET_USD = "1000";
    const mid = fake([[{ name: "read_node", input: { alias: "n1" } }], [{ name: "answer", input: { claims: [] } }]]);
    const midCaller: ModelCaller = async (p) => {
      const out = await mid.caller(p);
      process.env.CHAT_V3_DAILY_BUDGET_USD = "0"; // 첫 라운드 뒤 예산이 찼다
      return out;
    };
    const rMid = await askMap(userB, "라운드 중", { callModel: midCaller, data: persona });
    process.env.CHAT_V3_DAILY_BUDGET_USD = "1000";
    check("⑥ 라운드마다 예산 확인 — 중간에 넘으면 멈춤(쓴 만큼은 원장에)", !rMid.ok && rMid.reason === "budget" && mid.calls.length === 1 && (await prisma.chatV3Usage.count({ where: { userId: userB } })) === 1, rMid);

    // ── ⑦ 읽기 전용·남의 노드 ──────────
    const now = new Date();
    const evA = await prisma.lifeEvent.create({ data: { userId: userA, type: "BIRTH", label: "A의 출생", year: 1960, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 0, personAsked: true }, select: { id: true } });
    const peA = await prisma.person.create({ data: { userId: userA, name: "가상인물갑", relation: "이웃", metYear: 1901, memo: "메모비밀값" }, select: { id: true } });
    const plA = await prisma.place.create({ data: { userId: userA, name: "가상장소갑", address: "주소비밀값", lat: 37.123456, lng: 127.654321, source: "naver" }, select: { id: true } });
    await saveNodeLink(userA, { type: "LIFE_EVENT", id: evA.id }, { type: "PLACE", id: plA.id });
    await prisma.person.create({ data: { userId: userB, name: "다른사람비밀이름", relation: "이웃" } });
    const snapshot = async () => JSON.stringify(await getMyLifeData(userA));
    const before = await snapshot();
    const db = fake([[{ name: "find_nodes", input: { query: "다른사람비밀이름" } }], [{ name: "read_node", input: { alias: "n999" } }], [{ name: "answer", input: { claims: [{ text: "이웃이 계세요", cardIds: ["n2"] }] } }]]);
    const rDb = await askMap(userA, "이웃이 누구야?", { callModel: db.caller });
    const reqDb = JSON.stringify(db.calls);
    check("⑦ 실제 DB 지도 — 칩 = 그 사람 · 보내면 안 되는 값 없음", rDb.ok && rDb.answer.claims[0]?.nodes[0]?.key === `pe:${peA.id}` && reqDb.includes("가상인물갑") && reqDb.includes("가상장소갑") && !["1901", "메모비밀값", "주소비밀값", "37.123456", "naver"].some((s) => reqDb.includes(s)), rDb);
    check("⑦ 남의 노드 — 다른 사용자 이름이 요청·도구 결과에 없음(찾아도 빈 결과)", !reqDb.includes("|다른사람비밀이름") && lastUser(db.calls[1]).includes('\\"nodes\\":[]'), lastUser(db.calls[1]));
    check("⑦ 지도 전후 같음(모델이 쓰기 도구 이름을 불러도 아무것도 안 바뀜)", before === (await snapshot()));
    const agentSrc = read("lib/map-agent.ts") + read("lib/map-agent-view.ts") + read("lib/prompts/map-agent.ts");
    const writes = agentSrc.match(/prisma\.\w+\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\b|\$executeRaw|saveNodeLink|removeNodeLink|from "\.\/my-life-edit"|from "\.\/custom-node"/g);
    check("⑦ 쓰기 코드 없음(원장 recordChatUsage 만) · 질문을 로그·DB 에 안 남김", writes === null && !/console\.(log|info|warn)/.test(agentSrc) && read("lib/map-agent.ts").includes("await recordChatUsage(opts.userId, opts.purpose, {"), writes);
    const actions = read("app/my-life/actions.ts");
    const fn = actions.slice(actions.indexOf("export async function askMapAction"));
    check("⑦ 액션 첫 줄 auth · 사용자 지정은 세션에서만", fn.split("\n")[1].includes("await requireUserId()") && fn.slice(0, 300).includes("askMap(userId, question)"), fn.slice(0, 200));

    // ── ⑧ 화면 연결 ──────────
    const view2 = read("app/my-life/MyLifeView.tsx");
    check("⑧ 찾기 시트 안 입구 → 시트 · 칩 = 찾기와 같은 goTo · 지도 편집 버튼 없음", view2.includes("onAsk={openAsk}") && view2.includes("<AskSheet") && view2.includes('aria-labelledby="mylife-ask-title"') && (read("app/my-life/AskSheet.tsx") + read("app/my-life/AskCards.tsx")).includes("onGo(n.key, n.eventId)") && read("app/my-life/AskSheet.tsx").includes("<AnswerClaims claims={view.answer.claims} onGo={onGo} />") && !(read("app/my-life/AskSheet.tsx") + read("app/my-life/AskCards.tsx")).includes("saveNodeLink")); // 답 칩은 AI 시트·튜토리얼이 같이 쓰는 ./AskCards
    check("⑧ 칩·찾기 → 지도 이동은 선택 줄이 생긴 뒤에(첫 선택에 지도 상자 높이가 바뀌며 이동이 끊기던 것 — 2026-11-07 실측)", view2.includes("requestAnimationFrame(() => requestAnimationFrame(() => apiRef.current?.zoomToElement(el, Math.max(stateRef.current.scale, 1), 300)))"));
    check("⑧ 서버 함수 시간 상한(여러 라운드) · 이동 지도 · 문구 [임시]", read("app/my-life/page.tsx").includes("export const maxDuration = 60;") && read("docs/navigation-map.md").includes("AI에게 부탁하기") && /지도 질문 답하기[^\n]*\[임시/.test(read("lib/my-life-copy.ts")));
    check("⑧ 안 보내는 칸은 화면에는 그대로(만난 해 등은 패널·찾기가 씀 — getMyLifeData 무변)", read("lib/my-life.ts").includes("metYear: p.metYear"));

    // ── ⑨ AI 편집 기록(Q92 B안) ──────────
    const DAY = 86400000;
    const old = (userId: string, days: number) => prisma.mapEditLog.create({ data: { userId, commandId: `old-${days}`, tool: "link", nodeType: "PERSON", nodeId: "x", createdAt: new Date(Date.now() - days * DAY) } });
    await old(userA, MAP_EDIT_LOG_DAYS + 1);
    await old(userB, MAP_EDIT_LOG_DAYS + 1);
    await old(userA, MAP_EDIT_LOG_DAYS - 1);
    await recordMapEdit(userA, { commandId: "c1", tool: "put_in", node: { type: "PERSON", id: peA.id } });
    await recordMapEdit(userA, { commandId: "c1", tool: "link", node: { type: "PLACE", id: plA.id } });
    const logsA = await prisma.mapEditLog.findMany({ where: { userId: userA }, orderBy: { createdAt: "asc" } });
    const row = logsA.find((l) => l.tool === "put_in")!;
    check("⑨ 기록 칸 = 명령·도구·노드 종류·노드 id·시각·되돌린 시각뿐(문장·이름·본문 칸 없음)", sameSet(Object.keys(row), ["id", "userId", "commandId", "tool", "nodeType", "nodeId", "createdAt", "undoneAt"]) && row.commandId === "c1" && row.nodeType === "PERSON" && row.nodeId === peA.id && row.undoneAt === null, Object.keys(row));
    check("⑨ 90일 — 쓸 때 지난 행 삭제 · 안 지난 행은 그대로 · 다른 사용자 행은 안 건드림", !logsA.some((l) => l.commandId === `old-${MAP_EDIT_LOG_DAYS + 1}`) && logsA.some((l) => l.commandId === `old-${MAP_EDIT_LOG_DAYS - 1}`) && (await prisma.mapEditLog.count({ where: { userId: userB, commandId: `old-${MAP_EDIT_LOG_DAYS + 1}` } })) === 1, logsA.map((l) => l.commandId));
    await markMapEditUndone(userB, "c1");
    const notMine = await prisma.mapEditLog.count({ where: { userId: userA, commandId: "c1", undoneAt: { not: null } } });
    await markMapEditUndone(userA, "c1");
    check("⑨ 되돌린 시각 — 그 명령의 내 행만", notMine === 0 && (await prisma.mapEditLog.count({ where: { userId: userA, commandId: "c1", undoneAt: { not: null } } })) === 2);
    const v15 = POLICY_NOTICES.find((n) => n.version === "v1.5");
    const privacyNow = read("app/privacy/page.tsx").replace(/\s+/g, " ");
    check("⑨ 처리방침 v1.5 — 1항 마에 90일·남기지 않는 것 · 공지 등록(오늘 시행 = 성민 승인 사유) · 동의 버전 5 유지 · 칸 설명이 스키마와 같음",
      !!v15 && noticeProblem(v15) === null && v15.noticeDay === v15.effectiveDay && (v15.leadException ?? "").includes("성민") && (v15.leadException ?? "").includes("실사용자 0") && CURRENT_CONSENT_VERSION === 5 &&
        privacyNow.includes("(작업 이름·기록 종류·기록 번호·시각·되돌린 시각)를 90일 동안 보관한 뒤 지웁니다. 부탁하신 말씀과 기록 내용은 이 기록에 남기지 않습니다.") && privacyNow.includes("· 시행일: 2026년 11월 7일"));
  } finally {
    await removeFixtures();
    console.log("정리 — 픽스처 계정", await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B] } } }));
  }
  console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
  process.exit(failed === 0 ? 0 : 1);
}

const KIND: Record<string, string> = { event: "시기", story: "이야기", person: "사람", group: "모임", place: "장소", placeGroup: "장소 묶음", category: "카테고리", customGroup: "묶음", item: "항목" };
const kindLabel = (k: string) => KIND[k] ?? k;

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
