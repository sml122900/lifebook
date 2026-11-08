import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { getPrintDraft, printOwnerName } from "@/lib/commerce/print-orders";
import { PRINT_TIERS, printOnSale } from "@/lib/commerce/print-tiers";
import { SHIPPING_KRW } from "@/lib/commerce/products";
import { getMyLifeData } from "@/lib/my-life";
import { getOnboardingTrack } from "@/lib/onboarding-track";
import { PRINT_COPY as T } from "@/lib/print-copy";
import { liveKeys } from "@/lib/print-layout";

import { PrintEditor } from "./PrintEditor";

// /my-life/print — My Life 인쇄본 출력 편집(2026-11-08 — docs/phase/print-mylife.md §2). V3 사용자만(Q16).
// 실제 지도는 읽기만 — 빼기·간선·이니셜은 인쇄본에만(PrintDraft). 가격이 정해지기 전에는 [주문하기]가 잠기고 들어오는 버튼도 없다.
export default async function MyLifePrintPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?returnTo=/my-life/print");
  const userId = session.user.id;
  if ((await getOnboardingTrack(userId)) !== "V3") redirect("/enter");

  const [data, draft, owner] = await Promise.all([getMyLifeData(userId), getPrintDraft(userId), printOwnerName(userId)]);
  const live = liveKeys(data);
  const initial = { ...draft, excluded: draft.excluded.filter((k) => live.has(k)) }; // 지워진 노드 키는 무시(§2.2)
  // 카드결제 테스트 안내 = 결제위젯 키 기준(결제창 키 기준 isTossTestMode 와 따로 — 상품 주문만 위젯)

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
      <ButtonLink href="/my-life" variant="tertiary" className="self-start">
        {T.back}
      </ButtonLink>
      <h1 className="mt-6 text-ink">{T.pageTitle}</h1>
      <div className="mt-6">
        {data.events.length === 0 ? (
          <p className="text-xl text-ink">{T.empty}</p>
        ) : (
          <PrintEditor
            data={data}
            owner={owner}
            initial={initial}
            tiers={[...PRINT_TIERS]}
            onSale={printOnSale(SHIPPING_KRW)}
            shippingKrw={SHIPPING_KRW}
            widgetClientKey={process.env.TOSS_WIDGET_CLIENT_KEY ?? null}
            customerKey={userId}
            testMode={(process.env.TOSS_WIDGET_CLIENT_KEY ?? "").startsWith("test_")}
          />
        )}
      </div>
    </main>
  );
}
