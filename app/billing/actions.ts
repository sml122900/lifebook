"use server";

import { auth } from "@/auth";
import { createPendingOrder, type CreatedOrder } from "@/lib/tokens/orders";

// Phase 8.5 — turn a packageId into a PENDING TokenOrder. The client
// passes ONLY the package id; the server records the canonical krw +
// tokens straight from policy. Returns the ids/values the Toss SDK
// needs to open the payment window.
export async function startTopup(packageId: string): Promise<CreatedOrder> {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  return createPendingOrder(session.user.id, packageId);
}
