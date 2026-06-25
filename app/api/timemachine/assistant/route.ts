// Phase V1 — 타임머신 AI 비서 API.
// Phase V3 — body 에 prior[] 추가 (멀티턴 컨텍스트).
//
// POST body: {
//   question: string,
//   year: number,
//   month: number,
//   prior?: Array<{ role: "user"|"assistant", text: string }>,
// }
// 응답: { text, source, category, citations, tokensSpent, balanceAfter,
//         events, songs }
//
// 인증: 세션 필수 (userId 는 서버 세션에서만, 클라가 보낸 값 안 받음).
// 잔액 부족: 402 + { error: "insufficient_balance" }.
// 잘못된 입력: 400 + { error: "bad_request", message }.
// 검색 도구 비활성/외부 호출 실패: 502 + { error: "upstream", message }.

import { auth } from "@/auth";
import {
  askAssistant,
  type AssistantDepth,
  type AssistantPriorTurn,
} from "@/lib/timemachine-assistant";
import { InsufficientBalanceError } from "@/lib/tokens/errors";
import type { AiModel } from "@/lib/ai-model";
import { getUserAiModel } from "@/lib/user-ai-model";

// 비서 깊이는 더 이상 화면별 토글이 아니라 전역 모델을 따른다(1:1 매핑).
const TIER_TO_DEPTH: Record<AiModel, AssistantDepth> = {
  haiku: "simple",
  sonnet: "detailed",
  opus: "precise",
};

export const runtime = "nodejs";

// 클라가 보낸 prior 의 모양·길이 가드.
//   - 최대 16개 (백엔드 clampPrior 가 추가로 8개 자름. 여기선 명백한 폭주만 차단)
//   - 각 텍스트는 그대로 두고 백엔드에서 자름.
const MAX_PRIOR_ITEMS = 16;

function parsePrior(raw: unknown): AssistantPriorTurn[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error("prior must be an array");
  }
  if (raw.length > MAX_PRIOR_ITEMS) {
    throw new Error("prior too long");
  }
  return raw.map((item, i) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`prior[${i}] not an object`);
    }
    const it = item as { role?: unknown; text?: unknown };
    if (it.role !== "user" && it.role !== "assistant") {
      throw new Error(`prior[${i}] invalid role`);
    }
    if (typeof it.text !== "string") {
      throw new Error(`prior[${i}] text not a string`);
    }
    return { role: it.role, text: it.text };
  });
}

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }
  const userId = session.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(
      { error: "bad_request", message: "invalid json" },
      { status: 400 },
    );
  }
  const b = body as {
    question?: unknown;
    year?: unknown;
    month?: unknown;
    prior?: unknown;
    depth?: unknown;
  };

  if (typeof b.question !== "string" || b.question.trim() === "") {
    return Response.json(
      { error: "bad_request", message: "question required" },
      { status: 400 },
    );
  }
  if (
    typeof b.year !== "number" ||
    typeof b.month !== "number" ||
    !Number.isInteger(b.year) ||
    !Number.isInteger(b.month)
  ) {
    return Response.json(
      { error: "bad_request", message: "year/month required" },
      { status: 400 },
    );
  }

  let prior: AssistantPriorTurn[];
  try {
    prior = parsePrior(b.prior);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: "bad_request", message },
      { status: 400 },
    );
  }

  // 깊이 = 전역 모델(클라 depth 무시).
  const depth = TIER_TO_DEPTH[await getUserAiModel(userId)];

  try {
    const result = await askAssistant(
      userId,
      b.question,
      b.year,
      b.month,
      prior,
      depth,
    );
    return Response.json(result);
  } catch (e) {
    if (e instanceof InsufficientBalanceError) {
      return Response.json(
        { error: "insufficient_balance" },
        { status: 402 },
      );
    }
    const message = e instanceof Error ? e.message : String(e);
    // 입력 검증 (year/month 범위) 도 askAssistant 내부에서 throw → 400.
    if (
      message === "empty question" ||
      message === "invalid target year/month"
    ) {
      return Response.json(
        { error: "bad_request", message },
        { status: 400 },
      );
    }
    console.error("[api:assistant]", message);
    return Response.json(
      { error: "upstream", message },
      { status: 502 },
    );
  }
}
