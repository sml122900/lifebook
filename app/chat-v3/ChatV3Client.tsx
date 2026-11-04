"use client";

// v3 통합 채팅 — 설정(신상 + 골격 확인질문) 뒤 자유 대화 하나. My Life 개편 2단계
// (docs/phase/my-life-restructure.md §3): 이야기·인물 단계와 자유 발화 즉시 중심 생성(promoteOpenTurn)을
// 없애고, 자유 대화가 일단락되면 "이 이야기를 남길까요?" 제안 카드([만들기]·[고치기]·[안 만들기])가
// 요약·인물 추출·인물 확인(2b-2)을 대신한다. 구간·카드는 서버(lib/free-chat.ts, ChatV3Segment)가 기억한다.
//
// 대화 로그를 DB(OnboardingChatMessage)에 저장/복원한다. P3-1 — addBot/addUser 를 반드시 await 한다
// (저장을 "다음 상호작용을 열어주기 전에 반드시 끝난 상태"로 — 다른 페이지로 이동해도 씹히지 않게).
// 자유 대화 서버는 이 로그를 읽어 구간을 만든다 — 그래서 본인 말 저장이 끝난 뒤에 응답을 부른다.
//
// 재사용 엔진: completeOnboarding(onboarding.ts), getNextConfirmQuestion/submitConfirmAnswer/
// getConfirmQuestionForEvent(life-event.ts) — 설정 단계는 무수정.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { Button, ButtonLink } from "@/components/ui/Button";
import { CharacterStage } from "@/app/components/CharacterStage";
import { isSendEnter, useAutoGrow, useHasKeyboard } from "@/app/components/chat-input";
import { ProposalCard, type CreateOutcome } from "@/app/components/ProposalCard";
import type { CharacterState } from "@/lib/characters";

import { completeOnboarding } from "@/app/actions/onboarding";
import {
  hasOnboardingProfile,
  parseProfileBirthYear,
  parseProfileRegion,
} from "@/app/actions/onboarding-v3";
import {
  getConfirmQuestionForEvent,
  getNextConfirmQuestion,
  submitConfirmAnswer,
} from "@/app/actions/life-event";
import {
  createProposalAction,
  declineProposalAction,
  freeChatReplyAction,
  initFreeChatAction,
  proposeAction,
  startFreeTopicAction,
} from "@/app/actions/free-chat";
import { getTopGaps } from "@/app/actions/gaps";
import {
  listRecentChatMessages,
  saveChatMessage,
  type ChatLogTurn,
} from "@/app/actions/chat-v3-log";
import type { Gap } from "@/lib/gap-detector";
import type { FreeTopicInput, ProposalView } from "@/lib/free-chat";
import { FREE_CHAT_COPY as FC } from "@/lib/free-chat-copy";
import type { CardEdit } from "@/lib/node-proposal";
import { isExitIntent } from "@/lib/episode-text";
import { shortTitle } from "@/lib/story-title";

type Msg = { role: "a" | "u"; text: string };
type Stage = "profile_year" | "profile_region" | "confirm" | "free";
type Status = "loading" | "idle" | "submitting" | "finished" | "error";
type FinishReason = "capped" | "exited";

export type InitialGap =
  | { eventId: string; kind: "confirm" | "episode" | "period" | "person" }
  | { eventId: string; kind: "person_episode"; personId: string }
  | null;

// 피로도 제어 — 신상(생년·출생지) + 확인질문 합쳐 한 세션 상한. 자유 대화는 이 상한에 안 걸린다.
const MAX_SESSION_QUESTIONS = 12;

// finishSession 이 마지막으로 남기는 문구들. 재진입 dedupe(마지막 메시지가 봇 발화 = 이미 뭔가 물어본
// 채로 끝나 있다)에서 이 문구는 질문이 아니라 제외한다.
const SESSION_END_MESSAGES = new Set<string>([
  FC.endCapped,
  FC.endPlain,
  FC.endSaved,
  "뼈대가 다 채워졌어요! 지금까지 채운 이야기를 보여드릴게요.", // 옛 마무리 말(지금은 안 씀 — 옛 대화 기록 판정용)
]);

function endsWithPendingBotTurn(loaded: ChatLogTurn[] | undefined): boolean {
  const last = loaded?.[loaded.length - 1];
  return last?.role === "assistant" && !SESSION_END_MESSAGES.has(last.content);
}

// P13-3 — "무한 로딩 절대 금지". 서버 액션이 응답을 영영 안 주면 이 시간을 넘겨 거절 → enterError.
const ACTION_TIMEOUT_MS = 45_000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("action timeout")), ACTION_TIMEOUT_MS);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

// P13-1 — 딥링크 소비 표식. 딥링크(?gapEventId=…)로 들어온 뒤 갭 칩으로 다른 대화를 시작하면 주소창은
// 옛 딥링크 그대로다(주소를 고치면 Next 라우터가 페이지를 리마운트한다). 새로고침 때 옛 딥링크가 다시
// 발화하지 않게 sessionStorage 에 표식을 남긴다. 클라이언트 라우팅으로 떠날 때(언마운트) 지운다.
const DEEP_LINK_CONSUMED_KEY = "chat-v3:deep-link-consumed";

function deepLinkKey(gap: NonNullable<InitialGap>): string {
  return `${gap.eventId}:${gap.kind}:${gap.kind === "person_episode" ? gap.personId : ""}`;
}

function isStaleDeepLink(gap: NonNullable<InitialGap>): boolean {
  try {
    return sessionStorage.getItem(DEEP_LINK_CONSUMED_KEY) === deepLinkKey(gap);
  } catch {
    return false;
  }
}

function markDeepLinkConsumed(gap: InitialGap): void {
  if (!gap) return;
  try {
    sessionStorage.setItem(DEEP_LINK_CONSUMED_KEY, deepLinkKey(gap));
  } catch {
    // storage 불가 환경 — 표식 없이 진행.
  }
}

function clearDeepLinkConsumed(): void {
  try {
    sessionStorage.removeItem(DEEP_LINK_CONSUMED_KEY);
  } catch {
    // no-op
  }
}

function gapToTopic(gap: Gap): FreeTopicInput | null {
  if (!gap.targetEventId) return null;
  if (gap.type === "episode") return { eventId: gap.targetEventId, kind: "episode" };
  if (gap.type === "time_gap") return { eventId: gap.targetEventId, kind: "period" };
  if (gap.type === "person") return { eventId: gap.targetEventId, kind: "person" };
  if (gap.type === "person_episode" && gap.targetPersonId) {
    return { eventId: gap.targetEventId, kind: "person_episode", personId: gap.targetPersonId };
  }
  return null;
}

export function ChatV3Client({
  userId,
  initialGap,
  characterId,
  characterMotionEnabled,
}: {
  userId: string;
  initialGap: InitialGap;
  characterId: string;
  characterMotionEnabled: boolean;
}) {
  const router = useRouter();
  // 입력칸 — 키보드 있는 기기만 Enter 보내기·"Shift+Enter 줄바꿈" 안내, 터치 기기는 줄바꿈 키 = 줄바꿈(app/components/chat-input).
  const hasKeyboard = useHasKeyboard();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [sessionId] = useState(() => crypto.randomUUID());

  const [stage, setStage] = useState<Stage>("profile_year");
  const [status, setStatus] = useState<Status>("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  useAutoGrow(inputRef, inputVal);
  const [inputFocused, setInputFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [gapSuggestions, setGapSuggestions] = useState<Gap[]>([]);
  // 자유 대화 — 결정 전 제안 카드 · 지금 구간 본인 실질 턴 수 · 방금 만든 노드(지도로 가는 버튼).
  const [proposal, setProposal] = useState<ProposalView | null>(null);
  const [segTurns, setSegTurns] = useState(0);
  const [lastCreated, setLastCreated] = useState<string | null>(null);
  // 캐릭터 리액션 — 확인질문 통과·노드 만들기 때 잠깐 happy.
  const [reaction, setReaction] = useState<CharacterState | null>(null);
  const reactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function triggerReaction(state: CharacterState, ms = 2200) {
    setReaction(state);
    if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
    reactionTimeoutRef.current = setTimeout(() => setReaction(null), ms);
  }
  useEffect(() => {
    return () => {
      if (reactionTimeoutRef.current) clearTimeout(reactionTimeoutRef.current);
      clearDeepLinkConsumed();
    };
  }, []);

  const characterState: CharacterState =
    reaction ??
    (status === "loading" || status === "submitting"
      ? "thinking"
      : inputFocused
        ? "listening"
        : "idle");

  const birthYearRef = useRef<number | null>(null);
  const activeEventIdRef = useRef<string | null>(null);
  const questionCountRef = useRef(0);
  const isTargetedConfirmRef = useRef(false);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);
  // "그만할래요" 때 카드가 떠 있거나 새로 떴으면, 카드를 정한 뒤 세션을 마친다.
  const exitAfterCardRef = useRef(false);
  const lastMessageRef = useRef<Msg | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  // 고정 머리말(sticky) 높이만큼 문서 스크롤 여백(scroll-padding-top) — 카드로 자동 스크롤할 때·키보드로 카드 버튼에 갈 때·
  // 카드를 맨 위까지 올렸을 때 머리말 뒤로 가리지 않게(390 실측 — 카드 제목 윗줄이 가렸다). 머리말 높이가 바뀌면 다시 잰다.
  // 2026-11-04 — 이 머리말은 앱 머리 줄(Lifebook + [내 정보], --app-header-h) 아래에 붙으므로 그 높이도 더한다.
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => {
      root.style.scrollPaddingTop = `calc(var(--app-header-h) + ${el.offsetHeight}px)`;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => {
      ro.disconnect();
      root.style.scrollPaddingTop = "";
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);
  // 카드가 뜨면 카드 맨 위(제목)부터 — 맨 아래로 내리면 긴 카드의 제목이 고정 머리 줄 뒤에 가린다(390 실측).
  // 위 이펙트보다 뒤에 둬서 같은 그림에서는 이쪽이 이긴다.
  const cardKey = proposal ? (proposal.card.until ?? proposal.card.title) : null;
  useEffect(() => {
    if (cardKey) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [cardKey]);

  // P3-1 — 반드시 await. P10-1 — 직전 메시지와 역할·본문이 완전히 같으면 건너뛴다.
  async function addBot(text: string): Promise<void> {
    if (lastMessageRef.current?.role === "a" && lastMessageRef.current.text === text) return;
    showMsg({ role: "a", text });
    try {
      await saveChatMessage(userId, sessionId, "assistant", text);
    } catch (e) {
      console.error("[chat-v3-log]", e);
    }
  }
  async function addUser(text: string): Promise<void> {
    showMsg({ role: "u", text });
    try {
      await saveChatMessage(userId, sessionId, "user", text);
    } catch (e) {
      console.error("[chat-v3-log]", e);
    }
  }
  // 서버가 이미 로그에 저장한 말(주제 고른 말·오프닝) — 보여 주기만.
  function showMsg(msg: Msg) {
    lastMessageRef.current = msg;
    setMessages((prev) => [...prev, msg]);
  }

  function enterError(message: string, retryAction: () => Promise<void>) {
    retryActionRef.current = retryAction;
    setErrorMsg(message);
    setStatus("error");
  }

  // 세션 마침 — 마무리 말 뒤 My Life 로(Q68). canReview = 보여 줄 골격이 있는지(신상 단계 종료면 없음).
  async function finishSession(reason: FinishReason, canReview: boolean, savedStory = false) {
    const msg = reason === "capped" ? FC.endCapped : savedStory ? FC.endSaved : FC.endPlain;
    setStatus("finished");
    await addBot(msg);
    if (canReview) setTimeout(() => router.push("/my-life"), 1200);
  }

  // ─── 설정 단계(신상·골격 확인) ────────────────────────────────────────

  async function loadNextConfirmQuestion(opts: { fromInit?: boolean; dedupeAgainst?: ChatLogTurn[] } = {}) {
    const { fromInit = false, dedupeAgainst } = opts;
    setStage("confirm");
    setStatus("loading");
    try {
      if (questionCountRef.current >= MAX_SESSION_QUESTIONS) {
        await finishSession("capped", true);
        return;
      }
      const res = await withTimeout(getNextConfirmQuestion(userId));
      if (res.done) {
        // 설정 끝 — 자유 대화로 합친다(Q65). 처음부터 끝나 있었으면 인사만.
        await enterFree(fromInit ? { dedupeAgainst } : { intro: FC.setupDone });
        return;
      }
      activeEventIdRef.current = res.eventId;
      const alreadyPending = fromInit && endsWithPendingBotTurn(dedupeAgainst);
      if (!alreadyPending) {
        questionCountRef.current += 1;
        await addBot(res.question);
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () => loadNextConfirmQuestion({ fromInit, dedupeAgainst }));
    }
  }

  async function afterConfirmResolved() {
    if (isTargetedConfirmRef.current) {
      isTargetedConfirmRef.current = false;
      await enterFree({ intro: FC.confirmApplied });
    } else {
      await loadNextConfirmQuestion();
    }
  }

  // 갭 칩·딥링크에서 특정(needsReview 포함) 이벤트를 다시 묻는 경로.
  async function startTargetedConfirm(eventId: string) {
    isTargetedConfirmRef.current = true;
    setStage("confirm");
    setStatus("loading");
    try {
      const res = await getConfirmQuestionForEvent(userId, eventId);
      if (res.done) {
        isTargetedConfirmRef.current = false;
        await enterFree({ intro: FC.confirmAlready });
        return;
      }
      activeEventIdRef.current = res.eventId;
      await addBot(res.question);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () => startTargetedConfirm(eventId));
    }
  }

  async function submitBirthYear(text: string) {
    setStatus("submitting");
    try {
      const res = await parseProfileBirthYear(text);
      if (res.birthYear === null) {
        await addBot("죄송해요, 잘 못 알아들었어요. 태어나신 연도를 다시 말씀해주시겠어요? (예: 1958년)");
        setStatus("idle");
        return;
      }
      birthYearRef.current = res.birthYear;
      await addBot(`${res.birthYear}년에 태어나셨군요. 어디서 태어나셨어요?`);
      questionCountRef.current += 1;
      setStage("profile_region");
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => submitBirthYear(text));
    }
  }

  async function submitRegion(text: string) {
    setStatus("submitting");
    try {
      const res = await parseProfileRegion(text);
      if (res.region === null) {
        await addBot("죄송해요, 잘 못 알아들었어요. 태어나거나 자란 곳을 다시 말씀해주시겠어요?");
        setStatus("idle");
        return;
      }
      const birthYear = birthYearRef.current;
      if (birthYear === null) {
        setStage("profile_year");
        await addBot("죄송해요, 처음부터 다시 여쭤볼게요. 언제 태어나셨어요?");
        setStatus("idle");
        return;
      }
      // 골격 생성 + 첫 확인질문 생성이 AI 호출 2연쇄로 이어져 몇 초 걸린다.
      setLoadingHint("잠깐만요, 이야기 칸을 정리하고 있어요…");
      await withTimeout(completeOnboarding(userId, { birthYear, birthMonth: null, gender: null, region: res.region }));
      await addBot("네, 그럼 몇 가지 확인해볼게요.");
      await loadNextConfirmQuestion();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("저장하지 못했어요.", () => submitRegion(text));
    } finally {
      setLoadingHint(null);
    }
  }

  async function submitConfirmTurn(text: string) {
    const eventId = activeEventIdRef.current;
    if (!eventId) {
      setStatus("idle");
      return;
    }
    setStatus("submitting");
    try {
      const result = await withTimeout(submitConfirmAnswer(eventId, text));
      if (result.status === "UNCLEAR") {
        if (result.needsReview) {
          await addBot("네, 그건 나중에 다시 여쭤볼게요.");
          await afterConfirmResolved();
        } else {
          await addBot("죄송해요, 잘 못 알아들었어요. 다시 한번 말씀해주시겠어요?");
          setStatus("idle");
        }
        return;
      }
      if (result.status === "CONFIRMED") await addBot("네, 확인했어요.");
      else if (result.status === "SKIPPED") await addBot("알겠어요, 넘어갈게요.");
      else if (result.status === "CORRECTED") await addBot("그렇게 고쳐서 담아둘게요.");
      triggerReaction("happy");
      await afterConfirmResolved();
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 저장하지 못했어요.", () => submitConfirmTurn(text));
    }
  }

  // ─── 자유 대화 ────────────────────────────────────────────────────────

  // 자유 대화 진입·재진입 — 구간 상태(카드·실질 턴)와 갭 칩을 불러오고, 인사를 붙인다.
  // 카드가 있으면 카드부터, 마지막 활동 6시간 넘게 지난 구간(실질 내용 있음 — 짧으면 서버가 입장 때 이미 버림)이면
  // 첫 메시지 전에 바로 제안(Q66, lib/free-chat SEGMENT_IDLE_CLOSE_MS).
  async function enterFree(opts: { intro?: string; dedupeAgainst?: ChatLogTurn[] } = {}) {
    setStage("free");
    setStatus("loading");
    try {
      const [state, gaps] = await Promise.all([withTimeout(initFreeChatAction()), withTimeout(getTopGaps(userId, 3))]);
      setGapSuggestions(gaps);
      setSegTurns(state.segmentTurns);
      if (state.proposal) {
        setProposal(state.proposal);
        setStatus("idle");
        return;
      }
      if (state.stale) {
        await addBot(FC.staleNotice);
        await requestProposal(null);
        return;
      }
      if (opts.intro) await addBot(opts.intro);
      else if (!endsWithPendingBotTurn(opts.dedupeAgainst)) {
        await addBot(state.segmentTurns > 0 ? FC.resume : FC.greeting);
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError(FC.loadFailed, () => enterFree(opts));
    }
  }

  // 주제(갭 칩·딥링크)로 새 구간 — 서버가 고른 말·오프닝을 로그에 저장하고 돌려준다.
  async function startTopic(topic: FreeTopicInput) {
    setStage("free");
    setStatus("loading");
    try {
      const r = await withTimeout(startFreeTopicAction(topic, sessionId));
      if (r.kind === "opening") {
        showMsg({ role: "u", text: r.announce });
        showMsg({ role: "a", text: r.opening });
        setSegTurns(0);
      } else if (r.kind === "pending") {
        // 결정 전 카드(또는 하던 이야기로 방금 만든 카드)부터.
        setProposal(r.view);
        await addBot(FC.cardFirst);
      } else if (r.kind === "resume") {
        await addBot(FC.resume);
      } else if (r.kind === "budget") {
        await addBot(FC.budgetPaused);
      } else {
        await addBot(FC.topicGone);
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError(FC.topicFailed, () => startTopic(topic));
    }
  }

  async function submitFree() {
    setStatus("submitting");
    try {
      const r = await withTimeout(freeChatReplyAction());
      if (r.kind === "budget") {
        await addBot(FC.budgetPaused);
        setStatus("idle");
        return;
      }
      await addBot(r.reply.trim() || FC.replyEmpty);
      setSegTurns(r.segmentTurns);
      if (r.propose) {
        await requestProposal(r.propose.until);
        return;
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError(FC.replyFailed, () => submitFree());
    }
  }

  // 지금 구간을 카드로. 카드가 안 생기면(내용 없음) 그대로 대화. 반환 = 카드가 떴는지.
  async function requestProposal(until: string | null): Promise<boolean> {
    setStatus("loading");
    setLoadingHint(FC.proposing);
    try {
      const r = await withTimeout(proposeAction(until));
      if (r.kind === "card") {
        setProposal(r.view);
        return true;
      }
      if (r.kind === "budget") await addBot(FC.budgetPaused);
      else setSegTurns(r.segmentTurns);
      return false;
    } catch (e) {
      console.error("[chat-v3]", e);
      return false;
    } finally {
      setLoadingHint(null);
      setStatus((s) => (s === "loading" ? "idle" : s));
    }
  }

  async function handleCreate(edit: CardEdit): Promise<CreateOutcome> {
    const r = await withTimeout(createProposalAction(edit));
    if (r.ok) {
      setProposal(null);
      setSegTurns(r.segmentTurns);
      triggerReaction("happy", 3000);
      await addBot(FC.created(shortTitle(r.title)));
      setLastCreated(`/my-life?focus=${encodeURIComponent(`st:${r.eventId}:${r.episodeId}`)}`);
      if (exitAfterCardRef.current) {
        exitAfterCardRef.current = false;
        await finishSession("exited", true, true);
      }
      return { ok: true };
    }
    if (r.reason === "ask") return { ok: false, ask: r.ask, placeAsk: r.placeAsk };
    if (r.reason === "invalid") return { ok: false, message: r.message };
    if (r.reason === "no_card") setProposal(null);
    return { ok: false };
  }

  async function handleDecline(): Promise<void> {
    const r = await withTimeout(declineProposalAction());
    setProposal(null);
    setSegTurns(r.segmentTurns);
    await addBot(FC.declined);
    if (exitAfterCardRef.current) {
      exitAfterCardRef.current = false;
      await finishSession("exited", true);
    }
  }

  async function handleSaveNow() {
    if (status !== "idle" || proposal) return;
    await requestProposal(null);
  }

  // ─── 진입 ─────────────────────────────────────────────────────────────

  async function init() {
    setStatus("loading");
    try {
      const loaded = await listRecentChatMessages(userId);
      if (loaded.length > 0) {
        const mapped: Msg[] = loaded.map((m) => ({ role: m.role === "assistant" ? "a" : "u", text: m.content }));
        setMessages(mapped);
        lastMessageRef.current = mapped[mapped.length - 1];
      }

      // 갭 카드·My Life 에서 특정 이벤트를 지정해 들어온 경우(새로고침으로 다시 온 옛 딥링크는 무시 — P13-1).
      if (initialGap && !isStaleDeepLink(initialGap)) {
        markDeepLinkConsumed(initialGap);
        if (initialGap.kind === "confirm") {
          await startTargetedConfirm(initialGap.eventId);
          return;
        }
        const [state, gaps] = await Promise.all([initFreeChatAction(), getTopGaps(userId, 3)]);
        setGapSuggestions(gaps);
        setSegTurns(state.segmentTurns);
        if (state.proposal) {
          // 결정 전 카드가 있으면 카드부터(주제는 카드를 정한 뒤 갭 칩으로).
          setStage("free");
          setProposal(state.proposal);
          setStatus("idle");
          return;
        }
        await startTopic(
          initialGap.kind === "person_episode"
            ? { eventId: initialGap.eventId, kind: "person_episode", personId: initialGap.personId }
            : { eventId: initialGap.eventId, kind: initialGap.kind },
        );
        return;
      }

      const hasProfile = await hasOnboardingProfile(userId);
      if (!hasProfile) {
        setStage("profile_year");
        if (!endsWithPendingBotTurn(loaded)) {
          await addBot("먼저 몇 가지만 여쭤볼게요. 언제 태어나셨어요?");
          questionCountRef.current += 1;
        }
        setStatus("idle");
        return;
      }

      await loadNextConfirmQuestion({ fromInit: true, dedupeAgainst: loaded });
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("시작하지 못했어요.", init);
    }
  }

  const didInitRef = useRef(false);
  useEffect(() => {
    // dev StrictMode 가 마운트 이펙트를 두 번 실행 — 첫 질문이 중복 표시되는 것을 막는다.
    if (didInitRef.current) return;
    didInitRef.current = true;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleGapClick(gap: Gap) {
    if (status !== "idle" || proposal) return;
    markDeepLinkConsumed(initialGap);
    setLastCreated(null);
    if ((gap.type === "unconfirmed" || gap.type === "needs_review") && gap.targetEventId) {
      await addUser(gap.announceText);
      await startTargetedConfirm(gap.targetEventId);
      return;
    }
    const topic = gapToTopic(gap);
    if (topic) await startTopic(topic);
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || status !== "idle") return;
    setInputVal("");
    setLastCreated(null);

    if (isExitIntent(text)) {
      await addUser(text);
      const canReview = stage !== "profile_year" && stage !== "profile_region";
      // 자유 대화 — 남길 이야기가 있으면 카드를 먼저(정한 뒤 마침), 없으면 바로 마침.
      if (stage === "free") {
        if (proposal) {
          exitAfterCardRef.current = true;
          await addBot(FC.exitAfterCard);
          return;
        }
        if (await requestProposal(null)) {
          exitAfterCardRef.current = true;
          await addBot(FC.exitAfterCard);
          return;
        }
      }
      await finishSession("exited", canReview);
      return;
    }

    await addUser(text);
    if (stage === "profile_year") await submitBirthYear(text);
    else if (stage === "profile_region") await submitRegion(text);
    else if (stage === "confirm") await submitConfirmTurn(text);
    else await submitFree();
  }

  function handleRetry() {
    setErrorMsg(null);
    const action = retryActionRef.current;
    if (action) void action();
  }

  const isIdle = status === "idle";
  const showInput = status !== "error" && status !== "finished";
  const showGaps = stage === "free" && isIdle && !proposal && segTurns === 0 && gapSuggestions.length > 0;
  const showSaveNow = stage === "free" && isIdle && !proposal && segTurns > 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* P5-4 — 캐릭터가 대화 리액션 용도라 헤더 전체를 sticky 로 고정. 앱 머리 줄(--app-header-h, [내 정보] 버튼이 그 안)
          바로 아래에 붙는다. 2026-11-04 — 화면 폭·스크롤과 상관없이 한 줄 [캐릭터 64] + 제목 + [바꾸기](56px·18px) — 고정 영역을
          줄이려고(390×667 스크롤 중 217 → 머리 줄 56 + 이 줄). 360px 에 들어가게 간격 8px·[바꾸기] 좌우 여백 16px(가안).
          제목 아래 부제(대답만 하면 된다는 안내)는 삭제 — 대화창 첫 말(setupDone·greeting)이 같은 안내를 한다. */}
      <header ref={headerRef} className="sticky top-[var(--app-header-h)] z-20 flex items-center gap-2 border-b border-line bg-canvas py-2">
        <CharacterStage characterId={characterId} motionEnabled={characterMotionEnabled} state={characterState} />
        <h1 className="min-w-0 flex-1 whitespace-nowrap text-2xl font-bold text-ink">이야기 나누기</h1>
        <ButtonLink href="/account/settings" variant="tertiary" size="lg" className="shrink-0 px-4!">
          바꾸기
        </ButtonLink>
      </header>

      <div className="space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div key={i} className={["flex", msg.role === "u" ? "justify-end" : "justify-start"].join(" ")}>
            <div
              className={[
                "max-w-[82%] rounded-2xl px-5 py-4 text-lg leading-relaxed whitespace-pre-wrap",
                msg.role === "u" ? "bg-action text-white rounded-br-sm" : "bg-surface border border-line text-ink rounded-bl-sm",
              ].join(" ")}
            >
              {msg.text}
            </div>
          </div>
        ))}

        {lastCreated && !proposal && (
          <div className="flex justify-start">
            <ButtonLink href={lastCreated} variant="secondary" size="lg">
              {FC.viewOnMap}
            </ButtonLink>
          </div>
        )}

        {proposal && status !== "finished" && (
          // 고정 머리 줄 높이만큼 띄워 멈춘다(좁은 화면은 캐릭터 줄까지 두 줄).
          <div ref={cardRef} className="scroll-mt-3">
            <ProposalCard key={cardKey ?? ""} view={proposal} onCreate={handleCreate} onDecline={handleDecline} />
          </div>
        )}

        {(status === "loading" || status === "submitting") && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-line bg-surface px-5 py-4">
              {loadingHint ? (
                <p className="text-base text-ink-soft">{loadingHint}</p>
              ) : (
                <div className="flex h-4 items-center gap-1">
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      className="h-2 w-2 animate-bounce rounded-full bg-ink-soft"
                      style={{ animationDelay: `${delay}ms` }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {showGaps && (
        <div className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-ink-soft">{FC.chipsTitle}</p>
          {gapSuggestions.map((gap, i) => (
            <button
              key={i}
              onClick={() => void handleGapClick(gap)}
              className="min-h-[56px] rounded-2xl border-2 border-line bg-surface px-5 py-3 text-left text-lg text-ink hover:bg-banner"
            >
              {gap.cardLabel}
            </button>
          ))}
        </div>
      )}

      {status === "error" && (
        <div className="py-2 text-center">
          <p className="mb-2 text-base text-danger">{errorMsg}</p>
          <Button variant="secondary" onClick={handleRetry}>
            다시 시도할게요
          </Button>
        </div>
      )}

      {showInput && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          {showSaveNow && (
            <Button variant="secondary" size="lg" onClick={() => void handleSaveNow()}>
              {FC.saveNow}
            </Button>
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (isSendEnter(e, hasKeyboard)) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!isIdle}
              placeholder={hasKeyboard ? `${FC.inputPlaceholder} ${FC.inputNewlineHint}` : FC.inputPlaceholder}
              rows={2}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
              data-form-type="other"
              className="flex-1 resize-none rounded-2xl border-2 border-line bg-canvas px-4 py-3 text-lg text-ink placeholder:text-ink-faint focus:border-brand focus:outline-none disabled:opacity-50"
              style={{ maxHeight: "9rem" }}
            />
            <button
              onClick={() => void handleSend()}
              disabled={!isIdle || !inputVal.trim()}
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-action text-white text-2xl font-bold transition-colors hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="전송"
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
