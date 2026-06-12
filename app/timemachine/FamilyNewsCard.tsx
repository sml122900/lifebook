import Link from "next/link";

import type { FamilyNews } from "@/lib/family-news";
import { objectJosa } from "@/lib/josa";

import { FamilyNewsSeen } from "./FamilyNewsSeen";

// 동기부여 ② — "가족 소식" 카드 (/timemachine 메인).
// 서버 컴포넌트. total>0 일 때만 부모가 렌더 (0건이면 서운한 표현 없이
// 아예 안 보임 — 기획 원칙).
//
// 두 섹션:
//   - 가족이 내 이야기에 반응했어요 (스탬프/댓글) → 그 기록으로 이동
//   - 가족이 새 이야기를 남겼어요 → 그 가족 룸으로 이동
// mount 시 FamilyNewsSeen 이 "읽음" 갱신 → 다음 접속 때 배지에서 빠짐.

function monthLabel(year: number, month: number | null): string {
  return month === null ? `${year}년` : `${year}년 ${month}월`;
}

// 받침 유무로 조사 선택은 lib/josa.ts 의 헬퍼 사용 (다른 화면에서도 공유).

export function FamilyNewsCard({ news }: { news: FamilyNews }) {
  const { newReactions, newRecords } = news;

  return (
    <section
      className="flex flex-col gap-5 rounded-md border-2 border-amber-400 bg-amber-50 p-6"
      aria-labelledby="family-news-heading"
    >
      <FamilyNewsSeen
        markReactions={newReactions.count > 0}
        markRecords={newRecords.count > 0}
      />
      <h2
        id="family-news-heading"
        className="text-2xl font-bold text-ink sm:text-3xl"
      >
        가족 소식
      </h2>

      {newReactions.count > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-bold text-amber-900">
            가족이 내 이야기에 반응했어요
            <span className="ml-2 text-base font-bold text-white">
              <span className="rounded-full bg-amber-700 px-3 py-1">
                {newReactions.count}
              </span>
            </span>
          </h3>
          <ul className="flex flex-col gap-2">
            {newReactions.items.map((it, i) => (
              <li key={`${it.memoryId}-${i}`}>
                <Link
                  href={`/rooms/${it.roomId}#m-${it.memoryId}`}
                  className="flex flex-col gap-1 rounded-md border-2 border-amber-200 bg-surface px-4 py-3 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <span className="text-lg text-ink">
                    <b>{it.reactorName}</b>님이{" "}
                    <b>{monthLabel(it.year, it.month)}</b> 이야기에{" "}
                    {it.kind === "stamp" ? (
                      <>‘{it.detail}’{objectJosa(it.detail)} 남겼어요</>
                    ) : (
                      <>댓글을 남겼어요</>
                    )}
                  </span>
                  {it.kind === "comment" && (
                    <span className="text-base text-ink-soft">
                      “{it.detail}”
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {newRecords.count > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xl font-bold text-amber-900">
            가족이 새 이야기를 남겼어요
            <span className="ml-2 text-base font-bold text-white">
              <span className="rounded-full bg-amber-700 px-3 py-1">
                {newRecords.count}
              </span>
            </span>
          </h3>
          <ul className="flex flex-col gap-2">
            {newRecords.items.map((it, i) => (
              <li key={`${it.roomId}-${i}`}>
                <Link
                  href={`/rooms/${it.roomId}`}
                  className="flex items-center gap-2 rounded-md border-2 border-amber-200 bg-surface px-4 py-3 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
                >
                  <span className="text-lg text-ink">
                    <b>{it.authorName}</b>님이{" "}
                    <b>{monthLabel(it.year, it.month)}</b> 이야기를 남겼어요.
                    함께 보고 가볍게 반응해 보세요.
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
