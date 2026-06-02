import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { ConsentForm } from "./ConsentForm";

// 동의 게이트 페이지. 로그인했으나 3종 동의(개인정보·국외이전·약관)가
// 아직이면 미들웨어(proxy.ts)가 여기로 보낸다. 이미 다 동의했으면
// /enter 로 통과시킨다 — /enter 가 인생 이벤트 유무를 보고 신규/기존을
// 분기한다 (Phase L7).
export default async function ConsentPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      privacyConsentAt: true,
      overseasTransferConsentAt: true,
      termsConsentAt: true,
    },
  });

  if (
    user?.privacyConsentAt &&
    user?.overseasTransferConsentAt &&
    user?.termsConsentAt
  ) {
    redirect("/enter");
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="mb-8">
        <h1 className="text-4xl font-bold text-zinc-900">시작하기 전에</h1>
        <p className="mt-3 text-zinc-800">
          서비스를 이용하려면 아래 항목에 동의해 주세요. 각 항목은 별도로
          확인하실 수 있습니다.
        </p>
      </header>

      <ConsentForm />
    </main>
  );
}
