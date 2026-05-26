// Phase V1 — 타임머신 AI 비서 API.
//
// POST body: { question: string, year: number, month: number }
// 응답: { text, source, category, citations, tokensSpent, balanceAfter }
//
// 인증: 세션 필수 (userId 는 서버 세션에서만, 클라가 보낸 값 안 받음).
// 잔액 부족: 402 + { error: "insufficient_balance" }.
// 잘못된 입력: 400 + { error: "bad_request", message }.
// 검색 도구 비활성/외부 호출 실패: 502 + { error: "upstream", message }.
//
// UI 는 V2 에서 만들 예정. 이 라우트는 백엔드 검증용으로도 사용 가능.

import { auth } from "@/auth";
import { askAssistant } from "@/lib/timemachine-assistant";
import { InsufficientBalanceError } from "@/lib/tokens/errors";

export const runtime = "nodejs";

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
  const b = body as { question?: unknown; year?: unknown; month?: unknown };

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

  try {
    const result = await askAssistant(userId, b.question, b.year, b.month);
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
