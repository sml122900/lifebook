import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { CURRENT_CONSENT_VERSION } from "@/lib/consent-version";
import { buttonClasses } from "@/components/ui/Button";
import { FreeRecordClient } from "./FreeRecordClient";

// Phase 10 — 통녹음 화면.
// 물꼬 선택 → 녹음 → CLOVA STT → Claude 정리 → 검토 → 저장.
export default async function FreeRecordPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // 음성 저장 동의(v2) 미완료면 동의 화면으로
  if ((session.consentVersion ?? 0) < CURRENT_CONSENT_VERSION) {
    redirect("/consent");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/life-timeline"
        className={buttonClasses("tertiary", "md", "self-start")}
      >
        ← 인생 연혁으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-ink">말로 기록하기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          이야기를 녹음하면 글로 바꿔드려요.
        </p>
      </header>

      <FreeRecordClient userId={session.user.id} />
    </main>
  );
}
