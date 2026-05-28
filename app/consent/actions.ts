"use server";

// 동의 저장 서버 액션. 3종 동의 시각을 User 행에 기록한다(이후 JWT 의
// consentComplete 가 true 가 되어 미들웨어 게이트를 통과).
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function saveConsent(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // "묵시적 동의 금지"의 서버 측 강제: 필수 체크박스 3개가 제출에 모두
  // 있어야 한다(클라 검증만 믿지 않음).
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
}
