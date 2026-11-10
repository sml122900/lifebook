// 토큰 충전 환불 계산(2026-11-10 — 환불 정책 lib/commerce/order-display TOKEN_REFUND_LINES). 순수 함수, prisma 없음.
//
// 지갑은 잔액 한 칸(TokenWallet.balance)이지만 모든 잔액 변경이 원장(TokenTransaction)에 이유와 함께 남는다(lib/tokens/wallet 불변식).
// 그래서 원장을 처음부터 다시 따라가며 무료 토큰과 충전 건별 유료 토큰이 얼마 남았는지 센다. 사용 순서는 이 계산이 정한다:
//   - 무료 토큰 먼저 → 그다음 유료 토큰(만료가 가까운 것부터 — 유효기간이 모두 충전일로부터 1년이라 먼저 충전한 것부터와 같음).
//   - + 거래: 이유 "topup" = 충전 건(refId = TokenOrder.id) · 이유가 "_refund" 로 끝나고 refId 가 앞의 차감 거래 id = 그 차감을 되돌림
//     (그 차감이 꺼낸 칸으로 — 유료 먼저) · 그 밖(가입·출석 등) = 무료.
//   - − 거래: 이유 "topup_refund"(refId = 충전 주문 id) = 그 충전을 환불해 남은 토큰을 뺌 · 그 밖 = 사용(무료 → 유료 순으로 꺼냄).
// 환불 금액: 결제 후 7일 안 + 하나도 안 쓴 충전 = 결제 금액 전부 · 그 밖 = 결제 금액 × 남은 토큰 ÷ 그 충전으로 받은 토큰(더 드린 토큰 포함),
// 원 아래 버림(성민 확정 2026-11-10 — 수수료 없음). 안 쓴 충전은 비례식도 결제 금액 전부라, 환불 금액은 늘 refundKrwFor(order, 남은 토큰).
// 무료 토큰은 환불 대상 아님. 실행(관리자 — 토스 결제 취소 + 원장 차감) = lib/tokens/refund-exec.
// 유효기간(2026-11-10 성민): 유료 토큰 = 충전일(결제 시각)로부터 1년(TOPUP_VALID_YEARS). 만료된 충전은 자동 환불 대상 아님(refundKrw 0 · expired) —
// 만료분을 소멸할지 환불할지는 법률 검토 뒤(그때까지 지갑에서 빼지도 않음). 만료 30일 전부터 토큰 화면에 안내(expiringSoon).

export type LedgerRow = { id: string; delta: number; reason: string; refId: string | null; createdAt: Date };
export type PaidTopupOrder = { id: string; krw: number; tokens: number; approvedAt: Date | null };

export type TopupRefundQuote = {
  orderId: string;
  krw: number;
  tokens: number;
  remaining: number; // 이 충전에서 아직 안 쓴 토큰(환불했으면 0)
  refundedTokens: number; // 이미 환불한 토큰(topup_refund) — 0 이 아니면 이 충전은 다시 환불하지 않음
  paidAt: Date;
  unused: boolean; // 하나도 안 씀
  within7Days: boolean; // 결제 후 7일 안
  expiresAt: Date; // 충전일로부터 1년
  expired: boolean; // 유효기간 지남 — 자동 환불 대상 아님(처리 방식 법률 검토)
  expiringSoon: boolean; // 만료 30일 전부터(아직 안 지남 · 남은 토큰 있음) — 토큰 화면 안내
  refundKrw: number;
};

export const TOPUP_FULL_REFUND_DAYS = 7;
export const TOPUP_VALID_YEARS = 1;
export const TOPUP_EXPIRY_NOTICE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// 충전일로부터 1년 — 같은 시각 다음 해(2월 29일 충전은 3월 1일).
export function topupExpiresAt(paidAt: Date): Date {
  const d = new Date(paidAt);
  d.setUTCFullYear(d.getUTCFullYear() + TOPUP_VALID_YEARS);
  return d;
}

// 남은 토큰 → 돌려드릴 금액(원 아래 버림). 다 남았으면 결제 금액 전부.
export function refundKrwFor(order: { krw: number; tokens: number }, remaining: number): number {
  return Math.floor((order.krw * remaining) / order.tokens);
}

type Lot = { orderId: string; remaining: number; creditedAt: Date; expiresAt: Date; refunded: number };
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
        lots.push({ orderId: r.refId, remaining: r.delta, creditedAt: r.createdAt, expiresAt: topupExpiresAt(r.createdAt), refunded: 0 });
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
    if (r.delta < 0 && r.reason === "topup_refund" && r.refId) {
      // 충전 환불 — 그 충전 칸에서만 뺀다(무료·다른 충전은 그대로)
      const lot = lots.find((l) => l.orderId === r.refId);
      if (lot) {
        const n = Math.min(lot.remaining, -r.delta);
        lot.remaining -= n;
        lot.refunded += -r.delta;
      }
      continue;
    }
    if (r.delta < 0) {
      let need = -r.delta;
      const draw: Draw = { free: 0, lots: [] };
      const fromFree = Math.min(free, need);
      free -= fromFree;
      draw.free = fromFree;
      need -= fromFree;
      // 만료가 가까운 유료부터(만료된 것 포함 — 지갑에서 아직 빼지 않았으므로 먼저 쓰인 것으로 봄)
      for (const lot of [...lots].sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())) {
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
    const refundedTokens = lot?.refunded ?? 0;
    const expiresAt = topupExpiresAt(paidAt);
    const expired = now.getTime() >= expiresAt.getTime();
    const expiringSoon = !expired && remaining > 0 && expiresAt.getTime() - now.getTime() <= TOPUP_EXPIRY_NOTICE_DAYS * DAY_MS;
    const refundKrw = refundedTokens > 0 || expired ? 0 : unused && within7Days ? o.krw : refundKrwFor(o, remaining);
    return { orderId: o.id, krw: o.krw, tokens: o.tokens, remaining, refundedTokens, paidAt, unused, within7Days, expiresAt, expired, expiringSoon, refundKrw };
  });
  return { quotes, free, paid: lots.reduce((s, l) => s + l.remaining, 0) };
}
