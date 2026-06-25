"use client";

// C3 — companion 대화 중 연도 언급 시 그 해 시대 아카이브(사건·히트곡)를
// 채팅 메시지 아래 인라인으로 보여주는 접이식 카드. 기억 트리거 역할.
// 순수 프레젠테이션 — 데이터(EraSnapshot)는 CompanionClient 가 감지·조회해 준다.

import { useState } from "react";

export type EraSnapshot = {
  year: number;
  events: { title: string }[];
  songs: { title: string; artist: string }[];
};

export function EraArchiveCard({ era }: { era: EraSnapshot }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-1 overflow-hidden rounded-md border-2 border-line bg-canvas">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
      >
        <span className="text-base font-semibold text-action">
          🕰️ {era.year}년, 그 시절 이야기 보기
        </span>
        <span aria-hidden className="text-ink-soft">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t-2 border-line px-4 py-3">
          {era.events.length > 0 && (
            <div>
              <p className="text-sm font-bold text-ink-soft">그 해 있었던 일</p>
              <ul className="mt-1 flex flex-col gap-1">
                {era.events.map((e, i) => (
                  <li key={i} className="text-lg leading-snug text-ink">
                    • {e.title}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {era.songs.length > 0 && (
            <div>
              <p className="text-sm font-bold text-ink-soft">그때 유행한 노래</p>
              <ul className="mt-1 flex flex-col gap-1">
                {era.songs.map((s, i) => (
                  <li key={i} className="text-lg leading-snug text-ink">
                    🎵 {s.title}
                    {s.artist ? ` — ${s.artist}` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-base text-ink-soft">이 노래 기억나세요?</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
