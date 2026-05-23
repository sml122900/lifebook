import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { listRoomCommentsByTarget } from "@/lib/comments";
import { prisma } from "@/lib/db";
import { getMembership, listRoomMemories } from "@/lib/rooms";

import { createInviteAction } from "../actions";
import { CommentThread } from "./CommentThread";

type RoomMemory = NonNullable<
  Awaited<ReturnType<typeof listRoomMemories>>
>[number];

function groupMemoriesByYear(
  rows: RoomMemory[],
): Array<[number, RoomMemory[]]> {
  const map = new Map<number, RoomMemory[]>();
  for (const r of rows) {
    const list = map.get(r.year) ?? [];
    list.push(r);
    map.set(r.year, list);
  }
  return Array.from(map.entries()).sort(([a], [b]) => a - b);
}

function authorLabel(
  authorId: string,
  authorName: string | null,
  authorEmail: string | null,
  viewerId: string,
): string {
  if (authorId === viewerId) return "나";
  return authorName ?? authorEmail ?? "익명";
}

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

  // Joined personal-memory feed. listRoomMemories re-checks membership
  // itself, so this can never leak data even if the upstream check above
  // is bypassed somehow.
  const memories = (await listRoomMemories(roomId, session.user.id)) ?? [];
  const memoriesByYear = groupMemoriesByYear(memories);

  // Single batched comment fetch keyed by memory id — re-verifies
  // membership before returning anything.
  const commentsByTarget =
    (await listRoomCommentsByTarget(
      roomId,
      session.user.id,
      "user_memory",
      memories.map((m) => m.id),
    )) ?? new Map();

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

      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold text-zinc-900">함께 보는 추억</h2>
        <p className="text-base text-zinc-700">
          이 룸 멤버들이 각자 남긴 추억이에요. 다른 분의 글은 여기서는
          읽기만 할 수 있고, 수정은 작성자 본인이 자기 화면에서 합니다.
        </p>
        {memoriesByYear.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-6">
            <p className="text-lg text-zinc-800">
              아직 룸에서 함께 볼 추억이 없어요. 자신의 타임라인에서 추억을
              남기면 이곳에 함께 모입니다.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-10">
            {memoriesByYear.map(([year, rows]) => (
              <li key={year}>
                <h3 className="mb-4 text-3xl font-bold text-zinc-900">
                  {year}
                </h3>
                <ul className="flex flex-col gap-4">
                  {rows.map((m) => {
                    const isSelf = m.userId === session.user!.id;
                    return (
                      <li
                        key={m.id}
                        className={
                          "rounded-md border-2 p-5 " +
                          (isSelf
                            ? "border-amber-300 bg-amber-50"
                            : "border-sky-300 bg-sky-50")
                        }
                      >
                        <p
                          className={
                            "text-base font-bold uppercase tracking-wide " +
                            (isSelf ? "text-amber-800" : "text-sky-800")
                          }
                        >
                          {authorLabel(
                            m.userId,
                            m.user.name,
                            m.user.email,
                            session.user!.id,
                          )}
                          {m.month && (
                            <span className="ml-2 text-zinc-700">
                              · {String(m.month).padStart(2, "0")}월
                            </span>
                          )}
                        </p>
                        <p className="mt-2 text-xl font-semibold text-zinc-900">
                          {m.title}
                        </p>
                        {m.content && (
                          <p className="mt-2 whitespace-pre-wrap text-lg text-zinc-800">
                            {m.content}
                          </p>
                        )}
                        <CommentThread
                          roomId={room.id}
                          targetType="user_memory"
                          targetId={m.id}
                          viewerId={session.user!.id}
                          comments={commentsByTarget.get(m.id) ?? []}
                        />
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}
