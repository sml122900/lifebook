// 발주 어댑터 — 주문 결제 완료 시 "인쇄소로 보내는" 단계를 추상화.
//
// 현재 구현체 = ManualFulfiller(수동): 아무 외부 동작 없음. 관리자가
// /admin/orders 에서 주문·스냅샷을 보고 직접 인쇄소에 전송한다. 추후
// 이메일 알림(EmailFulfiller)·파트너 API(PartnerApiFulfiller)는 이 인터페이스의
// 구현체 교체로 추가한다(호출부 무수정).

export type FulfillableOrder = {
  id: string;
  productId: string;
  optionId: string | null;
};

export interface OrderFulfiller {
  // 결제 승인(paid) 직후 1회 호출. 멱등하게 구현할 것(재호출 안전).
  onOrderPaid(order: FulfillableOrder): Promise<void>;
}

// 수동 발주 — no-op. 관리자 페이지가 사람의 손으로 처리.
class ManualFulfiller implements OrderFulfiller {
  async onOrderPaid(_order: FulfillableOrder): Promise<void> {
    void _order;
    // 의도적 no-op. 이메일/파트너 API 구현체로 교체 시 여기에 동작 추가.
  }
}

export const orderFulfiller: OrderFulfiller = new ManualFulfiller();
