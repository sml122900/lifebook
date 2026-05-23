import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMembership } from "@/lib/rooms";

import { createInviteAction } from "../actions";

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
      invites: {
        select: { id: true, token: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      },
    },
  });
  if (!room) {
    notFound();
  }

  // Build absolute invite URLs from the incoming request so the link
  // works from whatever host the user is browsing (localhost vs LAN
  // vs prod).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

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

      <section className="rounded-md border-2 border-zinc-200 bg-white p-6">
        <h2 className="text-xl font-bold text-zinc-900">초대하기</h2>
        <p className="mt-2 text-base text-zinc-700">
          링크를 만들어 가족·배우자에게 보내세요. 받는 분이 직접 동의해야
          멤버가 됩니다.
        </p>
        <form action={createInviteAction} className="mt-4">
          <input type="hidden" name="roomId" value={room.id} />
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            새 초대 링크 만들기
          </button>
        </form>
        {room.invites.length > 0 && (
          <ul className="mt-5 flex flex-col gap-3">
            {room.invites.map((inv) => (
              <li
                key={inv.id}
                className="rounded-md border-2 border-zinc-200 bg-zinc-50 px-4 py-3"
              >
                <p className="text-base text-zinc-700">초대 링크</p>
                <p className="mt-1 break-all text-base font-mono text-zinc-900">
                  {origin}/invite/{inv.token}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-6">
        <p className="text-lg text-zinc-800">
          이 룸의 공유 타임라인과 댓글은 다음 단계(9.3, 9.4)에서 들어옵니다.
        </p>
      </section>
    </main>
  );
}
