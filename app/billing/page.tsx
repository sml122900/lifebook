import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { TOPUP_PACKAGES } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

// /billing — placeholder for the Phase 8.5 top-up flow. For now it
// shows the current balance and the package list so 8.4's
// insufficient-balance card has somewhere meaningful to send users.

export default async function BillingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const balance = await getBalance(session.user.id);

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
            <button
              type="button"
              disabled
              className="rounded-md bg-zinc-300 px-6 py-4 text-lg font-semibold text-white"
            >
              곧 열림
            </button>
          </div>
        ))}
      </section>

      <p className="text-base text-zinc-600">
        실제 결제 흐름은 다음 단계(8.5)에서 들어옵니다.
      </p>
    </main>
  );
}
