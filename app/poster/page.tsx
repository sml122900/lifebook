import Link from "next/link";
import { redirect } from "next/navigation";

import { Sprout } from "lucide-react";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";
import type { MappingEvent } from "@/lib/poster/types";
import { mapToPlacement } from "@/lib/poster/mapping";
import { loadMasterSvg, renderPoster } from "@/lib/poster/render";
import { zelkovaManifest } from "@/lib/poster/templates/zelkova";

// T1 STEP3 — 인생 나무 포스터 화면 (읽기 전용 데모).
//
// 사용자의 life_event 를 매핑(STEP1) → 자동 선택된 마스터에 렌더(STEP2) →
// 인라인 SVG 로 미리보기. 인터랙션 0. 마이그 0.
//
// 디자인 동결: v0.1 느티나무 마스터를 비주얼 수정 없이 그대로 스킨으로 쓴다.
// 화면에서 글씨가 작은 건(인쇄용 mm 밀도) 7월 다듬기 과제 — 여기선 폰트 크기
// 등 비주얼을 건드리지 않는다(디자인 동결 우선).

export const metadata = { title: "인생 나무 미리보기" };

export default async function PosterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [allEvents, birthYear] = await Promise.all([
    getLifeEvents(userId),
    getBirthYear(userId),
  ]);

  // 나무 = 사용자가 직접 쓴 인생 골격(life_event)만. era_event·photo 는 제외.
  const lifeEvents = allEvents.filter((e) => e.kind === "life_event");

  if (lifeEvents.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={Sprout}
          message="연혁에 사건을 몇 개 적으면, 그것들이 한 그루 나무로 자라납니다."
          buttonLabel="인생 연혁으로 가기"
          href="/life-timeline"
        />
      </main>
    );
  }

  const mapped: MappingEvent[] = lifeEvents.map((e) => ({
    title: e.title,
    year: e.eventYear,
    month: e.eventMonth,
    endYear: e.endYear,
    textLength: e.content?.length ?? 0,
  }));

  // 뿌리 줄 = 출생지 · 출생연도 (있으면). 없으면 렌더러가 root-text 를 숨김.
  const birth = lifeEvents.find((e) => e.category === "BIRTH");
  const rootLine =
    birth?.place.placeName && birthYear
      ? `${birth.place.placeName} · ${birthYear}`
      : birth?.place.placeName
        ? birth.place.placeName
        : birthYear
          ? `${birthYear}`
          : null;

  const ownerName = session.user.name
    ? `${session.user.name} 님의 인생 나무`
    : "나의 인생 나무";

  const placement = mapToPlacement(mapped, zelkovaManifest, {
    birthYear,
    ownerName,
    rootLine,
    footerLine: session.user.name ? `${session.user.name} · 2026년 제작` : null,
  });

  const rawSvg = loadMasterSvg(zelkovaManifest, placement.branchCount);
  const svg = renderPoster(rawSvg, zelkovaManifest, placement);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">인생 나무 미리보기</h1>
        <p className="mt-2 text-base text-ink-soft">
          지금까지 적으신 이야기로 자란 한 그루 나무예요.
        </p>
      </header>

      {/* 읽기 전용 인라인 SVG. CSS 로 폭만 맞춤(width:100%) — 마스터의 mm
          크기를 덮어쓰되 viewBox 비율은 유지. 비주얼은 손대지 않음. */}
      <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm [&>svg]:h-auto [&>svg]:w-full">
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      </div>

      <p className="mx-auto mt-4 max-w-[560px] text-center text-sm text-ink-soft">
        포스터로 만들면 더 크고 또렷하게 보여요.
      </p>

      <div className="mt-8 text-center">
        <Link href="/life-timeline" className={buttonClasses("secondary", "lg")}>
          ← 인생 연혁으로
        </Link>
      </div>
    </main>
  );
}
