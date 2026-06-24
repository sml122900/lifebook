import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBirthYear, getLifeEventById } from "@/lib/life-events";
import { listMemoryPhotos } from "@/lib/photos";
import { getRecordingSignedUrl } from "@/lib/storage";

import { EventForm } from "../../EventForm";
import { EventPhotos } from "./EventPhotos";

// Phase L4 — 인생 이벤트 수정 페이지. 권한 확인은 헬퍼(getLifeEventById)
// 가 userId 일치만 통과시키므로, 결과가 null 이면 자동 404.

export const metadata = {
  title: "이벤트 수정 — 인생 연혁",
};

export default async function LifeTimelineEditPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { eventId } = await params;
  // Phase Photo (4단계) — getLifeEventById 는 life_event 만 통과(createdVia
  // 필터) → era_event/photo 메모리 id 면 null → 404. 즉 이 화면은 본질적으로
  // life_event 전용이라 사진 첨부 섹션이 era/photo 에 안 뜨는 것은 자동 보장.
  // listMemoryPhotos 는 where userId 로 소유 검증(남의 id 면 []).
  const [event, birthYear, photos] = await Promise.all([
    getLifeEventById(session.user.id, eventId),
    getBirthYear(session.user.id),
    listMemoryPhotos(session.user.id, eventId),
  ]);
  if (!event) {
    notFound();
  }

  // 7c — 저장된 녹음이 있으면 signed URL 발급. 실패해도 재생 버튼만 안 보임.
  let audioSignedUrl: string | undefined;
  if (event.audioPath) {
    try {
      audioSignedUrl = await getRecordingSignedUrl(event.audioPath);
    } catch { /* silent */ }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-ink-soft">
          <Link
            href="/life-timeline/manage"
            className="underline hover:text-ink"
          >
            ← 이벤트 관리
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          이벤트 수정
        </h1>
      </header>

      <EventForm
        mode="edit"
        birthYear={birthYear}
        initial={{
          eventId: event.id,
          category: event.category,
          precision: event.precision,
          title: event.eventTitle,
          year: event.eventYear,
          month: event.eventMonth,
          endYear: event.endYear,
          endMonth: event.endMonth,
          content: event.content ?? "",
          places: event.places,
        }}
        refine={{
          memoryId: event.id,
          initialRefinedText: event.refinedText,
          initialDisplayRefined: event.displayRefined,
        }}
        audioSignedUrl={audioSignedUrl}
      >
        {/* 사진 섹션은 폼 본문 아래·취소/저장 버튼 위에 (children). */}
        <EventPhotos
          memoryId={event.id}
          isPeriod={
            event.endYear != null &&
            (event.endYear !== event.eventYear || event.endMonth != null)
          }
          photos={photos.map((p) => ({
            id: p.id,
            signedUrl: p.signedUrl,
            caption: p.caption,
            bytes: p.bytes,
            mimeType: p.mimeType,
            periodAnchor: p.periodAnchor,
          }))}
        />
      </EventForm>
    </main>
  );
}
