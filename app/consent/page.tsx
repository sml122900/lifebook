import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { ConsentForm } from "./ConsentForm";

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
    redirect("/timeline");
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
