import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { prisma } from "@/lib/db";
import { getV3BirthYear } from "@/lib/life-events";

import { ProfileEditForm, type ProfileInitial } from "./ProfileEditForm";

// 회원정보 — 가입 시 받은 질문을 한 화면에서 모두 다시 보고 수정.
// 온보딩 wizard와 달리 step 없이 전체 폼. LifeProfile + User.birthYear를
// upsert 한 번에 저장.
export default async function AccountProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const [user, v3BirthYear, profile] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { birthYear: true },
    }),
    getV3BirthYear(userId),
    prisma.lifeProfile.findUnique({
      where: { userId },
      select: {
        interests: true,
        residences: true,
        schools: true,
        favMovies: true,
        favGames: true,
        favMusic: true,
        siblings: true,
        parentsInfo: true,
        closeFriends: true,
        hobbies: true,
      },
    }),
  ]);

  const initial: ProfileInitial = {
    // V3 는 출생 시기(원본) 연도 — User.birthYear 가 비어 빈칸으로 보이던 것(2026-11-03). V2 는 예전처럼 User.birthYear.
    birthYear: v3BirthYear ?? user?.birthYear ?? null,
    interests: profile?.interests ?? [],
    residences: profile?.residences ?? [],
    schools: profile?.schools ?? [],
    favMovies: profile?.favMovies ?? [],
    favGames: profile?.favGames ?? [],
    favMusic: profile?.favMusic ?? [],
    siblings: profile?.siblings ?? "",
    parentsInfo: profile?.parentsInfo ?? "",
    closeFriends: profile?.closeFriends ?? "",
    hobbies: profile?.hobbies ?? "",
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/life-timeline"
        className={buttonClasses("tertiary", "md", "self-start")}
      >
        ← 인생 연혁으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-ink">회원정보</h1>
        <p className="mt-3 text-lg text-ink-soft">
          가입할 때 답하신 내용을 언제든 수정할 수 있어요. 비워두셔도 괜찮아요.
        </p>
      </header>

      <ProfileEditForm initial={initial} />
    </main>
  );
}
