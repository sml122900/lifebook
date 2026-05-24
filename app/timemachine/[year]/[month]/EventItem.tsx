"use client";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";

// 한 사건 카드. controlled — 상태는 MonthForm 이 들고 있다.
//   pending  : 초기. 남기기/지우기 버튼 노출.
//   kept     : 남김. 카드 강조 + 내 이야기 입력 + 취소 링크.
//   removed  : 지움. 작은 줄로 축소 + 복구 (실수 방지).
//
// 메모 보존 (M2): 취소/지우기 누른 뒤 다시 "남기기" 했을 때 입력한 메모
// 가 복원되도록, status 만 바꾸고 story 는 건드리지 않는다. 저장 시
// kept 인 사건만 DB 로 가므로 pending/removed 상태의 메모는 무해.
export type Status = "pending" | "kept" | "removed";

export type EventItemData = {
  id: string;
  title: string;
  description: string;
  isPeriod: boolean;
};

export function EventItem({
  item,
  status,
  onStatusChange,
  story,
  onStoryChange,
}: {
  item: EventItemData;
  status: Status;
  onStatusChange: (s: Status) => void;
  story: string;
  onStoryChange: (s: string) => void;
}) {
  if (status === "removed") {
    return (
      <li className="flex items-center justify-between gap-3 rounded-md border-2 border-zinc-200 bg-zinc-50 px-4 py-3">
        <span className="text-base text-zinc-600 line-through">
          {item.title}
        </span>
        <button
          type="button"
          onClick={() => onStatusChange("pending")}
          className="min-h-[44px] rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          복구
        </button>
      </li>
    );
  }

  const kept = status === "kept";

  return (
    <li
      className={
        "rounded-md border-2 p-5 " +
        (kept
          ? "border-amber-300 bg-amber-50"
          : "border-zinc-200 bg-white")
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-semibold text-zinc-900">{item.title}</h3>
          {item.description && (
            <p className="mt-2 text-lg text-zinc-800">{item.description}</p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          {kept ? (
            <button
              type="button"
              onClick={() => onStatusChange("pending")}
              className="min-h-[60px] rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
              aria-label={`${item.title} 선택 취소`}
            >
              취소
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onStatusChange("kept")}
                className="min-h-[60px] rounded-md border-2 border-emerald-500 bg-emerald-50 px-5 py-3 text-base font-bold text-emerald-900 hover:bg-emerald-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500 focus-visible:ring-offset-2"
                aria-label={`${item.title} 남기기`}
              >
                ✓ 남기기
              </button>
              <button
                type="button"
                onClick={() => onStatusChange("removed")}
                className="min-h-[60px] rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-base font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
                aria-label={`${item.title} 지우기`}
              >
                ✕ 지우기
              </button>
            </>
          )}
        </div>
      </div>

      {kept && (
        <div className="mt-4 flex flex-col gap-2">
          <span className="text-base font-medium text-zinc-800">
            어떤 일이 있었나요?
          </span>
          <VoiceTextarea
            value={story}
            onChange={onStoryChange}
            rows={3}
            placeholder="기억나는 만큼만 적어도 좋아요."
            ariaLabel={`${item.title} 에 대한 내 이야기`}
          />
        </div>
      )}
    </li>
  );
}
