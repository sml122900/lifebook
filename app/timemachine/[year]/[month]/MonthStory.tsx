"use client";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";

import { cleanupVoiceTextAction } from "./cleanup-action";

// 그 달 전체 자유 회고. controlled — 값은 MonthForm 이 관리.
// 사건별 메모(EventItem) 와 별개로 음악 섹션 아래에 자리한다.
export function MonthStory({
  year,
  month,
  value,
  onChange,
}: {
  year: number;
  month: number;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-md border-2 border-zinc-200 bg-white p-6">
      <h2 className="text-2xl font-bold text-zinc-900 sm:text-3xl">
        {year}년 {month}월, 당신은 어떻게 지냈나요?
      </h2>
      <p className="text-base text-zinc-700">
        위에 표시되지 않은 일이라도, 그 달에 있었던 일을 자유롭게 적어주세요.
      </p>
      <VoiceTextarea
        value={value}
        onChange={onChange}
        rows={8}
        placeholder="기억나는 만큼만 적어도 좋아요."
        ariaLabel={`${year}년 ${month}월 전체 회고`}
        textareaClassName="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-4 text-lg leading-relaxed text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:text-xl"
        onCleanup={cleanupVoiceTextAction}
      />
    </section>
  );
}
