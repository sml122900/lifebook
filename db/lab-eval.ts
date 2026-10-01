// 기억 에이전트 — 골든셋 평가기. R1: --mode retrieval (검색만, 생성 없음). R2: --mode answer (에이전트 답).
//
// retrieval: 골든셋(db/lab/golden/persona-a.ts, 동결)의 NO_RECORD 를 뺀 24문항을 질문 그대로
// searchWithQuestion(연구실 검색 디버그와 같은 경로, LLM 0 — 질문 임베딩만)에 넣고 상위 8장의
// 원본으로 expected 그룹 적중을 센다. recall = 적중 그룹 / 전체 그룹, 문항 평균.
// 기준 = db/lab/criteria.ts LAB_CRITERIA.R1.retrievalRecallAt8(동결). 리포트는 합성 데이터만이라
// db/lab/reports/ 에 JSON 으로 남긴다. 페르소나 원장·카드는 읽기만(테스트 격리 규칙).
//
// 실행: npx tsx db/lab-eval.ts --persona a --mode retrieval
//       npx tsx db/lab-eval.ts --persona a --mode answer --repeat 3 [--concurrency 3]

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
import { AGENT_MODEL, runAgent } from "../lib/lab/agent";
import { judgeClaims } from "../lib/lab/judge";
import { searchWithQuestion } from "../lib/lab/search";
import {
  kstDate,
  loadSourceUnits,
  normText,
  type SourceUnit,
} from "../lib/lab/sources";
import { LAB_CRITERIA } from "./lab/criteria";
import { GOLDEN_PERSONA_A, type GoldenCategory } from "./lab/golden/persona-a";
import { PERSONA_A, type PersonaSourceKey } from "./lab/personas/persona-a";

const K = 8;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const unitKey = (u: { sourceType: string; sourceId: string }) =>
  `${u.sourceType}\u0000${u.sourceId}`;

// 페르소나 key → 색인 원본(유형+id). 시드가 같으면 같은 원본을 가리킨다.
function mapPersonaKeys(units: SourceUnit[]): Map<PersonaSourceKey, string> {
  const map = new Map<PersonaSourceKey, string>();
  const find = (pred: (u: SourceUnit) => boolean) => units.find(pred);
  for (const ev of PERSONA_A.skeleton) {
    const u = find(
      (x) => x.sourceType === "SKELETON_EVENT" && x.extra.type === ev.type,
    );
    if (u) map.set(ev.key, unitKey(u));
  }
  for (const ep of PERSONA_A.episodes) {
    const u = find(
      (x) =>
        x.sourceType === "EPISODE" && x.fields.content === normText(ep.content),
    );
    if (u) map.set(ep.key, unitKey(u));
  }
  for (const m of PERSONA_A.lifeMemories) {
    const u = find(
      (x) =>
        x.sourceType === "LIFE_EVENT_MEMORY" &&
        x.fields.content === normText(m.content),
    );
    if (u) map.set(m.key, unitKey(u));
  }
  for (const e of PERSONA_A.eraMemories) {
    const u = find(
      (x) =>
        x.sourceType === "ERA_MEMORY" &&
        x.fields.content === normText(e.content),
    );
    if (u) map.set(e.key, unitKey(u));
  }
  for (const p of PERSONA_A.people) {
    const u = find((x) => x.sourceType === "PERSON_MEMO" && x.title === p.name);
    if (u) map.set(p.key, unitKey(u));
  }
  const profile = find((x) => x.sourceType === "PROFILE");
  if (profile) map.set("PROFILE", unitKey(profile));
  return map;
}

async function retrieval() {
  const userId = PERSONA_A.userId;
  const runId = `eval:retrieval:${new Date().toISOString().slice(0, 19)}`;
  const units = await loadSourceUnits(userId);
  const keyToUnit = mapPersonaKeys(units);
  const unitToKey = new Map([...keyToUnit].map(([k, u]) => [u, k]));
  const allKeys = [
    ...PERSONA_A.skeleton.map((x) => x.key),
    ...PERSONA_A.episodes.map((x) => x.key),
    ...PERSONA_A.lifeMemories.map((x) => x.key),
    ...PERSONA_A.eraMemories.map((x) => x.key),
    ...PERSONA_A.people.map((x) => x.key),
    "PROFILE" as const,
  ];
  const unmapped = allKeys.filter((k) => !keyToUnit.has(k));

  const items = GOLDEN_PERSONA_A.filter((g) => g.expected.length > 0);
  const results: {
    id: string;
    category: GoldenCategory;
    question: string;
    expected: readonly (readonly PersonaSourceKey[])[];
    groupHits: boolean[];
    recall: number;
    timeHint: { yearFrom: number; yearTo: number } | null;
    top: { key: string; summary: string; final: number }[];
  }[] = [];
  for (const g of items) {
    const res = await searchWithQuestion(userId, {
      query: g.question,
      limit: K,
      refId: runId,
    });
    const top = res.hits.map((h) => ({
      key:
        unitToKey.get(unitKey(h)) ??
        `${h.sourceType}:${h.sourceId.slice(0, 6)}`,
      summary: h.summary,
      final: h.scores.final,
    }));
    const topKeys = new Set(top.map((t) => t.key));
    const groupHits = g.expected.map((grp) => grp.some((k) => topKeys.has(k)));
    const recall = groupHits.filter(Boolean).length / g.expected.length;
    results.push({
      id: g.id,
      category: g.category,
      question: g.question,
      expected: g.expected,
      groupHits,
      recall,
      timeHint: res.timeHint,
      top,
    });
  }

  const mean = (xs: number[]) =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  const overall = mean(results.map((r) => r.recall));
  const categories = [
    ...new Set(results.map((r) => r.category)),
  ] as GoldenCategory[];
  const byCategory = Object.fromEntries(
    categories.map((c) => {
      const rs = results.filter((r) => r.category === c);
      return [
        c,
        {
          items: rs.length,
          recall: Number(mean(rs.map((r) => r.recall)).toFixed(3)),
        },
      ];
    }),
  );
  const cost = await prisma.labUsage.aggregate({
    _sum: { costMicroUsd: true },
    _count: { _all: true },
    where: { refId: runId },
  });
  const threshold = LAB_CRITERIA.R1.retrievalRecallAt8;
  const pass = overall >= threshold;

  console.log(
    `retrieval 평가 · 페르소나 A · 문항 ${results.length}(NO_RECORD 제외) · top-${K}`,
  );
  console.log(
    `recall@${K} 전체: ${overall.toFixed(3)} (기준 ≥ ${threshold}) → ${pass ? "PASS" : "FAIL"}`,
  );
  console.log("유형별:", JSON.stringify(byCategory));
  // 리포트 규칙(2026-10-01): recall@1·@3·@8 · 첫 등장 평균 순위 · 코퍼스 규모를 늘 함께 남긴다
  // (카드 수가 적으면 top-8 이 쉽게 가득 차므로). 기준 판정은 동결 항목(recall@8)으로만.
  const recallAt = (r: (typeof results)[number], k: number) =>
    r.expected.filter((grp) =>
      grp.some((key) => r.top.slice(0, k).some((t) => t.key === key)),
    ).length / r.expected.length;
  const firstRanks = results.map((r) => {
    const i = r.top.findIndex((t) =>
      r.expected.flat().includes(t.key as PersonaSourceKey),
    );
    return i < 0 ? K + 1 : i + 1;
  });
  const corpusCards = await prisma.memoryCard.count({
    where: { userId, unit: { status: "ACTIVE" } },
  });
  const ranking = {
    recallAt1: Number(mean(results.map((r) => recallAt(r, 1))).toFixed(3)),
    recallAt3: Number(mean(results.map((r) => recallAt(r, 3))).toFixed(3)),
    recallAt8: Number(overall.toFixed(3)),
    meanFirstRank: Number(mean(firstRanks).toFixed(2)),
    corpusCards,
    corpusSources: units.length,
  };
  console.log(
    `순위 지표(기준 아님 — 판정은 recall@8): recall@1 ${ranking.recallAt1} · recall@3 ${ranking.recallAt3} · recall@8 ${ranking.recallAt8} · 기대 원본 첫 등장 평균 순위 ${ranking.meanFirstRank}(못 찾으면 ${K + 1}) · 코퍼스 카드 ${corpusCards}장(원본 ${units.length}건)`,
  );
  console.log(
    `매핑 안 된 페르소나 원본(카드 대상 아님): ${unmapped.join(", ") || "-"}`,
  );
  console.log(
    `질문 임베딩 ${cost._count._all}회 · $${((cost._sum.costMicroUsd ?? 0) / 1e6).toFixed(5)}`,
  );
  const failures = results.filter((r) => r.recall < 1);
  console.log(`\n실패 문항 ${failures.length}개(그룹 하나라도 못 찾음):`);
  for (const f of failures) {
    console.log(
      `- ${f.id} [${f.category}] ${f.question}  recall=${f.recall.toFixed(2)}${f.timeHint ? ` 힌트 ${f.timeHint.yearFrom}~${f.timeHint.yearTo}` : ""}`,
    );
    console.log(
      `  기대: ${f.expected.map((g, i) => `[${g.join("|")}]${f.groupHits[i] ? "✓" : "✗"}`).join(" ")}`,
    );
    f.top.forEach((t, i) =>
      console.log(`  ${i + 1}. ${t.key} — ${t.summary.slice(0, 50)}`),
    );
  }

  const dir = path.join(__dirname, "lab", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `r1-retrieval-${kstDate(new Date())}.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify({ runId, persona: "a", k: K, threshold, overall, pass, ranking, byCategory, unmapped, results }, null, 2)}\n`,
  );
  console.log(
    `\n리포트: ${path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/")}`,
  );
  return pass;
}

// ── R2-4: --mode answer ─────────────────────────────────────────────
// 골든셋 27문항을 질문 그대로 에이전트(runAgent, source=EVAL)에 넣고 규칙 채점한다.
// 판정은 LAB_CRITERIA.R2(동결)로만: 비율 지표는 반복 평균, 개수 지표(required/of)는 매 회 충족.
// 보조 지표(기준 아님): 근거 2개 이상 단 주장 수, Sonnet 판정기(lib/lab/judge.ts) 주장 단위 pass/fail.
// 정답 규칙(문항별):
//   FACT·PERIOD·PERSON·FALSE_PREMISE·PREFERENCE: mustInclude 전부 · mustNotInclude 0 · mustNotCite 인용 0
//     · 순수 기록 없음(근거 있는 주장 0) 아님
//   NO_RECORD: 기록 없음 답(noRecord) · mustNotInclude 0 · mustNotCite 인용 0
//   CONFLICT: 위 규칙 + expected 그룹 전부 인용(양쪽 기록)
// 인용 정밀도 = expected ∪ alsoAcceptable 원본을 가리킨 인용 카드 / 전체 인용 카드(27문항 합).
// 인용 재현율 = 인용된 expected 그룹 / 전체 그룹(expected 있는 24문항 합).
// 잘못된 "없음" = expected 있는 24문항 중 순수 기록 없음으로 답한 비율.

type RunRec = {
  repeat: number;
  id: string;
  category: GoldenCategory;
  question: string;
  text: string;
  citedKeys: string[];
  groupHits: boolean[];
  pass: boolean;
  checks: {
    mustInclude: boolean;
    mustNotInclude: boolean;
    mustNotCite: boolean;
    noRecord: boolean;
    pureNoRecord: boolean;
    allGroupsCited: boolean;
  };
  goodCites: number;
  cites: number;
  submittedClaims: number;
  droppedClaims: number;
  droppedCitations: number;
  followUpRejected: string | null;
  multiCiteClaims: number;
  judge: {
    claims: number;
    supported: number;
    failures: { claim: string; unsupported: string | null }[];
  };
  rounds: number;
  costMicroUsd: number;
  judgeCostMicroUsd: number;
  error: string | null;
};

async function pool<T>(items: T[], size: number, fn: (t: T) => Promise<void>) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) await fn(items[i++]);
    }),
  );
}

async function answerMode(repeats: number, concurrency: number) {
  const userId = PERSONA_A.userId;
  const stamp = new Date().toISOString().slice(0, 19);
  const units = await loadSourceUnits(userId);
  const unitToKey = new Map([...mapPersonaKeys(units)].map(([k, u]) => [u, k]));
  const cardRows = await prisma.memoryCard.findMany({
    where: { userId },
    select: { id: true, sourceType: true, sourceId: true },
  });
  const keyOfCard = new Map(
    cardRows.map((c) => [
      c.id,
      unitToKey.get(unitKey(c)) ?? `?${c.sourceType}`,
    ]),
  );

  const tasks = Array.from({ length: repeats }, (_, r) =>
    GOLDEN_PERSONA_A.map((g) => ({ repeat: r + 1, g })),
  ).flat();
  const recs: RunRec[] = [];
  let done = 0;

  await pool(tasks, concurrency, async ({ repeat, g }) => {
    const refId = `eval:answer:${stamp}:r${repeat}:${g.id}`;
    const r = await runAgent(userId, g.question, { source: "EVAL", refId });
    const a = r.answer;
    const citedKeys = a.citations.map(
      (c) => keyOfCard.get(c.cardId) ?? "?gone",
    );
    const okKeys = new Set<string>([
      ...g.expected.flat(),
      ...(g.alsoAcceptable ?? []),
    ]);
    const groupHits = g.expected.map((grp) =>
      grp.some((k) => citedKeys.includes(k)),
    );
    const allClaims = [...a.claims, ...a.conflicts.flatMap((c) => c.sides)];
    const pureNoRecord = allClaims.length === 0;
    const checks = {
      mustInclude: (g.mustInclude ?? []).every((re) => re.test(a.text)),
      mustNotInclude: !(g.mustNotInclude ?? []).some((re) => re.test(a.text)),
      mustNotCite: !(g.mustNotCite ?? []).some((k) => citedKeys.includes(k)),
      noRecord: a.noRecord !== null,
      pureNoRecord,
      allGroupsCited: groupHits.every(Boolean),
    };
    const rulesOk =
      checks.mustInclude && checks.mustNotInclude && checks.mustNotCite;
    const pass =
      g.category === "NO_RECORD"
        ? checks.noRecord && checks.mustNotInclude && checks.mustNotCite
        : g.category === "CONFLICT"
          ? rulesOk && !pureNoRecord && checks.allGroupsCited
          : rulesOk && !pureNoRecord;

    // 보조 지표 b — 주장 단위 근거 판정.
    const cards = await prisma.memoryCard.findMany({
      where: { id: { in: a.citations.map((c) => c.cardId) } },
      select: { id: true, sourceType: true, summary: true, quote: true },
    });
    const numOf = new Map(a.citations.map((c) => [c.cardId, c.n]));
    const verdicts = await judgeClaims(
      allClaims.map((c) => ({
        text: c.text,
        cards: c.cardIds.map((id) => {
          const k = cards.find((x) => x.id === id);
          return {
            n: numOf.get(id) ?? 0,
            source: k?.sourceType ?? "?",
            summary: k?.summary ?? "",
            quote: k?.quote ?? null,
          };
        }),
      })),
      { userId, refId: `${refId}:judge` },
    );
    const judgeCost = await prisma.labUsage.aggregate({
      _sum: { costMicroUsd: true },
      where: { refId: `${refId}:judge` },
    });

    recs.push({
      repeat,
      id: g.id,
      category: g.category,
      question: g.question,
      text: a.text,
      citedKeys,
      groupHits,
      pass,
      checks,
      goodCites: citedKeys.filter((k) => okKeys.has(k)).length,
      cites: citedKeys.length,
      submittedClaims: a.stats.submittedClaims,
      droppedClaims: a.stats.droppedClaims,
      droppedCitations: a.stats.droppedCitations,
      followUpRejected: a.stats.followUpRejected,
      multiCiteClaims: allClaims.filter((c) => c.cardIds.length >= 2).length,
      judge: {
        claims: verdicts.length,
        supported: verdicts.filter((v) => v.supported).length,
        failures: verdicts
          .map((v, i) => ({ v, i }))
          .filter(({ v }) => !v.supported)
          .map(({ v, i }) => ({
            claim: allClaims[i].text,
            unsupported: v.unsupported,
          })),
      },
      rounds: r.rounds,
      costMicroUsd: r.costMicroUsd,
      judgeCostMicroUsd: judgeCost._sum.costMicroUsd ?? 0,
      error: r.error,
    });
    done += 1;
    console.log(
      `  [${done}/${tasks.length}] r${repeat} ${g.id} ${pass ? "PASS" : "FAIL"} · ${r.rounds}R · ${(r.costMicroUsd / 1e6).toFixed(4)}`,
    );
  });

  // ── 반복별 집계 ──
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  const ACC = LAB_CRITERIA.R2.answerAccuracy
    .categories as readonly GoldenCategory[];
  const perRepeat = Array.from({ length: repeats }, (_, i) => {
    const rs = recs.filter((x) => x.repeat === i + 1);
    const withExpected = rs.filter((x) => x.groupHits.length > 0);
    const rate = (xs: RunRec[]) =>
      xs.length ? xs.filter((x) => x.pass).length / xs.length : 0;
    const byCategory = Object.fromEntries(
      [...new Set(GOLDEN_PERSONA_A.map((g) => g.category))].map((c) => {
        const xs = rs.filter((x) => x.category === c);
        return [c, { pass: xs.filter((x) => x.pass).length, of: xs.length }];
      }),
    );
    const cites = sum(rs.map((x) => x.cites));
    const submitted = sum(rs.map((x) => x.submittedClaims));
    const judged = sum(rs.map((x) => x.judge.claims));
    return {
      repeat: i + 1,
      answerAccuracy: rate(rs.filter((x) => ACC.includes(x.category))),
      preferenceAccuracy: rate(rs.filter((x) => x.category === "PREFERENCE")),
      byCategory,
      citationPrecision: cites ? sum(rs.map((x) => x.goodCites)) / cites : 1,
      citationRecall:
        sum(withExpected.map((x) => x.groupHits.filter(Boolean).length)) /
        sum(withExpected.map((x) => x.groupHits.length)),
      unsupportedClaimRate: submitted
        ? sum(rs.map((x) => x.droppedClaims)) / submitted
        : 0,
      noRecordHandled: rs.filter((x) => x.category === "NO_RECORD" && x.pass)
        .length,
      falseNoRecordRate:
        withExpected.filter((x) => x.checks.pureNoRecord).length /
        withExpected.length,
      conflictBothCited: rs.filter(
        (x) => x.category === "CONFLICT" && x.checks.allGroupsCited,
      ).length,
      mustNotViolations: rs.filter(
        (x) => !x.checks.mustNotInclude || !x.checks.mustNotCite,
      ).length,
      avgCostUsd: sum(rs.map((x) => x.costMicroUsd)) / rs.length / 1e6,
      avgRounds: sum(rs.map((x) => x.rounds)) / rs.length,
      maxRounds: Math.max(...rs.map((x) => x.rounds)),
      followUpRejected: rs.filter((x) => x.followUpRejected).length,
      errors: rs.filter((x) => x.error).length,
      aux: {
        multiCiteClaims: sum(rs.map((x) => x.multiCiteClaims)),
        submittedClaims: submitted,
        judgeSupported: sum(rs.map((x) => x.judge.supported)),
        judgeClaims: judged,
        judgeRate: judged ? sum(rs.map((x) => x.judge.supported)) / judged : 1,
        judgeCostUsd: sum(rs.map((x) => x.judgeCostMicroUsd)) / 1e6,
      },
    };
  });

  const stat = (xs: number[]) => {
    const m = sum(xs) / xs.length;
    const sd = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / xs.length);
    return {
      mean: Number(m.toFixed(4)),
      sd: Number(sd.toFixed(4)),
      min: Math.min(...xs),
      max: Math.max(...xs),
    };
  };
  type Rep = (typeof perRepeat)[number];
  const series = (f: (p: Rep) => number) => stat(perRepeat.map(f));
  const deviation = {
    answerAccuracy: series((p) => p.answerAccuracy),
    preferenceAccuracy: series((p) => p.preferenceAccuracy),
    citationPrecision: series((p) => p.citationPrecision),
    citationRecall: series((p) => p.citationRecall),
    unsupportedClaimRate: series((p) => p.unsupportedClaimRate),
    falseNoRecordRate: series((p) => p.falseNoRecordRate),
    avgCostUsd: series((p) => p.avgCostUsd),
    avgRounds: series((p) => p.avgRounds),
    multiCiteClaims: series((p) => p.aux.multiCiteClaims),
    judgeRate: series((p) => p.aux.judgeRate),
  };

  const C = LAB_CRITERIA.R2;
  const every = (f: (p: Rep) => boolean) => perRepeat.every(f);
  const verdict: [string, boolean, unknown][] = [
    [
      `answerAccuracy(FACT·PERIOD·PERSON·FALSE_PREMISE) 평균 ≥ ${C.answerAccuracy.min}`,
      deviation.answerAccuracy.mean >= C.answerAccuracy.min,
      deviation.answerAccuracy.mean,
    ],
    [
      `citationPrecision 평균 ≥ ${C.citationPrecisionMin}`,
      deviation.citationPrecision.mean >= C.citationPrecisionMin,
      deviation.citationPrecision.mean,
    ],
    [
      `unsupportedClaimRate 평균 ≤ ${C.unsupportedClaimRateMax}`,
      deviation.unsupportedClaimRate.mean <= C.unsupportedClaimRateMax,
      deviation.unsupportedClaimRate.mean,
    ],
    [
      `noRecordHandled ${C.noRecordHandled.required}/${C.noRecordHandled.of} 매 회`,
      every((p) => p.noRecordHandled >= C.noRecordHandled.required),
      perRepeat.map((p) => p.noRecordHandled),
    ],
    [
      `falseNoRecordRate 평균 ≤ ${C.falseNoRecordRateMax}`,
      deviation.falseNoRecordRate.mean <= C.falseNoRecordRateMax,
      deviation.falseNoRecordRate.mean,
    ],
    [
      `conflictBothCited ${C.conflictBothCited.required}/${C.conflictBothCited.of} 매 회`,
      every((p) => p.conflictBothCited >= C.conflictBothCited.required),
      perRepeat.map((p) => p.conflictBothCited),
    ],
    [
      `mustNotViolations ${C.mustNotViolations} 매 회`,
      every((p) => p.mustNotViolations <= C.mustNotViolations),
      perRepeat.map((p) => p.mustNotViolations),
    ],
    [
      `avgCostPerQuestionUsd 평균 ≤ ${C.avgCostPerQuestionUsdMax}`,
      deviation.avgCostUsd.mean <= C.avgCostPerQuestionUsdMax,
      deviation.avgCostUsd.mean,
    ],
    [
      `maxToolRounds ≤ ${C.maxToolRounds}(하드 상한)`,
      every((p) => p.maxRounds <= C.maxToolRounds),
      perRepeat.map((p) => p.maxRounds),
    ],
  ];

  console.log(
    `\nanswer 평가 · 페르소나 A · 27문항 × ${repeats}회 · 모델 ${AGENT_MODEL}`,
  );
  for (const [label, ok, val] of verdict) {
    console.log(`${ok ? "PASS" : "FAIL"} — ${label} :: ${JSON.stringify(val)}`);
  }
  console.log("\n반복별:");
  for (const p of perRepeat) {
    console.log(
      `  r${p.repeat}: 정답률 ${p.answerAccuracy.toFixed(3)} · 취향 ${p.preferenceAccuracy.toFixed(2)} · 정밀도 ${p.citationPrecision.toFixed(3)} · 재현율 ${p.citationRecall.toFixed(3)} · 근거없는주장 ${p.unsupportedClaimRate.toFixed(3)} · 기록없음 ${p.noRecordHandled}/3 · 잘못된없음 ${p.falseNoRecordRate.toFixed(3)} · 모순양쪽 ${p.conflictBothCited}/2 · mustNot위반 ${p.mustNotViolations} · ${p.avgCostUsd.toFixed(4)}/문항 · ${p.avgRounds.toFixed(2)}R(최대 ${p.maxRounds}) · 후속질문버림 ${p.followUpRejected} · 오류 ${p.errors}`,
    );
    console.log(`      유형별: ${JSON.stringify(p.byCategory)}`);
    console.log(
      `      보조: 근거2+ 주장 ${p.aux.multiCiteClaims}/${p.aux.submittedClaims} · 판정기 뒷받침 ${p.aux.judgeSupported}/${p.aux.judgeClaims}(${p.aux.judgeRate.toFixed(3)}) · 판정 원가 ${p.aux.judgeCostUsd.toFixed(4)}`,
    );
  }
  console.log(`\n${repeats}회 편차(mean·sd·min·max):`);
  for (const [k, v] of Object.entries(deviation))
    console.log(`  ${k}: ${JSON.stringify(v)}`);

  const byItem = GOLDEN_PERSONA_A.map((g) => {
    const xs = recs
      .filter((x) => x.id === g.id)
      .sort((a, b) => a.repeat - b.repeat);
    return {
      id: g.id,
      category: g.category,
      passes: xs.filter((x) => x.pass).length,
      of: xs.length,
      runs: xs,
    };
  });
  console.log("\n문항별 통과(회):");
  console.log(
    "  " + byItem.map((b) => `${b.id} ${b.passes}/${b.of}`).join(" · "),
  );
  const focus = byItem.filter(
    (b) =>
      ["NO_RECORD", "CONFLICT", "FALSE_PREMISE"].includes(b.category) ||
      b.passes < b.of,
  );
  console.log("\n기록 없음·모순·거짓 전제 + 한 번이라도 실패한 문항:");
  for (const b of focus) {
    for (const x of b.runs) {
      const why = [
        !x.checks.mustInclude && "mustInclude 미충족",
        !x.checks.mustNotInclude && "mustNotInclude 위반",
        !x.checks.mustNotCite && "mustNotCite 인용",
        x.category === "NO_RECORD" && !x.checks.noRecord && "기록 없음 아님",
        x.category !== "NO_RECORD" && x.checks.pureNoRecord && "잘못된 없음",
        x.category === "CONFLICT" && !x.checks.allGroupsCited && "한쪽만 인용",
      ].filter(Boolean);
      console.log(
        `  ${b.id} r${x.repeat} ${x.pass ? "PASS" : `FAIL(${why.join(", ")})`} · 인용 ${x.citedKeys.join(",") || "-"}`,
      );
      console.log(`     ${x.text}`);
    }
  }
  const judgeFails = recs.flatMap((x) =>
    x.judge.failures.map((f) => ({ id: x.id, repeat: x.repeat, ...f })),
  );
  console.log(`\n판정기 '뒷받침 안 됨' ${judgeFails.length}건:`);
  for (const f of judgeFails) {
    console.log(
      `  ${f.id} r${f.repeat}: ${f.claim} → 안 됨: ${f.unsupported ?? "-"}`,
    );
  }

  const dir = path.join(__dirname, "lab", "reports");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `r2-answer-${kstDate(new Date())}.json`);
  fs.writeFileSync(
    file,
    `${JSON.stringify(
      {
        stamp,
        persona: "a",
        repeats,
        model: AGENT_MODEL,
        verdict: verdict.map(([label, ok, value]) => ({ label, ok, value })),
        perRepeat,
        deviation,
        byItem,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `\n리포트: ${path.relative(path.join(__dirname, ".."), file).replace(/\\/g, "/")}`,
  );
  return verdict.every(([, ok]) => ok);
}

async function main() {
  const persona = arg("--persona");
  const mode = arg("--mode");
  if (persona !== "a")
    throw new Error("--persona a 만 지원(페르소나 B 는 R2 완료 직전)");
  if (mode !== "retrieval" && mode !== "answer")
    throw new Error("--mode retrieval | answer");
  const pass =
    mode === "retrieval"
      ? await retrieval()
      : await answerMode(
          Number(arg("--repeat") ?? 1),
          Number(arg("--concurrency") ?? 3),
        );
  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
