import { BANK_TRANSFER_INFO } from "@/lib/commerce/bank";

// 무통장입금 안내 — 주문 완료/내 주문에서 공용. 실제 입금받는 계좌이므로
// 금액·계좌·입금자명 안내를 명확히(시니어 친화 큰 글씨).

const won = (n: number) => n.toLocaleString("ko-KR");

export function BankDepositGuide({
  amount,
  orderId,
  ordererName,
}: {
  amount: number;
  orderId: string;
  ordererName?: string | null;
}) {
  return (
    <section className="rounded-md border-2 border-brand bg-banner px-5 py-4">
      <h2 className="text-lg font-bold text-action">입금 안내</h2>
      <p className="mt-2 text-lg text-ink">
        아래 계좌로 <b className="text-action">{won(amount)}원</b>을 입금해
        주세요.
      </p>
      <dl className="mt-3 grid grid-cols-[5.5rem_1fr] gap-y-1.5 text-base">
        <dt className="text-ink-soft">은행</dt>
        <dd className="font-semibold text-ink">{BANK_TRANSFER_INFO.bankName}</dd>
        <dt className="text-ink-soft">계좌번호</dt>
        <dd className="text-lg font-bold text-ink">
          {BANK_TRANSFER_INFO.accountNumber}
        </dd>
        <dt className="text-ink-soft">예금주</dt>
        <dd className="font-semibold text-ink">
          {BANK_TRANSFER_INFO.accountHolder}
        </dd>
        <dt className="text-ink-soft">주문번호</dt>
        <dd className="break-all text-ink">{orderId}</dd>
      </dl>
      <p className="mt-3 rounded-md bg-surface px-4 py-3 text-base text-ink">
        <b>주문하신 분 성함으로 입금</b>해 주세요
        {ordererName ? ` (예: ${ordererName})` : ""}. 입금자명이 다르면 입금
        확인이 어려워요.
      </p>
      <p className="mt-2 text-sm text-ink-soft">
        입금이 확인되면 제작이 시작돼요 (영업일 1~2일 내 확인).
      </p>
    </section>
  );
}
