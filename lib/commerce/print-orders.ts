// My Life 인쇄본 — 출력 편집 상태(PrintDraft)와 주문 생성(2026-11-08 — print-mylife.md §2·§5, Q10·Q11).
// 금액·장수는 서버가 지금 지도 + 저장한 편집 상태로 다시 계산한다(클라가 보낸 장수·금액 불신). 실제 지도는 읽기만.
// 정산·성공 화면·탈퇴 정리는 기존 ProductOrder 경로(productId "mylife-print") 그대로. 결제 = 토스 결제위젯 v2(테스트 키).

import { prisma } from "../db";
import { getMyLifeData } from "../my-life";
import { PRINT_COPY as T } from "../print-copy";
import { DEFAULT_PRINT_OPTIONS, layoutPrint, liveKeys, PRINT, type PrintLayout, type PrintOptions } from "../print-layout";
import type { CreateProductOrderResult, ShippingInput } from "./orders";
import { PRINT_MIN_PAGES, PRINT_PAGE_KRW, printOnSale, printPrice } from "./print-price";
import { getProduct } from "./products";

export const PRINT_PRODUCT_ID = "mylife-print";

// 실결제 플래그 — POSTER_PAYMENT_LIVE_ENABLED 와 같은 뜻(기본 꺼짐 = 테스트 결제, 발주 대상 아님). 켜지 않는다(2026-11-08 성민).
export const PRINT_PAYMENT_LIVE_ENABLED = process.env.PRINT_PAYMENT_LIVE_ENABLED === "true";

// tierId 는 2026-11-09 장당 금액으로 바뀌며 뺌(그 전 인쇄본 주문 0건 — 장수 = layout.pageCount = 주문 quantity).
export type PrintSnapshot = { v: 1; owner: string; options: PrintOptions; layout: PrintLayout };

const KEY_RE = /^(ev|st|pe|pl|gl|pgl|cat|cn):[A-Za-z0-9_-]{1,64}$/;
const MAX_EXCLUDED = 3000;

// 화면에서 온 값 → 편집 상태(모양이 틀리면 기본값). live 가 있으면 지금 지도에 있는 키만 남김.
export function sanitizePrintOptions(raw: unknown, live?: Set<string>): PrintOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const excluded = Array.isArray(o.excluded)
    ? [...new Set(o.excluded.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)))].slice(0, MAX_EXCLUDED)
    : [];
  return {
    excluded: live ? excluded.filter((k) => live.has(k)) : excluded,
    showPeopleEdges: typeof o.showPeopleEdges === "boolean" ? o.showPeopleEdges : DEFAULT_PRINT_OPTIONS.showPeopleEdges,
    showPlaceEdges: typeof o.showPlaceEdges === "boolean" ? o.showPlaceEdges : DEFAULT_PRINT_OPTIONS.showPlaceEdges,
    initials: typeof o.initials === "boolean" ? o.initials : DEFAULT_PRINT_OPTIONS.initials,
  };
}

export async function getPrintDraft(userId: string): Promise<PrintOptions> {
  const row = await prisma.printDraft.findUnique({ where: { userId } });
  return row ? sanitizePrintOptions(row) : DEFAULT_PRINT_OPTIONS;
}

export async function savePrintDraft(userId: string, raw: unknown): Promise<PrintOptions> {
  const opts = sanitizePrintOptions(raw);
  await prisma.printDraft.upsert({ where: { userId }, create: { userId, ...opts }, update: opts });
  return opts;
}

// 화면 이름(표지) — 회원 이름. 없으면 빈 문자열(표지에 "My Life" 만).
export async function printOwnerName(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return u?.name?.trim() ?? "";
}

export async function createPendingPrintOrder(
  userId: string,
  rawOptions: unknown,
  shipping: ShippingInput,
  pageKrw: number = PRINT_PAGE_KRW, // 회귀만 바꿈(금액이 없을 때 거절 확인용)
): Promise<CreateProductOrderResult & { pageCount?: number }> {
  const product = getProduct(PRINT_PRODUCT_ID);
  if (!product || !printOnSale(pageKrw)) return { ok: false, error: T.notOnSale };

  const recipientName = shipping.recipientName.trim();
  const recipientPhone = shipping.recipientPhone.trim();
  const postalCode = shipping.postalCode?.trim() || "";
  const address1 = shipping.address1.trim();
  if (!recipientName || !recipientPhone || !postalCode || !address1) return { ok: false, error: T.needShipping };

  // 편집 상태를 먼저 저장하고(주문 = 마지막 편집), 지금 지도로 다시 그린다.
  const [data, owner] = await Promise.all([getMyLifeData(userId), printOwnerName(userId)]);
  const options = sanitizePrintOptions(await savePrintDraft(userId, rawOptions), liveKeys(data));
  const layout = layoutPrint(data, owner, options);
  if (layout.pageCount < PRINT_MIN_PAGES) return { ok: false, error: T.noPages }; // 최소 2장(표지 + 1장)
  // 금액 = 화면 금액 줄과 같은 함수(printPrice) — 장당 금액 × 장수 + 배송비(0).
  const price = layout.overLimit ? null : printPrice(layout.pageCount, pageKrw);
  if (!price) return { ok: false, error: T.tooMany(PRINT.MAX_PAGES), pageCount: layout.pageCount };

  const snapshot: PrintSnapshot = { v: 1, owner, options, layout };
  const { totalKrw } = price;
  const fields = {
    productId: PRINT_PRODUCT_ID,
    optionId: null,
    quantity: price.quantity,
    unitKrw: price.unitKrw,
    shippingKrw: price.shippingKrw,
    totalKrw,
    recipientName,
    recipientPhone,
    postalCode,
    address1,
    address2: shipping.address2?.trim() || null,
    jibunAddress: shipping.jibunAddress?.trim() || null,
    deliveryMemo: shipping.deliveryMemo?.trim() || null,
    paymentMethod: "card",
    status: "pending",
    paymentLive: PRINT_PAYMENT_LIVE_ENABLED,
    printSnapshot: snapshot,
  } as const;
  // 같은 사용자의 미결제 대기 주문은 재사용(2026-11-09) — [결제하기]를 여러 번 눌러도(결제 수단·카드사를 안 골라 결제창이
  // 안 열린 경우 등) 대기 주문은 하나. 사용자마다 잠금을 걸어 동시에 눌러도 둘이 생기지 않게. 토스 orderId 는 승인된 결제끼리만
  // 겹치면 안 되므로 미승인 주문 번호를 다시 써도 됨. 금액·배송지·스냅샷은 지금 값으로 덮어씀.
  const order = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`print-order:${userId}`}))`;
    const open = await tx.productOrder.findFirst({
      where: { userId, productId: PRINT_PRODUCT_ID, status: "pending", paymentKey: null },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return open
      ? tx.productOrder.update({ where: { id: open.id }, data: fields, select: { id: true } })
      : tx.productOrder.create({ data: { userId, ...fields }, select: { id: true } });
  });
  return { ok: true, order: { orderId: order.id, totalKrw, orderName: T.orderName(product.name, layout.pageCount) }, pageCount: layout.pageCount };
}
