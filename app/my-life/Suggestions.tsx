// Q69(2026-11-02, docs/phase/my-life-restructure.md §15) — /story-review 에서 옮긴 카드(오늘의 인터뷰 · 더 들어볼까요?).
// 목록 보기(맨 위·시간 줄기 아래)와 지도 보기 [이야기 거리] 시트가 같이 쓴다. "정리할 것"(인물 확인 대기) 카드는
// 2026-11-03 인물 확인 화면과 함께 삭제(§15.6).
// 데이터는 app/my-life/page.tsx 가 서버에서 만든다(갭 딥링크·진행 중 판정 포함) — 이 파일은 그리기만.

import { ButtonLink } from "@/components/ui/Button";
import { INTERVIEW_COPY } from "@/lib/interview/copy";
import type { InterviewCardState } from "@/lib/interview/session";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";

export type SuggestGap = { key: string; label: string; href: string; inProgress: boolean };
export type MyLifeSuggest = { interview: InterviewCardState; gaps: SuggestGap[] };

type Heading = "h2" | "h3";
const CARD = "flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-5";
const CARD_TITLE = "m-0 text-2xl font-bold text-ink";

// 오늘의 인터뷰 진입 — 항상 표시(V3 화면, 오늘 기록만 1회 조회).
export function InterviewEntryCard({ state, as: H = "h2" }: { state: InterviewCardState; as?: Heading }) {
  const I = INTERVIEW_COPY;
  const [desc, button] =
    state.kind === "before"
      ? [I.cardBefore, I.cardButtonStart]
      : state.kind === "progress"
        ? [I.cardInProgress(state.done, state.total), I.cardButtonContinue]
        : [I.cardDone, I.cardButtonDone];
  return (
    <section className={CARD}>
      <H className={CARD_TITLE}>{I.cardTitle}</H>
      <p className="m-0 text-lg text-ink">{desc}</p>
      <ButtonLink href="/interview" variant="secondary" size="lg">
        {button}
      </ButtonLink>
    </section>
  );
}

// 갭 카드 "더 들어볼까요?" — 최대 3개(pickTopGaps), 지금 자유 대화 주제와 같으면 "진행 중" + [이어서 이야기하기].
export function GapCards({ gaps, as: H = "h2" }: { gaps: SuggestGap[]; as?: Heading }) {
  if (gaps.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <H className={H === "h2" ? "m-0" : "m-0 text-xl font-bold text-ink"}>{C.gapsTitle}</H>
      <div className="flex flex-col gap-3">
        {gaps.map((g) => (
          <div key={g.key} className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <p className="m-0 text-lg text-ink">{g.label}</p>
              {g.inProgress && <span className="shrink-0 rounded-full bg-banner px-3 py-1 text-lg text-action">{C.gapInProgress}</span>}
            </div>
            <ButtonLink href={g.href} variant="secondary" size="lg" className="shrink-0">
              {g.inProgress ? C.gapContinue : C.gapStart}
            </ButtonLink>
          </div>
        ))}
      </div>
    </section>
  );
}
