import Link from "next/link";

import { deleteSharedMemoryAction } from "./shared-actions";

// Server component rendering one SharedMemory + the per-card actions
// the viewer is allowed to take.

type Props = {
  memory: {
    id: string;
    roomId: string;
    year: number;
    month: number | null;
    title: string;
    content: string | null;
    // null = original author withdrew; UI shows "탈퇴한 사용자".
    createdById: string | null;
    createdBy: { name: string | null; email: string | null } | null;
    lastEditedById: string | null;
    lastEditedBy: { name: string | null; email: string | null } | null;
    updatedAt: Date;
  };
  viewerId: string;
  roomOwnerId: string;
};

function name(
  u: { name: string | null; email: string | null } | null,
  viewerId: string,
  authorId: string | null,
) {
  if (!u || !authorId) return "탈퇴한 사용자";
  if (authorId === viewerId) return "나";
  return u.name ?? u.email ?? "익명";
}

export function SharedMemoryCard({ memory, viewerId, roomOwnerId }: Props) {
  // 작성자가 탈퇴한 경우 본인 삭제 권한이 사라지니 owner만 삭제 가능.
  const canDelete =
    memory.createdById === viewerId || roomOwnerId === viewerId;
  // Phase 9.6: every member can edit shared memories (room-owned).
  const canEdit = true;

  const author = name(memory.createdBy, viewerId, memory.createdById);
  const editor =
    memory.lastEditedBy && memory.lastEditedById
      ? name(memory.lastEditedBy, viewerId, memory.lastEditedById)
      : null;

  return (
    <article className="rounded-md border-2 border-violet-300 bg-violet-50 p-5">
      <p className="text-base font-bold uppercase tracking-wide text-violet-800">
        우리의 추억
        {memory.month && (
          <span className="ml-2 text-zinc-700">
            · {String(memory.month).padStart(2, "0")}월
          </span>
        )}
      </p>
      <h4 className="mt-2 text-2xl font-bold text-zinc-900">{memory.title}</h4>
      {memory.content && (
        <p className="mt-2 whitespace-pre-wrap text-lg text-zinc-800">
          {memory.content}
        </p>
      )}
      <p className="mt-3 text-base text-zinc-700">
        시작: {author}
        {editor && editor !== author && (
          <span className="ml-2 text-zinc-600">· 마지막 편집: {editor}</span>
        )}
      </p>

      <div className="mt-4 flex gap-3">
        {canEdit && (
          <Link
            href={`/rooms/${memory.roomId}/shared/${memory.id}/edit`}
            className="rounded-md border-2 border-violet-300 bg-white px-4 py-2 text-base font-semibold text-violet-800 hover:bg-violet-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-400 focus-visible:ring-offset-2"
          >
            편집
          </Link>
        )}
        {canDelete && (
          <form action={deleteSharedMemoryAction}>
            <input type="hidden" name="memoryId" value={memory.id} />
            <button
              type="submit"
              className="rounded-md border-2 border-rose-300 bg-white px-4 py-2 text-base font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            >
              삭제
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
