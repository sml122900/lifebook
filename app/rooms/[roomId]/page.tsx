import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/rooms";

// /rooms/[roomId] — Phase 9.1 stub. 9.3 fills in the joined timeline
// and 9.4 adds comments. For now we show membership + member list so
// the access gate is testable end-to-end.

type PageProps = {
  params: Promise<{ roomId: string }>;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "방장",
  member: "멤버",
};

export default async function RoomDetailPage({ params }: PageProps) {
  const { roomId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // ⚠️ Gate: only consented members can see anything inside the room.
  // Non-members get a 404 — don't leak the room's existence.
  const membership = await getMembership(session.user.id, roomId);
  if (!membership) {
    notFound();
  }

  const room = await prisma.sharedRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: {
        where: { consentAt: { not: null } },
        select: {
          id: true,
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
        orderBy: { joinedAt: "asc" },
      },
    },
  });
  if (!room) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/rooms"
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 룸 목록
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-zinc-900">{room.name}</h1>
        <p className="mt-2 text-base text-zinc-600">
          내 역할: {ROLE_LABEL[membership.role] ?? membership.role}
        </p>
      </header>

      <section>
        <h2 className="text-xl font-bold text-zinc-900">멤버</h2>
        <ul className="mt-3 flex flex-col divide-y-2 divide-zinc-200 overflow-hidden rounded-md border-2 border-zinc-200 bg-white">
          {room.members.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-5 py-3">
              <span className="text-lg text-zinc-900">
                {m.user.name ?? m.user.email ?? "(이름 없음)"}
              </span>
              <span className="text-base text-zinc-700">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-6">
        <p className="text-lg text-zinc-800">
          이 룸의 공유 타임라인과 댓글은 다음 단계(9.3, 9.4)에서 들어옵니다.
        </p>
      </section>
    </main>
  );
}
