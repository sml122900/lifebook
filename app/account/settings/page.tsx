import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ThemeToggle } from "@/app/components/ThemeToggle";
import { prisma } from "@/lib/db";

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function fmt(d: Date | null) {
  return d ? DATE_FMT.format(d) : "동의 안 함";
}

// 설정 — 동의 내역 확인 + 회원 탈퇴 진입.
// 동의 자체는 가입 흐름의 /consent에서 받고, 여기는 read-only.
export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      name: true,
      termsConsentAt: true,
      privacyConsentAt: true,
      overseasTransferConsentAt: true,
      createdAt: true,
    },
  });
  if (!user) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/timeline"
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 타임라인으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-zinc-900">설정</h1>
      </header>

      <section className="rounded-md border-2 border-zinc-200 bg-white p-5">
        <h2 className="text-2xl font-bold text-zinc-900">계정</h2>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-lg text-zinc-900">
          <dt className="text-zinc-700">이메일</dt>
          <dd>{user.email ?? "-"}</dd>
          <dt className="text-zinc-700">이름</dt>
          <dd>{user.name ?? "-"}</dd>
          <dt className="text-zinc-700">가입일</dt>
          <dd>{DATE_FMT.format(user.createdAt)}</dd>
        </dl>
      </section>

      <section className="rounded-md border-2 border-amber-300 bg-amber-50 p-5">
        <h2 className="text-2xl font-bold text-zinc-900">토큰</h2>
        <p className="mt-2 text-base text-zinc-700">
          잔액 확인, 매일 출석체크, 충전을 한 화면에서.
        </p>
        <Link
          href="/account/tokens"
          className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-md bg-amber-700 px-5 py-3 text-base font-bold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          토큰 화면 열기 →
        </Link>
      </section>

      <section className="rounded-md border-2 border-zinc-200 bg-white p-5">
        <h2 className="text-2xl font-bold text-zinc-900">화면 모드</h2>
        <p className="mt-2 text-base text-zinc-600">
          밝은 화면(라이트)과 어두운 화면(다크) 중 골라주세요.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="rounded-md border-2 border-zinc-200 bg-white p-5">
        <h2 className="text-2xl font-bold text-zinc-900">동의 내역</h2>
        <p className="mt-2 text-base text-zinc-600">
          가입 시 동의하신 항목입니다.
        </p>
        <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-lg text-zinc-900">
          <dt className="text-zinc-700">서비스 이용약관</dt>
          <dd>{fmt(user.termsConsentAt)}</dd>
          <dt className="text-zinc-700">개인정보 수집·이용</dt>
          <dd>{fmt(user.privacyConsentAt)}</dd>
          <dt className="text-zinc-700">개인정보 국외 이전</dt>
          <dd>{fmt(user.overseasTransferConsentAt)}</dd>
        </dl>
      </section>

      <section className="rounded-md border-2 border-rose-200 bg-rose-50 p-5">
        <h2 className="text-2xl font-bold text-rose-900">회원 탈퇴</h2>
        <p className="mt-2 text-lg text-zinc-900">
          탈퇴하면 개인 추억과 토큰 잔액 등이 삭제됩니다. 진행 전 안내 페이지에서
          어떤 정보가 처리되는지 자세히 확인할 수 있어요.
        </p>
        <Link
          href="/account/delete"
          className="mt-4 inline-block rounded-md border-2 border-rose-300 bg-white px-5 py-3 text-base font-bold text-rose-800 hover:bg-rose-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        >
          회원 탈퇴 안내 보기
        </Link>
      </section>
    </main>
  );
}
