import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getFamilyNews } from "@/lib/family-news";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";
import { listPeople, listPeopleByEventBatch } from "@/lib/people";
import { listAssistantAnswers } from "@/lib/timemachine-assistant-saved";

import type { InitialSavedAnswer } from "../timemachine/[year]/[month]/AssistantPanel";
import { FamilyNewsCard } from "../timemachine/FamilyNewsCard";
import { AssistantModal } from "./AssistantModal";
import { TimelineView } from "./TimelineView";
import { V3WelcomeBanner } from "./V3WelcomeBanner";

// 비서 fallback — life_event 0 개일 때. 시드 마지막 달 = LATEST. 시드에
// 시대 사건/노래가 풍성해 비서가 빈 답이 안 나옴.
// (LATEST_YEAR/MONTH 하드코드는 layout / side-panel-data 와 동일 정책 —
//  CLAUDE.md L8 후속 항목에서 함께 new Date() 기반으로 통합 예정.)
const LATEST_YEAR = 2026;
const LATEST_MONTH = 5;
// life_event 의 eventMonth 가 null(사이 이벤트)일 때 비서 fallback 의 월.
// "그해 중반" 의미. (2026-06-06 까지는 TimelineView 의 timemachineHref 와도
// 같은 값을 썼으나, 점 클릭 동선이 /life-timeline/[eventId]/edit 로 바뀌며
// 이제는 비서 컨텍스트 fallback 한 용도로만 남았다.)
const APPROX_DEFAULT_MONTH = 6;

// Phase L3+L5 — 인생 연혁 화면 (v3 의 얼굴, 새 메인).
//
// L2 에서 사용자가 채운 life_event UserMemory 들을 시간순으로 세로 시간축
// 에 펼쳐 보인다. 점을 누르면 그 이벤트의 편집 화면으로 들어가 이야기·
// 장소·인물을 한곳에서 보강한다. (2026-06-06 까지는 점 클릭이 월별 타임
// 머신으로 갔지만, "사용자는 사건 순서는 기억해도 정확한 월은 모른다" 는
// 통찰에 따라 메인 동선에서 '월' 개념 제거.)
//
// L5 — /timemachine 메인이 여기로 옮겨졌다. 출석·진척·가족 소식 카드도
// 모두 *연혁 아래* 로 재배치 — 연혁이 주인공, 동기 요소는 보조.

export const metadata = {
  title: "내 인생 연혁",
};

export default async function LifeTimelinePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  // 네 fetch 모두 독립 — 병렬. (출석은 /account/tokens 로 이전했고
  // 사이드 패널 AttendanceMini 가 이미 자기 데이터를 들고 있어 여기선 안 부름.
  // 진척 카드(ProgressCard)는 v3 월 OFF 후 동기부여 가치가 약해져 메인에서
  // 뺌 — 컴포넌트·헬퍼는 보존(부활 시 import 만 다시 추가).)
  // P3 — listPeople 도 함께 prefetch (모달이 매번 fetch 하지 않게).
  const [events, familyNews, birthYear, allPeopleRows] = await Promise.all([
    getLifeEvents(userId),
    getFamilyNews(userId),
    getBirthYear(userId),
    listPeople(userId),
  ]);

  // P2 — 연혁 점/카드 아래 인물 미리보기. N+1 회피: events.id IN(...) 으로
  // 단일 쿼리. 이벤트 0 개면 헬퍼가 즉시 빈 Map 반환. RSC→client 직렬화를
  // 위해 plain object 로 변환.
  const peopleByEventMap = await listPeopleByEventBatch(
    userId,
    events.map((e) => e.id),
  );
  const peopleByEvent: Record<string, { id: string; name: string }[]> = {};
  for (const [memoryId, people] of peopleByEventMap) {
    peopleByEvent[memoryId] = people;
  }
  // 모달용 인물 목록 — id/name 만 추려 직렬화 크기 줄임.
  const allPeople = allPeopleRows.map((p) => ({ id: p.id, name: p.name }));
  const userName = session.user.name ?? session.user.email ?? "회원";
  const hasEvents = events.length > 0;
  const hasFamilyNews =
    familyNews.newReactions.count > 0 || familyNews.newRecords.count > 0;

  // L6 — 비서 맥락 결정. getLifeEvents 는 시간순(오래된 것부터) 이라
  // 가장 최근 이벤트는 배열 끝. 0 개면 LATEST 시드 달로 폴백.
  // E2 — era_event 는 시대 자료 행이라 비서 맥락에서 제외. 사용자가 직접
  // 쓴 인생 이벤트(life_event)만 "가장 최근" 후보. 한 줄 filter.
  const lifeOnlyEvents = events.filter((e) => e.kind === "life_event");
  const lastEvent =
    lifeOnlyEvents.length > 0 ? lifeOnlyEvents[lifeOnlyEvents.length - 1] : null;
  const assistantYear = lastEvent ? lastEvent.eventYear : LATEST_YEAR;
  const assistantMonth = lastEvent
    ? lastEvent.eventMonth ?? APPROX_DEFAULT_MONTH
    : LATEST_MONTH;
  const assistantLabel = lastEvent
    ? lastEvent.eventMonth != null
      ? `${lastEvent.eventYear}년 ${lastEvent.eventMonth}월 ${lastEvent.title}`
      : `${lastEvent.eventYear}년쯤 ${lastEvent.title}`
    : `${LATEST_YEAR}년 ${LATEST_MONTH}월`;

  // 그 (year, month) 에 저장된 비서 답을 prefetch — 월 화면과 같은 패턴.
  // 사용자가 모달을 열자마자 "저장된 답변" 탭에 보이도록.
  const savedAnswersRaw = await listAssistantAnswers(
    userId,
    assistantYear,
    assistantMonth,
  );
  const assistantSaved: InitialSavedAnswer[] = savedAnswersRaw.map((s) => ({
    id: s.id,
    question: s.question,
    createdAtIso: s.createdAt.toISOString(),
    answer: s.answer,
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <V3WelcomeBanner />

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold tracking-tight text-zinc-900 sm:text-5xl">
            내 인생 연혁
          </h1>
          <p className="mt-3 text-xl text-zinc-800 sm:text-2xl">
            <b>{userName}</b>님의 큰 줄기예요.
          </p>
        </div>
        <div className="flex-shrink-0">
          <AssistantModal
            fallbackYear={assistantYear}
            fallbackMonth={assistantMonth}
            fallbackLabel={assistantLabel}
            initialSavedAnswers={assistantSaved}
          />
        </div>
      </header>

      {/* 주인공 — 연혁 (또는 빈 상태 초대) */}
      {hasEvents ? (
        <TimelineView
          events={events}
          birthYear={birthYear}
          peopleByEvent={peopleByEvent}
          allPeople={allPeople}
        />
      ) : (
        <EmptyState />
      )}

      {/* L4 진입점 — "+ 추가" 가 메인 액션, 옆에 "관리" 와 "기록 보강" */}
      {hasEvents && (
        <section
          aria-label="이벤트 추가 / 관리"
          className="flex flex-col gap-3 rounded-md border-2 border-amber-300 bg-amber-50 px-5 py-5"
        >
          <p className="text-lg text-zinc-800">
            연혁을 보다 떠오르는 게 있으시면 한 장면 더 더해주세요.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/life-timeline/add"
              className="inline-flex min-h-[64px] flex-1 items-center justify-center rounded-md bg-amber-600 px-6 py-3 text-xl font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 sm:flex-initial"
            >
              + 인생의 한 장면 추가하기
            </Link>
            <Link
              href="/life-timeline/manage"
              className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            >
              이벤트 관리
            </Link>
            <Link
              href="/people"
              className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            >
              <span aria-hidden className="mr-1">👥</span>인물 기록
            </Link>
            <Link
              href="/life-record"
              className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            >
              인생 기록 보강
            </Link>
          </div>
        </section>
      )}

      {/* 보조 요소들 — 연혁 아래로. v3.5: 출석체크 카드는 /account/tokens
          로 이전. 이후 ProgressCard("내 기록 현황" + 달별 그리드)도 v3 월
          OFF 결정 후 동기부여 가치 약해져 제거 — 메인은 연혁 + 가족 소식만.
          가족 소식 0건이면 이 섹션 자체 노출 0(헤더 포함 깔끔). */}
      {hasFamilyNews && (
        <section
          aria-label="가족 소식"
          className="flex flex-col gap-6 border-t-2 border-zinc-200 pt-8"
        >
          <h2 className="text-2xl font-bold text-zinc-900">오늘의 한 걸음</h2>
          <FamilyNewsCard news={familyNews} />
        </section>
      )}
    </main>
  );
}

// 인생 이벤트 0건 — 압박 없는 초대 톤. 큰 버튼 하나만.
function EmptyState() {
  return (
    <section className="flex flex-col items-center gap-6 rounded-md border-2 border-amber-200 bg-amber-50 px-6 py-12 text-center">
      <p aria-hidden className="text-6xl">
        🌱
      </p>
      <div>
        <h2 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
          아직 인생 기록을 시작하지 않으셨네요
        </h2>
        <p className="mt-3 text-xl text-zinc-700">
          몇 가지 질문에 떠오르는 만큼만 답하시면 인생 연혁이 그려져요.
        </p>
      </div>
      <Link
        href="/life-record"
        prefetch
        className="inline-flex min-h-[72px] items-center justify-center rounded-md bg-violet-700 px-8 py-4 text-2xl font-bold text-white hover:bg-violet-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-violet-500 focus-visible:ring-offset-2"
      >
        인생 기록 시작하기 →
      </Link>
    </section>
  );
}
