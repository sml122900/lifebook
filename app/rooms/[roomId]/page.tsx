import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { EventCard } from "@/components/EventCard";
import { auth } from "@/auth";
import { listRoomCommentsByTarget } from "@/lib/comments";
import { prisma } from "@/lib/db";
import { listReactionsByTarget } from "@/lib/reactions";
import { getMembership, listRoomMemories } from "@/lib/rooms";
import { listSharedMemories } from "@/lib/shared-memories";

import { createInviteAction } from "../actions";
import { PersonalMemoryCard } from "./PersonalMemoryCard";
import { SharedMemoryCard } from "./SharedMemoryCard";
import { SharedMemoryComposer } from "./SharedMemoryComposer";
import { TimelineLegend } from "./TimelineLegend";

type PageProps = {
  params: Promise<{ roomId: string }>;
};

const ROLE_LABEL: Record<string, string> = {
  owner: "방장",
  member: "멤버",
};

type Anchor = Awaited<ReturnType<typeof prisma.event.findMany>>[number];
type PersonalMemory = NonNullable<
  Awaited<ReturnType<typeof listRoomMemories>>
>[number];
type SharedMemory = NonNullable<
  Awaited<ReturnType<typeof listSharedMemories>>
>[number];

function indexByYear<T extends { year: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const list = map.get(r.year) ?? [];
    list.push(r);
    map.set(r.year, list);
  }
  return map;
}

export default async function RoomDetailPage({ params }: PageProps) {
  const { roomId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // ⚠️ Gate: only consented members can see anything inside the room.
  const membership = await getMembership(session.user.id, roomId);
  if (!membership) {
    notFound();
  }

  const room = await prisma.sharedRoom.findUnique({
    where: { id: roomId },
    select: {
      id: true,
      name: true,
      ownerId: true,
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

  // Absolute invite URL host.
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${host}`;

  // Three feeds, all room-scoped + membership-checked at the helper level.
  const memories = (await listRoomMemories(roomId, session.user.id)) ?? [];
  const sharedMemories =
    (await listSharedMemories(roomId, session.user.id)) ?? [];

  // Joined-timeline year set: years with personal or shared memories.
  // Anchors are pulled only for those years so a senior viewer isn't
  // buried under 50 years of world events.
  const yearSet = new Set<number>();
  for (const m of memories) yearSet.add(m.year);
  for (const s of sharedMemories) yearSet.add(s.year);
  // 올해 → 과거 역순. 솔로 타임라인과 일관.
  const sortedYears = Array.from(yearSet).sort((a, b) => b - a);

  const anchors: Anchor[] =
    sortedYears.length === 0
      ? []
      : await prisma.event.findMany({
          where: {
            category: "anchor",
            year: { in: sortedYears },
          },
          orderBy: [{ year: "asc" }, { month: "asc" }],
        });

  // Batched comments for personal memories — one query, sliced into a
  // map at render time.
  const memoryIds = memories.map((m) => m.id);
  const commentsByTarget =
    (await listRoomCommentsByTarget(
      roomId,
      session.user.id,
      "user_memory",
      memoryIds,
    )) ?? new Map();

  // 스탬프도 같은 방식으로 배치 로드 — 멤버십 가드는 헬퍼 내부.
  const reactionsByTarget =
    (await listReactionsByTarget(
      roomId,
      session.user.id,
      "user_memory",
      memoryIds,
    )) ?? new Map();

  const anchorsByYear = indexByYear<Anchor>(anchors);
  const memoriesByYear = indexByYear<PersonalMemory>(memories);
  const sharedByYear = indexByYear<SharedMemory>(sharedMemories);

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
            <li
              key={m.id}
              className="flex items-center justify-between px-5 py-3"
            >
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
        <h2 className="text-2xl font-bold text-zinc-900">함께 보는 타임라인</h2>
        <TimelineLegend />

        {sortedYears.length === 0 ? (
          <div className="rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-6">
            <p className="text-lg text-zinc-800">
              아직 룸에서 함께 볼 추억이 없어요. 자신의 타임라인에서 추억을
              남기거나, 아래에서 공동 추억을 시작해보세요.
            </p>
          </div>
        ) : (
          <ol className="flex flex-col gap-12">
            {sortedYears.map((year) => {
              const yearAnchors = anchorsByYear.get(year) ?? [];
              const yearMemories = memoriesByYear.get(year) ?? [];
              const yearShared = sharedByYear.get(year) ?? [];
              return (
                <li key={year}>
                  <h3 className="mb-5 text-3xl font-bold text-zinc-900">
                    {year}
                  </h3>
                  <ul className="flex flex-col gap-4">
                    {yearAnchors.map((e) => (
                      <li key={`a-${e.id}`}>
                        <EventCard
                          id={e.id}
                          year={e.year}
                          month={e.month}
                          title={e.title}
                          description={e.description}
                          domain={e.domain}
                        />
                      </li>
                    ))}
                    {yearMemories.map((m) => (
                      <li key={`m-${m.id}`}>
                        <PersonalMemoryCard
                          memory={m}
                          viewerId={session.user!.id}
                          roomId={room.id}
                          comments={commentsByTarget.get(m.id) ?? []}
                          reactions={reactionsByTarget.get(m.id) ?? []}
                        />
                      </li>
                    ))}
                    {yearShared.map((sm) => (
                      <li key={`s-${sm.id}`}>
                        <SharedMemoryCard
                          memory={sm}
                          viewerId={session.user!.id}
                          roomOwnerId={room.ownerId}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-2xl font-bold text-zinc-900">공동 추억 추가</h2>
        <p className="text-base text-zinc-700">
          위 타임라인의 어느 해든 좋습니다. 추가하면 그 연도 자리에 함께 놓여요.
        </p>
        <SharedMemoryComposer roomId={room.id} />
      </section>
    </main>
  );
}
