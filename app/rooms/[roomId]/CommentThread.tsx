import {
  createCommentAction,
  deleteCommentAction,
} from "./comment-actions";

// 서버 컴포넌트 — 댓글 목록 + 인라인 작성 폼 + (내 댓글에만) 줄별 삭제
// 폼을 렌더한다.

type Comment = {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date;
  author: { name: string | null; email: string | null };
};

const DATE_FMT = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function authorLabel(
  authorId: string,
  name: string | null,
  email: string | null,
  viewerId: string,
): string {
  if (authorId === viewerId) return "나";
  return name ?? email ?? "익명";
}

export function CommentThread({
  roomId,
  targetType,
  targetId,
  viewerId,
  comments,
}: {
  roomId: string;
  targetType: "user_memory" | "shared_memory";
  targetId: string;
  viewerId: string;
  comments: Comment[];
}) {
  return (
    <div className="mt-4 flex flex-col gap-3 border-t-2 border-line pt-4">
      {comments.length === 0 ? (
        <p className="text-base text-ink-soft">
          이 추억에 한마디 남겨보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => {
            const isMine = c.authorId === viewerId;
            return (
              <li
                key={c.id}
                className="rounded-md border-2 border-line bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-base font-semibold text-ink">
                    {authorLabel(c.authorId, c.author.name, c.author.email, viewerId)}
                  </p>
                  <p className="text-sm text-ink-soft">
                    {DATE_FMT.format(c.createdAt)}
                  </p>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
                  {c.content}
                </p>
                {isMine && (
                  <form action={deleteCommentAction} className="mt-2">
                    <input type="hidden" name="commentId" value={c.id} />
                    <input type="hidden" name="roomId" value={roomId} />
                    <button
                      type="submit"
                      className="text-base text-ink-soft underline hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      내 댓글 삭제
                    </button>
                  </form>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <form action={createCommentAction} className="flex flex-col gap-2">
        <input type="hidden" name="roomId" value={roomId} />
        <input type="hidden" name="targetType" value={targetType} />
        <input type="hidden" name="targetId" value={targetId} />
        <label htmlFor={`c-${targetId}`} className="sr-only">
          댓글 입력
        </label>
        <textarea
          id={`c-${targetId}`}
          name="content"
          rows={2}
          required
          maxLength={2000}
          placeholder="한마디 남기기"
          className="w-full rounded-md border-2 border-line px-4 py-3 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
        <button
          type="submit"
          className="self-end rounded-md bg-action px-5 py-3 text-base font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          댓글 남기기
        </button>
      </form>
    </div>
  );
}
