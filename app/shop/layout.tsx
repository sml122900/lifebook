import type { ReactNode } from "react";

// /shop 전체 공통 레이아웃 — 결제수단 안내 상시 배너. 무통장입금은 실제
// 주문이고 카드결제만 테스트 모드라, 부모님이 헷갈리지 않도록 둘을 구분해
// 상점·상세·주문·결과 모든 화면 상단에 고정 노출.
// /shop/* 는 비공개 경로라 proxy.ts 가 이미 로그인 + 동의를 강제한다.
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div
        role="note"
        className="border-b-2 border-brand bg-banner px-6 py-3 text-center text-base font-semibold text-action"
      >
        무통장입금(계좌이체)은 실제 주문이에요. 카드결제는 지금 테스트 모드예요.
      </div>
      {children}
    </>
  );
}
