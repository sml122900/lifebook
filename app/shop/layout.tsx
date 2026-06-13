import type { ReactNode } from "react";

// /shop 전체 공통 레이아웃 — "테스트 결제" 상시 배너. 부모님이 "진짜
// 주문됐나" 오해하지 않도록 상점·상세·주문·결과 모든 화면 상단에 고정 노출.
// /shop/* 는 비공개 경로라 proxy.ts 가 이미 로그인 + 동의를 강제한다.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        role="note"
        className="border-b-2 border-brand bg-banner px-6 py-3 text-center text-base font-semibold text-action"
      >
        테스트 결제 화면이에요 — 실제로 청구되거나 배송되지 않아요.
      </div>
      {children}
    </>
  );
}
