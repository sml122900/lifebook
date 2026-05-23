import { ListenButton } from "@/components/ListenButton";

import { CommentThread } from "./CommentThread";

// One room-view of a member's personal UserMemory. Read-only here;
// edits happen only on the author's own /timeline.

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
};

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
}: Props) {
  const isSelf = memory.userId === viewerId;
  const tone = isSelf
    ? { border: "border-amber-300", bg: "bg-amber-50", label: "text-amber-800" }
    : {
        border: "border-emerald-300",
        bg: "bg-emerald-50",
        label: "text-emerald-800",
      };

  const isMusic = memory.event?.domain === "music";
  const songTitle = memory.event?.title ?? "";
  const songArtist = artistFromDescription(memory.event?.description ?? null);

  return (
    <article className={`rounded-md border-2 p-5 ${tone.border} ${tone.bg}`}>
      <p className={`text-base font-bold uppercase tracking-wide ${tone.label}`}>
        {authorLabel(memory.userId, memory.user.name, memory.user.email, viewerId)}
        {memory.month && (
          <span className="ml-2 text-zinc-700">
            · {String(memory.month).padStart(2, "0")}월
          </span>
        )}
      </p>
      <p className="mt-2 text-xl font-semibold text-zinc-900">{memory.title}</p>
      {memory.content && (
        <p className="mt-2 whitespace-pre-wrap text-lg text-zinc-800">
          {memory.content}
        </p>
      )}
      {isMusic && songTitle && (
        <div className="mt-3">
          <ListenButton title={songTitle} artist={songArtist} />
        </div>
      )}
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
