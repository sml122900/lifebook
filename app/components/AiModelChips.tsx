"use client";

// 전역 AI 모델 선택 칩 — 설정(full) + 라이브 화면 빠른 전환(compact) 공용.
// 어디서 바꿔도 updateAiModel 로 User.aiModel 한 값 갱신 → 모든 라이브 일관.
// 모델명 노출 X(품질 어휘). opus 선택 시 8배 경고.

import { useState, useTransition } from "react";

import { updateAiModel } from "@/app/account/ai-model-actions";
import {
  AI_MODELS,
  AI_MODEL_LABEL,
  AI_MODEL_NOTE,
  OPUS_WARNING,
  multiplierLabel,
  type AiModel,
} from "@/lib/ai-model";

export function AiModelChips({
  current,
  variant = "compact",
  onChanged,
}: {
  current: AiModel;
  variant?: "compact" | "full";
  onChanged?: (m: AiModel) => void;
}) {
  const [value, setValue] = useState<AiModel>(current);
  const [pending, startTransition] = useTransition();

  function pick(m: AiModel) {
    if (m === value || pending) return;
    const prev = value;
    setValue(m); // 옵티미스틱
    startTransition(async () => {
      const res = await updateAiModel(m);
      if (!res.ok) setValue(prev);
      else onChanged?.(m);
    });
  }

  if (variant === "full") {
    return (
      <div className="flex flex-col gap-3">
        {AI_MODELS.map((m) => {
          const label = AI_MODEL_LABEL[m];
          const selected = m === value;
          return (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              aria-pressed={selected}
              disabled={pending}
              className={
                "flex items-start gap-3 rounded-md border-2 px-4 py-3 text-left disabled:opacity-60 " +
                (selected
                  ? "border-action bg-banner"
                  : "border-line bg-surface hover:bg-banner")
              }
            >
              <span className="flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="text-lg font-bold text-ink">{label.name}</span>
                  <span className="text-base font-semibold text-ink-soft">
                    {multiplierLabel(m)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-ink-soft">{label.desc}</span>
                {m === "opus" && (
                  <span className="mt-1 block text-sm font-semibold text-amber-700">
                    ⚠️ {OPUS_WARNING}
                  </span>
                )}
              </span>
            </button>
          );
        })}
        <p className="text-sm text-ink-faint">{AI_MODEL_NOTE}</p>
      </div>
    );
  }

  // compact — 라이브 화면 칩 한 줄.
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-ink-soft">AI 모델</span>
        {AI_MODELS.map((m) => {
          const label = AI_MODEL_LABEL[m];
          const selected = m === value;
          return (
            <button
              key={m}
              type="button"
              onClick={() => pick(m)}
              aria-pressed={selected}
              disabled={pending}
              className={
                "inline-flex min-h-[36px] items-center gap-1 rounded-full border-2 px-3 py-1 text-sm font-semibold disabled:opacity-60 " +
                (selected
                  ? "border-action bg-action text-white"
                  : "border-line bg-surface text-ink hover:bg-banner")
              }
            >
              {label.name}
              <span className={selected ? "text-white/80" : "text-ink-faint"}>
                {multiplierLabel(m)}
              </span>
            </button>
          );
        })}
      </div>
      {value === "opus" && (
        <p className="text-xs font-semibold text-amber-700">⚠️ {OPUS_WARNING}</p>
      )}
    </div>
  );
}
