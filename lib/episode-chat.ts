// STAGE4 — 에피소드 심화 대화(질문/마무리 판단). 순수 모듈(auth 없음) — 오늘의 인터뷰(lib/interview/session.ts)가
// userId 로 직접 부른다. 대화 자체는 턴마다 DB 에 쓰지 않는다(클라가 history 배열을 들고 있음).
// 2026-11-03 — 옛 온보딩 이야기 대화(/onboarding-episode-chat)의 마무리 저장 finishEpisodeChatCore(요약 + 인물 추출)
// 삭제. 지금 이야기 저장은 제안 카드(lib/node-proposal createFromCard → lib/episode createEpisodeBridge).
//
// 존엄 원칙은 프롬프트(lib/prompts/episode-chat)에 규칙으로 박혀 있고,
// 여기서는 MAX_FOLLOWUPS 하드캡으로 한 번 더 지킨다 — 모델이 스스로
// end:true 를 안 줘도 정해진 턴 수를 넘기지 않는다.

import { prisma } from "./db";
import { chat } from "./ai";
import { buildEpisodeChatSystemPrompt } from "./prompts/episode-chat";

// 추출/분류와 같은 이유로 Sonnet 고정 — 전역 aiModel(라이브 응답)과 무관.
const CHAT_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const MAX_FOLLOWUPS = 2;

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
export async function continueEpisodeChatCore(
  userId: string,
  lifeEventId: string,
  history: EpisodeTurn[],
  followUpCount: number,
  topicOverride?: EpisodeTopic,
): Promise<ContinueEpisodeResult> {
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
