import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { peopleEntryRedirect } from "@/lib/people-entry";
import { getBirthYear } from "@/lib/life-events";
import type { SubjectType } from "@/lib/people";
import { safeReturnTo } from "@/lib/return-to";

import { PersonForm } from "../PersonForm";

// Phase P2 + Phase 8 — 새 주체(인물/장소/물건) 추가 화면.
// ?type=person|location|thing 으로 생성 종류 결정 (없으면 person 기본).
// ?returnTo=... 는 저장 후 돌아갈 경로 (open redirect 차단).

const SUBJECT_TITLE: Record<SubjectType, string> = {
  person: "새 인물 추가",
  location: "새 장소 추가",
  thing: "새 물건 추가",
};
const SUBJECT_HINT: Record<SubjectType, string> = {
  person: "이름만 적어도 돼요. 나머지는 떠오르는 만큼만.",
  location: "이름만 적어도 돼요. 어떤 곳인지 메모를 남겨도 좋아요.",
  thing: "이름만 적어도 돼요. 얽힌 이야기를 메모로 남겨도 좋아요.",
};

type Search = { returnTo?: string; type?: string };

// open redirect 차단 — lib/return-to.ts safeReturnTo(2026-11-08 이 파일에서 옮김, 로그인 뒤 돌아오기와 공용).

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
  // 인물록 통합(2026-11-06) — V3 사용자는 My Life 인물록·장소록으로(lib/people-entry). V2 는 이 화면 그대로.
  const toMyLife = await peopleEntryRedirect(session.user.id, { page: "new", tab: sp.type });
  if (toMyLife) redirect(toMyLife);
  const subjectType: SubjectType =
    sp.type === "location" || sp.type === "thing" ? sp.type : "person";

  const backHref = returnTo ?? `/people?tab=${subjectType}`;
  const backLabel = returnTo ? "이전 화면으로" : "목록으로";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={backHref}
          className="self-start text-base text-ink-soft hover:text-ink hover:underline"
        >
          ← {backLabel}
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          {SUBJECT_TITLE[subjectType]}
        </h1>
        <p className="text-lg text-ink-soft">
          {SUBJECT_HINT[subjectType]}
        </p>
      </header>

      <PersonForm
        mode="add"
        subjectType={subjectType}
        birthYear={subjectType === "person" ? birthYear : null}
        returnTo={returnTo}
      />
    </main>
  );
}
