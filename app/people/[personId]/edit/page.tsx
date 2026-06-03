import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBirthYear } from "@/lib/life-events";
import { getPerson } from "@/lib/people";

import { PersonForm } from "../../PersonForm";

// Phase P2 — 인물 수정 화면. PersonForm 공용 컴포넌트(mode="edit").

type Params = { params: Promise<{ personId: string }> };

export const metadata = { title: "인물 수정" };

export default async function EditPersonPage({ params }: Params) {
  const { personId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [person, birthYear] = await Promise.all([
    getPerson(userId, personId),
    getBirthYear(userId),
  ]);
  if (!person) notFound();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Link
          href={`/people/${person.id}`}
          className="self-start text-base text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          ← 인물 상세로
        </Link>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          인물 수정
        </h1>
      </header>

      <PersonForm
        mode="edit"
        birthYear={birthYear}
        initial={{
          id: person.id,
          name: person.name,
          relation: person.relation,
          metYear: person.metYear,
          memo: person.memo,
        }}
      />
    </main>
  );
}
