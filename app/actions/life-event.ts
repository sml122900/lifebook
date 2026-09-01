"use server";

// 인생 이벤트 골격 확인질문 흐름.
//
// 한 턴에 이벤트 1개만 확인질문(getNextConfirmQuestion) → 사용자 응답 분류·반영
// (submitConfirmAnswer). 모든 읽기/쓰기는 세션 userId 로 scope(다른 사용자의
// LifeEvent 접근 차단).
//
// UNCLEAR 무한루프 방지: required(optional=false) 이벤트가 MAX_UNCLEAR_ATTEMPTS
// 회 연속 UNCLEAR 로 분류되면 status 는 그대로 두고 needsReview 플래그만 세운다
// (LifeEvent.unclearCount/needsReview). getNextConfirmQuestion 은 needsReview
// 인 이벤트를 다음 질문 대상에서 제외한다 — 사람 개입 전까지 재질문 안 함.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import {
  CONFIRM_QUESTION_SYSTEM_PROMPT,
  CORRECTION_PARSE_SYSTEM_PROMPT,
} from "@/lib/prompts/life-event-confirm";
import { withJosa } from "@/lib/josa";
import {
  listConfirmedLifeEvents as listConfirmedLifeEventsCore,
  getConfirmedLifeEvent as getConfirmedLifeEventCore,
  type ConfirmedEpisodeItem,
} from "@/lib/life-event-query";
export type { ConfirmedEpisodeItem } from "@/lib/life-event-query";

// 추출/분류는 항상 Sonnet 고정 — 전역 aiModel(라이브 응답)과 무관.
const CONFIRM_MODEL =
  process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";

const MAX_UNCLEAR_ATTEMPTS = 2;

async function requireUserId(expected?: string): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  if (expected !== undefined && expected !== userId) {
    throw new Error("Unauthorized");
  }
  return userId;
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

export type NextConfirmQuestion =
  | { done: true }
  | { done: false; eventId: string; question: string };

type ConfirmQuestionTarget = {
  id: string;
  year: number | null;
  label: string;
  isOptional: boolean;
};

// getNextConfirmQuestion 과 getConfirmQuestionForEvent(P2 — 갭 카드에서 특정
// 이벤트를 직접 지정) 가 공유하는 질문 문구 생성. 순수 헬퍼(비export) — DB
// 접근 없음, chat() 호출만.
async function buildConfirmQuestionText(event: ConfirmQuestionTarget): Promise<string> {
  const eventDesc = [
    event.year ? `${event.year}년` : "연도 미상",
    event.label,
    event.isOptional ? "(선택 이벤트 — 안 했을 수도 있음)" : "(필수 이벤트)",
  ].join(" ");

  let question = event.isOptional
    ? `${event.label}${withJosa(event.label, "은/는")} 하셨나요?`
    : `${event.year ? `${event.year}년에 ` : ""}${event.label} 하셨나요?`;

  try {
    const res = await chat(
      [{ role: "user", content: `확인할 이벤트: ${eventDesc}\neventId: ${event.id}` }],
      { system: CONFIRM_QUESTION_SYSTEM_PROMPT, model: CONFIRM_MODEL, maxTokens: 300 },
    );
    const parsed = JSON.parse(stripJsonFence(res.text)) as {
      question?: unknown;
    };
    if (typeof parsed.question === "string" && parsed.question.trim()) {
      question = parsed.question.trim();
    }
  } catch {
    // 파싱 실패 시 위에서 만든 템플릿 질문으로 폴백 — 흐름이 끊기지 않는다.
  }

  return question;
}

// 다음 UNCONFIRMED 이벤트에 대한 확인질문. needsReview 된 이벤트는 건너뛴다.
// 대상이 없으면 { done: true }.
export async function getNextConfirmQuestion(
  userId: string,
): Promise<NextConfirmQuestion> {
  await requireUserId(userId);

  const event = await prisma.lifeEvent.findFirst({
    where: { userId, status: "UNCONFIRMED", needsReview: false },
    orderBy: { sequenceOrder: "asc" },
  });

  if (!event) return { done: true };

  const question = await buildConfirmQuestionText(event);
  return { done: false, eventId: event.id, question };
}

// P2 — 갭 카드에서 사용자가 특정 이벤트를 직접 골라 다시 묻는 경로.
// getNextConfirmQuestion 과 달리 needsReview 도 대상으로 허용한다(사용자가
// 명시적으로 골랐으니 자동 스킵 가드가 필요 없음). status 가 이미
// CONFIRMED/CORRECTED/SKIPPED 면 대상 아님 — { done: true }.
export async function getConfirmQuestionForEvent(
  userId: string,
  eventId: string,
): Promise<NextConfirmQuestion> {
  await requireUserId(userId);

  const event = await prisma.lifeEvent.findFirst({
    where: { id: eventId, userId, status: "UNCONFIRMED" },
  });
  if (!event) return { done: true };

  const question = await buildConfirmQuestionText(event);
  return { done: false, eventId: event.id, question };
}

export type SubmitAnswerResult =
  | { status: "NOT_FOUND" }
  | { status: "CONFIRMED" }
  | { status: "SKIPPED" }
  | { status: "CORRECTED"; correctedYear: number | null; correctedLabel: string | null }
  | { status: "UNCLEAR"; needsReview: boolean };

// 사용자 응답을 분류해 LifeEvent 에 반영.
export async function submitConfirmAnswer(
  eventId: string,
  userAnswer: string,
): Promise<SubmitAnswerResult> {
  const userId = await requireUserId();

  const event = await prisma.lifeEvent.findFirst({
    where: { id: eventId, userId },
  });
  if (!event) return { status: "NOT_FOUND" };

  const eventDesc = [
    event.year ? `${event.year}년` : "연도 미상",
    event.label,
  ].join(" ");

  let parsed: {
    status: "CONFIRMED" | "SKIPPED" | "CORRECTED" | "UNCLEAR";
    correctedYear: number | null;
    correctedLabel: string | null;
  } = { status: "UNCLEAR", correctedYear: null, correctedLabel: null };

  try {
    const res = await chat(
      [
        {
          role: "user",
          content: `이벤트: ${eventDesc}\n사용자 응답: "${userAnswer}"`,
        },
      ],
      { system: CORRECTION_PARSE_SYSTEM_PROMPT, model: CONFIRM_MODEL, maxTokens: 300 },
    );
    const raw = JSON.parse(stripJsonFence(res.text)) as Record<string, unknown>;
    const status = raw.status;
    if (
      status === "CONFIRMED" ||
      status === "SKIPPED" ||
      status === "CORRECTED" ||
      status === "UNCLEAR"
    ) {
      parsed = {
        status,
        correctedYear: typeof raw.correctedYear === "number" ? raw.correctedYear : null,
        correctedLabel:
          typeof raw.correctedLabel === "string" && raw.correctedLabel.trim()
            ? raw.correctedLabel.trim()
            : null,
      };
    }
  } catch {
    // 파싱 실패 → UNCLEAR 기본값 유지, 재질문.
  }

  // required 이벤트에 대한 SKIPPED 는 허용 안 함 — UNCLEAR 로 강제 재질문.
  let status = parsed.status;
  if (status === "SKIPPED" && !event.isOptional) {
    status = "UNCLEAR";
  }

  if (status === "CONFIRMED") {
    await prisma.lifeEvent.update({
      where: { id: eventId },
      data: { status: "CONFIRMED", confirmedAt: new Date(), unclearCount: 0 },
    });
    return { status: "CONFIRMED" };
  }

  if (status === "SKIPPED") {
    await prisma.lifeEvent.update({
      where: { id: eventId },
      data: { status: "SKIPPED", unclearCount: 0 },
    });
    return { status: "SKIPPED" };
  }

  if (status === "CORRECTED") {
    await prisma.lifeEvent.update({
      where: { id: eventId },
      data: {
        status: "CORRECTED",
        // 원본 year 는 보존 — correctedYear/correctedLabel 별도 컬럼에만 반영.
        correctedYear: parsed.correctedYear,
        correctedLabel: parsed.correctedLabel,
        unclearCount: 0,
      },
    });

    // 연도 정정이 뒤 이벤트들의 "추정" year 에 반영되게 delta 를 전파한다.
    // generateSkeleton(app/actions/onboarding.ts) 이 만든 오프셋들은 전부
    // birthYear 기준 고정값이므로, 한 이벤트의 실제-예상 차이를 뒤쪽
    // UNCONFIRMED 이벤트 전원에게 그대로 더하면 원래 오프셋 간격이 보존된다.
    // 이미 CONFIRMED/CORRECTED/SKIPPED 된 이벤트는 건드리지 않는다(where 의
    // status: "UNCONFIRMED" 가 자연히 걸러줌). year=null(첫 직장·결혼처럼
    // 추정치 자체가 없는 이벤트)도 건드릴 게 없어 제외.
    if (parsed.correctedYear !== null && event.year !== null) {
      const delta = parsed.correctedYear - event.year;
      if (delta !== 0) {
        await prisma.lifeEvent.updateMany({
          where: {
            userId,
            sequenceOrder: { gt: event.sequenceOrder },
            status: "UNCONFIRMED",
            year: { not: null },
          },
          data: { year: { increment: delta } },
        });
      }
    }

    return {
      status: "CORRECTED",
      correctedYear: parsed.correctedYear,
      correctedLabel: parsed.correctedLabel,
    };
  }

  // UNCLEAR (직접 분류 또는 required-SKIPPED 강제 전환)
  const unclearCount = event.unclearCount + 1;
  const needsReview = !event.isOptional && unclearCount >= MAX_UNCLEAR_ATTEMPTS;

  await prisma.lifeEvent.update({
    where: { id: eventId },
    data: { unclearCount, needsReview },
  });

  return { status: "UNCLEAR", needsReview };
}

// STAGE3/STAGE4 — 실제 로직은 lib/life-event-query.ts(순수, auth 없음).
// 검증 스크립트가 재현본 아닌 이 함수를 그대로 호출할 수 있도록 분리했다
// (lib/account-deletion.ts·lib/person-chat.ts 와 같은 패턴, 2026-09-01).
// v2(/onboarding-episode, /onboarding-episode-chat)도 이 액션을 그대로
// 쓰므로, lib 쪽에서 CONFIRMED 뿐 아니라 CORRECTED 도 포함하게 넓힌 효과가
// v2 화면에도 그대로 적용된다(의도된 것 — CORRECTED 는 확인은 됐고 값만
// 정정된 상태라 미확인이 아니다).
export async function listConfirmedLifeEvents(
  userId: string,
): Promise<ConfirmedEpisodeItem[]> {
  await requireUserId(userId);
  return listConfirmedLifeEventsCore(userId);
}

export async function getConfirmedLifeEvent(
  userId: string,
  eventId: string,
): Promise<ConfirmedEpisodeItem | null> {
  await requireUserId(userId);
  return getConfirmedLifeEventCore(userId, eventId);
}
