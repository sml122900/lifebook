import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { InsufficientBalanceCard } from "@/components/InsufficientBalanceCard";
import { getOrCreateConversation } from "@/lib/memory-chat";
import { MIN_BALANCE_TO_START_CYCLE } from "@/lib/tokens/policy";
import { getBalance } from "@/lib/tokens/wallet";

import { AnswerForm } from "./AnswerForm";

// /memory/[eventId] — guided memory conversation.
//
// Access policy (Phase 7.2):
//   - anchor events: open to any signed-in (consent-passed) user
//   - trigger events: only if THIS user has TriggerResponse confirmed
//     (dismissed / unanswered triggers should not be reachable here)

type PageProps = {
  params: Promise<{ eventId: string }>;
};

export default async function MemoryPage({ params }: PageProps) {
  const { eventId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      id: true,
      year: true,
      month: true,
      title: true,
      description: true,
      category: true,
      domain: true,
    },
  });
  if (!event) {
    notFound();
  }

  if (event.category === "trigger") {
    const response = await prisma.triggerResponse.findUnique({
      where: { userId_eventId: { userId, eventId } },
      select: { status: true },
    });
    if (response?.status !== "confirmed") {
      // Don't leak the existence of unconfirmed / dismissed triggers —
      // just send the user back to the timeline.
      redirect("/timeline");
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthYear: true },
  });
  const ageAtYear =
    user?.birthYear != null ? event.year - user.birthYear : null;

  // Gate: don't even call the AI generator if the wallet can't cover
  // one cycle. The existing conversation (if any) is still safe to
  // resume — guided questions are cached, so no new AI call happens.
  const balance = await getBalance(userId);
  const existingConv = await prisma.aIConversation.findUnique({
    where: { userId_eventId: { userId, eventId } },
    select: { id: true },
  });
  const wouldStartNewCycle = !existingConv;
  if (wouldStartNewCycle && balance < MIN_BALANCE_TO_START_CYCLE) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
        <Link
          href="/timeline"
          className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          ← 타임라인으로
        </Link>
        <header>
          <p className="text-base text-zinc-600">
            {event.year}
            {event.month ? `.${String(event.month).padStart(2, "0")}` : ""}
            {ageAtYear !== null && ageAtYear >= 0 && (
              <span className="ml-2">· 그때 {ageAtYear}살</span>
            )}
          </p>
          <h1 className="mt-2 text-3xl font-bold text-zinc-900">
            {event.title}
          </h1>
        </header>
        <InsufficientBalanceCard
          balance={balance}
          required={MIN_BALANCE_TO_START_CYCLE}
        />
      </main>
    );
  }

  // Persisted per-(user, event) conversation: questions are generated
  // once on first visit and reused on every reload, and we surface any
  // answers the user already saved so they can pick up where they left.
  const conversation = await getOrCreateConversation(userId, eventId, {
    title: event.title,
    description: event.description,
    year: event.year,
    category: event.category,
    domain: event.domain,
    ageAtYear,
  });

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/timeline"
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 타임라인으로
      </Link>

      <header>
        <p className="text-base text-zinc-600">
          {event.year}
          {event.month ? `.${String(event.month).padStart(2, "0")}` : ""}
          {ageAtYear !== null && ageAtYear >= 0 && (
            <span className="ml-2">· 그때 {ageAtYear}살</span>
          )}
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900">{event.title}</h1>
        {event.description && (
          <p className="mt-3 text-lg text-zinc-800">{event.description}</p>
        )}
      </header>

      <section className="rounded-md border-2 border-zinc-200 bg-white p-6">
        <p className="text-lg font-semibold text-zinc-900">
          어떤 게 떠오르세요?
        </p>
        <p className="mt-1 text-base text-zinc-600">
          아래 질문 중 하나를 골라 답해도 좋고, 떠오르는 대로 자유롭게 적어도
          좋아요.
        </p>
        <ul className="mt-5 flex flex-col gap-3">
          {conversation.questions.map((q, i) => (
            <li
              key={i}
              className="rounded-md border-2 border-zinc-200 bg-zinc-50 px-4 py-3 text-lg text-zinc-800"
            >
              {q}
            </li>
          ))}
        </ul>
      </section>

      {conversation.pastAnswers.length > 0 && (
        <section className="rounded-md border-2 border-emerald-200 bg-emerald-50 p-6">
          <p className="text-lg font-semibold text-emerald-900">
            이전에 남긴 추억
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {conversation.pastAnswers.map((a) => (
              <li
                key={a.id}
                className="rounded-md border-2 border-emerald-200 bg-white px-4 py-3 text-zinc-800"
              >
                {a.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      <AnswerForm
        eventId={event.id}
        conversationId={conversation.conversationId}
      />
    </main>
  );
}
