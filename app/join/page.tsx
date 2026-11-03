import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { InAppBrowserGuard, InAppIosBanner } from "@/app/login/InAppBrowserGuard";
import { JOIN_COPY as C } from "@/lib/join-copy";
import { isSignupProvider } from "@/lib/signup-consent";

import { JoinForm } from "./JoinForm";

// 가입 전 동의(2026-11-03 — docs/phase/my-life-restructure.md §16.3). 동의 → 가입 방법 → 계정 생성 순서.
// 들어오는 곳: 로그인 화면 [회원가입] 링크 · 로그인 화면에서 소셜 버튼을 눌렀는데 아직 계정이 없을 때(소셜 로그인 콜백이
// 계정을 만들지 않고 ?provider= 로 보냄) · 동의 없이 /signup 에 온 경우(?provider=email). 공개 경로(proxy PUBLIC_PATHS).
// 이미 로그인했으면 /enter. 이미 있는 계정의 재동의는 /consent(그대로).
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ provider?: string; error?: string }> }) {
  const session = await auth();
  if (session?.user?.id) redirect("/enter");
  const { provider, error } = await searchParams;
  const first = isSignupProvider(provider) || provider === "email" ? provider : null;

  return (
    <InAppBrowserGuard>
      <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-12">
        <InAppIosBanner />
        <header className="flex flex-col gap-3">
          <h1 className="m-0 text-4xl font-bold text-ink">{C.title}</h1>
          <p className="m-0 text-lg text-ink">{C.desc}</p>
        </header>
        {first && (
          <p className="m-0 rounded-md border-2 border-brand bg-banner p-4 text-lg text-ink">{C.bounced(C.methodName[first])}</p>
        )}
        {/* 동의 없이 제출돼 돌아온 경우(?error=consent)의 안내는 가입 방법 칸 안 한 자리에서 — 같은 자리의 "모두 동의하시면" 안내와 둘 중 하나만 */}
        <JoinForm first={first} consentError={error === "consent"} />
        <Link href="/login" className="self-center text-lg font-semibold text-action underline underline-offset-2">
          {C.toLogin}
        </Link>
      </main>
    </InAppBrowserGuard>
  );
}
