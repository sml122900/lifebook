import { ListenButton } from "@/components/ListenButton";
import {
  STAMP_KINDS,
  isStampKind,
  type StampKind,
} from "@/lib/reactions-policy";

import { CommentThread } from "./CommentThread";
import { StampBar } from "./StampBar";

// One room-view of a member's personal UserMemory. Read-only here;
// edits happen only on the author's own /timeline.
// 2026-11-09 — V3 My Life 이야기도 이 카드(제목 없는 이야기는 제목 줄 생략 — My Life 패널과 같은 규칙). 고치기·지우기 버튼 없음.

type ReactionRow = {
  authorId: string;
  stamp: string;
};

type Props = {
  memory: {
    id: string;
    userId: string;
    month: number | null;
    title: string;
    content: string | null;
    user: { name: string | null; email: string | null };
    event: {
      title: string;
      description: string | null;
      domain: string;
    } | null;
  };
  viewerId: string;
  roomId: string;
  comments: React.ComponentProps<typeof CommentThread>["comments"];
  reactions: ReactionRow[];
};

function tallyReactions(reactions: ReactionRow[], viewerId: string) {
  const counts = Object.fromEntries(
    STAMP_KINDS.map((k) => [k, 0]),
  ) as Record<StampKind, number>;
  const mine = Object.fromEntries(
    STAMP_KINDS.map((k) => [k, false]),
  ) as Record<StampKind, boolean>;
  for (const r of reactions) {
    if (!isStampKind(r.stamp)) continue;
    counts[r.stamp] += 1;
    if (r.authorId === viewerId) mine[r.stamp] = true;
  }
  return { counts, mine };
}

function authorLabel(
  authorId: string,
  name: string | null,
  email: string | null,
  viewerId: string,
): string {
  if (authorId === viewerId) return "나의 추억";
  const who = name ?? email ?? "익명";
  return `${who}의 추억`;
}

// Seed writer stored Event.description for music as "{artist} ·
// {context}", so the artist for the YouTube query is the slice
// before " · ".
function artistFromDescription(description: string | null): string {
  if (!description) return "";
  const [first] = description.split(" · ");
  return first?.trim() ?? "";
}

export function PersonalMemoryCard({
  memory,
  viewerId,
  roomId,
  comments,
  reactions,
}: Props) {
  const isSelf = memory.userId === viewerId;
  const { counts, mine } = tallyReactions(reactions, viewerId);
  const tone = isSelf
    ? { border: "border-line", bg: "bg-banner", label: "text-action" }
    : {
        border: "border-success",
        bg: "bg-success-wash",
        label: "text-success",
      };

  const isMusic = memory.event?.domain === "music";
  const songTitle = memory.event?.title ?? "";
  const songArtist = artistFromDescription(memory.event?.description ?? null);

  return (
    <article
      id={`m-${memory.id}`}
      className={`scroll-mt-4 rounded-md border-2 p-5 ${tone.border} ${tone.bg}`}
    >
      <p className={`text-base font-bold uppercase tracking-wide ${tone.label}`}>
        {authorLabel(memory.userId, memory.user.name, memory.user.email, viewerId)}
        {memory.month && (
          <span className="ml-2 text-ink-soft">
            · {String(memory.month).padStart(2, "0")}월
          </span>
        )}
      </p>
      {memory.title && <p className="mt-2 text-xl font-semibold text-ink">{memory.title}</p>}
      {memory.content && (
        <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
          {memory.content}
        </p>
      )}
      {isMusic && songTitle && (
        <div className="mt-3">
          <ListenButton title={songTitle} artist={songArtist} />
        </div>
      )}
      <StampBar
        roomId={roomId}
        targetType="user_memory"
        targetId={memory.id}
        initialCounts={counts}
        initialMine={mine}
      />
      <CommentThread
        roomId={roomId}
        targetType="user_memory"
        targetId={memory.id}
        viewerId={viewerId}
        comments={comments}
      />
    </article>
  );
}
