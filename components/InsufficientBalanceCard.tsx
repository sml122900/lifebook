import Link from "next/link";

import { TOPUP_OPEN } from "@/lib/tokens/policy";

// 토큰 부족 안내 카드 (시니어 친화). 따뜻한 톤, 큰 글씨, 큰 터치 영역,
// 죄책감 유발 표현 없음. 잔액 부족으로 막힌 흐름에서 충전을 부드럽게 권한다.

type Props = {
  balance: number;
  required: number;
};

export function InsufficientBalanceCard({ balance, required }: Props) {
  return (
    <section className="rounded-md border-2 border-line bg-banner p-6">
      <p className="text-2xl font-bold text-ink">
        {TOPUP_OPEN ? "토큰이 부족해요. 충전하시겠어요?" : "토큰이 부족해요."}
      </p>
      <p className="mt-3 text-lg text-ink">
        지금 남은 토큰은 {balance.toLocaleString()}개예요. 추억 한 번을 시작하려면
        {" "}{required}개가 필요해요.
      </p>
      {/* 충전 비공개(2026-11-09 — TOPUP_OPEN) 동안은 충전 권유 없이 */}
      {TOPUP_OPEN ? (
        <>
          <p className="mt-2 text-base text-ink-soft">
            걱정하지 마세요. 잠깐 충전하시고 다시 오시면 그대로 이어집니다.
          </p>
          <Link
            href="/billing"
            className="mt-5 inline-block rounded-md bg-action px-6 py-4 text-lg font-semibold text-on-action hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            토큰 충전하러 가기
          </Link>
        </>
      ) : (
        <p className="mt-2 text-base text-ink-soft">매일 출석체크로 토큰을 받으실 수 있어요.</p>
      )}
    </section>
  );
}
