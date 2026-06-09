"use client";

import { useState, useTransition } from "react";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { ERA_MEMORY_MAX_LENGTH } from "@/lib/era-constants";

import { saveEraMemoryAction } from "./actions";

// Phase E3 — 담은 시대 사건(era_event) 의 본인 회상(content) 입력 영역.
// /era 펼친 상세 + /life-timeline EraCard 양쪽에서 재사용 (한 컴포넌트, 같은
// server action). 한 쪽에서 적으면 revalidatePath 가 다른 쪽도 갱신.
//
// 시니어 친화:
//   - 빈 칸이어도 괜찮다는 톤 (안내 한 줄 + placeholder)
//   - VoiceTextarea 로 음성 입력 (어르신 타이핑 부담 ↓)
//   - 길이 제한(500자) 잔량 표시는 부드럽게 (초과 시에만 rose)
//   - 저장됐어요 / 실패 안내는 한 번에 하나만
//
// state 동기화 정책:
//   - useState 초기값으로 initialContent. 같은 인스턴스가 유지되는 한
//     사용자의 마지막 입력값 우선 (외부 revalidate 가 와도 internal value
//     덮어쓰지 않음 — 작성 중 사라지는 사고 방지). 다른 클라이언트의 변경은
//     사용자가 새로고침해야 반영(일반적 React 한계, 단일 사용자 가정 OK).
export function EraMemoryEditor({
  monthEventId,
  eventTitle,
  initialContent,
  onSaved,
  variant = "default",
}: {
  monthEventId: string;
  eventTitle: string;
  initialContent: string | null;
  onSaved: (newContent: string | null) => void;
  // "default" — /era 펼친 상세(emerald 톤). "compact" — /life-timeline EraCard
  // (slate 톤, 작은 글씨, 카드 안에 자연스럽게).
  variant?: "default" | "compact";
}) {
  const [value, setValue] = useState(initialContent ?? "");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isPending, startTransition] = useTransition();

  const trimmed = value.trim();
  const normalized: string | null = trimmed === "" ? null : trimmed;
  const initial = initialContent ?? null;
  const hasChange = normalized !== initial;
  const tooLong = trimmed.length > ERA_MEMORY_MAX_LENGTH;
  const disabled = isPending || !hasChange || tooLong;

  function onSave() {
    if (disabled) return;
    setErrorMsg(null);
    setSavedFlash(false);
    startTransition(async () => {
      try {
        const r = await saveEraMemoryAction(monthEventId, trimmed);
        if (r === "saved" || r === "cleared") {
          onSaved(normalized);
          setSavedFlash(true);
        } else if (r === "too_long") {
          setErrorMsg("회상은 500자까지 적을 수 있어요.");
        } else {
          // not_stashed — UI 가 이미 담았다고 표시하는데 서버는 아니라는
          // race. 사용자에게 새로고침 안내.
          setErrorMsg("담은 사건 정보를 다시 불러올 수 없어요. 새로고침 해주세요.");
        }
      } catch (e) {
        console.error("[era-save-memory]", e);
        setErrorMsg("저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  const containerClass =
    variant === "compact"
      ? "flex flex-col gap-2 rounded-md border border-slate-300 bg-white/70 p-3"
      : "flex flex-col gap-3 rounded-md border-2 border-emerald-200 bg-emerald-50/40 p-4";
  const promptClass =
    variant === "compact"
      ? "text-sm font-semibold text-slate-800"
      : "text-base font-semibold text-emerald-900";
  const subtleClass =
    variant === "compact" ? "text-xs text-slate-600" : "text-sm text-emerald-700";
  const rows = variant === "compact" ? 2 : 3;
  const textareaClassName =
    variant === "compact"
      ? "w-full rounded-md border-2 border-slate-300 bg-white px-3 py-2 text-base text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
      : undefined; // VoiceTextarea 의 기본 (큰 글씨, 시니어 친화)

  return (
    <div className={containerClass}>
      <p className={promptClass}>
        {initial ? "그때 어떻게 지내셨나요?" : "그때 어떻게 지내셨나요?"}
        <span className={"ml-2 font-normal " + subtleClass}>
          (안 적어도 괜찮아요)
        </span>
      </p>
      <VoiceTextarea
        value={value}
        onChange={setValue}
        rows={rows}
        placeholder="그때 저는… 어디서 무엇을 하고 있었어요"
        ariaLabel={`${eventTitle} 본인 회상 입력`}
        textareaClassName={textareaClassName}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={disabled}
          className={
            variant === "compact"
              ? "inline-flex min-h-[40px] items-center justify-center rounded-md border-2 border-emerald-600 bg-emerald-600 px-4 py-1 text-sm font-bold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              : "inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-emerald-600 bg-emerald-600 px-5 py-2 text-base font-bold text-white hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          }
        >
          {isPending
            ? "저장 중…"
            : initial !== null && normalized === null
              ? "회상 비우기"
              : "회상 저장"}
        </button>
        <span
          className={
            "text-sm " + (tooLong ? "font-semibold text-rose-700" : "text-zinc-500")
          }
          aria-live="polite"
        >
          {trimmed.length} / {ERA_MEMORY_MAX_LENGTH}
        </span>
        {savedFlash && !errorMsg && (
          <span className="text-sm font-semibold text-emerald-700" aria-live="polite">
            저장됐어요
          </span>
        )}
      </div>
      {errorMsg && (
        <p role="alert" className="text-sm text-rose-700">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
