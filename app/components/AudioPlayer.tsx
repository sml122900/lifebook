"use client";

import { useRef, useState } from "react";

// 시니어 친화 오디오 재생 컴포넌트 (Phase 7c).
// signedUrl — 서버에서 발급한 Supabase signed URL(1h TTL). 만료 시 재생 실패.
// 만료 안내는 별도하지 않음 — 어르신에겐 "오류 → 새로고침" 단순 안내가 낫다.
export function AudioPlayer({ signedUrl }: { signedUrl: string }) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  function toggle() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      setError(false);
      el.play().then(() => setPlaying(true)).catch(() => {
        setPlaying(false);
        setError(true);
      });
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* 숨김 오디오 — JS로 제어해 시니어용 큰 버튼 래핑 */}
      <audio
        ref={audioRef}
        src={signedUrl}
        onEnded={() => setPlaying(false)}
        onError={() => { setPlaying(false); setError(true); }}
        preload="none"
      />
      <button
        type="button"
        onClick={toggle}
        className="flex min-h-[56px] w-full items-center gap-3 rounded-lg border-2 border-brand bg-banner px-5 text-lg font-semibold text-ink hover:bg-banner/80 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        aria-label={playing ? "일시정지" : "저장된 녹음 듣기"}
      >
        <span className="text-2xl" aria-hidden>
          {playing ? "⏸" : "🔊"}
        </span>
        <span>{playing ? "일시정지" : "녹음 듣기"}</span>
      </button>
      {error && (
        <p className="text-sm text-danger">
          재생할 수 없어요. 페이지를 새로고침하면 다시 들을 수 있어요.
        </p>
      )}
    </div>
  );
}
