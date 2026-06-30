import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EventCard } from "@/components/EventCard";
import { ListenButton } from "@/components/ListenButton";
import { TriggerCard } from "@/components/TriggerCard";
import { prisma } from "@/lib/db";
import {
  getMusicTriggersForUser,
  type TriggerCandidate,
} from "@/lib/triggers";

type EventRow = Awaited<ReturnType<typeof prisma.event.findMany>>[number];
type MemoryRow = Awaited<ReturnType<typeof prisma.userMemory.findMany>>[number];

function indexByYear<T extends { year: number }>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const list = map.get(r.year) ?? [];
    list.push(r);
    map.set(r.year, list);
  }
  return map;
}

// Lifebook v3 — /timeline 비활성화 (레거시 Phase 5 출생연도 타임라인).
//
// 메인 동선에서 UI 진입로 0인 폐루프(/timeline ↔ /onboarding)였다. 신규
// 가입은 /enter → /onboarding-chat, 회고 동선은 /life-timeline 으로 통일.
// 이 라우트는 메인으로 redirect — 직접 URL·옛 북마크·다른 코드의
// redirect("/timeline")·revalidatePath("/timeline") 를 안전하게 흡수한다.
//
// 코드 보존: 아래 _TimelinePageArchived 함수와 의존(EventCard·ListenButton·
// TriggerCard·getMusicTriggersForUser=RAG 체인) 그대로 유지. 부활 시
// default export 만 archived 함수로 교체. (EventCard·ListenButton 은 가족
// 룸에서도 쓰여 어차피 살아있음.)
export default function TimelinePage() {
  redirect("/life-timeline");
}

// ─────────────────────────────────────────────────────────────────────────
// 이하 보존 — v2 이전 출생연도 타임라인 원본. 사용 0(default export 가 위
// redirect 로 교체됨). import 들이 unused 가 안 되도록 본문은 그대로 둔다.
// 향후 부활 시 export default 를 이 함수로 다시 가리키면 됨.
// ─────────────────────────────────────────────────────────────────────────
async function _TimelinePageArchived() {
  // 부드러운 온보딩 게이트: 신규 사용자는 먼저 /onboarding 으로, 끝내거나
  // 건너뛰면 그 뒤부턴 바로 여기로 온다.
  const session = await auth();
  let birthYear: number | null = null;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { onboardingCompletedAt: true, birthYear: true },
    });
    if (!user?.onboardingCompletedAt) {
      redirect("/onboarding");
    }
    birthYear = user.birthYear;
  }

  // 타임라인을 사용자가 살아온 시대에 맞춘다. birthYear 가 아직 없으면
  // (온보딩 건너뜀) 모든 앵커로 폴백 — Phase 5.5 가 입력을 권한다.
  const events = await prisma.event.findMany({
    where: {
      category: "anchor",
      ...(birthYear ? { year: { gte: birthYear } } : {}),
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  const anchorsByYear = indexByYear(events);

  // ⚠️ UserMemory 는 반드시 현재 사용자 범위로 — 솔로 콘텐츠는 Phase 3
  // 설계상 비공개. 추억이 아직 없으면 빈 배열(Phase 7 이 작성 흐름 추가).
  const memories = session?.user?.id
    ? await prisma.userMemory.findMany({
        where: { userId: session.user.id },
        // event.domain 으로 추억 카드에 "들어보기" 버튼 노출 여부를 정한다.
        // title + description 이 유튜브 검색에 넣을 곡 정보를 담는다.
        include: {
          event: { select: { title: true, description: true, domain: true } },
        },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      })
    : [];
  const memoriesByYear = indexByYear(memories);

  // 음악 트리거 — 사용자의 시대를 알 때만. 프로필 필드는 빈 배열 기본값
  // 이라 온보딩을 건너뛴 사용자도 세대 기반 추천은 받는다. Voyage/pgvector
  // 가 에러나면(네트워크·키·레이트리밋) 헬퍼가 failed=true + 빈 목록을
  // 반환 → 페이지는 작은 배너만 띄우고 나머지 타임라인은 계속 렌더.
  let triggers: TriggerCandidate[] = [];
  let triggersFailed = false;
  if (birthYear && session?.user?.id) {
    const profile = await prisma.lifeProfile.findUnique({
      where: { userId: session.user.id },
      select: { interests: true, favMusic: true },
    });
    const result = await getMusicTriggersForUser(
      {
        birthYear,
        interests: profile?.interests ?? [],
        favMusic: profile?.favMusic ?? [],
      },
      session.user.id,
      15,
    );
    triggers = result.triggers;
    triggersFailed = result.failed;
  }
  const triggersByYear = indexByYear(triggers);

  // 앵커 또는 제안 트리거가 하나라도 있는 해는 전부 렌더.
  const yearSet = new Set<number>();
  for (const y of anchorsByYear.keys()) yearSet.add(y);
  for (const y of triggersByYear.keys()) yearSet.add(y);
  // 최근(올해)부터 태어난 해까지 역순. 사용자가 첫 화면에서 최근 시점을
  // 먼저 보고 위로 거슬러 올라가는 게 회상에 더 자연스럽다.
  const sortedYears = Array.from(yearSet).sort((a, b) => b - a);

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
      <header className="mb-10">
        <h1 className="text-4xl font-bold text-ink sm:text-5xl">
          타임라인
        </h1>
        <p className="mt-3 text-ink">
          {birthYear ? `${birthYear}년생 기준 · ` : ""}
          세상 사건 {events.length}개
          {triggers.length > 0 && ` · 음악 추천 ${triggers.length}곡`}
        </p>
        {!birthYear && session?.user && (
          <div className="mt-5 rounded-md border-2 border-line bg-canvas p-5">
            <p className="text-ink">
              출생연도를 알려주시면 당신이 살아온 시대 위주로 보여드릴게요.
            </p>
            <Link
              href="/onboarding"
              className="mt-3 inline-block rounded-md border-2 border-line px-5 py-3 text-base font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              출생연도 입력하기
            </Link>
          </div>
        )}
        {triggersFailed && (
          <div className="mt-5 rounded-md border-2 border-amber-200 bg-amber-50 p-4">
            <p className="text-base text-ink">
              음악 추천을 지금은 가져올 수 없어요. 잠시 후 새로고침 해주세요.
              나머지 기능은 평소처럼 사용하실 수 있어요.
            </p>
          </div>
        )}
      </header>

      {/* 트랙 라벨 — 데스크톱에서만 */}
      <div className="sticky top-0 z-10 mb-6 hidden grid-cols-2 gap-8 border-b-2 border-line bg-surface py-3 md:grid">
        <div className="text-base font-bold uppercase tracking-wide text-action">
          세상 사건
        </div>
        <div className="text-base font-bold uppercase tracking-wide text-amber-800">
          내 사건
        </div>
      </div>

      <ol className="space-y-14">
        {sortedYears.map((year) => {
          const anchors = anchorsByYear.get(year) ?? [];
          const yearTriggers = triggersByYear.get(year) ?? [];
          const ageAtYear = birthYear !== null ? year - birthYear : null;
          return (
          <li key={year}>
            <h2 className="mb-5 flex items-baseline gap-3 text-4xl font-bold text-ink sm:text-5xl">
              <span>{year}</span>
              {ageAtYear !== null && ageAtYear >= 0 && (
                <span className="text-xl font-medium text-ink-soft sm:text-2xl">
                  그때 {ageAtYear}살
                </span>
              )}
            </h2>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              {/* 세상 사건 트랙 — 검증 앵커 + 음악 추천(질문형)을 함께 */}
              <section
                aria-label={`${year}년 세상 사건`}
                className="border-l-4 border-brand pl-4 md:border-l-0 md:border-r-4 md:pl-0 md:pr-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-action md:hidden">
                  세상 사건
                </h3>
                <ul className="space-y-4">
                  {anchors.map((e) => (
                    <li key={e.id}>
                      <EventCard
                        id={e.id}
                        year={e.year}
                        month={e.month}
                        title={e.title}
                        description={e.description}
                        domain={e.domain}
                      />
                    </li>
                  ))}
                  {yearTriggers.map((t) => (
                    <li key={t.id}>
                      <TriggerCard
                        id={t.id}
                        title={t.title}
                        artist={t.artist}
                        year={t.year}
                        ageAtYear={ageAtYear}
                        status={t.status}
                      />
                    </li>
                  ))}
                </ul>
              </section>

              {/* 내 사건 트랙 (Phase 7에서 추억 입력 흐름이 들어옴) */}
              <section
                aria-label={`${year}년 내 사건`}
                className="border-l-4 border-amber-500 pl-4 md:pl-6"
              >
                <h3 className="mb-3 text-base font-bold uppercase tracking-wide text-amber-800 md:hidden">
                  내 사건
                </h3>
                {(memoriesByYear.get(year) ?? []).length > 0 ? (
                  <ul className="space-y-4">
                    {memoriesByYear.get(year)!.map((m) => {
                      const isMusic = m.event?.domain === "music";
                      const songTitle = m.event?.title ?? "";
                      const songArtist =
                        m.event?.description?.split(" · ")[0]?.trim() ?? "";
                      return (
                        <li
                          key={m.id}
                          className="rounded-md border-2 border-amber-300 bg-amber-50 p-5"
                        >
                          <div className="text-lg font-semibold text-ink">
                            {m.title}
                          </div>
                          {m.content && (
                            <p className="mt-2 text-ink">{m.content}</p>
                          )}
                          {isMusic && songTitle && (
                            <div className="mt-3">
                              <ListenButton
                                title={songTitle}
                                artist={songArtist}
                              />
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="rounded-md border-2 border-dashed border-amber-300 bg-amber-50 p-5">
                    <p className="text-ink">
                      이 시절, 당신은 어떤 일이 있었나요?
                    </p>
                    <p className="mt-1 text-ink-soft">
                      곧 추억을 더할 수 있어요.
                    </p>
                  </div>
                )}
              </section>
            </div>
          </li>
          );
        })}
      </ol>
    </main>
  );
}

// 보존된 함수에 대한 unused-vars 경고 억제. archived 함수 자체가 default
// export 에서 빠지면서 unused 가 됨(그 안에서 쓰는 import·헬퍼는 참조 유지).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const __preserve_archived_exports = {
  _TimelinePageArchived,
  indexByYear,
};
