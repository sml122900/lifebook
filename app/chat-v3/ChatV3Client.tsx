"use client";

// v3 통합 채팅(P1~P3) — 신상 수집(뼈대모드) + STAGE2 확인질문 + 갭 기반 열린
// 대화가 하나의 채팅 흐름으로 이어진다. 내부 stage 는 UI 에 안 보인다.
//
// 대화 로그를 DB(OnboardingChatMessage)에 저장/복원한다. P3-1 — addBot/
// addUser 를 반드시 await 한다(호출부도 전부 await). 이전엔 fire-and-forget
// 이라 골격 진행 중간에 다른 페이지로 이동하면 방금 턴들의 저장이 씹히는
// 사고가 있었다(골격 "완료" 후에는 왜인지 안 씹혔다 — 그 시점 이후엔 다시
// 들어와도 loadNextConfirmQuestion 류 후속 await 체인이 충분히 길어 저장이
// 이미 끝나 있었을 가능성; 근본 원인을 프로덕션에서 정확히 특정 못 했지만,
// 저장을 "다음 상호작용을 열어주기 전에 반드시 끝난 상태"로 만들면 어떤
// 메커니즘이었든 씹힐 여지 자체가 없어진다).
//
// 재사용 엔진: completeOnboarding(onboarding.ts), getNextConfirmQuestion/
// submitConfirmAnswer/getConfirmQuestionForEvent(life-event.ts),
// continueEpisodeChat/finishEpisodeChat(episode.ts, STAGE4 그대로) — 전부
// 무수정 또는 순수 추가.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { Button } from "@/components/ui/Button";
import { CharacterStage } from "@/app/components/CharacterStage";
import type { CharacterState } from "@/lib/characters";

import { completeOnboarding } from "@/app/actions/onboarding";
import {
  hasOnboardingProfile,
  parseProfileBirthYear,
  parseProfileRegion,
} from "@/app/actions/onboarding-v3";
import {
  getConfirmedLifeEvent,
  getConfirmQuestionForEvent,
  getNextConfirmQuestion,
  submitConfirmAnswer,
} from "@/app/actions/life-event";
import {
  continueEpisodeChat,
  finishEpisodeChat,
  type EpisodeTopic,
  type EpisodeTurn,
} from "@/app/actions/episode";
import { getPeriodPromptByEventId, getTopGaps } from "@/app/actions/gaps";
import { respondToOpenChat } from "@/app/actions/open-chat";
import { submitPersonAnswer, getPersonEpisodeTarget } from "@/app/actions/person-chat";
import {
  listRecentChatMessages,
  saveChatMessage,
  type ChatLogTurn,
} from "@/app/actions/chat-v3-log";
import {
  setPendingChatContext,
  clearPendingChatContext,
  getPendingChatContext,
  type PendingChatContext,
} from "@/app/actions/chat-v3-pending";
import type { Gap } from "@/lib/gap-detector";
import type { LifeEventType } from "@/lib/generated/prisma/enums";
import { buildPersonAddress } from "@/lib/person-honorific";

type Msg = { role: "a" | "u"; text: string };
type Stage = "profile_year" | "profile_region" | "confirm" | "episode" | "open" | "person";
type Status = "loading" | "idle" | "submitting" | "finished" | "error";
type FinishReason = "done" | "capped" | "exited";

export type InitialGap =
  | { eventId: string; kind: "confirm" | "episode" | "period" | "person" }
  | { eventId: string; kind: "person_episode"; personId: string }
  | null;

// 피로도 제어 — 신상(생년·출생지) + 확인질문 합쳐 한 세션 상한. 갭 카드로
// 되돌아와 특정 이벤트를 다시 다루는 것(targeted confirm)·에피소드 대화·
// open 자유 대화는 이 상한에 안 걸린다(온보딩 피로도와는 다른 맥락).
const MAX_SESSION_QUESTIONS = 12;

// P8-3 — app/actions/episode.ts 의 MAX_FOLLOWUPS 와 반드시 같은 값이어야
// 한다("use server" 파일은 async 함수만 export 할 수 있어(프로젝트 규칙)
// 상수를 직접 공유 못 함). 그쪽 값이 바뀌면 이 값도 함께 바꿀 것.
const EPISODE_MAX_FOLLOWUPS = 2;

// 종료 의사 키워드 사전 체크 — STAGE4(에피소드 대화)의 "종료 의사는 항상
// 즉시 존중" 원칙을 여기선 LLM 판단 대신 가벼운 키워드로 재현한다.
const EXIT_PHRASES = [
  "그만할래요",
  "그만할게요",
  "그만하고싶어요",
  "그만",
  "여기까지",
  "다음에할게요",
  "쉬고싶어요",
];

function isExitIntent(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return EXIT_PHRASES.some((p) => normalized.includes(p));
}

// P8-2 — "그걸로 된 것 같아요"/"충분해요" 류의 완곡한 종료 의사를 LLM 이
// 종종 "잘 됐다"는 뜻으로 오독해 마무리 대신 되묻는다(예: "무엇이 잘
// 되었나요?"). 에피소드(period 포함) 대화 중엔 AI 판단 전에 키워드로 먼저
// 거른다 — 존엄 원칙상 오탐(조기 종료)이 미탐(계속 캐물음)보다 안전.
const EPISODE_DONE_PHRASES = [
  "그걸로된것같아요",
  "그정도면됐어요",
  "이정도면됐어요",
  "이정도면",
  "그정도면",
  "이만하면",
  "충분해요",
  "충분한것같아요",
  "됐어요",
  "됐습니다",
];

function isEpisodeDoneIntent(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return EPISODE_DONE_PHRASES.some((p) => normalized.includes(p));
}

// P10-2 — capped(강제 마감) 응답이 프롬프트 지시("새 질문 대신 마무리 말을")
// 를 어기고 질문으로 끝나는지 판단하는 가벼운 휴리스틱. 이 앱의 질문형
// 문구는 전부 "?"로 끝난다(전각 물음표 포함).
function isAskingQuestion(text: string): boolean {
  return /[?？]\s*$/.test(text.trim());
}

const OPEN_GREETING = "하고 싶은 이야기 있으세요?";

// P4-1 — 에피소드 대화 오프닝 질문. 예전엔 내부 골격 라벨을 그대로
// 노출했다(예: "1963년 출생, 이때 기억나는 거 있으세요?"). 이벤트 종류별로
// 자연스러운 질문을 만든다. 학령기 라벨은 " 입학" 접미사를 떼어(예:
// "국민학교 입학" → "국민학교") 개칭 이력(getElemSchoolLabel)이 반영된
// 정확한 학제 명칭을 그대로 살린다.
function schoolPhaseName(label: string, fallback: string): string {
  const stripped = label.replace(/\s*입학$/, "").trim();
  return stripped || fallback;
}

function buildEpisodeOpeningPrompt(type: LifeEventType, label: string): string {
  switch (type) {
    case "BIRTH":
      return "태어나서 자란 동네는 어떤 곳이었어요?";
    case "ELEM_SCHOOL":
      return `${schoolPhaseName(label, "학교")} 다닐 때 기억나는 일 있으세요?`;
    case "MIDDLE_SCHOOL":
      return `${schoolPhaseName(label, "중학교")} 다닐 때 기억나는 일 있으세요?`;
    case "HIGH_SCHOOL":
      return `${schoolPhaseName(label, "고등학교")} 다닐 때 기억나는 일 있으세요?`;
    case "UNIVERSITY":
      return `${schoolPhaseName(label, "대학교")} 다닐 때 기억나는 일 있으세요?`;
    case "MILITARY":
      return "군대에서 기억나는 일 있으세요?";
    case "FIRST_JOB":
      return "처음 일하셨을 때 기억나는 일 있으세요?";
    case "MARRIAGE":
      return "결혼하실 때 기억나는 일 있으세요?";
    case "CUSTOM":
    default:
      return `${label}, 이때 기억나는 거 있으세요?`;
  }
}

// v3 P6 — 인물 모드 진입 질문. 에피소드 오프닝과 짝을 이루되 "무슨 일"이 아닌
// "누구"에 초점.
function buildPersonAskPrompt(type: LifeEventType, label: string): string {
  switch (type) {
    case "ELEM_SCHOOL":
      return `${schoolPhaseName(label, "학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "MIDDLE_SCHOOL":
      return `${schoolPhaseName(label, "중학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "HIGH_SCHOOL":
      return `${schoolPhaseName(label, "고등학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "UNIVERSITY":
      return `${schoolPhaseName(label, "대학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "MILITARY":
      return "군대에서 가깝게 지낸 전우 있으세요?";
    case "FIRST_JOB":
      return "그때 가깝게 지낸 동료 있으세요?";
    case "BIRTH":
    case "MARRIAGE":
    case "CUSTOM":
    default:
      return "그 시절 가까이 지내신 분 있으세요?";
  }
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
  const [sessionId] = useState(() => crypto.randomUUID());

  const [stage, setStage] = useState<Stage>("profile_year");
  const [status, setStatus] = useState<Status>("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [inputVal, setInputVal] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [gapSuggestions, setGapSuggestions] = useState<Gap[]>([]);
  // 캐릭터 리액션 — 확인질문 통과·에피소드 저장 시 잠깐 happy 로 덮어씀
  // (그 외엔 status/입력 포커스로 idle·listening·thinking 자동 계산).
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
  const episodeFollowUpCountRef = useRef(0);
  const episodeTranscriptRef = useRef<EpisodeTurn[]>([]);
  const retryActionRef = useRef<(() => Promise<void>) | null>(null);
  // v3 P6 — 지금 진행 중인 "episode" 단계가 특정 인물과의 이야기인지(null 이면
  // 일반 사건 회고). startEpisodeStage(일반 진입)는 항상 이 값을 지운다.
  const activePersonRef = useRef<{ id: string; name: string } | null>(null);
  // v3 P6 — "person" 단계에서 방금 던진 질문 문구(추출 시 맥락으로 필요).
  const personQuestionRef = useRef("");
  // P8-1 — 지금 진행 중인 "episode" 단계가 period(구간) 대화인지(null 이면
  // 일반 사건/인물 회고). 앵커 LifeEvent 자신의 label/year 대신 이 topic 을
  // 시스템 프롬프트·저장 제목에 쓴다. startEpisodeStage/enterPersonEpisode
  // 는 항상 이 값을 지운다(activePersonRef 와 같은 자리).
  const periodTopicRef = useRef<EpisodeTopic | null>(null);
  // P10-2 — capped(강제 마감) 턴의 응답이 규칙을 어기고 질문으로 끝나면,
  // 그 답을 받기 전엔 마무리하지 않고 한 턴 더 기다린다는 표시.
  const awaitingFinalAnswerRef = useRef(false);
  // P10-1 — 마지막으로 표시된 메시지(역할+본문). 폴백 문구처럼 같은 문구가
  // 재진입마다 반복 적재되는 것을 막는 데 쓴다(로그 재조회 없이 즉시 판단).
  const lastMessageRef = useRef<Msg | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // P3-1 — 반드시 await. DB 기록이 끝난 뒤에야 이 턴을 "완료된 것"으로
  // 치고 다음 상호작용(다른 페이지 이동 포함)을 허용한다.
  // P10-1 — 직전 메시지와 역할·본문이 완전히 같으면 건너뛴다(폴백 문구가
  // 재진입마다 쌓이던 문제).
  async function addBot(text: string): Promise<void> {
    if (lastMessageRef.current?.role === "a" && lastMessageRef.current.text === text) return;
    const msg: Msg = { role: "a", text };
    lastMessageRef.current = msg;
    setMessages((prev) => [...prev, msg]);
    try {
      await saveChatMessage(userId, sessionId, "assistant", text);
    } catch (e) {
      console.error("[chat-v3-log]", e);
    }
  }
  async function addUser(text: string): Promise<void> {
    const msg: Msg = { role: "u", text };
    lastMessageRef.current = msg;
    setMessages((prev) => [...prev, msg]);
    try {
      await saveChatMessage(userId, sessionId, "user", text);
    } catch (e) {
      console.error("[chat-v3-log]", e);
    }
  }

  // P7-7 — episode/person 단계 진입/이탈을 대기 컨텍스트 테이블에 반영.
  // best-effort(실패해도 대화 자체는 막지 않음) — addBot/addUser 와 같은
  // 방어 패턴.
  async function markPendingEpisode(eventId: string, personId: string | null): Promise<void> {
    try {
      await setPendingChatContext(userId, "EPISODE", eventId, personId);
    } catch (e) {
      console.error("[chat-v3-pending]", e);
    }
  }
  async function markPendingPerson(eventId: string): Promise<void> {
    try {
      await setPendingChatContext(userId, "PERSON", eventId, null);
    } catch (e) {
      console.error("[chat-v3-pending]", e);
    }
  }
  async function clearPending(): Promise<void> {
    try {
      await clearPendingChatContext(userId);
    } catch (e) {
      console.error("[chat-v3-pending]", e);
    }
  }

  function enterError(message: string, retryAction: () => Promise<void>) {
    retryActionRef.current = retryAction;
    setErrorMsg(message);
    setStatus("error");
  }

  // canReview — /story-review 로 넘어갈 만한 상태인지(신상 단계에서 종료한
  // 경우엔 아직 아무 골격도 없어 보여줄 게 없다). "done"/"capped" 는 항상
  // confirm 루프(골격 존재) 안에서만 발생하므로 호출부가 true 로 고정.
  async function finishSession(reason: FinishReason, canReview: boolean) {
    const msg =
      reason === "capped"
        ? "오늘은 여기까지 여쭤볼게요. 나머지는 다음에 이어서 여쭤볼게요."
        : reason === "exited"
          ? "네, 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요."
          : "뼈대가 다 채워졌어요! 지금까지 채운 이야기를 보여드릴게요.";
    if (reason === "done") triggerReaction("happy", 3500);
    await addBot(msg);
    setStatus("finished");
    if (canReview) {
      setTimeout(() => router.push("/story-review"), 1200);
    }
  }

  // "open" 단계 진입/재진입 — 갭을 새로 계산해 보여주고, 인사말을 붙인다.
  // P3-6 — dedupeAgainst 의 마지막 메시지가 이미 "assistant" 발화면(어떤
  // 문구였든) 또 새 프롬프트를 안 붙인다. 이 화면은 항상 봇이 마지막으로
  // 말하고 끝나므로("~있으세요?" 류), 텍스트를 정확히 맞출 필요 없이
  // "이미 봇이 뭔가 물어본 채로 끝나 있다"만 확인하면 충분하다(예전엔
  // OPEN_GREETING 문자열과의 완전 일치만 봐서 다른 마무리 멘트 뒤엔 매번
  // 새 인사말이 계속 쌓였다).
  async function enterOpenStage(promptText: string, dedupeAgainst?: ChatLogTurn[]) {
    setStage("open");
    setStatus("loading");
    try {
      // P7-7 — episode/person 대기 컨텍스트를 벗어나는 모든 경로가 결국
      // 여기로 모인다(finishEpisodeStage·submitPersonTurn 의 "없어요" 분기
      // 등) — 한 곳에서 정리하면 충분하다.
      await clearPending();
      const gaps = await getTopGaps(userId, 3);
      setGapSuggestions(gaps);
      const last = dedupeAgainst?.[dedupeAgainst.length - 1];
      const alreadyShown = last?.role === "assistant";
      if (!alreadyShown) await addBot(promptText);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 불러오지 못했어요.", () => enterOpenStage(promptText, dedupeAgainst));
    }
  }

  async function loadNextConfirmQuestion(
    opts: { fromInit?: boolean; dedupeAgainst?: ChatLogTurn[] } = {},
  ) {
    const { fromInit = false, dedupeAgainst } = opts;
    setStage("confirm");
    setStatus("loading");
    try {
      // P7-7 — confirm 루프로 들어오면 episode/person 대기 컨텍스트는 더
      // 이상 유효하지 않다(존재해도 no-op).
      await clearPending();
      if (questionCountRef.current >= MAX_SESSION_QUESTIONS) {
        await finishSession("capped", true);
        return;
      }
      const res = await getNextConfirmQuestion(userId);
      if (res.done) {
        if (fromInit) {
          // 마운트 직후 만난 done:true 는 "지금 막 끝난" 게 아니라 "이미 다
          // 끝나 있었다" — 축하 멘트+리뷰 이동 대신 open 단계로.
          await enterOpenStage(OPEN_GREETING, dedupeAgainst);
        } else {
          await finishSession("done", true);
        }
        return;
      }
      activeEventIdRef.current = res.eventId;
      // 재진입 시 복원된 로그가 이미 "질문 대기 중"(마지막 메시지가
      // assistant)으로 끝나 있으면 같은 이벤트를 새로 재생성해 또 물어보지
      // 않는다 — 안 그러면 방금 복원한 마지막 질문 바로 아래 같은(또는
      // 재생성돼 살짝 다른) 질문이 한 번 더 붙는다.
      const last = dedupeAgainst?.[dedupeAgainst.length - 1];
      const alreadyPending = fromInit && last?.role === "assistant";
      if (!alreadyPending) {
        questionCountRef.current += 1;
        await addBot(res.question);
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("질문을 불러오지 못했어요.", () =>
        loadNextConfirmQuestion({ fromInit, dedupeAgainst }),
      );
    }
  }

  async function afterConfirmResolved() {
    if (isTargetedConfirmRef.current) {
      isTargetedConfirmRef.current = false;
      await enterOpenStage("네, 반영했어요. 다른 이야기도 있으세요?");
    } else {
      await loadNextConfirmQuestion();
    }
  }

  // 갭 카드에서 특정(needsReview 포함) 이벤트를 골라 다시 묻는 경로.
  async function startTargetedConfirm(eventId: string) {
    isTargetedConfirmRef.current = true;
    setStage("confirm");
    setStatus("loading");
    try {
      await clearPending();
      const res = await getConfirmQuestionForEvent(userId, eventId);
      if (res.done) {
        isTargetedConfirmRef.current = false;
        await enterOpenStage("그 이야기는 이미 확인했나봐요. 다른 이야기 있으세요?");
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

  // 갭 카드에서 confirmed 인데 hasEpisode=false 인 이벤트를 골라 심화 대화
  // 시작. P4-1 — handleGapClick 은 이미 최상단에서 gap.announceText 를
  // addUser 했으므로(skipAnnounce=true) 여기서 또 남기지 않는다. 반면
  // init() 의 initialGap(/story-review "이야기하기" 딥링크) 경로는 그
  // addUser 를 거치지 않고 곧장 여기로 오므로(skipAnnounce 기본 false)
  // 직접 사용자 발화 버블을 남긴다 — 이전엔 이 경로만 버블이 안 남고 내부
  // 골격 라벨("1963년 출생")이 그대로 오프닝에 노출되던 버그가 있었다.
  async function startEpisodeStage(eventId: string, opts: { skipAnnounce?: boolean } = {}) {
    setStage("episode");
    setStatus("loading");
    try {
      const item = await getConfirmedLifeEvent(userId, eventId);
      if (!item) {
        await enterOpenStage("그 이야기는 지금 들을 수 없나봐요. 다른 이야기 있으세요?");
        return;
      }
      if (!opts.skipAnnounce) {
        // P9-5 — person/period 는 "~시절 이야기도 해볼게요"(조사 "도")인데
        // 여기만 "도" 가 빠져 있었다. 통일.
        await addUser(`${item.label} 이야기도 해볼게요`);
      }
      activeEventIdRef.current = item.id;
      activePersonRef.current = null;
      periodTopicRef.current = null;
      episodeFollowUpCountRef.current = 0;
      awaitingFinalAnswerRef.current = false;
      await markPendingEpisode(item.id, null);
      const opening = buildEpisodeOpeningPrompt(item.type, item.label);
      episodeTranscriptRef.current = [{ role: "assistant", text: opening }];
      await addBot(opening);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 준비하지 못했어요.", () => startEpisodeStage(eventId, opts));
    }
  }

  // v3 P6 — 갭 카드(person)에서, 또는 인물 수집 직후 자동으로 들어오는
  // "그 시절 주변 사람" 질문. 인물이 이미 저장돼 있으면(그래서 다시 사람을
  // 물을 필요가 없으면) enterPersonEpisode 로 바로 넘어가지 않는 이유는,
  // 이 단계는 "새 인물을 더 들어볼까" 이지 이미 아는 인물과의 에피소드가
  // 아니기 때문 — person_episode 갭은 별도 진입점(startPersonEpisodeStage).
  async function startPersonStage(eventId: string, opts: { skipAnnounce?: boolean } = {}) {
    setStage("person");
    setStatus("loading");
    try {
      const item = await getConfirmedLifeEvent(userId, eventId);
      if (!item) {
        await enterOpenStage("그 이야기는 지금 들을 수 없나봐요. 다른 이야기 있으세요?");
        return;
      }
      if (!opts.skipAnnounce) {
        await addUser(`${item.label} 시절 이야기도 해볼게요`);
      }
      activeEventIdRef.current = item.id;
      await markPendingPerson(item.id);
      const question = buildPersonAskPrompt(item.type, item.label);
      personQuestionRef.current = question;
      await addBot(question);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 준비하지 못했어요.", () => startPersonStage(eventId, opts));
    }
  }

  // 인물 답변 처리. 저장된 인물이 있으면 바로 그 사람과의 에피소드 대화로
  // 이어간다(존엄 원칙 — "없어요"/"기억 안 나요" 는 캐묻지 않고 open 으로).
  async function submitPersonTurn(text: string) {
    const eventId = activeEventIdRef.current;
    if (!eventId) {
      setStatus("idle");
      return;
    }
    setStatus("submitting");
    try {
      const result = await submitPersonAnswer(userId, eventId, personQuestionRef.current, text);
      if (result.savedCount === 0 || !result.firstPersonId || !result.firstPersonName) {
        await enterOpenStage("네, 알겠어요. 다른 이야기도 있으세요?");
        return;
      }
      triggerReaction("happy");
      await enterPersonEpisode(eventId, result.firstPersonId, result.firstPersonName, result.firstPersonRelation);
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => submitPersonTurn(text));
    }
  }

  // 인물 저장 직후 자동 진입, 또는 person_episode 갭에서 진입 — 둘 다 여기로
  // 모인다. "episode" 단계 기존 엔진(submitEpisodeTurn/finishEpisodeStage)을
  // personId 태그만 붙여 그대로 탄다.
  async function enterPersonEpisode(
    eventId: string,
    personId: string,
    personName: string,
    personRelation: string | null,
  ) {
    setStage("episode");
    setStatus("loading");
    try {
      activeEventIdRef.current = eventId;
      activePersonRef.current = { id: personId, name: personName };
      periodTopicRef.current = null;
      episodeFollowUpCountRef.current = 0;
      awaitingFinalAnswerRef.current = false;
      await markPendingEpisode(eventId, personId);
      // P10-4 — 윗사람(가족·은사)이면 호칭을 살려 격식 조사로 부른다.
      const opening = `${buildPersonAddress(personName, personRelation)} 기억나는 일 있으세요?`;
      episodeTranscriptRef.current = [{ role: "assistant", text: opening }];
      await addBot(opening);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 준비하지 못했어요.", () =>
        enterPersonEpisode(eventId, personId, personName, personRelation),
      );
    }
  }

  // person_episode 갭 카드/딥링크 진입 — "이미 아는 그 인물"과의 이야기를
  // 새로 시작. getPersonEpisodeTarget 이 두 ID 의 소유·연결을 다시 확인한다.
  async function startPersonEpisodeStage(
    eventId: string,
    personId: string,
    opts: { skipAnnounce?: boolean } = {},
  ) {
    setStage("episode");
    setStatus("loading");
    try {
      const target = await getPersonEpisodeTarget(userId, eventId, personId);
      if (!target) {
        await enterOpenStage("그 이야기는 지금 들을 수 없나봐요. 다른 이야기 있으세요?");
        return;
      }
      if (!opts.skipAnnounce) {
        await addUser(`${buildPersonAddress(target.personName, target.personRelation)} 있었던 이야기 해볼게요`);
      }
      await enterPersonEpisode(eventId, personId, target.personName, target.personRelation);
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 준비하지 못했어요.", () => startPersonEpisodeStage(eventId, personId, opts));
    }
  }

  // P3-2/P8-1 — /story-review 의 time_gap 카드(또는 갭 칩)에서 anchor
  // eventId 를 지정해 돌아온 경우. 그 구간의 문구를 다시 찾아 userPrompt 를
  // 던진다. P8-1 이전엔 stage="open"(저장 없는 1회성 잡담)으로 빠져 이 구간
  // 이야기가 통째로 저장 안 됐다 — episode 엔진(STAGE4)을 그대로 타되,
  // 앵커 이벤트 자신이 아니라 "그 이벤트 이후"가 주제이므로 periodTopicRef
  // 로 topic 을 덮어씌운다. Episode 는 lifeEventId 에 여러 개 붙을 수 있어
  // (스키마 1:N) 앵커에 붙이는 것이 자연스럽다.
  // P10-1 — getPeriodPromptByEventId 를 쓴다(getGapByEventId 대신). 그 갭이
  // 이미 해소돼(그 앵커에 period Episode 가 이미 있어) 갭 카드 목록에서는
  // 사라졌어도, 딥링크로 직접(또는 재)진입하면 이 구간 대화를 이어갈 수
  // 있어야 한다 — 그렇지 않으면 매번 폴백만 뜨고 대화가 시작조차 안 된다.
  async function startPeriodPrompt(eventId: string, opts: { skipAnnounce?: boolean } = {}) {
    setStage("episode");
    setStatus("loading");
    try {
      await clearPending();
      const [prompt, item] = await Promise.all([
        getPeriodPromptByEventId(userId, eventId),
        getConfirmedLifeEvent(userId, eventId),
      ]);
      if (!prompt || !item) {
        await enterOpenStage("그 이야기는 지금 들을 수 없나봐요. 다른 이야기 있으세요?");
        return;
      }
      if (!opts.skipAnnounce) {
        await addUser(prompt.announceText);
      }
      activeEventIdRef.current = item.id;
      activePersonRef.current = null;
      periodTopicRef.current = { label: `${item.label} 이후`, year: item.year };
      episodeFollowUpCountRef.current = 0;
      awaitingFinalAnswerRef.current = false;
      await markPendingEpisode(item.id, null);
      episodeTranscriptRef.current = [{ role: "assistant", text: prompt.userPrompt }];
      await addBot(prompt.userPrompt);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("이야기를 불러오지 못했어요.", () => startPeriodPrompt(eventId, opts));
    }
  }

  function submitEpisodeTurn(text: string): Promise<void> {
    const eventId = activeEventIdRef.current;
    if (!eventId) {
      setStatus("idle");
      return Promise.resolve();
    }
    setStatus("submitting");
    const historyBefore = episodeTranscriptRef.current;

    // P8-2 — 완곡한 종료 의사는 AI 판단(오독 위험) 없이 먼저 거른다.
    // P10-3 — "그걸로 된 것 같아요" 같은 종료 신호 자체는 이야기 내용이
    // 아니라 신호일 뿐이라 요약 입력에서 뺀다(넣으면 "그것으로 충분했다"
    // 처럼 이야기 내용으로 잘못 흡수된다). 화면·DB 로그(addUser)에는 이미
    // 남았으니 여기선 episodeTranscriptRef 에만 안 넣는다.
    if (isEpisodeDoneIntent(text)) {
      awaitingFinalAnswerRef.current = false;
      episodeTranscriptRef.current = historyBefore;
      return finishEpisodeStage();
    }

    // P10-2 — 직전 assistant 응답이 강제 마감(capped) 턴이었고 질문으로
    // 끝났다면, 이 턴은 그 질문에 대한 답이다 — 모델을 다시 부르지 않고
    // (더 물으면 안 되는 차례) 곧장 이 답을 담아 마무리한다.
    if (awaitingFinalAnswerRef.current) {
      awaitingFinalAnswerRef.current = false;
      episodeTranscriptRef.current = [...historyBefore, { role: "user", text }];
      return finishEpisodeStage();
    }

    return submitEpisodeTurnToModel(eventId, text, historyBefore);
  }

  async function submitEpisodeTurnToModel(
    eventId: string,
    text: string,
    historyBefore: EpisodeTurn[],
  ): Promise<void> {
    const apiHistory: EpisodeTurn[] = [...historyBefore.slice(1), { role: "user", text }];
    try {
      const result = await continueEpisodeChat(
        eventId,
        apiHistory,
        episodeFollowUpCountRef.current,
        periodTopicRef.current ?? undefined,
      );
      if (!result.ok) {
        enterError(result.error, () => {
          setStatus("idle");
          return Promise.resolve();
        });
        return;
      }
      episodeTranscriptRef.current = [
        ...historyBefore,
        { role: "user", text },
        { role: "assistant", text: result.reply },
      ];
      await addBot(result.reply);
      episodeFollowUpCountRef.current += 1;
      if (result.end) {
        // P10-2 — capped(강제 마감) 응답이 규칙을 어기고 질문으로 끝나면,
        // 그 답을 받기 전에 마무리하면 방금 그 답이 유실된다("open" 단계로
        // 넘어가 저장 안 되는 채로 흘러간다). 질문 형태가 아니면(잘 지켜진
        // 마무리 말) 기존처럼 바로 저장.
        if (result.capped && isAskingQuestion(result.reply)) {
          awaitingFinalAnswerRef.current = true;
          setStatus("idle");
          return;
        }
        await finishEpisodeStage();
        return;
      }
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => {
        setStatus("idle");
        return Promise.resolve();
      });
    }
  }

  async function finishEpisodeStage() {
    const eventId = activeEventIdRef.current;
    const personId = activePersonRef.current?.id;
    const topicOverride = periodTopicRef.current ?? undefined;
    setStatus("loading");
    try {
      const result = eventId
        ? await finishEpisodeChat(eventId, episodeTranscriptRef.current, personId, topicOverride)
        : { ok: false as const, error: "" };
      if (!result.ok) {
        await addBot("저장하지 못했어요. 그래도 이야기 나눠주셔서 고마워요.");
      } else {
        triggerReaction("happy");
      }
    } catch (e) {
      console.error("[chat-v3]", e);
      await addBot("저장하지 못했어요. 그래도 이야기 나눠주셔서 고마워요.");
    }
    activePersonRef.current = null;
    periodTopicRef.current = null;
    await enterOpenStage("소중한 이야기 들려주셔서 고마워요. 다른 이야기도 있으세요?");
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
        // 순서상 항상 birthYear 가 먼저 채워지므로 이론상 도달하지 않는다.
        setStage("profile_year");
        await addBot("죄송해요, 처음부터 다시 여쭤볼게요. 언제 태어나셨어요?");
        setStatus("idle");
        return;
      }

      // 골격 생성 + 첫 확인질문 생성이 AI 호출 2연쇄로 이어져 몇 초 걸린다.
      setLoadingHint("잠깐만요, 이야기 칸을 정리하고 있어요…");
      await completeOnboarding(userId, {
        birthYear,
        birthMonth: null,
        gender: null,
        region: res.region,
      });
      // 직전 턴이 이미 "OO년에 태어나셨군요"였으니 여기서 연도를 또
      // 반복하지 않는다.
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
      const result = await submitConfirmAnswer(eventId, text);

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

  async function submitOpenChat(text: string) {
    setStatus("submitting");
    try {
      const reply = await respondToOpenChat(userId, text);
      await addBot(reply);
      setStatus("idle");
    } catch (e) {
      console.error("[chat-v3]", e);
      enterError("답변을 처리하지 못했어요.", () => submitOpenChat(text));
    }
  }

  // P7-7 — 딥링크 없이 재진입했을 때, episode/person 단계에서 못 끝낸
  // 대화가 있으면 이어받는다. confirm/profile 은 항상 LifeEvent/
  // OnboardingProfile 실제 상태에서 재계산하므로(기존 그대로) 대상이 아니다.
  // 이전 turn 히스토리는 복원하지 않는다 — 로그의 마지막 assistant
  // 메시지(대기 중이던 질문) 하나만 이어받는다(lib/chat-v3-pending.ts 상단
  // 주석 참조). 대상이 더 이상 유효하지 않으면(이벤트/링크가 사라짐 등)
  // 조용히 정리하고 false — 호출부가 기존 정상 분기로 이어간다.
  async function tryResumePendingContext(
    loaded: ChatLogTurn[],
    pending: PendingChatContext | null,
  ): Promise<boolean> {
    if (!pending) return false;

    const lastAssistantText =
      loaded.length > 0 && loaded[loaded.length - 1].role === "assistant"
        ? loaded[loaded.length - 1].content
        : null;
    const item = await getConfirmedLifeEvent(userId, pending.targetEventId);
    if (!item || !lastAssistantText) {
      await clearPending();
      return false;
    }

    if (pending.stage === "PERSON") {
      activeEventIdRef.current = item.id;
      personQuestionRef.current = lastAssistantText;
      setStage("person");
      setStatus("idle");
      return true;
    }

    // EPISODE — targetPersonId 가 있으면 그 인물과의 이야기(연결이 끊겼으면
    // getPersonEpisodeTarget 이 null 을 줘 일반 사건 회고로 자연히 강등).
    let personName: string | null = null;
    if (pending.targetPersonId) {
      const target = await getPersonEpisodeTarget(userId, pending.targetEventId, pending.targetPersonId);
      personName = target?.personName ?? null;
    }
    activeEventIdRef.current = item.id;
    activePersonRef.current =
      pending.targetPersonId && personName ? { id: pending.targetPersonId, name: personName } : null;
    // P8-3 — 이전 턴 히스토리를 복원하지 않으므로(위 주석) 실제 진행된
    // 턴 수를 알 수 없다. 0 으로 리셋하면 최대 MAX_FOLLOWUPS 만큼 더
    // 늘어질 수 있어 "재진입 후 안 끝난다"는 체감으로 이어진다 — 대신
    // 재진입 후 다음 한 번의 답변으로 강제 마무리되게 한다(오탐이 미탐보다
    // 안전하다는 P8-2 와 같은 원칙).
    episodeFollowUpCountRef.current = EPISODE_MAX_FOLLOWUPS - 1;
    // P10-2 — 새로 이어받는 대화이므로 "직전 답을 기다리는 중" 상태는 아니다.
    awaitingFinalAnswerRef.current = false;
    // P11-5 — period 대화였는지 복원. ChatV3PendingContext 엔 period 표식이
    // 없어(스키마 무변) 로그로 판정한다: 오프닝 문구는 전부 결정적 템플릿
    // 이라, 로그에서 마지막으로 등장한 오프닝이 period 질문(getPeriodPrompt-
    // ByEventId 의 userPrompt — 아직 저장 전이므로 시작 당시와 같은 회차
    // 문구)이면 period, 이벤트 자체 오프닝이면 일반 회고. 이전엔 무조건
    // null 로 떨어져 재진입 후 저장분이 "결혼"(이후 누락) 제목 + isPeriod=
    // false 로 남았다(1회차 "결혼 이후"와 제목 불일치).
    periodTopicRef.current = null;
    if (!activePersonRef.current) {
      const periodPrompt = await getPeriodPromptByEventId(userId, item.id);
      if (periodPrompt) {
        const lastIndexOf = (text: string) => {
          for (let i = loaded.length - 1; i >= 0; i--) {
            if (loaded[i].role === "assistant" && loaded[i].content === text) return i;
          }
          return -1;
        };
        const episodeOpening = buildEpisodeOpeningPrompt(item.type, item.label);
        if (lastIndexOf(periodPrompt.userPrompt) > lastIndexOf(episodeOpening)) {
          periodTopicRef.current = { label: `${item.label} 이후`, year: item.year };
        }
      }
    }
    episodeTranscriptRef.current = [{ role: "assistant", text: lastAssistantText }];
    setStage("episode");
    setStatus("idle");
    return true;
  }

  // P9-2 — initialGap(딥링크)이 가리키는 대상이 이미 진행 중인 대기 대화
  // (ChatV3PendingContext)와 같은 것인지 판정. 가장 흔한 트리거: /story-review
  // 에서 아직 안 끝난 갭 카드를 다시 클릭 — 이전엔 initialGap 이 항상 우선이라
  // 진행 중이던 대화를 무시하고 연결 멘트+오프닝 질문을 통째로 재주입했다
  // (재진입 2회 시 같은 쌍이 3번 쌓이던 원인). tryResumePendingContext 를
  // 아예 안 타서 P8-3 의 "재진입 후 강제 마무리" 도 함께 못 탔던 것도 이
  // 우회 경로 때문 — pending 을 우선하면 둘 다 자연히 해결된다. "confirm"
  // 은 대상 아님(ChatV3PendingContext 는 EPISODE/PERSON 만 다룸).
  function pendingMatchesInitialGap(
    pending: PendingChatContext,
    gap: NonNullable<InitialGap>,
  ): boolean {
    if (pending.targetEventId !== gap.eventId) return false;
    if (gap.kind === "person") return pending.stage === "PERSON";
    if (gap.kind === "episode" || gap.kind === "period") {
      return pending.stage === "EPISODE" && !pending.targetPersonId;
    }
    if (gap.kind === "person_episode") {
      return pending.stage === "EPISODE" && pending.targetPersonId === gap.personId;
    }
    return false;
  }

  async function init() {
    setStatus("loading");
    try {
      const loaded = await listRecentChatMessages(userId);
      if (loaded.length > 0) {
        const mapped: Msg[] = loaded.map((m) => ({
          role: m.role === "assistant" ? "a" : "u",
          text: m.content,
        }));
        setMessages(mapped);
        lastMessageRef.current = mapped[mapped.length - 1];
      }

      let pending: PendingChatContext | null = null;
      try {
        pending = await getPendingChatContext(userId);
      } catch (e) {
        console.error("[chat-v3-pending]", e);
      }

      // P9-2 — 진행 중이던 대화와 같은 대상이면 새로 시작하지 않고 이어받는다.
      if (initialGap && pending && pendingMatchesInitialGap(pending, initialGap)) {
        if (await tryResumePendingContext(loaded, pending)) return;
      }

      // 갭 카드에서 특정 이벤트를 지정해 돌아온 경우 — 자연 분기보다 우선.
      if (initialGap) {
        if (initialGap.kind === "episode") {
          await startEpisodeStage(initialGap.eventId);
        } else if (initialGap.kind === "period") {
          await startPeriodPrompt(initialGap.eventId);
        } else if (initialGap.kind === "person") {
          await startPersonStage(initialGap.eventId);
        } else if (initialGap.kind === "person_episode") {
          await startPersonEpisodeStage(initialGap.eventId, initialGap.personId);
        } else {
          await startTargetedConfirm(initialGap.eventId);
        }
        return;
      }

      if (await tryResumePendingContext(loaded, pending)) return;

      const hasProfile = await hasOnboardingProfile(userId);
      if (!hasProfile) {
        setStage("profile_year");
        // P9-3 — 다른 진입점들(loadNextConfirmQuestion 의 alreadyPending,
        // enterOpenStage 의 alreadyShown)과 같은 dedup: 복원된 로그의
        // 마지막 메시지가 이미 봇 발화(= 이미 뭔가 물어본 채로 끝나 있음)면
        // 또 새 질문을 안 붙인다. 이 가드가 없으면 OnboardingProfile 이
        // 아직 안 생긴 상태(프로필 단계 완료 전)에서 새로고침할 때마다
        // "먼저 몇 가지만 여쭤볼게요" 가 매번 새 행으로 재적재됐다.
        const alreadyAsked = loaded.length > 0 && loaded[loaded.length - 1].role === "assistant";
        if (!alreadyAsked) {
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
    // dev StrictMode 가 마운트 이펙트를 두 번 실행 — 첫 질문이 중복 표시되는
    // 것을 막는다.
    if (didInitRef.current) return;
    didInitRef.current = true;
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // P3-3 — 칩 클릭도 "사용자가 이 주제를 골랐다"는 발화 버블을 남긴다(이전엔
  // time_gap 클릭 시 사용자 버블 없이 봇이 내부 진단 문구를 그대로 말하는
  // 것처럼 보였다). P7-5 — cardLabel 은 시스템이 사용자에게 건네는 질문형
  // ("~들어볼까요?")이라 그대로 addUser 하면 사용자가 하지 않은 말이 버블에
  // 뜬다 — 1인칭 진술체인 gap.announceText 를 대신 쓴다.
  async function handleGapClick(gap: Gap) {
    if (status !== "idle") return;
    await addUser(gap.announceText);
    if (gap.type === "episode" && gap.targetEventId) {
      await startEpisodeStage(gap.targetEventId, { skipAnnounce: true });
    } else if (gap.type === "person" && gap.targetEventId) {
      await startPersonStage(gap.targetEventId, { skipAnnounce: true });
    } else if (gap.type === "person_episode" && gap.targetEventId && gap.targetPersonId) {
      await startPersonEpisodeStage(gap.targetEventId, gap.targetPersonId, { skipAnnounce: true });
    } else if ((gap.type === "unconfirmed" || gap.type === "needs_review") && gap.targetEventId) {
      await startTargetedConfirm(gap.targetEventId);
    } else if (gap.type === "time_gap" && gap.targetEventId) {
      // P8-1 — episode 엔진을 타고 앵커 이벤트에 저장(startPeriodPrompt 참고).
      await startPeriodPrompt(gap.targetEventId, { skipAnnounce: true });
    } else {
      setStatus("idle");
    }
  }

  async function handleSend() {
    const text = inputVal.trim();
    if (!text || status !== "idle") return;

    if (isExitIntent(text)) {
      await addUser(text);
      setInputVal("");
      const canReview = stage !== "profile_year" && stage !== "profile_region";
      await finishSession("exited", canReview);
      return;
    }

    setInputVal("");
    await addUser(text);

    if (stage === "profile_year") await submitBirthYear(text);
    else if (stage === "profile_region") await submitRegion(text);
    else if (stage === "confirm") await submitConfirmTurn(text);
    else if (stage === "person") await submitPersonTurn(text);
    else if (stage === "episode") await submitEpisodeTurn(text);
    else await submitOpenChat(text);
  }

  function handleRetry() {
    setErrorMsg(null);
    const action = retryActionRef.current;
    if (action) void action();
  }

  const isIdle = status === "idle";
  const showInput = status !== "error" && status !== "finished";
  const showGaps = stage === "open" && isIdle && gapSuggestions.length > 0;

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* P5-4 — 캐릭터가 대화 리액션 용도라 스크롤해도 계속 보여야 의미가
          있다. 헤더 전체를 sticky top-0 으로 고정(대화 내내 노출).
          작은 화면(sm 미만)에서는 캐릭터를 제목 "아래 줄"로 내린다 —
          사이드 패널 "내 정보" 버튼(fixed right-4 top-4)이 차지하는
          가로 폭을 픽셀 단위로 계산해 여백을 맞추는 대신, 세로로 겹칠
          공간 자체를 없애는 방식이라 화면 폭이 달라져도 안전하다. */}
      <header className="sticky top-0 z-20 flex flex-col gap-3 border-b border-line bg-canvas py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">이야기 나누기</h1>
          <p className="mt-1 text-base text-ink-soft">편하게 대답만 해주세요.</p>
        </div>
        <div className="flex items-center gap-2 self-start sm:flex-col sm:items-center sm:gap-1 sm:self-auto">
          <CharacterStage
            characterId={characterId}
            motionEnabled={characterMotionEnabled}
            state={characterState}
          />
          <Link href="/account/settings" className="text-sm text-ink-faint underline">
            바꾸기
          </Link>
        </div>
      </header>

      <div className="space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={["flex", msg.role === "u" ? "justify-end" : "justify-start"].join(" ")}
          >
            <div
              className={[
                "max-w-[82%] rounded-2xl px-5 py-4 text-lg leading-relaxed whitespace-pre-wrap",
                msg.role === "u"
                  ? "bg-action text-white rounded-br-sm"
                  : "bg-surface border border-line text-ink rounded-bl-sm",
              ].join(" ")}
            >
              {msg.text}
            </div>
          </div>
        ))}

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
        <div className="border-t border-line pt-3">
          <div className="flex items-end gap-2">
            <textarea
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              disabled={!isIdle}
              placeholder="답을 입력해 주세요 (Shift+Enter 줄바꿈)"
              rows={2}
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
