"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/Button";
import { EraMemoryEditor } from "@/app/era/EraMemoryEditor";
import { stashAndSaveFirstEraMemoryAction } from "@/app/era/actions";

// 온보딩 첫 사건 카드 — 가입 직후(출생연도 有 · BIRTH 외 이벤트 0건) 빈 타임라인
// 이탈을 줄이려 "그 시절 큰 사건" 1개를 제시하고 첫 회상을 유도한다.
//
// "신규 화면" 아님 — /life-timeline 메인 위에 얹는 카드. 회상 입력은 기존
// EraMemoryEditor 재사용(stash+저장 결합 액션 주입). 저장 시 첫 era_event 행이
// 생기면 nonBirth 이벤트가 1 → 서버 분기가 꺼져 다음 렌더에 자연 소멸.
//
// 닫기 정책(스키마 변경 0): "나중에 할게요" 는 localStorage 기기-로컬 표시.
// 강제 아님 — 닫으면 빈 타임라인 + 기존 "+ 인생의 한 장면" 유도로 폴백.
// 어차피 기록 1건 생기면 사라지므로 서버 영속 표시는 두지 않는다.

const DISMISS_KEY = "first-era-card-dismissed";

export function FirstEraEventCard({
  birthYear,
  monthEventId,
  eventYear,
  eventTitle,
  eventDescription,
  eventSource,
}: {
  birthYear: number;
  monthEventId: string;
  eventYear: number;
  eventTitle: string;
  eventDescription: string;
  eventSource: string | null;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);

  // 이전에 "나중에" 누른 기기면 안 띄움.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(DISMISS_KEY)) setHidden(true);
    } catch {
      // localStorage 막힌 환경이어도 카드 동작엔 지장 없음.
    }
  }, []);

  function onDismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // 무시 — 표시만 못 할 뿐 동작 영향 없음.
    }
  }

  // 회상 저장 성공 → 서버 재검증(revalidatePath) + 화면 갱신. 새 era 행이
  // 생겨 분기가 꺼지므로 카드는 사라지고 타임라인에 첫 이야기가 나타난다.
  function onSaved() {
    router.refresh();
  }

  if (hidden) return null;

  const age = eventYear - birthYear; // 사건 당시 나이(연도차, "무렵")

  return (
    <section
      aria-label="첫 기록 안내"
      className="flex flex-col gap-5 rounded-md border-2 border-brand bg-banner px-6 py-7"
    >
      <div>
        <h2 className="text-2xl font-bold text-action sm:text-3xl">
          {birthYear}년에 태어나셨군요.
        </h2>
        <p className="mt-2 text-xl text-action">
          {age >= 0 && age <= 110
            ? `그때 ${age}세 무렵, 이 사건 기억나세요?`
            : "그 시절, 이 사건 기억나세요?"}
        </p>
      </div>

      {/* 시대 자료(앵커 사건) — 본인 회상과 시각 구분 위해 surface 톤 */}
      <div className="rounded-md border border-line bg-surface px-5 py-4">
        <p className="text-lg font-bold text-ink">
          {eventYear}년 · {eventTitle}
        </p>
        <p className="mt-1 text-lg leading-relaxed text-ink-soft">
          {eventDescription}
        </p>
        {eventSource && (
          <p className="mt-2 text-sm text-ink-faint">출처: {eventSource}</p>
        )}
      </div>

      {/* 회상 입력 — 기존 EraMemoryEditor 재사용 + stash+저장 결합 액션 주입 */}
      <EraMemoryEditor
        monthEventId={monthEventId}
        eventTitle={eventTitle}
        initialContent={null}
        onSaved={onSaved}
        variant="default"
        saveAction={stashAndSaveFirstEraMemoryAction}
      />

      {/* 폴백 — 기억 안 나거나 나중에. 강제 아님. */}
      <button
        type="button"
        onClick={onDismiss}
        className={buttonClasses("plain", "md", "self-start")}
      >
        나중에 할게요
      </button>
    </section>
  );
}
