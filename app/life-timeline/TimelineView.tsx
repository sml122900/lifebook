import Link from "next/link";

import type { LifeEvent } from "@/lib/life-events";

// Phase L3 — 인생 연혁 시각화. 서버 컴포넌트(좌표 계산은 순수 함수, 클릭은
// <Link> 만으로 충분 — 클라이언트 핸들러 불필요).
//
// 데스크톱(sm+): 가로 시간축 + zigzag 라벨 (점 위/아래 교대)
// 모바일(sm-): 세로 리스트 — 좁은 화면에서 가로 스와이프는 시니어 부담.
//
// 점 시각 구분 (한눈에 "정확/대략" 인지):
//   - EXACT(앵커) : 큰 채움 원 (amber-600 + 진한 테두리)
//   - APPROXIMATE(사이) : 작은 점선 원 (amber-100 fill + dashed 테두리)
//
// 사이 이벤트의 기본 월: 6월. 사용자가 "그해 중반" 의 시대 사건/음악을
// 만나도록 — 1월/12월보다 평균적인 진입점.

const APPROX_DEFAULT_MONTH = 6;

// 한 이벤트의 시간축 좌표(연 단위 소수). EXACT+month → 정확한 시점,
// 그 외엔 그해 중반(year + 0.5).
function timeKey(e: LifeEvent): number {
  if (e.eventMonth != null) {
    return e.eventYear + (e.eventMonth - 1) / 12;
  }
  return e.eventYear + 0.5;
}

// "1972년 3월" / "1972년" / "1985년쯤"
function formatWhen(e: LifeEvent): string {
  if (e.precision === "EXACT" && e.eventMonth != null) {
    return `${e.eventYear}년 ${e.eventMonth}월`;
  }
  if (e.precision === "EXACT") {
    return `${e.eventYear}년`;
  }
  return `${e.eventYear}년쯤`;
}

function timemachineHref(e: LifeEvent): string {
  const month = e.eventMonth ?? APPROX_DEFAULT_MONTH;
  return `/timemachine/${e.eventYear}/${month}`;
}

type AxisGeometry = {
  minY: number;
  maxY: number;
  span: number; // maxY - minY (0 이면 단일 시점)
};

function computeGeometry(events: LifeEvent[]): AxisGeometry {
  const keys = events.map(timeKey);
  const rawMin = Math.min(...keys);
  const rawMax = Math.max(...keys);

  // 양 끝에 2년 padding — 첫/마지막 점이 가장자리에 붙는 어색함 방지.
  // 단일 시점이거나 매우 좁은 범위면 ±5년으로 넓힘.
  const padding = rawMax - rawMin < 4 ? 5 : 2;
  const minY = Math.floor(rawMin) - padding;
  const maxY = Math.ceil(rawMax) + padding;
  return { minY, maxY, span: maxY - minY };
}

function leftPercent(e: LifeEvent, geo: AxisGeometry): number {
  if (geo.span === 0) return 50;
  return ((timeKey(e) - geo.minY) / geo.span) * 100;
}

export function TimelineView({ events }: { events: LifeEvent[] }) {
  const geo = computeGeometry(events);
  const eventCount = events.length;

  return (
    <div className="flex flex-col gap-6">
      {/* 데스크톱 가로 시간축 */}
      <div className="hidden sm:block">
        <HorizontalAxis events={events} geo={geo} />
      </div>

      {/* 모바일 세로 리스트 */}
      <div className="sm:hidden">
        <VerticalList events={events} />
      </div>

      {eventCount > 0 && eventCount < 5 && (
        <p className="text-base text-zinc-600">
          이벤트를 더 채울수록 인생 연혁이 풍성해져요.
        </p>
      )}

      <Legend />
    </div>
  );
}

// 가로 시간축 (데스크톱).
// height 는 위/아래 라벨 공간을 위해 충분히(h-64).
// 라벨은 짝수 index 위, 홀수 아래 — zigzag 로 가까운 라벨 겹침 50% 완화.
function HorizontalAxis({
  events,
  geo,
}: {
  events: LifeEvent[];
  geo: AxisGeometry;
}) {
  return (
    <div className="relative my-4 h-64 w-full">
      {/* 가로 라인 */}
      <div
        aria-hidden
        className="absolute top-1/2 left-0 right-0 h-1 -translate-y-1/2 rounded-full bg-amber-200"
      />

      {/* 양 끝 연도 캡션 */}
      <span className="absolute top-1/2 left-0 mt-4 text-base text-zinc-500">
        {geo.minY}
      </span>
      <span className="absolute top-1/2 right-0 mt-4 text-right text-base text-zinc-500">
        {geo.maxY}
      </span>

      {events.map((e, i) => {
        const left = leftPercent(e, geo);
        const above = i % 2 === 0;
        const exact = e.precision === "EXACT";

        return (
          <Link
            key={e.id}
            href={timemachineHref(e)}
            aria-label={`${formatWhen(e)} ${e.title} — 그 시기의 타임머신 열기`}
            style={{ left: `${left}%` }}
            className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 focus:outline-none"
          >
            {/* 라벨: 짝수 index = 점 위, 홀수 = 점 아래 (zigzag) */}
            <div
              className={
                "absolute left-1/2 w-44 -translate-x-1/2 text-center " +
                (above ? "bottom-8" : "top-8")
              }
            >
              <p
                className={
                  "text-sm " +
                  (exact ? "font-semibold text-amber-800" : "text-zinc-500")
                }
              >
                {formatWhen(e)}
              </p>
              <p
                className={
                  "mt-0.5 leading-tight " +
                  (exact
                    ? "text-base font-bold text-zinc-900"
                    : "text-base font-medium text-zinc-700")
                }
              >
                {e.title}
              </p>
            </div>

            {/* 점 — 클릭 영역 충분히 크게(p-2 hit-area) */}
            <span
              className={
                "block rounded-full border-2 transition-transform group-hover:scale-110 " +
                (exact
                  ? "h-6 w-6 border-amber-800 bg-amber-600"
                  : "h-4 w-4 border-amber-400 border-dashed bg-amber-100")
              }
              aria-hidden
            />
          </Link>
        );
      })}
    </div>
  );
}

// 세로 리스트 (모바일). 좌측 세로선 + 점 + 우측 라벨.
function VerticalList({ events }: { events: LifeEvent[] }) {
  return (
    <ol className="relative ml-3 border-l-2 border-amber-200 pl-7">
      {events.map((e) => {
        const exact = e.precision === "EXACT";
        return (
          <li key={e.id} className="relative py-3">
            <span
              aria-hidden
              className={
                "absolute top-5 rounded-full border-2 " +
                (exact
                  ? "-left-[34px] h-6 w-6 border-amber-800 bg-amber-600"
                  : "-left-[30px] h-4 w-4 border-amber-400 border-dashed bg-amber-100")
              }
            />
            <Link
              href={timemachineHref(e)}
              className="block rounded-md py-1 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            >
              <p
                className={
                  "text-base " +
                  (exact ? "font-semibold text-amber-800" : "text-zinc-500")
                }
              >
                {formatWhen(e)}
              </p>
              <p className="text-xl font-bold text-zinc-900">{e.title}</p>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

// 점 의미 안내.
function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border-2 border-zinc-200 bg-white px-4 py-3 text-base text-zinc-700">
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-5 w-5 rounded-full border-2 border-amber-800 bg-amber-600"
        />
        정확한 시점
      </span>
      <span className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block h-4 w-4 rounded-full border-2 border-amber-400 border-dashed bg-amber-100"
        />
        대략적인 시점
      </span>
      <span className="text-zinc-500">
        점을 누르면 그 시기로 들어가요
      </span>
    </div>
  );
}
