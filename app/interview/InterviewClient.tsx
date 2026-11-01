"use client";

// 오늘의 인터뷰(1차) — 시작 → 문항(한 화면 한 질문) → 종료 요약. 중단("오늘은 그만")·
// 이탈 후 다시 들어오면 서버가 다음 PLANNED 문항부터 준다(lib/interview/session.ts).
//
// 이야기형 문항은 /chat-v3 에피소드 엔진과 같은 규칙: 클라가 transcript 를 들고 있다가
// 마무리 때 한 번에 저장, 후속 질문 최대 2개(capped 응답이 질문이면 그 답 1번 더 받음),
// 완곡 종료("그걸로 됐어요")는 저장 후 다음 문항, 명시 종료("그만할래요")는 저장 후 중단.
// 이야기 도중 브라우저를 닫으면 그 문항의 이전 턴은 사라지고 질문부터 다시 한다(P7-7 과 같은 정책).
// My Life 개편 2단계(Q67) — 이야기 마무리는 바로 저장하지 않고 제안 카드(사람·장소 확인, 시기는 문항이 정함)를
// 띄운다. 카드는 문항에 저장돼 새로고침해도 카드부터 다시 보인다.

import { useState } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { ProposalCard, type CreateOutcome } from "@/app/components/ProposalCard";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import type { ProposalView } from "@/lib/free-chat";
import type { CardEdit } from "@/lib/node-proposal";
import type { EpisodeTurn } from "@/lib/episode-chat";
import {
  isAskingQuestion,
  isEpisodeDoneIntent,
  isExitIntent,
  stripEpisodeDoneSignal,
} from "@/lib/episode-text";
import { INTERVIEW_COPY as C } from "@/lib/interview/copy";
import type { InterviewItemView, InterviewState } from "@/lib/interview/session";
import { CONFIRM_COPY } from "@/lib/node-confirm-copy";

import {
  answerInterviewYearAction,
  decideInterviewProposalAction,
  finishInterviewStoryAction,
  interviewStoryTurnAction,
  skipInterviewItemAction,
  startInterviewAction,
} from "./actions";

export function InterviewClient({ initial }: { initial: InterviewState }) {
  const [state, setState] = useState<InterviewState>(initial);
  const [paused, setPaused] = useState(false);
  const [notice, setNotice] = useState<string | null>(
    initial.kind === "item" && initial.resumed ? C.resumeNotice : null,
  );
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState(false);

  // 문항이 끝날 때마다 다음 상태로. 중단 요청이었으면(마지막 문항이 아니라면) 중단 화면.
  function goNext(next: InterviewState, nextNotice: string | null, pause = false) {
    setState(next);
    setNotice(nextNotice);
    setPaused(pause && next.kind === "item");
  }

  async function start() {
    setStarting(true);
    setStartError(false);
    try {
      goNext(await startInterviewAction(), null);
    } catch (e) {
      console.error("[interview]", e);
      setStartError(true);
    } finally {
      setStarting(false);
    }
  }

  if (state.kind === "start") {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">{C.startTitle}</h1>
        <p className="text-lg text-ink-soft">{C.startDesc(state.plannedCount)}</p>
        {startError && <p className="text-lg text-danger">{C.errorGeneric}</p>}
        <Button variant="primary" size="lg" onClick={start} disabled={starting}>
          {starting ? C.thinking : C.startButton}
        </Button>
      </section>
    );
  }

  if (state.kind === "empty") {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">{C.emptyTitle}</h1>
        <p className="text-lg text-ink-soft">{C.emptyDesc}</p>
        <ButtonLink href="/chat-v3" variant="primary" size="lg">
          {C.summaryChat}
        </ButtonLink>
        <ButtonLink href="/story-review" variant="secondary" size="lg">
          {C.summaryReview}
        </ButtonLink>
      </section>
    );
  }

  if (state.kind === "summary") {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">{C.summaryTitle}</h1>
        <p className="text-lg text-ink">{C.summaryCounts(state.answered, state.skipped)}</p>
        {/* 노드 그래프 2b-2 — 이야기에 나온 인물 확인 대기가 있으면 확인 화면으로. */}
        {state.pendingPeople > 0 && (
          <div className="flex flex-col gap-4 rounded-md border-2 border-brand bg-banner p-5">
            <p className="text-lg text-ink">{CONFIRM_COPY.interviewCardDesc(state.pendingPeople)}</p>
            <ButtonLink href="/story-review/confirm" variant="secondary" size="lg">
              {CONFIRM_COPY.interviewCardButton}
            </ButtonLink>
          </div>
        )}
        {state.saved.length > 0 && (
          <div className="flex flex-col gap-3">
            <h2 className="text-2xl font-bold text-ink">{C.summarySavedHeading}</h2>
            <ul className="flex flex-col gap-2">
              {state.saved.map((title, i) => (
                <li key={i} className="rounded-md border-2 border-line bg-surface px-5 py-4 text-lg text-ink">
                  {title}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-lg text-ink-soft">{C.summaryNextDay}</p>
        <ButtonLink href="/story-review" variant="primary" size="lg">
          {C.summaryReview}
        </ButtonLink>
        <ButtonLink href="/chat-v3" variant="secondary" size="lg">
          {C.summaryChat}
        </ButtonLink>
      </section>
    );
  }

  if (paused) {
    return (
      <section className="flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">{C.pausedTitle}</h1>
        <p className="text-lg text-ink-soft">{C.pausedDesc}</p>
        <Button
          variant="primary"
          size="lg"
          onClick={() => {
            setPaused(false);
            setNotice(null);
          }}
        >
          {C.pausedResume}
        </Button>
        <ButtonLink href="/story-review" variant="secondary" size="lg">
          {C.summaryReview}
        </ButtonLink>
      </section>
    );
  }

  // key — 문항이 바뀌면(또는 중단 후 이어서 하면) 이야기 상태를 처음부터.
  return (
    <ItemCard
      key={state.item.id}
      item={state.item}
      notice={notice}
      onNext={goNext}
      onPause={() => setPaused(true)}
    />
  );
}

type Busy = null | "thinking" | "saving";

function ItemCard({
  item,
  notice,
  onNext,
  onPause,
}: {
  item: InterviewItemView;
  notice: string | null;
  onNext: (next: InterviewState, notice: string | null, pause?: boolean) => void;
  onPause: () => void;
}) {
  const [prompt, setPrompt] = useState(item.question);
  const [transcript, setTranscript] = useState<EpisodeTurn[]>([{ role: "assistant", text: item.question }]);
  const [followUps, setFollowUps] = useState(0);
  const [awaitingFinal, setAwaitingFinal] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<string | null>(notice);
  const [failed, setFailed] = useState<null | (() => Promise<void>)>(null);
  // 마무리 뒤 결정 전 제안 카드 · 카드를 정한 뒤 중단 화면으로 갈지("오늘은 그만"으로 마무리한 경우).
  const [proposal, setProposal] = useState<ProposalView | null>(item.proposal);
  const [pauseAfterCard, setPauseAfterCard] = useState(false);

  const hasAnswered = transcript.some((t) => t.role === "user");

  // 서버 호출 공통 — 실패하면 같은 동작을 다시 시도할 수 있게 남긴다.
  async function run(kind: Exclude<Busy, null>, action: () => Promise<void>, failMessage: string = C.errorGeneric) {
    setBusy(kind);
    setFailed(null);
    try {
      await action();
    } catch (e) {
      console.error("[interview]", e);
      setMessage(failMessage);
      setFailed(() => () => run(kind, action, failMessage));
    } finally {
      setBusy(null);
    }
  }

  // 저장이 끝날 때까지 await 해야 바깥 run 의 busy 가 저장 도중에 풀리지 않는다.
  async function finishStory(turns: EpisodeTurn[], pause = false): Promise<void> {
    if (!turns.some((t) => t.role === "user")) {
      // 답 없이 끝냄 — 중단이면 그냥 멈추고, 완곡 종료면 건너뛰기와 같다.
      if (pause) onPause();
      else await skip();
      return;
    }
    await run(
      "saving",
      async () => {
        const res = await finishInterviewStoryAction(item.id, turns);
        if (!res.ok) throw new Error(res.error);
        if (res.proposal) {
          setProposal(res.proposal);
          setPauseAfterCard(pause);
          return;
        }
        // 이야기 내용이 없었음 — 건너뛰기와 같다.
        onNext(res.next, null, pause);
      },
      C.saveFailed,
    );
  }

  async function createFromCard(edit: CardEdit): Promise<CreateOutcome> {
    const r = await decideInterviewProposalAction(item.id, { kind: "create", edit });
    if (r.ok) {
      onNext(r.next, C.storySaved, pauseAfterCard);
      return { ok: true };
    }
    if (r.reason === "ask") return { ok: false, ask: r.ask };
    if (r.reason === "invalid") return { ok: false, message: r.message };
    return { ok: false };
  }

  async function declineCard(): Promise<void> {
    const r = await decideInterviewProposalAction(item.id, { kind: "decline" });
    if (r.ok) onNext(r.next, null, pauseAfterCard);
  }

  async function skip() {
    await run("thinking", async () => onNext(await skipInterviewItemAction(item.id), null));
  }

  function sendStory(text: string) {
    if (isExitIntent(text) || isEpisodeDoneIntent(text)) {
      const kept = stripEpisodeDoneSignal(text);
      const turns: EpisodeTurn[] = kept ? [...transcript, { role: "user", text: kept }] : transcript;
      setTranscript(turns);
      void finishStory(turns, isExitIntent(text));
      return;
    }
    const turns: EpisodeTurn[] = [...transcript, { role: "user", text }];
    setTranscript(turns);
    if (!item.followUp || awaitingFinal) {
      void finishStory(turns);
      return;
    }
    void run("thinking", async () => {
      const res = await interviewStoryTurnAction(item.id, turns.slice(1), followUps);
      if (!res.ok || !res.reply.trim()) {
        await finishStory(turns);
        return;
      }
      const withReply: EpisodeTurn[] = [...turns, { role: "assistant", text: res.reply }];
      setTranscript(withReply);
      setFollowUps(followUps + 1);
      if (res.end && !(res.capped && isAskingQuestion(res.reply))) {
        await finishStory(withReply);
        return;
      }
      // capped 인데 질문으로 끝났으면 그 답 하나만 더 받고 마무리(P10-2).
      if (res.end) setAwaitingFinal(true);
      setPrompt(res.reply);
    });
  }

  function sendYear(text: string | null) {
    void run("thinking", async () => {
      const { result, next } = await answerInterviewYearAction(item.id, text);
      if (result.outcome === "retry" || !next) {
        setPrompt(C.yearRetry);
        return;
      }
      onNext(
        next,
        result.outcome === "saved"
          ? C.yearSaved(result.label, result.year)
          : result.outcome === "unknown"
            ? C.yearUnknown
            : null,
      );
    });
  }

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setMessage(null);
    if (item.kind === "year") sendYear(text);
    else sendStory(text);
  }

  function handlePause() {
    if (busy) return;
    if (item.kind === "story" && hasAnswered) void finishStory(transcript, true);
    else onPause();
  }

  if (proposal) {
    return (
      <section className="flex flex-col gap-6">
        <p className="text-lg font-semibold text-ink-soft">{C.progress(item.ordinal, item.total)}</p>
        <ProposalCard view={proposal} onCreate={createFromCard} onDecline={declineCard} />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6">
      <p className="text-lg font-semibold text-ink-soft">{C.progress(item.ordinal, item.total)}</p>
      {message && (
        <p role="status" className="rounded-md bg-banner px-5 py-4 text-lg text-ink">
          {message}
        </p>
      )}
      <h1 className="text-2xl font-bold leading-snug text-ink sm:text-3xl">{prompt}</h1>
      {item.hint && !hasAnswered && <p className="text-lg text-ink-soft">{item.hint}</p>}

      <VoiceTextarea
        value={input}
        onChange={setInput}
        rows={4}
        placeholder={C.answerPlaceholder}
        ariaLabel={C.answerLabel}
      />

      {busy ? (
        <p role="status" className="text-lg text-ink-soft">
          {busy === "saving" ? C.saving : C.thinking}
        </p>
      ) : failed ? (
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" onClick={() => void failed()}>
            {C.retry}
          </Button>
          <Button variant="tertiary" size="lg" onClick={onPause}>
            {C.pause}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Button variant="primary" size="lg" onClick={handleSend} disabled={!input.trim()}>
            {C.send}
          </Button>
          {item.kind === "year" && (
            <Button variant="secondary" size="lg" onClick={() => sendYear(null)}>
              {C.yearUnknownButton}
            </Button>
          )}
          {item.kind === "story" && hasAnswered ? (
            <Button variant="secondary" size="lg" onClick={() => void finishStory(transcript)}>
              {C.storyEnough}
            </Button>
          ) : (
            <Button variant="tertiary" size="lg" onClick={() => void skip()}>
              {C.skip}
            </Button>
          )}
          <Button variant="tertiary" size="lg" onClick={handlePause}>
            {C.pause}
          </Button>
        </div>
      )}
    </section>
  );
}
