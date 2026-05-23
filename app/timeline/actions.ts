"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

async function saveResponse(
  formData: FormData,
  status: "confirmed" | "dismissed",
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }
  const eventId = formData.get("eventId");
  if (typeof eventId !== "string" || eventId === "") {
    throw new Error("missing eventId");
  }

  // ⚠️ The unique key is (userId, eventId), so a user can flip their own
  // response but can never overwrite anyone else's.
  await prisma.triggerResponse.upsert({
    where: {
      userId_eventId: { userId: session.user.id, eventId },
    },
    create: { userId: session.user.id, eventId, status },
    update: { status },
  });

  revalidatePath("/timeline");
}

export async function confirmTrigger(formData: FormData) {
  await saveResponse(formData, "confirmed");
}

export async function dismissTrigger(formData: FormData) {
  await saveResponse(formData, "dismissed");
}
