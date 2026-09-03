"use server";

// STAGE4 — 에피소드 심화 대화 + 저장.
//
// 대화 자체는 턴마다 DB 에 쓰지 않는다 — 클라가 history 배열을 들고 있다가
// 끝날 때(finishEpisodeChat) 한 번에 요약 + 저장한다. continueEpisodeChat 은
// 순수 대화 진행(질문/마무리 판단)만 담당.
//
// 존엄 원칙은 프롬프트(lib/prompts/episode-chat)에 규칙으로 박혀 있고,
// 여기서는 MAX_FOLLOWUPS 하드캡으로 한 번 더 지킨다 — 모델이 스스로
// end:true 를 안 줘도 정해진 턴 수를 넘기지 않는다.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import {
  buildEpisodeChatSystemPrompt,
  EPISODE_SUMMARY_SYSTEM_PROMPT,
} from "@/lib/prompts/episode-chat";
import { createEpisodeBridge, saveEpisodePlaces as saveEpisodePlacesDb } from "@/lib/episode";
import type { PlaceInfo } from "@/lib/place-types";

// 추출/분류와 같은 이유로 Sonnet 고정 — 전역 aiModel(라이브 응답)과 무관.
const CHAT_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const MAX_FOLLOWUPS = 2;

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// 2026-09-01 — CORRECTED 도 허용(확인은 됐고 값만 정정된 상태 — 미확인이
// 아니다). getConfirmedLifeEvent(life-event.ts) 와 같은 이유로 함께 넓힘 —
// 그쪽에서 CORRECTED 이벤트가 화면에 뜨는데 여기서 막히면 저장이 깨진다.
async function requireConfirmedEvent(userId: string, lifeEventId: string) {
  return prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
  });
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

export type EpisodeTurn = { role: "assistant" | "user"; text: string };

export type ContinueEpisodeResult =
  // P10-2 — capped: MAX_FOLLOWUPS 에 도달해 end 가 모델 판단과 무관하게
  // 강제로 true 가 된 턴인지. 강제로 끝난 턴은 프롬프트 지시에도 불구하고
  // 모델이 새 질문을 던지는 경우가 있어(관찰됨), 호출부가 곧장
  // finishEpisodeChat 으로 넘어가면 그 질문에 대한 답이 유실된다 — 호출부가
  // capped 일 때 한 턴 더 기다리도록 구분해서 넘긴다.
  | { ok: true; reply: string; end: boolean; capped: boolean }
  | { ok: false; error: string };

// P8-1 — period(구간) 대화는 특정 LifeEvent "그 자체"가 아니라 그 이벤트
// "이후"가 주제라, 앵커 이벤트 자신의 label/year 를 그대로 쓰면 topic 이
// 어긋난다(예: 주제가 "결혼 이후" 인데 시스템 프롬프트엔 "결혼"만 뜸).
// topicOverride 로 호출자(ChatV3Client)가 정확한 주제 문구를 넘긴다 —
// 안 넘기면 기존처럼 이벤트 자신의 label/year 그대로.
export type EpisodeTopic = { label: string; year: number | null };

// history 는 이 이벤트에 대해 실제로 오간 턴만(오프닝 템플릿 질문은 제외 —
// 클라가 시스템 프롬프트로 이미 주제를 알고 있어 굳이 필요 없음).
export async function continueEpisodeChat(
  lifeEventId: string,
  history: EpisodeTurn[],
  followUpCount: number,
  topicOverride?: EpisodeTopic,
): Promise<ContinueEpisodeResult> {
  const userId = await requireUserId();
  const event = await requireConfirmedEvent(userId, lifeEventId);
  if (!event) return { ok: false, error: "이야기를 찾을 수 없어요." };

  const label = topicOverride?.label ?? event.correctedLabel ?? event.label;
  const year = topicOverride ? topicOverride.year : (event.correctedYear ?? event.year);
  const isLastTurn = followUpCount + 1 >= MAX_FOLLOWUPS;

  const system = buildEpisodeChatSystemPrompt({
    label,
    year,
    followUpCount,
    maxFollowUps: MAX_FOLLOWUPS,
  });

  let reply = "네, 잘 들었어요. 소중한 이야기 들려주셔서 고마워요.";
  let end = isLastTurn;

  try {
    const res = await chat(
      history.map((t) => ({ role: t.role, content: t.text })),
      { system, model: CHAT_MODEL, maxTokens: 400, temperature: 0.6 },
    );
    const parsed = JSON.parse(stripJsonFence(res.text)) as {
      reply?: unknown;
      end?: unknown;
    };
    if (typeof parsed.reply === "string" && parsed.reply.trim()) {
      reply = parsed.reply.trim();
    }
    if (typeof parsed.end === "boolean") {
      end = end || parsed.end;
    }
  } catch {
    // 파싱/호출 실패 — 존엄 원칙상 에러를 노출하지 않고 부드럽게 마무리.
    end = true;
  }

  return { ok: true, reply, end, capped: isLastTurn };
}

export type FinishEpisodeResult =
  | { ok: true; memoryId: string }
  | { ok: false; error: string };

// 대화 전체(오프닝 포함, transcriptHistory)를 요약해 Episode.content +
// UserMemory 를 함께 만들고 LifeEvent.hasEpisode=true 로 갱신.
export async function finishEpisodeChat(
  lifeEventId: string,
  transcriptHistory: EpisodeTurn[],
  personId?: string,
  topicOverride?: EpisodeTopic,
): Promise<FinishEpisodeResult> {
  const userId = await requireUserId();
  const event = await requireConfirmedEvent(userId, lifeEventId);
  if (!event) return { ok: false, error: "이야기를 찾을 수 없어요." };

  const label = topicOverride?.label ?? event.correctedLabel ?? event.label;
  const year = topicOverride ? topicOverride.year : (event.correctedYear ?? event.year);

  // v3 P6 — personId 는 클라가 넘긴 값이라 소유 검증 후에만 신뢰(남의 Person
  // 을 태깅하는 것 방지). 소유가 아니면 조용히 무시(일반 에피소드로 저장).
  // P11-2 — 이름·관계도 함께 읽어 요약 입력 머리에 붙인다. 인물 모드
  // 답변("정영식이라는 선임이…")은 에피소드 대화 밖이라 요약 모델이 관계를
  // 모른 채 이름만 반말로 쓰던 원인.
  let ownedPersonId: string | undefined;
  let personLine = "";
  if (personId) {
    const person = await prisma.person.findFirst({
      where: { id: personId, userId },
      select: { id: true, name: true, relation: true },
    });
    if (person) {
      ownedPersonId = person.id;
      personLine = `[이 이야기의 인물] ${person.name}${person.relation ? ` (관계: ${person.relation})` : ""}\n`;
    }
  }

  const transcript =
    personLine +
    transcriptHistory
      .map((t) => `[${t.role === "assistant" ? "동반자" : "본인"}] ${t.text}`)
      .join("\n");

  // 요약 실패 폴백 — 본인 발화만 이어붙여서라도 저장은 막지 않는다.
  let content = transcriptHistory
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ")
    .trim();

  try {
    const res = await chat(
      [{ role: "user", content: transcript }],
      {
        system: EPISODE_SUMMARY_SYSTEM_PROMPT,
        model: CHAT_MODEL,
        maxTokens: 500,
        temperature: 0.35,
      },
    );
    const cleaned = res.text.trim();
    if (cleaned) content = cleaned;
  } catch {
    // 폴백 content 유지.
  }

  if (!content) {
    return { ok: false, error: "저장할 이야기가 없어요." };
  }

  // P9-1 — topicOverride 는 period(구간) 대화에서만 넘어온다(ChatV3Client
  // periodTopicRef). 그 존재 여부로 isPeriod 를 판단 — 별도 플래그를 클라
  // 에서 다시 스레딩할 필요가 없다.
  const isPeriod = topicOverride !== undefined;

  try {
    const result = await createEpisodeBridge(
      userId,
      lifeEventId,
      label,
      year,
      content,
      transcript,
      ownedPersonId,
      isPeriod,
    );
    if (!result) return { ok: false, error: "이야기를 찾을 수 없어요." };
    return { ok: true, memoryId: result.memoryId };
  } catch (e) {
    console.error("[episode-finish]", e);
    return { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export async function saveEpisodePlaces(
  memoryId: string,
  places: PlaceInfo[],
): Promise<boolean> {
  const userId = await requireUserId();
  return saveEpisodePlacesDb(userId, memoryId, places);
}
