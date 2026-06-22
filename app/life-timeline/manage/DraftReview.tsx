// 동반자 추출 초안 검토 섹션 (서버 컴포넌트).
//
// isDraft=true 인 UserMemory(life_event) + Person(person/location/thing) 을 세션별로 묶어 표시.
// 승인/거절은 form action (server action .bind 패턴) — JavaScript 없어도 동작.

import { prisma } from "@/lib/db";

import {
  approveDraftMemoryAction,
  rejectDraftMemoryAction,
  approveDraftPersonAction,
  rejectDraftPersonAction,
  approveAllSessionMemoriesAction,
  approveAllSessionPeopleAction,
  approveAllSessionLocationsAction,
  approveAllSessionThingsAction,
} from "./draft-actions";

function formatWhenDraft(
  eventYear: number | null,
  eventMonth: number | null,
  precision: string | null,
) {
  if (!eventYear) return "";
  if (precision === "EXACT" && eventMonth != null)
    return `${eventYear}년 ${eventMonth}월`;
  if (precision === "EXACT") return `${eventYear}년`;
  return `${eventYear}년쯤`;
}

export async function DraftReview({ userId }: { userId: string }) {
  const [draftMemories, draftSubjects] = await Promise.all([
    prisma.userMemory.findMany({
      where: {
        userId,
        isDraft: true,
        createdVia: "life_event",
        companionSessionId: { not: null },
      },
      include: { companionSession: { select: { createdAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.person.findMany({
      where: {
        userId,
        isDraft: true,
        companionSessionId: { not: null },
      },
      include: { companionSession: { select: { createdAt: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const draftPeople = draftSubjects.filter((p) => p.subjectType === "person");
  const draftLocations = draftSubjects.filter((p) => p.subjectType === "location");
  const draftThings = draftSubjects.filter((p) => p.subjectType === "thing");

  const totalCount =
    draftMemories.length + draftPeople.length + draftLocations.length + draftThings.length;

  if (totalCount === 0) return null;

  // 세션 ID 기준 묶기
  type SessionGroup = {
    sessionId: string;
    createdAt: Date;
    memories: typeof draftMemories;
    people: typeof draftSubjects;
    locations: typeof draftSubjects;
    things: typeof draftSubjects;
  };
  const sessionMap = new Map<string, SessionGroup>();

  function ensureSession(sid: string, createdAt: Date) {
    if (!sessionMap.has(sid)) {
      sessionMap.set(sid, { sessionId: sid, createdAt, memories: [], people: [], locations: [], things: [] });
    }
    return sessionMap.get(sid)!;
  }

  for (const m of draftMemories) {
    ensureSession(m.companionSessionId!, m.companionSession!.createdAt).memories.push(m);
  }
  for (const p of draftPeople) {
    ensureSession(p.companionSessionId!, p.companionSession!.createdAt).people.push(p);
  }
  for (const l of draftLocations) {
    ensureSession(l.companionSessionId!, l.companionSession!.createdAt).locations.push(l);
  }
  for (const t of draftThings) {
    ensureSession(t.companionSessionId!, t.companionSession!.createdAt).things.push(t);
  }

  const sessions = [...sessionMap.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm font-bold text-white">
          {totalCount}
        </span>
        <h2 className="text-2xl font-bold text-ink">동반자 대화 — 검토 대기</h2>
      </div>
      <p className="text-base text-ink-soft">
        동반자와 나눈 이야기에서 찾아낸 내용이에요. 확인하고 추가하거나 건너뛰어 주세요.
      </p>

      {sessions.map((s) => {
        const dateStr = s.createdAt.toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        return (
          <div
            key={s.sessionId}
            className="flex flex-col gap-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-5"
          >
            {/* 세션 헤더 + 일괄 승인 버튼 */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-semibold text-amber-900">
                🎙 {dateStr} 대화
              </p>
              <div className="flex flex-wrap gap-2">
                {s.memories.length > 0 && (
                  <form action={approveAllSessionMemoriesAction.bind(null, s.sessionId)}>
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      이야기 {s.memories.length}개 모두 추가
                    </button>
                  </form>
                )}
                {s.people.length > 0 && (
                  <form action={approveAllSessionPeopleAction.bind(null, s.sessionId)}>
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      인물 {s.people.length}명 모두 추가
                    </button>
                  </form>
                )}
                {s.locations.length > 0 && (
                  <form action={approveAllSessionLocationsAction.bind(null, s.sessionId)}>
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      장소 {s.locations.length}곳 모두 추가
                    </button>
                  </form>
                )}
                {s.things.length > 0 && (
                  <form action={approveAllSessionThingsAction.bind(null, s.sessionId)}>
                    <button
                      type="submit"
                      className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
                    >
                      물건 {s.things.length}개 모두 추가
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* 이야기 목록 */}
            {s.memories.length > 0 && (
              <SubjectSection label="발견된 이야기">
                {s.memories.map((m) => {
                  const whenText = formatWhenDraft(m.eventYear, m.eventMonth, m.precision);
                  return (
                    <DraftRow
                      key={m.id}
                      approveAction={approveDraftMemoryAction.bind(null, m.id)}
                      rejectAction={rejectDraftMemoryAction.bind(null, m.id)}
                    >
                      {whenText && <p className="text-sm text-ink-soft">{whenText}</p>}
                      <p className="break-words font-semibold text-ink">{m.title}</p>
                      {m.content && (
                        <p className="mt-0.5 line-clamp-3 break-words text-sm text-ink-soft">
                          {m.content}
                        </p>
                      )}
                    </DraftRow>
                  );
                })}
              </SubjectSection>
            )}

            {/* 인물 목록 */}
            {s.people.length > 0 && (
              <SubjectSection label="발견된 인물">
                {s.people.map((p) => (
                  <DraftRow
                    key={p.id}
                    approveAction={approveDraftPersonAction.bind(null, p.id)}
                    rejectAction={rejectDraftPersonAction.bind(null, p.id)}
                  >
                    <p className="font-semibold text-ink">
                      {p.name}
                      {p.relation && (
                        <span className="ml-1 text-sm font-normal text-ink-soft">
                          ({p.relation})
                        </span>
                      )}
                    </p>
                    {p.memo && (
                      <p className="mt-0.5 text-sm text-ink-soft">{p.memo}</p>
                    )}
                  </DraftRow>
                ))}
              </SubjectSection>
            )}

            {/* 장소 목록 */}
            {s.locations.length > 0 && (
              <SubjectSection label="발견된 장소">
                {s.locations.map((l) => (
                  <DraftRow
                    key={l.id}
                    approveAction={approveDraftPersonAction.bind(null, l.id)}
                    rejectAction={rejectDraftPersonAction.bind(null, l.id)}
                  >
                    <p className="font-semibold text-ink">📍 {l.name}</p>
                    {l.memo && (
                      <p className="mt-0.5 text-sm text-ink-soft">{l.memo}</p>
                    )}
                  </DraftRow>
                ))}
              </SubjectSection>
            )}

            {/* 물건 목록 */}
            {s.things.length > 0 && (
              <SubjectSection label="발견된 물건">
                {s.things.map((t) => (
                  <DraftRow
                    key={t.id}
                    approveAction={approveDraftPersonAction.bind(null, t.id)}
                    rejectAction={rejectDraftPersonAction.bind(null, t.id)}
                  >
                    <p className="font-semibold text-ink">🎁 {t.name}</p>
                    {t.memo && (
                      <p className="mt-0.5 text-sm text-ink-soft">{t.memo}</p>
                    )}
                  </DraftRow>
                ))}
              </SubjectSection>
            )}
          </div>
        );
      })}

      <hr className="border-line" />
    </section>
  );
}

function SubjectSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-amber-700">{label}</p>
      {children}
    </div>
  );
}

function DraftRow({
  approveAction,
  rejectAction,
  children,
}: {
  approveAction: () => Promise<void>;
  rejectAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-amber-200 bg-white px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">{children}</div>
      <div className="flex flex-shrink-0 gap-2">
        <form action={approveAction}>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border-2 border-emerald-500 bg-emerald-50 px-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            ✓ 추가
          </button>
        </form>
        <form action={rejectAction}>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink-soft hover:bg-banner"
          >
            건너뛰기
          </button>
        </form>
      </div>
    </div>
  );
}
