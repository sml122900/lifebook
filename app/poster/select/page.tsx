import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ScreenTour } from "@/app/components/ScreenTour";
import { markTourCompletedAction } from "@/app/life-timeline/tour-actions";
import { prisma } from "@/lib/db";
import {
  POSTER_SELECT_TOUR_ID,
  POSTER_SELECT_TOUR_STEPS,
} from "@/lib/tours";

import { loadPosterEditor } from "./actions";
import { PosterSelectClient } from "./PosterSelectClient";

// P2 — 포스터 선택/분류/정정 화면.
//
// P1 후보(AI 분류)를 불러와 사용자가 노드/메모/제외를 정하고, 제목·내용을
// 정정하고, P3 미리보기를 본 뒤 Poster.selections 로 저장한다. SVG 합성은 P4.
//
// loadPosterEditor 가 P1 AI 분류를 돌리므로 첫 로드에 몇 초 걸릴 수 있음
// (후속: 후보 캐싱).

export const metadata = { title: "포스터에 담을 이야기 고르기" };

export default async function PosterSelectPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [{ candidates, savedSelections }, userRow] = await Promise.all([
    loadPosterEditor(),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { completedTours: true },
    }),
  ]);
  const tourSeen =
    userRow?.completedTours?.includes(POSTER_SELECT_TOUR_ID) ?? false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-ink">포스터에 담을 이야기 고르기</h1>
        <p className="mt-2 text-base text-ink-soft">
          AI가 골라본 이야기예요. 넣을 것은 <b>큰 사건(노드)</b> 또는{" "}
          <b>작은 이야기(메모)</b>로 정하고, 빼고 싶으면 <b>제외</b>를 누르세요.
          제목·내용은 눌러서 고칠 수 있어요.
        </p>
      </header>

      {candidates.length === 0 ? (
        <p className="rounded-md border-2 border-line bg-surface px-4 py-6 text-center text-ink-soft">
          아직 포스터에 담을 이야기가 없어요. 먼저 인생 연혁을 채워주세요.
        </p>
      ) : (
        <>
          <PosterSelectClient
            candidates={candidates}
            savedSelections={savedSelections}
          />
          <ScreenTour
            tourId={POSTER_SELECT_TOUR_ID}
            steps={POSTER_SELECT_TOUR_STEPS}
            autoStart={!tourSeen}
            onComplete={markTourCompletedAction}
          />
        </>
      )}
    </main>
  );
}
