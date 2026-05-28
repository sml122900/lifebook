// Phase 8.5 — 토스페이먼츠 서버 측 헬퍼.
//
// 시크릿 키는 반드시 서버에만 둔다. 여기와 .env 에만 등장 — 어떤 클라
// 컴포넌트에도 import 안 되고, 브라우저로 반환되지 않는다. 공개용 클라
// 키는 별도로 SDK 에 노출한다.

const TOSS_BASE = "https://api.tosspayments.com";

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY is not set");
  }
  return key;
}

function basicAuthHeader(): string {
  // 토스는 "시크릿키:" 형식(콜론 유지, 비밀번호는 빈 값)을 base64 로 받는다.
  return "Basic " + Buffer.from(`${getSecretKey()}:`).toString("base64");
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
): Promise<TossConfirmedPayment> {
  const res = await fetch(`${TOSS_BASE}/v1/payments/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: basicAuthHeader(),
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
