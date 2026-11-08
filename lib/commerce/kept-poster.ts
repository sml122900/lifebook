// 강물 포스터 보존 주문(2026-11-08 — 판매 종료로 그리기 코드 삭제, docs/phase/print-mylife.md §9.5·Q17).
// 결제 완료 이상 2건(전자상거래법 5년 보존 대상 — 주문 행·posterSnapshot 그대로)은 삭제 전 인쇄 그림을 한 번 만들어
// 비공개 Storage(photos/poster-orders/)에 두었다: 인쇄용 JPEG 5008×7063 300dpi(<id>-print.jpg) + 화면용 webp(<id>-preview.webp).
// 관리자 발주 화면·주인 주문 상세가 이 그림만 보여 준다(서명 URL 1시간).

import { getSignedUrl } from "../storage";

const KEPT_POSTER_ORDER_IDS = new Set(["cmqt53abh000004l8c62dypbg", "cmquvx5p4000004jurdgnrm6d"]);

export async function keptPosterImages(orderId: string): Promise<{ preview: string; print: string } | null> {
  if (!KEPT_POSTER_ORDER_IDS.has(orderId)) return null;
  try {
    const [preview, print] = await Promise.all([
      getSignedUrl(`poster-orders/${orderId}-preview.webp`),
      getSignedUrl(`poster-orders/${orderId}-print.jpg`),
    ]);
    return { preview, print };
  } catch (e) {
    console.error("[kept-poster] 그림 주소 발급 실패", e instanceof Error ? e.message : e);
    return null;
  }
}
