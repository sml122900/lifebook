import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { markOrderFailed } from "@/lib/tokens/orders";

// /billing/fail — Toss redirects here on user cancel / card failure.
// We mark the PENDING order as failed (best-effort, scoped to this
// user) so it doesn't sit around forever.

type SP = Promise<{ code?: string; message?: string; orderId?: string }>;

export default async function BillingFailPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : "UNKNOWN";
  const message =
    typeof sp.message === "string" ? sp.message : "결제가 완료되지 않았어요.";
  const orderId = typeof sp.orderId === "string" ? sp.orderId : null;

  if (orderId) {
    // markOrderFailed scopes the update to PENDING + this user via
    // updateMany so another user can't poke at it.
    await markOrderFailed(orderId, `${code}: ${message}`);
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-bold text-zinc-900">결제가 취소됐어요</h1>
      <p className="text-lg text-zinc-800">{message}</p>
      <p className="text-base text-zinc-600">코드: {code}</p>
      <Link
        href="/billing"
        className="self-start rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        다시 시도하기
      </Link>
    </main>
  );
}
