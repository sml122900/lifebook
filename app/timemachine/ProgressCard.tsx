import type { TimemachineProgress } from "@/lib/timemachine-progress";

// 동기부여 ① 쌓이는 재미 — "내 기록 현황" 카드.
// 서버 컴포넌트 (표시 전용, 상호작용 없음). 데이터는 page.tsx 가
// getTimemachineProgress 로 받아 props 로 내림.
//
// 원칙 (압박 금지):
//   - 빈 칸을 죄책감 들게 강조하지 않는다. 채운 것을 기쁘게 보여준다.
//   - "아직 N개월 비었어요" 같은 표현 절대 X.
//   - 시니어 친화: 큰 글씨, 색으로 직관. 12개월 = 채움(amber) / 빔(연한 회색).

// 가벼운 이정표 — 한두 단계만, 따뜻한 격려.
function milestoneMessage(filled: number): string | null {
  if (filled >= 10) return "10개월이 넘는 이야기가 모였어요. 정말 귀한 기록이에요.";
  if (filled >= 5) return "벌써 5개월의 이야기를 채우셨어요!";
  if (filled >= 1) return "첫 이야기를 남기셨어요. 좋은 시작이에요.";
  return null;
}

export function ProgressCard({
  progress,
}: {
  progress: TimemachineProgress;
}) {
  const { filledMonths, totalEvents, totalChars, cells } = progress;
  const milestone = milestoneMessage(filledMonths);

  return (
    <section
      className="flex flex-col gap-5 rounded-md border-2 border-amber-300 bg-surface p-6"
      aria-labelledby="progress-heading"
    >
      <h2
        id="progress-heading"
        className="text-2xl font-bold text-ink sm:text-3xl"
      >
        내 기록 현황
      </h2>

      {/* 채운 달 수 — 히어로. 0개월일 땐 압박 없이 초대 문구. */}
      {filledMonths > 0 ? (
        <p className="text-xl text-ink sm:text-2xl">
          지금까지{" "}
          <b className="text-3xl font-bold text-amber-800 sm:text-4xl">
            {filledMonths}개월
          </b>
          의 이야기를 남기셨어요.
        </p>
      ) : (
        <p className="text-xl text-ink sm:text-2xl">
          여기에 당신의 이야기가 하나씩 쌓일 거예요. 한 달부터 시작해 보세요.
        </p>
      )}

      {/* 기록의 양 — 사건 수 / 쓴 글자 수. 있을 때만. */}
      {(totalEvents > 0 || totalChars > 0) && (
        <div className="flex flex-wrap gap-3">
          {totalEvents > 0 && (
            <span className="inline-flex items-baseline gap-1 rounded-md border-2 border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-base text-ink-soft">기록한 사건</span>
              <b className="text-xl font-bold text-amber-900">
                {totalEvents.toLocaleString()}개
              </b>
            </span>
          )}
          {totalChars > 0 && (
            <span className="inline-flex items-baseline gap-1 rounded-md border-2 border-amber-200 bg-amber-50 px-4 py-2">
              <span className="text-base text-ink-soft">직접 쓴 글</span>
              <b className="text-xl font-bold text-amber-900">
                {totalChars.toLocaleString()}자
              </b>
            </span>
          )}
        </div>
      )}

      {/* 가벼운 이정표 */}
      {milestone && (
        <p
          className="rounded-md border-2 border-emerald-300 bg-emerald-50 px-4 py-3 text-lg font-semibold text-emerald-900"
          role="status"
        >
          {milestone}
        </p>
      )}

      {/* 진척 시각화 — 12개월 그리드. 채운 달 amber, 빈 달 연한 회색.
          2026-06-06: 칸 클릭으로 월 화면 진입은 닫음(메인 동선에서 '월'
          개념 제거). 시각만 유지 — 채운 패턴은 동기부여 가치 그대로. */}
      <div>
        <p className="mb-3 text-base font-semibold text-ink-soft">
          달별 기록
        </p>
        <ol
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          aria-label="최근 12개월 기록 현황"
        >
          {cells.map((c) => (
            <li
              key={`${c.year}-${c.month}`}
              aria-label={
                c.filled
                  ? `${c.year}년 ${c.month}월 — 기록 있음`
                  : `${c.year}년 ${c.month}월 — 기록 없음`
              }
              className={
                "flex min-h-[72px] flex-col items-center justify-center rounded-md border-2 px-2 py-3 text-center " +
                (c.filled
                  ? "border-amber-700 bg-amber-700 text-white"
                  : "border-line bg-surface text-ink-faint")
              }
            >
              <span className="text-xs opacity-90">{c.year}</span>
              <span className="text-xl font-bold">{c.month}월</span>
              {c.filled && (
                <span className="mt-0.5 text-xs font-semibold">
                  {c.eventCount > 0 ? `사건 ${c.eventCount}개` : "회고"}
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
