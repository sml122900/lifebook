import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { CompanionClient } from "./CompanionClient";

export const metadata = { title: "말동무 | 라이프북" };

export default async function CompanionPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) redirect("/consent");

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-6 py-10">
      <Link
        href="/life-timeline"
        className="self-start text-lg text-ink-soft underline-offset-4 hover:underline"
      >
        ← 인생 연혁으로
      </Link>

      <header className="mt-8 mb-10">
        <h1 className="text-3xl font-bold text-ink">말동무</h1>
        <p className="mt-2 text-lg text-ink-soft">
          동반자가 먼저 인사할게요. 편하게 이야기해 주세요.
        </p>
      </header>

      <CompanionClient />
    </main>
  );
}
