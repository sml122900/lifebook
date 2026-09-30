// 기억 에이전트 — 골든셋 평가기. R1: --mode retrieval (검색만, 생성 없음). R2 에서 --mode answer 추가.
//
// retrieval: 골든셋(db/lab/golden/persona-a.ts, 동결)의 NO_RECORD 를 뺀 24문항을 질문 그대로
// searchWithQuestion(연구실 검색 디버그와 같은 경로, LLM 0 — 질문 임베딩만)에 넣고 상위 8장의
// 원본으로 expected 그룹 적중을 센다. recall = 적중 그룹 / 전체 그룹, 문항 평균.
// 기준 = db/lab/criteria.ts LAB_CRITERIA.R1.retrievalRecallAt8(동결). 리포트는 합성 데이터만이라
// db/lab/reports/ 에 JSON 으로 남긴다. 페르소나 원장·카드는 읽기만(테스트 격리 규칙).
//
// 실행: npx tsx db/lab-eval.ts --persona a --mode retrieval

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
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

async function main() {
  const persona = arg("--persona");
  const mode = arg("--mode");
  if (persona !== "a")
    throw new Error("--persona a 만 지원(페르소나 B 는 R2 완료 직전)");
  if (mode !== "retrieval")
    throw new Error("--mode retrieval 만 지원(answer 는 R2)");
  const pass = await retrieval();
  process.exitCode = pass ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
