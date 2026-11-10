// 토큰 충전 환불 계산(2026-11-10 — 환불 정책 lib/commerce/order-display TOKEN_REFUND_LINES). 순수 함수, prisma 없음.
//
// 지갑은 잔액 한 칸(TokenWallet.balance)이지만 모든 잔액 변경이 원장(TokenTransaction)에 이유와 함께 남는다(lib/tokens/wallet 불변식).
// 그래서 원장을 처음부터 다시 따라가며 무료 토큰과 충전 건별 유료 토큰이 얼마 남았는지 센다. 사용 순서는 이 계산이 정한다:
//   - 무료 토큰 먼저 → 그다음 유료 토큰(먼저 충전한 것부터).
//   - + 거래: 이유 "topup" = 충전 건(refId = TokenOrder.id) · 이유가 "_refund" 로 끝나고 refId 가 앞의 차감 거래 id = 그 차감을 되돌림
//     (그 차감이 꺼낸 칸으로 — 유료 먼저) · 그 밖(가입·출석 등) = 무료.
//   - − 거래: 사용(무료 → 유료 순으로 꺼냄).
// 환불 금액: 결제 후 7일 안 + 하나도 안 쓴 충전 = 결제 금액 전부 · 그 밖 = 결제 금액 × 남은 토큰 ÷ 그 충전으로 받은 토큰(더 드린 토큰 포함),
// 원 아래 버림. 무료 토큰은 환불 대상 아님.
// 실제 환불 실행(토스 결제 취소 + 원장 차감)은 아직 없음 — 요청이 오면 운영자가 db/token-refund-quote.ts 로 금액을 보고 처리.

export type LedgerRow = { id: string; delta: number; reason: string; refId: string | null; createdAt: Date };
export type PaidTopupOrder = { id: string; krw: number; tokens: number; approvedAt: Date | null };

export type TopupRefundQuote = {
  orderId: string;
  krw: number;
  tokens: number;
  remaining: number; // 이 충전에서 아직 안 쓴 토큰
  paidAt: Date;
  unused: boolean; // 하나도 안 씀
  within7Days: boolean; // 결제 후 7일 안
  refundKrw: number;
};

export const TOPUP_FULL_REFUND_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Lot = { orderId: string; remaining: number; creditedAt: Date };
type Draw = { free: number; lots: [Lot, number][] };

export function quoteTopupRefunds(
  ledger: readonly LedgerRow[],
  orders: readonly PaidTopupOrder[],
  now: Date = new Date(),
): { quotes: TopupRefundQuote[]; free: number; paid: number } {
  const rows = [...ledger].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  let free = 0;
  const lots: Lot[] = [];
  const draws = new Map<string, Draw>();

  for (const r of rows) {
    if (r.delta > 0) {
      if (r.reason === "topup" && r.refId) {
        lots.push({ orderId: r.refId, remaining: r.delta, creditedAt: r.createdAt });
        continue;
      }
      const draw = r.reason.endsWith("_refund") && r.refId ? draws.get(r.refId) : undefined;
      let back = r.delta;
      if (draw) {
        // 되돌림 — 그 차감이 꺼낸 유료 칸부터 채우고, 남으면 무료
        for (const pair of draw.lots) {
          const n = Math.min(back, pair[1]);
          pair[0].remaining += n;
          pair[1] -= n;
          back -= n;
        }
        const n = Math.min(back, draw.free);
        draw.free -= n;
      }
      free += back;
      continue;
    }
    if (r.delta < 0) {
      let need = -r.delta;
      const draw: Draw = { free: 0, lots: [] };
      const fromFree = Math.min(free, need);
      free -= fromFree;
      draw.free = fromFree;
      need -= fromFree;
      for (const lot of lots) {
        if (need === 0) break;
        const n = Math.min(lot.remaining, need);
        if (n === 0) continue;
        lot.remaining -= n;
        draw.lots.push([lot, n]);
        need -= n;
      }
      draws.set(r.id, draw);
    }
  }

  const quotes = orders.map((o) => {
    const lot = lots.find((l) => l.orderId === o.id);
    const remaining = lot?.remaining ?? 0;
    const paidAt = o.approvedAt ?? lot?.creditedAt ?? now;
    const unused = remaining === o.tokens;
    const within7Days = now.getTime() - paidAt.getTime() < TOPUP_FULL_REFUND_DAYS * DAY_MS;
    const refundKrw = unused && within7Days ? o.krw : Math.floor((o.krw * remaining) / o.tokens);
    return { orderId: o.id, krw: o.krw, tokens: o.tokens, remaining, paidAt, unused, within7Days, refundKrw };
  });
  return { quotes, free, paid: lots.reduce((s, l) => s + l.remaining, 0) };
}
