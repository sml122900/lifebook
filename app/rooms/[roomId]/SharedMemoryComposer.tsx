import { createSharedMemoryAction } from "./shared-actions";

const CURRENT_YEAR = new Date().getFullYear();

// 서버 컴포넌트 — 인라인 "공동 추억 추가" 폼. 시니어 친화: 큰 입력칸,
// 명확한 라벨, 연도는 평범한 number 입력이라 스크린리더·키보드 둘 다 동작.
export function SharedMemoryComposer({ roomId }: { roomId: string }) {
  return (
    <form
      action={createSharedMemoryAction}
      className="flex flex-col gap-4 rounded-md border-2 border-line bg-surface p-6"
    >
      <input type="hidden" name="roomId" value={roomId} />
      <p className="text-xl font-bold text-ink">새 공동 추억</p>
      <p className="text-base text-ink-soft">
        "우리"가 함께 겪은 일을 적어보세요. 룸 멤버 모두가 함께 다듬을 수 있어요.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink">연도</span>
          <input
            type="number"
            name="year"
            required
            min={1900}
            max={CURRENT_YEAR}
            placeholder="예: 1998"
            className="w-32 rounded-md border-2 border-line px-3 py-2 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink">월 (선택)</span>
          <input
            type="number"
            name="month"
            min={1}
            max={12}
            placeholder="1-12"
            className="w-28 rounded-md border-2 border-line px-3 py-2 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold text-ink">제목</span>
        <input
          type="text"
          name="title"
          required
          maxLength={100}
          placeholder="예: 신혼여행, 첫째 태어난 날"
          className="w-full rounded-md border-2 border-line px-3 py-2 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-base font-semibold text-ink">
          내용 (선택)
        </span>
        <textarea
          name="content"
          rows={3}
          maxLength={5000}
          placeholder="기억나는 장면이나 함께 떠올릴 이야기"
          className="w-full rounded-md border-2 border-line px-3 py-2 text-lg focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        />
      </label>

      <button
        type="submit"
        className="self-end rounded-md bg-emerald-700 px-6 py-4 text-lg font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
      >
        공동 추억 추가
      </button>
    </form>
  );
}
