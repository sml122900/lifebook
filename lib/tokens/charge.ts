// Phase 8.3 — 밀린 AI 사용량을 사용자 지갑에서 정산(차감).
//
// 정책: 개별 API 호출이 아니라 추억 "사이클" 단위로 차감한다. 한 사이클
// = 가이드 질문 호출 + (최종) 요약 호출. 두 토큰을 합쳐 tokensFromUsage()
// 를 한 번만 돌리고 TokenTransaction 한 줄만 쓴다. 호출마다 차감하면
// ceil() 이 두 번 걸려, 정책이 calibrate 된 흔한 ~1,113토큰 사이클이
// 1 대신 1+1=2 로 이중 청구된다.
//
// race 안전성(검토 반영):
//   1. AIMessage 행을 원자적으로 선점 —
//        UPDATE ... SET chargedAt = NOW() WHERE chargedAt IS NULL
//      PostgreSQL 의 행 잠금 + 조건 재검사(READ COMMITTED) 하에서.
//      동시 정산은 0행을 보고 빠져나간다.
//   2. 지갑 차감은 조건부 —
//        UPDATE ... SET balance = balance - cost WHERE balance >= cost
//      두 병렬 차감이 잔액을 음수로 못 만든다. 조건 실패 시
//      InsufficientBalance 를 throw 하고, 감싼 $transaction 이 chargedAt
//      선점도 함께 롤백한다.
//
// 두 체크 모두 같은 $transaction 안 → balance ↔ ledger 가 절대 어긋나지
// 않고, race 패배자는 절반만 적용된 상태를 남기지 않는다.

import { prisma } from "../db";
import { InsufficientBalanceError } from "./errors";
import { tokensFromUsage } from "./policy";

export type ChargeOutcome =
  | { charged: false; reason: "no_usage" }
  | {
      charged: true;
      tokensSpent: number;
      balanceAfter: number;
      transactionId: string;
    };

type ClaimedRow = {
  id: string;
  inputTokens: number | null;
  outputTokens: number | null;
};

type WalletRow = { balance: number };

/**
 * 대화 안의 아직 정산 안 된 AIMessage 를 모두 지갑에서 차감. 여러 번
 * 불러도 안전 — 새로 차감할 게 없으면 { charged: false }.
 *
 * 동시 호출(더블 제출, 네트워크 재시도): 한 정산이 미정산 행을 선점하고
 * 나머지는 no-op. 두 차감이 상위 게이트를 경합으로 지나쳐도 지갑은 절대
 * 음수가 되지 않는다.
 */
export async function settleConversationCharges(
  userId: string,
  conversationId: string,
  refId?: string,
): Promise<ChargeOutcome> {
  return await prisma.$transaction(async (tx) => {
    // 심층 방어: 대화가 이 사용자 소유여야 한다. 액션 레이어에서 이미
    // 확인하지만, 헬퍼 자체도 안전하게 둔다.
    const conv = await tx.aIConversation.findUnique({
      where: { id: conversationId },
      select: { userId: true },
    });
    if (!conv || conv.userId !== userId) {
      throw new Error("conversation does not belong to user");
    }

    // 미정산 assistant 메시지를 원자적으로 선점. WHERE 절이 행 잠금 하에
    // 재평가되므로 두 동시 정산이 같은 행을 함께 못 선점한다 — 패배자는
    // 빈 결과를 받고 no_usage 로 빠져나간다.
    const claimed = await tx.$queryRaw<ClaimedRow[]>`
      UPDATE "AIMessage"
      SET "chargedAt" = NOW()
      WHERE "conversationId" = ${conversationId}
        AND role = 'assistant'::"AIMessageRole"
        AND "chargedAt" IS NULL
      RETURNING id, "inputTokens", "outputTokens"
    `;

    if (claimed.length === 0) {
      return { charged: false, reason: "no_usage" } as const;
    }

    const totalIn = claimed.reduce((sum, m) => sum + (m.inputTokens ?? 0), 0);
    const totalOut = claimed.reduce((sum, m) => sum + (m.outputTokens ?? 0), 0);
    const cost = tokensFromUsage(totalIn, totalOut);

    if (cost === 0) {
      // 방어적: tokensFromUsage 는 합계가 0 일 때만 0 을 반환하는데, 그건
      // 상위에서 이미 걸러졌어야 한다(사용량 0 이면 AIMessage 미저장).
      // 선점된 행엔 chargedAt 이 이미 찍혀 다음 정산이 재평가하지 않는다.
      return { charged: false, reason: "no_usage" } as const;
    }

    // 조건부 지갑 차감. balance < cost 면(상위 MIN_BALANCE 게이트를 경합으로
    // 지나친 경우) RETURNING 이 비고 throw → $transaction 이 chargedAt
    // 선점을 롤백해, 그 메시지들은 다음(잔액이 충분한) 정산 시도 대상이 된다.
    const walletUpdated = await tx.$queryRaw<WalletRow[]>`
      UPDATE "TokenWallet"
      SET balance = balance - ${cost}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND balance >= ${cost}
      RETURNING balance
    `;

    if (walletUpdated.length === 0) {
      throw new InsufficientBalanceError();
    }

    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        delta: -cost,
        reason: "ai_charge",
        refId: refId ?? conversationId,
      },
      select: { id: true },
    });

    return {
      charged: true,
      tokensSpent: cost,
      balanceAfter: walletUpdated[0].balance,
      transactionId: transaction.id,
    } as const;
  });
}

// Phase T4 — 일회성 AI 호출(예: 음성 다듬기) 후 차감.
//
// settleConversationCharges 가 대화 단위 합산을 위해 AIMessage 의
// chargedAt 을 사용하는 반면, 일회성 호출은 한 번의 in/out 토큰만
// 다루므로 conversation 우회. 락 패턴은 동일:
//   - WHERE balance >= cost 조건부 UPDATE → race 시 잔액 음수 차단
//   - 트랜잭션 내부에서 wallet 갱신 + ledger 기록 한 묶음
//
// reason 예: "voice_cleanup". refId 는 추적 보조 (생략 가능).
// surcharge: AI 토큰 외 운영 비용 가산 (예: web_search 1회당 1토큰).
//   cost = tokensFromUsage(in,out) + surcharge. surcharge 가 0 보다 크면
//   in/out 이 0 이어도 차감이 발생한다.
export async function chargeOneShot(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  reason: string,
  refId?: string,
  surcharge: number = 0,
): Promise<{ tokensSpent: number; balanceAfter: number; transactionId: string | null }> {
  const cost = tokensFromUsage(inputTokens, outputTokens) + surcharge;

  if (cost === 0) {
    const w = await prisma.tokenWallet.findUnique({
      where: { userId },
      select: { balance: true },
    });
    return { tokensSpent: 0, balanceAfter: w?.balance ?? 0, transactionId: null };
  }

  return await prisma.$transaction(async (tx) => {
    const walletUpdated = await tx.$queryRaw<WalletRow[]>`
      UPDATE "TokenWallet"
      SET balance = balance - ${cost}, "updatedAt" = NOW()
      WHERE "userId" = ${userId} AND balance >= ${cost}
      RETURNING balance
    `;
    if (walletUpdated.length === 0) {
      throw new InsufficientBalanceError();
    }
    const transaction = await tx.tokenTransaction.create({
      data: { userId, delta: -cost, reason, refId },
      select: { id: true },
    });
    return {
      tokensSpent: cost,
      balanceAfter: walletUpdated[0].balance,
      transactionId: transaction.id,
    };
  });
}

// V3 — 차감 환불.
// 사용 케이스: 비서 컨텍스트 미스 차감 후 검색이 실패해 사용자가 답을
// 못 받는 경우 (T2). 차감 자체는 ledger 에 남기고, 같은 refId 로 + 환불
// 거래를 별도 기록 → 감사 가능 + race-safe.
//
// race-safe 보장:
//   - balance + tokens 는 음수가 될 수 없으므로 동시 다른 차감과 무관.
//   - wallet 갱신과 ledger 기록은 한 트랜잭션 안 → 원자적.
//
// reason 예: "timemachine_assistant_context_miss_refund". refId 는 원
// 차감의 transactionId 를 권장 (감사 시 매칭 용이).
export async function refundTokens(
  userId: string,
  tokens: number,
  reason: string,
  refId?: string,
): Promise<void> {
  if (tokens <= 0) return;
  await prisma.$transaction(async (tx) => {
    const updated = await tx.$queryRaw<WalletRow[]>`
      UPDATE "TokenWallet"
      SET balance = balance + ${tokens}, "updatedAt" = NOW()
      WHERE "userId" = ${userId}
      RETURNING balance
    `;
    if (updated.length === 0) {
      // wallet 이 사라진 케이스 (사용자 탈퇴 race 등) — ledger 도 기록
      // 안 함. throw 하면 호출부가 또 catch 해야 해 흐름 복잡 → 조용히 skip.
      return;
    }
    await tx.tokenTransaction.create({
      data: { userId, delta: tokens, reason, refId },
    });
  });
}
