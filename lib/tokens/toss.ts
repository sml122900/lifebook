// Phase 8.5 — 토스페이먼츠 서버 측 헬퍼.
//
// 시크릿 키는 반드시 서버에만 둔다. 여기와 .env 에만 등장 — 어떤 클라
// 컴포넌트에도 import 안 되고, 브라우저로 반환되지 않는다. 공개용 클라
// 키는 별도로 SDK 에 노출한다.

const TOSS_BASE = "https://api.tosspayments.com";

// 결제창(API 개별 연동 키)과 결제위젯(위젯 연동 키 — 2026-11-08 My Life 인쇄본 주문)은 시크릿 키가 다르다.
function getSecretKey(widget = false): string {
  const name = widget ? "TOSS_WIDGET_SECRET_KEY" : "TOSS_SECRET_KEY";
  const key = process.env[name];
  if (!key) {
    throw new Error(`${name} is not set`);
  }
  return key;
}

// 화면의 카드결제 "테스트 모드" 안내는 이 판단 하나로만 켠다(서버 전용).
// 테스트 키(test_ 접두)면 실제 청구가 없고, 라이브 키로 바꾸면 안내가 저절로 사라진다.
export function isTossTestMode(): boolean {
  return process.env.TOSS_CLIENT_KEY?.startsWith("test_") ?? false;
}

function basicAuthHeader(widget = false): string {
  // 토스는 "시크릿키:" 형식(콜론 유지, 비밀번호는 빈 값)을 base64 로 받는다.
  return "Basic " + Buffer.from(`${getSecretKey(widget)}:`).toString("base64");
}

export type TossConfirmRequest = {
  paymentKey: string;
  orderId: string;
  amount: number;
};

export type TossConfirmedPayment = {
  paymentKey: string;
  orderId: string;
  totalAmount: number;
  status: string; // "DONE", "CANCELED", etc.
  method?: string;
  approvedAt?: string;
  currency?: string;
};

export class TossConfirmError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(`${code}: ${message}`);
    this.name = "TossConfirmError";
    this.code = code;
    this.status = status;
  }
}

/**
 * 토스 /v1/payments/confirm 을 호출해 결제를 확정한다. 토스가 직접
 * paymentKey + orderId + amount 가 자기 UI 기록과 맞는지 확인하고,
 * 성공 시 응답에 권위 있는 totalAmount 가 담긴다 — 우리는 적립 전에 이
 * 값을 PENDING 주문과 비교한다.
 */
export async function confirmTossPayment(
  body: TossConfirmRequest,
  opts: { widget?: boolean } = {}, // 결제위젯으로 연 결제면 위젯 시크릿 키(호출부가 주문 상품을 보고 정함)
): Promise<TossConfirmedPayment> {
  const res = await fetch(`${TOSS_BASE}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(opts.widget),
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const code = typeof json.code === "string" ? json.code : "UNKNOWN";
    const message = typeof json.message === "string" ? json.message : "no message";
    throw new TossConfirmError(code, message, res.status);
  }
  return json as unknown as TossConfirmedPayment;
}
