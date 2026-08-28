"use client";

// STAGE3 — 확인된(CONFIRMED) LifeEvent 를 하나씩 보여주며 심화 여부를 묻는 화면.
// AI 호출 없음 — listConfirmedLifeEvents 로 한 번에 받은 목록을 클라에서 순회.
//
// 액션 버튼 4개:
//   [이야기하기] → STAGE4(에피소드 심화 대화) placeholder. 실제 대화 루프는
//     다음 핸드오프에서 별도 구현(app/life-timeline/companion 류의 화면이
//     참고 대상이 될 수 있음).
//   [사진추가]   → placeholder. 기존 사진 업로드는
//     app/photos/PhotosUploadForm.tsx(/photos) ·
//     app/life-timeline/manage/DraftPhotoUpload.tsx 가 있지만 전부
//     UserMemory.memoryId 기반이라, LifeEvent(신규 모델) 이벤트에 연결하려면
//     LifeEvent ↔ UserMemory 브릿지가 먼저 필요 — 이번엔 연결 안 함.
//   [장소지정]   → placeholder. 기존 장소 입력은 app/components/PlacesEditor.tsx
//     (app/life-timeline/EventForm.tsx 등에서 사용)이지만 마찬가지로
//     UserMemory.memoryId 기반이라 브릿지 필요.
//   [다음에 하기] → hasEpisode 그대로 두고(DB 쓰기 없음) 다음 이벤트로.

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

import {
  listConfirmedLifeEvents,
  type ConfirmedEpisodeItem,
} from "@/app/actions/life-event";

type Phase = "loading" | "asking" | "placeholder" | "done" | "error";
type PlaceholderKind = "story" | "photo" | "place";

const PLACEHOLDER_COPY: Record<PlaceholderKind, string> = {
  story: "이야기 나누는 화면은 곧 준비할게요.",
  photo: "사진 추가 기능은 곧 연결할게요.",
  place: "장소 지정 기능은 곧 연결할게요.",
};

function formatQuestion(item: ConfirmedEpisodeItem): string {
  const yearPart = item.year ? `${item.year}년 ` : "";
  return `${yearPart}${item.label}, 이때 기억나는 거 있으세요?`;
}

export function EpisodeClient({ userId }: { userId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<ConfirmedEpisodeItem[]>([]);
  const [index, setIndex] = useState(0);
  const [placeholderKind, setPlaceholderKind] = useState<PlaceholderKind | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await listConfirmedLifeEvents(userId);
        if (!mounted) return;
        setItems(list);
        setPhase(list.length > 0 ? "asking" : "done");
      } catch (e) {
        console.error("[onboarding-episode]", e);
        if (!mounted) return;
        setErrorMsg("이야기 목록을 불러오지 못했어요.");
        setPhase("error");
      }
    })();
    return () => {
      mounted = false;
    };
  }, [userId]);

  function handleNext() {
    setPlaceholderKind(null);
    const next = index + 1;
    if (next >= items.length) {
      setPhase("done");
      return;
    }
    setIndex(next);
    setPhase("asking");
  }

  function openPlaceholder(kind: PlaceholderKind) {
    setPlaceholderKind(kind);
    setPhase("placeholder");
  }

  if (phase === "loading") {
    return (
      <div className="flex justify-center py-12">
        <div
          className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-brand"
          aria-label="준비 중"
        />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="py-2 text-center">
        <p className="mb-2 text-base text-danger">{errorMsg}</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>
          다시 시도할게요
        </Button>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div className="rounded-md border-2 border-line bg-surface p-6">
        <p className="text-xl font-semibold text-ink">
          오늘은 여기까지 할게요. 다음에 또 이어가요.
        </p>
        {/* TODO(STAGE4 이후): 에피소드 흐름 종료 후 다음 라우트 연결 */}
      </div>
    );
  }

  if (phase === "placeholder" && placeholderKind) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex justify-start">
          <div className="max-w-[82%] rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4 text-lg leading-relaxed text-ink">
            {PLACEHOLDER_COPY[placeholderKind]}
          </div>
        </div>
        <Button variant="tertiary" size="lg" onClick={() => setPhase("asking")}>
          돌아가기
        </Button>
      </div>
    );
  }

  const item = items[index];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-start">
        <div className="max-w-[82%] rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4 text-lg leading-relaxed text-ink">
          {formatQuestion(item)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="primary" size="lg" onClick={() => openPlaceholder("story")}>
          이야기하기
        </Button>
        <Button variant="secondary" size="lg" onClick={() => openPlaceholder("photo")}>
          사진 추가
        </Button>
        <Button variant="secondary" size="lg" onClick={() => openPlaceholder("place")}>
          장소 지정
        </Button>
        <Button variant="tertiary" size="lg" onClick={handleNext}>
          다음에 하기
        </Button>
      </div>
    </div>
  );
}
