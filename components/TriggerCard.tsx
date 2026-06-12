import Link from "next/link";

import { confirmTrigger, dismissTrigger } from "@/app/timeline/actions";

import { ListenButton } from "./ListenButton";

// 질문형 음악 트리거 카드. 타임라인에서 앵커 사건 옆에 놓인다. 보라색 +
// 질문 헤더로 시각적으로 구분돼, 검증된 앵커가 아니라 "확정/무시할 수 있는
// 제안"임을 한눈에 알 수 있다.
//
// 세 가지 시각 상태:
//   - 미응답:  보라색, "이 노래, 기억나세요?" + 버튼 2개
//   - 확정됨:  초록색, "✓ 기억나는 곡" (Phase 7 추억 작성용으로 유지)
//   - 무시됨:  렌더 안 함 — lib/triggers.ts 에서 걸러짐

type Props = {
  id: string;
  title: string;
  artist: string;
  year: number;
  ageAtYear: number | null;
  status: "confirmed" | null;
};

export function TriggerCard({
  id,
  title,
  artist,
  year,
  ageAtYear,
  status,
}: Props) {
  if (status === "confirmed") {
    return (
      <article className="rounded-md border-2 border-emerald-400 bg-emerald-50 p-5">
        <p className="text-base font-bold uppercase tracking-wide text-emerald-800">
          ✓ 기억나는 곡
        </p>
        <h4 className="mt-3 text-2xl font-bold text-ink">{title}</h4>
        <p className="mt-1 text-lg text-ink">{artist}</p>
        <p className="mt-3 text-base text-ink-soft">
          {year}
          {ageAtYear !== null && ageAtYear >= 0 && (
            <span className="ml-2 text-ink-soft">· 그때 {ageAtYear}살</span>
          )}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <ListenButton title={title} artist={artist} />
          <Link
            href={`/memory/${id}`}
            className="rounded-md bg-emerald-700 px-5 py-3 text-base font-semibold text-white hover:bg-emerald-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
          >
            이 노래로 추억 남기기 →
          </Link>
        </div>
      </article>
    );
  }

  return (
    <article className="rounded-md border-2 border-brand bg-banner p-5">
      <p className="text-base font-bold uppercase tracking-wide text-action">
        이 노래, 기억나세요?
      </p>
      <h4 className="mt-3 text-2xl font-bold text-ink">{title}</h4>
      <p className="mt-1 text-lg text-ink">{artist}</p>
      <p className="mt-3 text-base text-ink-soft">
        {year}
        {ageAtYear !== null && ageAtYear >= 0 && (
          <span className="ml-2 text-ink-soft">· 그때 {ageAtYear}살</span>
        )}
      </p>

      {/* 먼저 들어보고 결정하게 — 결정 버튼들 사이에 묻히지 않도록 별도 줄. */}
      <div className="mt-4">
        <ListenButton title={title} artist={artist} />
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <form action={confirmTrigger}>
          <input type="hidden" name="eventId" value={id} />
          <button
            type="submit"
            className="rounded-md bg-action px-5 py-3 text-base font-semibold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            기억나요
          </button>
        </form>
        <form action={dismissTrigger}>
          <input type="hidden" name="eventId" value={id} />
          <button
            type="submit"
            className="rounded-md border-2 border-line bg-surface px-5 py-3 text-base font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-400 focus-visible:ring-offset-2"
          >
            잘 모르겠어요
          </button>
        </form>
      </div>
    </article>
  );
}
