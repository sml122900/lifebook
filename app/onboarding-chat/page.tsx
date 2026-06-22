import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import OnboardingChatClient from "./OnboardingChatClient";

// 채팅 온보딩 진입. onboardingCompletedAt 이 이미 찍혀있으면 메인으로.
export default async function OnboardingChatPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingCompletedAt: true },
  });
  if (user?.onboardingCompletedAt) redirect("/life-timeline");

  return <OnboardingChatClient />;
}
