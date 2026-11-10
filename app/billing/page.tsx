import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { KST_DATE_TIME_FMT } from "@/lib/kst-date";
import { TOKEN_REFUND_LINES } from "@/lib/commerce/order-display";
import { topupRemainingTodayKrw } from "@/lib/tokens/orders";
import { TOPUP_DAILY_LIMIT_KRW, TOPUP_OPEN, TOPUP_PACKAGES, TOPUP_PRODUCT } from "@/lib/tokens/policy";
import { isTossWidgetTestMode } from "@/lib/tokens/toss";
import { getBalance } from "@/lib/tokens/wallet";

import { TopupCheckout } from "./TopupCheckout";

// 거래 사유별 한국어 라벨. TokenTransaction.reason 은 자유 문자열이라
// 모르는 사유는 원문 코드 그대로 노출(폴백).
const REASON_LABEL: Record<string, string> = {
  signup_grant: "가입 무료 지급",
  ai_charge: "추억 정리",
  topup: "토큰 충전",
  topup_refund: "충전 환불", // 2026-11-10 — 관리자 환불(lib/tokens/refund-exec)
  refund: "환불",
  voice_cleanup: "음성 다듬기",
};

function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

// /billing — 토큰 지갑 + 충전(결제위젯 v2 — 2026-11-10) + 환불·쓰는 곳 + 거래 내역. 클라이언트 키는 마크업에
// 박아도 안전(공개용 설계). 시크릿 키는 서버를 떠나지 않는다.

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const balance = await getBalance(userId);

  // 토큰 충전 닫혀 있을 때(TOPUP_OPEN false — 2026-11-09~10 비공개) — 주소로 들어오면 안내만. 남은 토큰은 그대로 쓸 수 있음.
  if (!TOPUP_OPEN) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
        <Link href="/" className={buttonClasses("tertiary", "md", "self-start")}>
          ← 처음 화면으로
        </Link>
        <h1 className="text-3xl font-bold text-ink">토큰 충전</h1>
        <p className="rounded-md border-2 border-line bg-banner px-5 py-4 text-lg text-ink">
          지금은 토큰 충전을 받지 않아요. 남은 토큰은 그대로 쓰실 수 있어요.
        </p>
        <p className="text-2xl text-ink">
          남은 토큰 <span className="font-bold">{balance.toLocaleString()}개</span>
        </p>
        <Link href="/account/tokens" className={buttonClasses("secondary", "lg", "self-start")}>
          내 토큰 보기
        </Link>
      </main>
    );
  }

  // ⚠️ 여기 모든 읽기는 userId 범위. 50건 제한으로 페이지를 가볍게 —
  // 페이지네이션은 나중 과제.
  const [txs, remainingKrw] = await Promise.all([
    prisma.tokenTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    topupRemainingTodayKrw(userId), // 하루 충전 한도(2026-11-10)
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/"
        className={buttonClasses("tertiary", "md", "self-start")}
      >
        ← 처음 화면으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-ink">토큰 충전</h1>
        <p className="mt-3 text-2xl text-ink">
          남은 토큰{" "}
          <span className="font-bold">{balance.toLocaleString()}개</span>
        </p>
        <p className="mt-3 text-lg text-ink-soft">{TOPUP_PRODUCT.blurb}</p>
      </header>

      {/* 결제위젯 v2(2026-11-10 — 인쇄본과 같은 위젯·키). 키가 없으면 위젯 대신 "결제 준비가 아직" 안내 */}
      <TopupCheckout
        packages={TOPUP_PACKAGES}
        dailyLimitKrw={TOPUP_DAILY_LIMIT_KRW}
        remainingKrw={remainingKrw}
        widgetClientKey={process.env.TOSS_WIDGET_CLIENT_KEY ?? null}
        customerKey={userId}
        testMode={isTossWidgetTestMode()}
      />

      {/* 환불·사용처 — 환불정책·약관 제25조·상점·고객센터와 같은 문장(lib/commerce/order-display TOKEN_REFUND_LINES) */}
      <section aria-labelledby="topup-refund" className="rounded-md border-2 border-line bg-surface px-5 py-4">
        <h2 id="topup-refund" className="text-xl font-bold text-ink">
          환불과 쓰는 곳
        </h2>
        <ul className="mt-2 flex flex-col gap-2 text-lg text-ink-soft">
          {TOKEN_REFUND_LINES.map((line) => (
            <li key={line}>· {line}</li>
          ))}
        </ul>
        <Link
          href="/refund"
          className="mt-3 inline-flex min-h-[48px] items-center text-lg font-semibold text-ink underline hover:text-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          환불·교환 정책 자세히 보기
        </Link>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">거래 내역</h2>
        {txs.length === 0 ? (
          <p className="text-lg text-ink-soft">아직 내역이 없어요.</p>
        ) : (
          <ul className="flex flex-col divide-y-2 divide-line overflow-hidden rounded-md border-2 border-line bg-surface">
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
                      {KST_DATE_TIME_FMT.format(t.createdAt)}
                    </p>
                  </div>
                  <p
                    className={
                      "shrink-0 text-2xl font-bold tabular-nums " +
                      (positive ? "text-success" : "text-danger")
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
