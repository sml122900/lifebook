"use server";

// 타임라인의 트리거 카드 "기억나요/잘 모르겠어요" 응답 저장.
// confirmed = 타임라인에 유지(Phase 7 추억 작성 대상), dismissed = 숨김.
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

  // ⚠️ unique 키가 (userId, eventId) 라, 사용자는 자기 응답만 뒤집을 수
  // 있고 남의 응답은 절대 덮어쓸 수 없다.
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
