import { KST_DATE_TIME_FMT } from "@/lib/kst-date";
import { refundKrwFor } from "@/lib/tokens/refund";
import { listTopupOrdersForAdmin } from "@/lib/tokens/refund-exec";

import { refundTopupAction } from "./actions";

// /admin/tokens — 토큰 충전 목록과 환불(2026-11-10 성민). 사용자는 고객센터로 환불을 요청하고, 운영자가 여기서
// 금액을 보고 [환불 실행] → 토스 결제 취소(부분 취소 포함) + 원장 차감(lib/tokens/refund-exec). 결과는 사용자 토큰 화면 내역 "충전 환불".
// 게이트 = proxy(/admin) + app/admin/layout + 액션(3중).

export const dynamic = "force-dynamic";

const RESULT_TEXT: Record<string, string> = {
  need_confirm: "금액 확인에 체크해 주세요.",
  not_found: "주문을 찾지 못했어요.",
  not_paid: "결제된 충전이 아니에요.",
  withdrawn: "탈퇴한 회원의 충전이라 환불할 수 없어요(고객센터에서 따로 처리).",
  already_refunded: "이미 환불한 충전이에요.",
  expired: "유효기간(충전일로부터 1년)이 지난 충전이에요 — 소멸·환불 처리 방식은 법률 검토 뒤 정해요.",
  nothing_to_refund: "돌려드릴 토큰이 남아 있지 않아요.",
};

function resultLine(r: string): string {
  if (r.startsWith("ok:")) {
    const [, krw, tokens] = r.split(":");
    return `환불했어요 — ${Number(krw).toLocaleString()}원 · ${Number(tokens).toLocaleString()}토큰 차감.`;
  }
  if (r.startsWith("cancel_failed:")) return `토스 결제 취소에 실패했어요(${r.slice("cancel_failed:".length)}). 원장은 그대로예요.`;
  return RESULT_TEXT[r] ?? r;
}

export default async function AdminTokensPage({ searchParams }: { searchParams: Promise<{ r?: string; o?: string }> }) {
  const sp = await searchParams;
  const rows = await listTopupOrdersForAdmin();

  return (
    <main className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-ink">토큰 충전 · 환불</h1>
      <p className="text-base text-ink-soft">
        환불 금액 = 결제 후 7일 안에 하나도 안 쓴 충전은 전부, 그 밖은 결제 금액 × 남은 토큰 ÷ 받은 토큰(원 아래 버림). 무료 토큰은 빼고 계산(무료 먼저 → 만료가 가까운 충전부터 쓰임).
        유효기간 = 충전일로부터 1년 — 지난 충전은 자동 환불하지 않음(소멸·환불은 법률 검토 뒤).
        [환불 실행] = 토스 결제 취소 → 성공했을 때만 토큰 차감.
      </p>
      {sp.r && (
        <p role="status" className="rounded-md border-2 border-line bg-banner px-4 py-3 text-lg text-ink">
          {sp.o ? `${sp.o} — ` : ""}
          {resultLine(sp.r)}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="text-lg text-ink-soft">결제된 충전이 없어요.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o) => {
            const q = o.quote;
            const refunded = (q?.refundedTokens ?? 0) > 0;
            return (
              <li key={o.id} className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-4 py-3 text-base text-ink">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-semibold">
                    {o.krw.toLocaleString()}원 · {o.tokens.toLocaleString()}토큰
                  </span>
                  <span className="text-ink-soft">{o.approvedAt ? KST_DATE_TIME_FMT.format(o.approvedAt) : "-"}</span>
                </div>
                <div className="text-ink-soft">
                  {o.user ? `${o.user.name ?? "(이름 없음)"} · ${o.user.email ?? "(이메일 없음)"}` : "(탈퇴한 회원)"} · 주문 {o.id}
                </div>
                {q && (
                  <div>
                    {refunded
                      ? `환불함 — ${q.refundedTokens.toLocaleString()}토큰 · ${refundKrwFor(o, q.refundedTokens).toLocaleString()}원`
                      : q.expired
                        ? `만료(${KST_DATE_TIME_FMT.format(q.expiresAt)}) — 남은 토큰 ${q.remaining.toLocaleString()} · 처리 방식 법률 검토 중`
                        : `남은 토큰 ${q.remaining.toLocaleString()} · ${q.unused ? "안 씀" : "씀"} · ${q.within7Days ? "7일 안" : "7일 지남"} · ${KST_DATE_TIME_FMT.format(q.expiresAt)}까지 → 환불 ${q.refundKrw.toLocaleString()}원`}
                  </div>
                )}
                {q && !refunded && q.refundKrw > 0 && o.userId && (
                  <form action={refundTopupAction} className="flex flex-wrap items-center gap-3">
                    <input type="hidden" name="orderId" value={o.id} />
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name="confirm" className="h-5 w-5" />
                      {q.refundKrw.toLocaleString()}원 환불 금액을 확인했어요
                    </label>
                    <button type="submit" className="rounded-md border-2 border-danger px-4 py-2 font-semibold text-danger hover:bg-danger-wash">
                      환불 실행
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
