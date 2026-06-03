import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBirthYear } from "@/lib/life-events";

import { PersonForm } from "../PersonForm";

// Phase P2 — 새 인물 추가 화면.
// P3 — ?returnTo=/life-timeline 처럼 진입한 경우 저장 후 그곳으로 돌아간다.
// 보안: relative 경로(/ 시작) 만 허용해 open redirect 차단.

export const metadata = { title: "새 인물 추가" };

type Search = { returnTo?: string };

// open redirect 차단: URL 객체로 정규화한 뒤 path 가 우리 원본과 일치하는지
// 확인. 브라우저가 백슬래시·다중 슬래시·encoded 우회를 정규화하면 원본과
// 달라져 거부됨. dummy origin 으로 파싱한 후 origin 이 그대로 dummy 면 외부
// 호스트가 아님 = relative 경로.
function safeReturnTo(raw: string | undefined): string | null {
  if (!raw) return null;
  // 최소 가드: / 로 시작 안 하면 무조건 거부 (relative 만 허용).
  if (!raw.startsWith("/")) return null;
  try {
    const dummy = "http://internal.local";
    const u = new URL(raw, dummy);
    if (u.origin !== dummy) return null; // 외부 호스트 우회 차단
    const reconstructed = u.pathname + u.search + u.hash;
    if (reconstructed !== raw) return null; // 정규화로 모양 바뀐 경우 거부
    return reconstructed;
  } catch {
    return null;
  }
}

export default async function NewPersonPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [sp, birthYear] = await Promise.all([
    searchParams,
    getBirthYear(session.user.id),
  ]);
  const returnTo = safeReturnTo(sp.returnTo);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={returnTo ?? "/people"}
          className="self-start text-base text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          ← {returnTo ? "이전 화면으로" : "인물록으로"}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          새 인물 추가
        </h1>
        <p className="text-lg text-zinc-700">
          이름만 적어도 돼요. 나머지는 떠오르는 만큼만.
        </p>
      </header>

      <PersonForm mode="add" birthYear={birthYear} returnTo={returnTo} />
    </main>
  );
}
