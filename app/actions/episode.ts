"use server";

// STAGE4 — 에피소드 심화 대화 + 저장. v3 P19-1/P19-3 — 삭제/정정도 이 파일에
// 함께 둔다(Episode 도메인 액션).
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
import {
  createEpisodeBridge,
  deleteEpisode as deleteEpisodeCore,
  saveEpisodePlaces as saveEpisodePlacesDb,
  updateEpisodeContent as updateEpisodeContentCore,
  type DeleteEpisodeResult,
  type UpdateEpisodeContentResult,
} from "@/lib/episode";
import { isSummaryGuidance } from "@/lib/episode-text";
import { savePeopleMentionedInEpisode } from "@/lib/person-chat";
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
  const rawUserText = transcriptHistory
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ")
    .trim();

  // P14-1 — 본인 발화가 한 턴도 없으면 요약 모델을 부르지 않는다. 부르면
  // "이 대화에는 실제 이야기 내용이 없어…" 같은 판정문이 그대로 저장된다.
  if (!rawUserText) {
    return { ok: false, error: "저장할 이야기가 없어요." };
  }

  // P14-1(2) — 요약 결과가 2인칭 안내문("더 들려주세요", "정리해
  // 드리겠습니다")이면 저장을 거부한다. 1회 재시도(더 강한 지시) 후에도
  // 안내문이면 본인 발화 원문 폴백으로 저장 — 어떤 경우에도 안내문이
  // Episode.content 에 들어가면 안 된다.
  let content = rawUserText;
  const attempts = [
    transcript,
    `${transcript}\n\n[지시] 위 대화의 본인 발화를 "-다"체 서술문으로만 바꿔 출력하세요. 사용자에게 말을 걸거나 내용이 부족하다고 쓰지 마세요.`,
  ];
  for (const input of attempts) {
    try {
      const res = await chat(
        [{ role: "user", content: input }],
        {
          system: EPISODE_SUMMARY_SYSTEM_PROMPT,
          model: CHAT_MODEL,
          maxTokens: 500,
          temperature: 0.35,
        },
      );
      const cleaned = res.text.trim();
      if (!cleaned) continue;
      if (isSummaryGuidance(cleaned)) {
        console.warn("[episode-finish] summary guidance rejected:", cleaned.slice(0, 80));
        continue;
      }
      content = cleaned;
      break;
    } catch {
      // 폴백 content 유지.
    }
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
    if (!result) {
      // v3 P22-1 — "화면엔 성공 멘트가 떴는데 DB 엔 없다"는 실측(test30)의
      // 원인을 Vercel 함수 로그로 사후 추적할 수 있도록 최소 로그. 이 분기는
      // requireConfirmedEvent 를 이미 통과한 뒤라 거의 도달 안 하지만(방어적
      // 재확인), 도달하면 반드시 흔적을 남긴다.
      console.error("[episode-finish] createEpisodeBridge returned null", { userId, lifeEventId });
      return { ok: false, error: "이야기를 찾을 수 없어요." };
    }
    console.log("[episode-finish] saved", {
      userId,
      lifeEventId,
      episodeId: result.episodeId,
      memoryId: result.memoryId,
      isPeriod,
    });
    // P12-2 — 대화 중 언급된 새 인물(이름 있는 사람만)을 함께 저장·연결.
    // 저장이 성공한 뒤에만(이야기 없이 인물만 남지 않게), best-effort —
    // 추출이 실패해도 방금 저장한 이야기 결과는 그대로 돌려준다.
    try {
      const question =
        transcriptHistory[0]?.role === "assistant"
          ? transcriptHistory[0].text
          : `${label} 이야기`;
      const userText = transcriptHistory
        .filter((t) => t.role === "user")
        .map((t) => t.text)
        .join("\n");
      await savePeopleMentionedInEpisode(userId, lifeEventId, question, userText);
    } catch (e) {
      console.error("[episode-finish] people", e);
    }
    return { ok: true, memoryId: result.memoryId };
  } catch (e) {
    console.error("[episode-finish] failed", { userId, lifeEventId }, e);
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

// v3 P19-1 — /story-review 카드에서 이야기 지우기.
//
// P20-1 — revalidatePath("/story-review") 를 여기 두면, 호출자(/story-review
// 자신)가 Server Action 응답에 최신 RSC 페이로드를 함께 실어 보내려고 그
// 자리에서 getStoryReviewData+detectGaps(무거운 재계산)를 통째로 다시
// 돌린다. 호출부(EpisodeCard)가 성공 후 router.refresh() 로 이미 같은
// 갱신을 별도 요청으로 하고 있어(=v2 컴포넌트 무수정 정책과 무관하게 v3
// 자체 컴포넌트) 실질적으로 매 클릭마다 같은 무거운 쿼리를 두 번 태우고
// 있었다 — Vercel 함수 응답이 그 안에서 타임아웃/503 나면 "DB 는 반영됐는데
// 화면엔 안 보이는" 상태로 남는다(P20 재현). /story-review 는 auth() 로
// 이미 항상 동적 렌더(정적 캐시 대상 아님)라 revalidatePath 는 여기서
// 실질적 이점 없이 비용만 더한다 — 제거하고 router.refresh() 단독으로 맡긴다.
export async function deleteEpisodeAction(episodeId: string): Promise<DeleteEpisodeResult> {
  const userId = await requireUserId();
  const result = await deleteEpisodeCore(userId, episodeId);
  // v3 P22-1 — "이야기가 사라졌는데 원인이 유실인지 삭제인지" 를 다음엔
  // Vercel 함수 로그로 구분할 수 있도록(이번엔 삭제 이력을 남길 방법이
  // 없어 대조 불가했다).
  console.log("[episode-delete]", { userId, episodeId, ok: result.ok });
  return result;
}

// v3 P19-3 — /story-review 카드에서 이야기 고치기. P20-1 이유로 revalidatePath
// 없음(위 deleteEpisodeAction 주석 참조).
export async function updateEpisodeContentAction(
  episodeId: string,
  content: string,
): Promise<UpdateEpisodeContentResult> {
  const userId = await requireUserId();
  return updateEpisodeContentCore(userId, episodeId, content);
}
