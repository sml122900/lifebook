"use client";

// C2 — companion "내 이야기" 타임라인 패널.
//   데스크톱(lg+): 채팅 왼쪽 고정 사이드 패널(항상 노출, sticky).
//   모바일: "내 이야기 보기" 토글 → 아래에서 올라오는 드로어.
// 데이터는 서버(fetchStoryTimeline)가 준 승인 사건 + 최근 세션 새 이야기.
// 실시간 아님 — 화면 진입 시 1회 로드(대화 종료·추출 후 재진입에서 갱신).

import { useEffect, useState } from "react";

import type { StoryTimelineItem } from "@/lib/companion";

export function StoryTimelinePanel({ items }: { items: StoryTimelineItem[] }) {
  const [open, setOpen] = useState(false);

  // 모바일 드로어 — Esc 닫기 + 배경 스크롤 잠금 (DeleteButton 패턴).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      {/* 데스크톱 고정 패널 */}
      <aside
        data-tour="companion-story"
        className="hidden lg:sticky lg:top-10 lg:flex lg:max-h-[calc(100vh-5rem)] lg:w-64 lg:shrink-0 lg:flex-col"
      >
        <div className="flex flex-col gap-3 overflow-y-auto rounded-md border-2 border-line bg-surface p-5">
          <PanelHeading count={items.length} />
          <StoryList items={items} />
        </div>
      </aside>

      {/* 모바일 토글 버튼 */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-md border-2 border-line bg-surface px-4 py-2 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          📖 내 이야기 보기{items.length > 0 ? ` (${items.length})` : ""}
        </button>
      </div>

      {/* 모바일 드로어 (아래에서 올라옴) */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="지금까지의 내 이야기"
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/50 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[75vh] overflow-y-auto rounded-t-2xl border-t-2 border-line bg-surface p-6"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <PanelHeading count={items.length} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-[44px] shrink-0 items-center rounded-md border-2 border-line px-4 py-2 text-base font-semibold text-ink hover:bg-banner"
              >
                닫기
              </button>
            </div>
            <StoryList items={items} />
          </div>
        </div>
      )}
    </>
  );
}

function PanelHeading({ count }: { count: number }) {
  return (
    <div>
      <h2 className="text-xl font-bold text-ink">지금까지의 내 이야기</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {count > 0 ? `${count}가지 이야기가 쌓였어요` : "이야기가 여기 쌓여요"}
      </p>
    </div>
  );
}

function StoryList({ items }: { items: StoryTimelineItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-base leading-relaxed text-ink-soft">
        아직 기록된 이야기가 없어요. 지금 나누는 이야기가 여기 차곡차곡 쌓여요.
      </p>
    );
  }
  return (
    <ol className="flex flex-col gap-2">
      {items.map((it) => (
        <li
          key={it.id}
          className={[
            "flex flex-col gap-0.5 rounded-md border-2 px-3 py-2",
            it.isNew ? "border-brand bg-banner" : "border-line bg-canvas",
          ].join(" ")}
        >
          <span className="flex items-center gap-2">
            <span className="text-base font-bold text-action">{it.year}년</span>
            {it.isNew && (
              <span className="rounded-full bg-action px-2 py-0.5 text-xs font-bold text-white">
                새 이야기
              </span>
            )}
          </span>
          <span className="text-lg leading-snug text-ink">{it.title}</span>
        </li>
      ))}
    </ol>
  );
}
