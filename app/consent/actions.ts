"use server";

import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function saveConsent(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // Server-side enforcement of "no implicit consent": all three required
  // checkboxes must be present in the submission.
  const privacy = formData.get("privacy") === "on";
  const overseas = formData.get("overseas") === "on";
  const terms = formData.get("terms") === "on";
  if (!privacy || !overseas || !terms) {
    throw new Error("필수 동의 항목이 누락되었습니다.");
  }

  const now = new Date();
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      privacyConsentAt: now,
      overseasTransferConsentAt: now,
      termsConsentAt: now,
    },
  });

  redirect("/timeline");
}
