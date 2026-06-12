import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { TOPUP_PACKAGES } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

import { TopupButton } from "./TopupButton";

// 거래 사유별 한국어 라벨. TokenTransaction.reason 은 자유 문자열이라
// 모르는 사유는 원문 코드 그대로 노출(폴백).
const REASON_LABEL: Record<string, string> = {
  signup_grant: "가입 무료 지급",
  ai_charge: "추억 정리",
  topup: "토큰 충전",
  refund: "환불",
  voice_cleanup: "음성 다듬기",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

// /billing — 토큰 지갑 + 충전 입구 + 거래 내역. 클라이언트 키는 마크업에
// 박아도 안전(공개용 설계). 시크릿 키는 서버를 떠나지 않는다.

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const balance = await getBalance(userId);

  const clientKey = process.env.TOSS_CLIENT_KEY;
  if (!clientKey) {
    throw new Error("TOSS_CLIENT_KEY is not set");
  }

  // ⚠️ 여기 모든 읽기는 userId 범위. 50건 제한으로 페이지를 가볍게 —
  // 페이지네이션은 나중 과제.
  const txs = await prisma.tokenTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/life-timeline"
        className={buttonClasses("tertiary", "md", "self-start")}
      >
        ← 인생 연혁으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-ink">토큰 충전</h1>
        <p className="mt-3 text-2xl text-ink">
          남은 토큰{" "}
          <span className="font-bold">{balance.toLocaleString()}개</span>
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {TOPUP_PACKAGES.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-md border-2 border-line bg-surface p-5"
          >
            <div>
              <p className="text-xl font-bold text-ink">{p.label}</p>
              <p className="mt-1 text-base text-ink-soft">
                {p.tokens}개 토큰 · {p.krw.toLocaleString()}원
              </p>
            </div>
            <TopupButton
              packageId={p.id}
              label={p.label}
              clientKey={clientKey}
              customerKey={userId}
            />
          </div>
        ))}
      </section>

      <p className="text-base text-ink-soft">
        테스트 모드입니다. 실제 청구는 일어나지 않아요. 토스 테스트 카드로
        결제해 보실 수 있습니다.
      </p>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">거래 내역</h2>
        {txs.length === 0 ? (
          <p className="text-lg text-ink-soft">아직 내역이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-zinc-200 overflow-hidden rounded-md border-2 border-line bg-surface">
            {txs.map((t) => {
              const positive = t.delta >= 0;
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-4 px-5 py-4"
                >
                  <div className="min-w-0">
                    <p className="text-lg font-semibold text-ink">
                      {reasonLabel(t.reason)}
                    </p>
                    <p className="text-base text-ink-soft">
                      {DATE_FMT.format(t.createdAt)}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-2xl font-bold tabular-nums " +
                      (positive ? "text-emerald-700" : "text-rose-700")
                    }
                  >
                    {positive ? "+" : ""}
                    {t.delta.toLocaleString()}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
