// Phase 8.5 — Toss Payments server-side helpers.
//
// The secret key MUST stay on the server. It only appears here and in
// .env — never imported into any client component, never returned to
// the browser. Public client key is exposed separately to the SDK.

const TOSS_BASE = "https://api.tosspayments.com";

function getSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY;
  if (!key) {
    throw new Error("TOSS_SECRET_KEY is not set");
  }
  return key;
}

function basicAuthHeader(): string {
  // Toss expects "secret_key:" — colon kept, empty password — base64'd.
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
 * Calls Toss /v1/payments/confirm to finalize a payment. Toss itself
 * checks that paymentKey + orderId + amount match what their UI
 * recorded; on success the response carries the authoritative
 * totalAmount, which we compare against our PENDING order before
 * crediting anything.
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
