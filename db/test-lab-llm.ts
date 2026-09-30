// 기억 에이전트 R1-3 — lab LLM 클라이언트·원가 원장·월 예산 가드·임베딩 배치 검증.
//
// 기본 실행은 외부 API 호출 0:
//   - 원가 계산·KST 월 경계·예산 파싱(순수)
//   - 전용 키 없으면 거부 — 운영 키(ANTHROPIC_API_KEY)가 있어도 대체하지 않음(결정 3)
//   - 예산 초과면 네트워크 호출 전에 차단(LLM·임베딩 둘 다)
//   - LabUsage 원장 합계(테스트 행은 refId 로 표시 후 삭제)
// --live: .env 의 LAB_ANTHROPIC_API_KEY 로 Haiku 1회 + 임베딩 1회 실제 호출 후 원장 기록 확인
//         (원가 수 센트 미만, 기록 행은 실제 사용분이라 남긴다).
//
// 실행: npx tsx db/test-lab-llm.ts [--live]

import "dotenv/config";

import { prisma } from "../lib/db";
import { EMBEDDING_MODEL } from "../lib/embeddings";
import { modelId } from "../lib/ai-model";
import { labEmbed, LAB_EMBED_BATCH } from "../lib/lab/embed";
import { LabConfigError, labMessage } from "../lib/lab/llm";
import {
  estimateCostMicroUsd,
  LabBudgetExceededError,
  monthlyBudgetMicroUsd,
  monthStartKst,
  recordLabUsage,
  spentThisMonthMicroUsd,
} from "../lib/lab/usage";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

async function rejectsWith(
  fn: () => Promise<unknown>,
  cls: new (...a: never[]) => Error,
): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (e) {
    return e instanceof cls;
  }
}

const ENV_KEYS = [
  "LAB_ANTHROPIC_API_KEY",
  "ANTHROPIC_API_KEY",
  "LAB_MONTHLY_BUDGET_USD",
] as const;
const TEST_REF = `test-lab-llm:${Date.now()}`;
const HAIKU = modelId("haiku");
const SONNET = modelId("sonnet");

async function main() {
  const live = process.argv.includes("--live");
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  const restoreEnv = () => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };

  try {
    // ── 원가 계산(순수) ───────────────────────────────────────────
    check(
      "Sonnet 입력 1000·출력 100 = 4500 μ$",
      estimateCostMicroUsd(SONNET, { input: 1000, output: 100 }) === 4500,
    );
    check(
      "Sonnet 캐시 읽기 1000 = 300 μ$(입력가 ×0.1)",
      estimateCostMicroUsd(SONNET, { input: 0, cacheRead: 1000 }) === 300,
    );
    check(
      "Sonnet 캐시 쓰기 1000 = 3750 μ$(입력가 ×1.25)",
      estimateCostMicroUsd(SONNET, { input: 0, cacheWrite: 1000 }) === 3750,
    );
    check(
      "Haiku 입력 1000·출력 100 = 1500 μ$",
      estimateCostMicroUsd(HAIKU, { input: 1000, output: 100 }) === 1500,
    );
    check(
      "voyage-3.5 1000토큰 = 60 μ$",
      estimateCostMicroUsd(EMBEDDING_MODEL, { input: 1000 }) === 60,
    );
    let unknownThrew = false;
    try {
      estimateCostMicroUsd("gpt-9", { input: 1 });
    } catch {
      unknownThrew = true;
    }
    check("가격표에 없는 모델은 throw(예산 가드 우회 방지)", unknownThrew);

    // ── KST 월 경계(순수) ─────────────────────────────────────────
    check(
      "UTC 09-30 20:00(=KST 10-01 05:00) → 월 시작 2026-09-30T15:00Z",
      monthStartKst(new Date("2026-09-30T20:00:00Z")).toISOString() ===
        "2026-09-30T15:00:00.000Z",
    );
    check(
      "UTC 09-30 14:00(=KST 09-30 23:00) → 월 시작 2026-08-31T15:00Z",
      monthStartKst(new Date("2026-09-30T14:00:00Z")).toISOString() ===
        "2026-08-31T15:00:00.000Z",
    );

    // ── 예산 파싱(순수) ───────────────────────────────────────────
    delete process.env.LAB_MONTHLY_BUDGET_USD;
    check("예산 미설정 → 기본 $30", monthlyBudgetMicroUsd() === 30_000_000);
    process.env.LAB_MONTHLY_BUDGET_USD = "5";
    check('예산 "5" → $5', monthlyBudgetMicroUsd() === 5_000_000);
    process.env.LAB_MONTHLY_BUDGET_USD = "abc";
    check("예산 잘못된 값 → 기본 $30", monthlyBudgetMicroUsd() === 30_000_000);
    process.env.LAB_MONTHLY_BUDGET_USD = "0";
    check('예산 "0" → $0(전면 차단 가능)', monthlyBudgetMicroUsd() === 0);

    // ── 전용 키 규칙(결정 3) ──────────────────────────────────────
    const msg = {
      model: HAIKU,
      max_tokens: 8,
      messages: [{ role: "user" as const, content: "hi" }],
    };
    process.env.ANTHROPIC_API_KEY =
      "sk-ant-operational-key-should-never-be-used";
    delete process.env.LAB_ANTHROPIC_API_KEY;
    delete process.env.LAB_MONTHLY_BUDGET_USD;
    const beforeNoKey = await prisma.labUsage.count();
    check(
      "LAB 키 없음 + 운영 키 있음 → LabConfigError(운영 키로 대체 안 함)",
      await rejectsWith(
        () =>
          labMessage(msg, { purpose: "SMOKE", userId: null, refId: TEST_REF }),
        LabConfigError,
      ),
    );
    check(
      "거부된 호출은 원장 기록 0",
      (await prisma.labUsage.count()) === beforeNoKey,
    );

    // ── 예산 초과 시 호출 전 차단 ──────────────────────────────────
    process.env.LAB_ANTHROPIC_API_KEY = "fake-key-network-must-not-be-reached";
    process.env.LAB_MONTHLY_BUDGET_USD = "0";
    check(
      "예산 $0 → LLM 호출 전 LabBudgetExceededError(가짜 키라 네트워크 닿으면 다른 오류)",
      await rejectsWith(
        () =>
          labMessage(msg, { purpose: "SMOKE", userId: null, refId: TEST_REF }),
        LabBudgetExceededError,
      ),
    );
    check(
      "예산 $0 → 임베딩 호출 전 LabBudgetExceededError",
      await rejectsWith(
        () => labEmbed(["테스트"], "query", { userId: null, refId: TEST_REF }),
        LabBudgetExceededError,
      ),
    );
    check(
      "빈 입력 임베딩은 예산·네트워크 없이 []",
      (await labEmbed([], "query", { userId: null })).length === 0,
    );
    check("임베딩 배치 상한 64", LAB_EMBED_BATCH === 64);

    // ── 원장 합계 ────────────────────────────────────────────────
    const spentBefore = await spentThisMonthMicroUsd();
    await recordLabUsage({
      purpose: "SMOKE",
      model: SONNET,
      userId: null,
      refId: TEST_REF,
      inputTokens: 1000,
      outputTokens: 100,
    });
    await recordLabUsage({
      purpose: "SMOKE",
      model: EMBEDDING_MODEL,
      userId: null,
      refId: TEST_REF,
      inputTokens: 1000,
    });
    const spentAfter = await spentThisMonthMicroUsd();
    check(
      "원장 기록 2건 → 이번 달 합계 +4560 μ$",
      spentAfter - spentBefore === 4560,
      spentAfter - spentBefore,
    );
    await prisma.labUsage.deleteMany({ where: { refId: TEST_REF } });
    check(
      "테스트 원장 행 정리",
      (await prisma.labUsage.count({ where: { refId: TEST_REF } })) === 0,
    );

    // ── --live: 실제 호출 ────────────────────────────────────────
    restoreEnv();
    if (!live) {
      console.log("   (--live 없음 — 실제 API 호출 건너뜀)");
    } else if (!process.env.LAB_ANTHROPIC_API_KEY) {
      check("--live: .env 에 LAB_ANTHROPIC_API_KEY 있음", false);
    } else {
      const liveRef = `test-lab-llm-live:${Date.now()}`;
      const res = await labMessage(
        {
          model: HAIKU,
          max_tokens: 16,
          messages: [
            {
              role: "user",
              content: "한 단어로만 답하세요: 맑은 하늘의 색은?",
            },
          ],
        },
        { purpose: "SMOKE", userId: null, refId: liveRef },
      );
      const text = res.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      check("--live: Haiku 응답 수신", text.length > 0, text);
      const vecs = await labEmbed(
        ["국민학교 때 낙동강에서 멱을 감았다"],
        "document",
        { userId: null, refId: liveRef },
      );
      check(
        "--live: 임베딩 1024차원",
        vecs.length === 1 && vecs[0].length === 1024,
        vecs[0]?.length,
      );
      const rows = await prisma.labUsage.findMany({
        where: { refId: liveRef },
        select: {
          purpose: true,
          model: true,
          inputTokens: true,
          outputTokens: true,
          costMicroUsd: true,
        },
      });
      check(
        "--live: 원장 2행(SMOKE 1 + EMBED 1), 토큰·원가 > 0",
        rows.length === 2 &&
          rows.every((r) => r.inputTokens > 0 && r.costMicroUsd > 0),
        rows,
      );
      console.log("   live 원장:", JSON.stringify(rows));
    }
  } finally {
    restoreEnv();
    await prisma.labUsage.deleteMany({ where: { refId: TEST_REF } });
  }

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
}

main()
  .catch((e) => {
    console.error(e);
    failed += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
