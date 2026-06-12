import Link from "next/link";

import { deleteSharedMemoryAction } from "./shared-actions";

// SharedMemory 한 건 + 뷰어에게 허용된 카드별 액션(편집/삭제)을 렌더하는
// 서버 컴포넌트.

type Props = {
  memory: {
    id: string;
    roomId: string;
    year: number;
    month: number | null;
    title: string;
    content: string | null;
    // null = 원작성자가 탈퇴함; UI 는 "탈퇴한 사용자"로 표시.
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
  // Phase 9.6: 공동 추억은 룸 소유라 모든 멤버가 편집 가능.
  const canEdit = true;

  const author = name(memory.createdBy, viewerId, memory.createdById);
  const editor =
    memory.lastEditedBy && memory.lastEditedById
      ? name(memory.lastEditedBy, viewerId, memory.lastEditedById)
      : null;

  return (
    <article className="rounded-md border-2 border-brand bg-banner p-5">
      <p className="text-base font-bold uppercase tracking-wide text-action">
        우리의 추억
        {memory.month && (
          <span className="ml-2 text-ink-soft">
            · {String(memory.month).padStart(2, "0")}월
          </span>
        )}
      </p>
      <h4 className="mt-2 text-2xl font-bold text-ink">{memory.title}</h4>
      {memory.content && (
        <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
          {memory.content}
        </p>
      )}
      <p className="mt-3 text-base text-ink-soft">
        시작: {author}
        {editor && editor !== author && (
          <span className="ml-2 text-ink-soft">· 마지막 편집: {editor}</span>
        )}
      </p>

      <div className="mt-4 flex gap-3">
        {canEdit && (
          <Link
            href={`/rooms/${memory.roomId}/shared/${memory.id}/edit`}
            className="rounded-md border-2 border-brand bg-surface px-4 py-2 text-base font-semibold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            편집
          </Link>
        )}
        {canDelete && (
          <form action={deleteSharedMemoryAction}>
            <input type="hidden" name="memoryId" value={memory.id} />
            <button
              type="submit"
              className="rounded-md border-2 border-rose-300 bg-surface px-4 py-2 text-base font-semibold text-rose-700 hover:bg-rose-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-400 focus-visible:ring-offset-2"
            >
              삭제
            </button>
          </form>
        )}
      </div>
    </article>
  );
}
