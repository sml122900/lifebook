import Link from "next/link";
import { redirect } from "next/navigation";

import { Sprout, Check, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";

import { ScreenTour } from "@/app/components/ScreenTour";
import { markTourCompletedAction } from "@/app/life-timeline/tour-actions";
import {
  POSTER_TEMPLATES_TOUR_ID,
  POSTER_TEMPLATES_TOUR_STEPS,
} from "@/lib/tours";

import { chooseTemplate } from "./actions";
import { TemplateSubmitButton } from "./TemplateSubmitButton";
import { hasPosterSourceEvents } from "@/lib/poster/v3-bridge";

// /poster — 포스터 디자인 고르기 화면.
//
// 흐름: /poster(디자인 고르기) → /poster/select(노드·메모) → /poster/view(시안).
// 강물(river — P4 합성)과 맞춤형(/poster/custom) 두 가지.
// 고른 디자인은 Poster.template 에 저장(chooseTemplate) 후 /poster/select 로.
// 옛 3종 템플릿 엔진(느티나무·인생 강물 SVG·인생의 나무)과 "준비 중" 카드는 2026-11-08 삭제.

export const metadata = { title: "포스터 디자인 고르기" };

type TemplateChoice = {
  id: string;
  name: string;
  desc: string;
  preview: string | null; // 미리보기 이미지(없으면 placeholder)
  status: "ready" | "custom"; // custom = 맞춤배경 생성 플로우(/poster/custom)
};

const TEMPLATE_CHOICES: TemplateChoice[] = [
  {
    id: "river",
    name: "강물",
    desc: "한 생애가 강물처럼 흘러갑니다. 큰 사건은 물길 옆에, 작은 이야기는 가장자리에 담겨요.",
    preview: "/poster/river-bg.png",
    status: "ready",
  },
  {
    id: "custom",
    name: "맞춤형 디자인",
    desc: "좋아하시는 색·꽃·분위기로 배경 그림을 새로 그려드려요.",
    preview: null,
    status: "custom",
  },
];

export default async function PosterTemplatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [hasLifeEvents, poster, userRow] = await Promise.all([
    hasPosterSourceEvents(userId),
    prisma.poster.findUnique({
      where: { userId },
      select: { template: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { completedTours: true },
    }),
  ]);

  // 포스터 = 본인 인생 골격(life_event 또는 확정된 v3 사건). 사건이 없으면 연혁부터.
  if (!hasLifeEvents) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={Sprout}
          message="연혁에 사건을 몇 개 적으면, 그것들로 한 장의 포스터를 만들 수 있어요."
          buttonLabel="인생 연혁으로 가기"
          href="/life-timeline"
        />
      </main>
    );
  }

  const current = poster?.template ?? null;
  const tourSeen =
    userRow?.completedTours?.includes(POSTER_TEMPLATES_TOUR_ID) ?? false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-ink">포스터 디자인 고르기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          마음에 드는 모양을 하나 골라주세요.
        </p>
      </header>

      <ul className="grid gap-5 sm:grid-cols-2">
        {TEMPLATE_CHOICES.map((t) => (
          <TemplateCard key={t.id} t={t} current={current} />
        ))}
      </ul>

      <div className="mt-10 text-center">
        <Link href="/life-timeline" className={buttonClasses("secondary", "lg")}>
          ← 인생 연혁으로
        </Link>
      </div>

      <ScreenTour
        tourId={POSTER_TEMPLATES_TOUR_ID}
        steps={POSTER_TEMPLATES_TOUR_STEPS}
        autoStart={!tourSeen}
        onComplete={markTourCompletedAction}
      />
    </main>
  );
}

function TemplateCard({
  t,
  current,
}: {
  t: TemplateChoice;
  current: string | null;
}) {
  const isCustom = t.status === "custom";
  const selected = current === t.id;
  // 코치마크 타겟 — 강물(river)과 맞춤형 카드.
  const dataTour = isCustom ? "poster-custom" : "poster-template";

  return (
    <li
      data-tour={dataTour}
      className="flex flex-col overflow-hidden rounded-xl border-2 border-action bg-surface"
    >
      {/* 미리보기 — A2 세로 비율(2:3). */}
      <div className="relative aspect-[2/3] w-full bg-banner">
        {t.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.preview}
            alt={`${t.name} 포스터 미리보기`}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-banner to-brand/20 text-action">
            <Sparkles aria-hidden strokeWidth={1.5} className="h-10 w-10" />
            <span className="text-sm">내 취향으로</span>
          </div>
        )}
        {selected && !isCustom && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-success px-3 py-1 text-xs font-semibold text-on-action">
            <Check strokeWidth={2.5} aria-hidden className="h-3.5 w-3.5" />
            지난번 선택
          </span>
        )}
      </div>

      {/* 이름·설명 */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="text-xl font-bold text-ink">{t.name}</h2>
        <p className="flex-1 text-base text-ink-soft">{t.desc}</p>

        {isCustom ? (
          <Link
            href="/poster/custom"
            className="mt-2 inline-flex min-h-[52px] w-full items-center justify-center rounded-md border-2 border-brand bg-surface text-action hover:bg-banner px-5 py-3 text-lg font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            내 취향으로 만들기 →
          </Link>
        ) : (
          <form action={chooseTemplate.bind(null, t.id)} className="mt-2">
            <TemplateSubmitButton />
          </form>
        )}
      </div>
    </li>
  );
}
