import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TOPUP_PACKAGES } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

import { TopupButton } from "./TopupButton";

// /billing — token wallet + top-up entry. Client key is safe to embed
// in markup (it's public by design); secret key never leaves the
// server.

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/timeline"
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 타임라인으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-zinc-900">토큰 충전</h1>
        <p className="mt-3 text-2xl text-zinc-900">
          남은 토큰{" "}
          <span className="font-bold">{balance.toLocaleString()}개</span>
        </p>
      </header>

      <section className="flex flex-col gap-4">
        {TOPUP_PACKAGES.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-md border-2 border-zinc-200 bg-white p-5"
          >
            <div>
              <p className="text-xl font-bold text-zinc-900">{p.label}</p>
              <p className="mt-1 text-base text-zinc-700">
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

      <p className="text-base text-zinc-600">
        테스트 모드입니다. 실제 청구는 일어나지 않아요. 토스 테스트 카드로
        결제해 보실 수 있습니다.
      </p>
    </main>
  );
}
