import Link from "next/link";

// /shop/order/fail — 토스 결제 실패/취소 리다이렉트. 쿼리스트링(code/message)
// 은 안내용. 주문은 PENDING 으로 남고 적립/접수는 일어나지 않는다.
type SP = Promise<{ code?: string; message?: string; orderId?: string }>;

export default async function ShopOrderFailPage({
  searchParams,
}: {
  searchParams: SP;
}) {
  const sp = await searchParams;
  const message =
    typeof sp.message === "string" && sp.message
      ? sp.message
      : "결제가 완료되지 않았어요.";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-bold text-rose-800">결제를 마치지 못했어요</h1>
      <p className="text-lg text-ink">{message}</p>
      <p className="text-base text-ink-soft">
        결제는 진행되지 않았어요. 다시 시도하시거나 잠시 후 시도해 주세요.
      </p>
      <Link
        href="/shop"
        className="self-start rounded-md border-2 border-line px-6 py-4 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        상점으로 돌아가기
      </Link>
    </main>
  );
}
