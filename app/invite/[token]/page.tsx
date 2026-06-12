import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { getInviteForJoin, getMembership } from "@/lib/rooms";

import { ConsentForm } from "./ConsentForm";

// /invite/[token] — 초대 랜딩 페이지.
//
// 핵심: 이 페이지를 보는 것 = 합류가 아니다. 동의 화면만 렌더한다.
// 멤버십은 joinRoomAction 에서, 사용자가 실제로 체크박스를 누르고 제출할
// 때만 생성된다.

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`);
  }

  const invite = await getInviteForJoin(token);
  if (!invite) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-6 py-10">
        <h1 className="text-3xl font-bold text-ink">
          초대 링크를 찾을 수 없어요
        </h1>
        <p className="text-lg text-ink">
          만료됐거나 잘못된 링크일 수 있어요. 초대해 주신 분께 다시 받아보세요.
        </p>
        <Link
          href="/life-timeline"
          className={buttonClasses("tertiary", "md", "self-start")}
        >
          인생 연혁으로
        </Link>
      </main>
    );
  }

  // 이미 동의한 멤버면 룸으로 바로 — 두 번째 동의 절차 없이.
  const existing = await getMembership(session.user.id, invite.roomId);
  if (existing) {
    redirect(`/rooms/${invite.roomId}`);
  }

  const inviterName = invite.inviter.name ?? invite.inviter.email ?? "초대한 분";

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-ink-soft">초대를 받으셨어요</p>
        <h1 className="mt-2 text-3xl font-bold text-ink">
          {invite.room.name}
        </h1>
        <p className="mt-3 text-lg text-ink">
          <span className="font-semibold">{inviterName}</span> 님이 이 룸에
          초대했습니다.
        </p>
      </header>

      <section className="rounded-md border-2 border-amber-200 bg-amber-50 p-5">
        <p className="text-lg text-ink">
          참여하시면 앞으로 작성하시는 추억이 이 룸의 멤버에게 보입니다.
          기존에 적어두신 추억도 마찬가지로 공유됩니다.
        </p>
        <p className="mt-2 text-base text-ink-soft">
          링크만으로는 자동 참여되지 않아요. 아래에서 직접 동의해 주세요.
        </p>
      </section>

      <ConsentForm token={token} />
    </main>
  );
}
