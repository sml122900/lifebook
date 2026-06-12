import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button, ButtonLink } from "@/components/ui/Button";
import { listUserRooms } from "@/lib/rooms";

import { createRoomAction } from "./actions";

// /rooms — 사용자가 속한 가족 룸 목록 + 새 룸 만들기 폼.
// 룸 상세(멤버 타임라인·댓글·스탬프 등)는 /rooms/[roomId].

const ROLE_LABEL: Record<string, string> = {
  owner: "방장",
  member: "멤버",
};

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export default async function RoomsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const memberships = await listUserRooms(session.user.id);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <ButtonLink href="/life-timeline" variant="tertiary" className="self-start">
        ← 인생 연혁으로
      </ButtonLink>

      <header>
        <h1 className="text-3xl font-bold text-ink">가족 룸</h1>
        <p className="mt-3 text-xl font-bold text-ink">
          내 이야기를, 자식들이 읽어줍니다
        </p>
        <p className="mt-1 text-lg text-ink-soft">
          한 줄씩 답하다 보면 내 인생이 정리됩니다.
        </p>
      </header>

      <section className="rounded-md border-2 border-line bg-surface p-6">
        <h2 className="text-xl font-bold text-ink">새 룸 만들기</h2>
        <form action={createRoomAction} className="mt-4 flex flex-col gap-3">
          <label htmlFor="name" className="text-base font-semibold text-ink">
            룸 이름
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            maxLength={50}
            placeholder="예: 우리 가족, 엄마와 나"
            className="w-full rounded-md border-2 border-line px-4 py-3 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
          <Button type="submit" variant="primary" size="lg" className="self-end">
            룸 만들기
          </Button>
        </form>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-ink">내가 속한 룸</h2>
        {memberships.length === 0 ? (
          <p className="text-lg text-ink-soft">
            아직 가입한 룸이 없어요. 위에서 새로 만들어보세요.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {memberships.map((m) => (
              <li key={m.room.id}>
                <Link
                  href={`/rooms/${m.room.id}`}
                  className="block rounded-md border-2 border-line bg-surface p-5 hover:border-brand hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
                >
                  <p className="text-xl font-bold text-ink">
                    {m.room.name}
                  </p>
                  <p className="mt-1 text-base text-ink-soft">
                    {ROLE_LABEL[m.role] ?? m.role} · 가입{" "}
                    {DATE_FMT.format(m.joinedAt)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
