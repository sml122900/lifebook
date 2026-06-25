"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  splitRecordingTranscript,
  type SplitSegment,
} from "@/lib/free-recording-split";
import { resolveBirthYear } from "@/lib/life-events";
import { addExtractedPreferences } from "@/lib/poster/preferences";
import { STT_TOKEN_CHARGING_ENABLED, calcSttTokens } from "@/lib/stt-cost";
import { getBalance } from "@/lib/tokens/wallet";

// Phase 10 — 통녹음 결과 저장.
// UserMemory(createdVia="free_recording") 신규 행 생성.
// year 는 현재 연도(KST)를 기본값으로 사용 — 사용자가 이야기한 시기는
// content 안에 자연어로 포함되어 있음(Phase 2 에서 분리 예정).

// 전사 시작 전 잔액 확인 + 예상 토큰 계산.
// 과금 플래그 OFF 이면 sufficient=true 로 즉시 반환 (차감 없음).
export async function checkSttBalanceAction(durationSec: number): Promise<{
  chargingEnabled: boolean;
  needed: number;
  balance: number;
  sufficient: boolean;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { chargingEnabled: false, needed: 0, balance: 0, sufficient: false };
  }

  if (!STT_TOKEN_CHARGING_ENABLED) {
    return { chargingEnabled: false, needed: 0, balance: 0, sufficient: true };
  }

  const needed = calcSttTokens(durationSec);
  const balance = await getBalance(session.user.id);
  return { chargingEnabled: true, needed, balance, sufficient: balance >= needed };
}

export async function saveFreeRecordingAction(input: {
  audioPath: string;
  transcript: string;
  refined: string;         // Claude 정리본 (사용자가 수정 가능)
  topicTitle: string;      // 물꼬 제목 (title 미러링)
}): Promise<{ ok: boolean; memoryId?: string; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const userId = session.user.id;
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const year = nowKst.getUTCFullYear();

  try {
    const memory = await prisma.userMemory.create({
      data: {
        userId,
        year,
        title: input.topicTitle.slice(0, 200),
        content: input.transcript.trim() || null,
        refinedText: input.refined.trim() || null,
        displayRefined: input.refined.trim() !== "" && input.refined.trim() !== input.transcript.trim(),
        audioPath: input.audioPath,
        createdVia: "free_recording",
      },
      select: { id: true },
    });

    revalidatePath("/life-timeline");
    return { ok: true, memoryId: memory.id };
  } catch (e) {
    console.error("[saveFreeRecording]", e);
    return { ok: false, error: "저장에 실패했어요. 다시 시도해 주세요." };
  }
}

// Phase 10 Phase 2 — 전사 텍스트를 Claude 로 시간순 사건 조각으로 분할.
// 별도 토큰 차감 없음(STT 분당 요금에 포함).
export async function splitTranscriptAction(input: {
  transcript: string;
  topicTitle: string;
  birthYear: number | null;
}): Promise<{ ok: boolean; segments?: SplitSegment[]; nextTopics?: string[]; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  try {
    // S5 — 클라가 birthYear 를 안 보냈으면 컬럼/ BIRTH 이벤트서 파생.
    const birthYear = input.birthYear ?? (await resolveBirthYear(session.user.id));
    const result = await splitRecordingTranscript(
      input.transcript,
      input.topicTitle,
      birthYear,
    );
    // P5-5a — 추출 취향(맞춤배경용) 누적 저장. 실패는 무시(부가 작업).
    await addExtractedPreferences(session.user.id, result.preferences).catch(() => {});
    return { ok: true, segments: result.segments, nextTopics: result.nextTopics };
  } catch (e) {
    console.error("[splitTranscript]", e instanceof Error ? e.message : e);
    return { ok: false, error: "분할에 실패했어요." };
  }
}

// Phase 10 Phase 2 — 분할 세그먼트 저장.
// 원본 free_recording 1행 + N개 life_event 세그먼트를 한 트랜잭션으로 저장.
export async function saveFreeRecordingSegments(input: {
  audioPath: string;
  transcript: string;
  topicTitle: string;
  segments: Omit<SplitSegment, never>[];
}): Promise<{ ok: boolean; parentId?: string; count?: number; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const userId = session.user.id;
  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentYear = nowKst.getUTCFullYear();

  const VALID_CATEGORIES = new Set([
    "BIRTH", "KINDERGARTEN", "ELEMENTARY", "MIDDLE", "HIGH",
    "UNIVERSITY", "MILITARY", "WORK", "RELATIONSHIP", "FAMILY",
  ]);

  let savedParentId = "";
  let savedCount = 0;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. 원본 free_recording 저장 (audioPath 보관, 세그먼트의 부모)
      const parent = await tx.userMemory.create({
        data: {
          userId,
          year: currentYear,
          title: input.topicTitle.slice(0, 200),
          content: input.transcript.trim() || null,
          audioPath: input.audioPath,
          createdVia: "free_recording",
        },
        select: { id: true },
      });
      savedParentId = parent.id;

      // 2. 각 세그먼트를 life_event 로 저장 (최대 10개)
      for (const seg of input.segments.slice(0, 10)) {
        const eventYear = typeof seg.estimatedYear === "number" ? seg.estimatedYear : null;
        const eventMonth = typeof seg.estimatedMonth === "number" ? seg.estimatedMonth : null;
        const category =
          typeof seg.category === "string" && VALID_CATEGORIES.has(seg.category)
            ? seg.category
            : null;

        await tx.userMemory.create({
          data: {
            userId,
            year: eventYear ?? currentYear,
            month: eventMonth,
            title: seg.title.slice(0, 200),
            content: seg.content.trim() || null,
            eventTitle: seg.title.slice(0, 200),
            eventYear,
            eventMonth,
            precision: seg.precision === "EXACT" ? "EXACT" : "APPROXIMATE",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            category: category as any,
            createdVia: "life_event",
            parentMemoryId: parent.id,
          },
        });
        savedCount++;
      }
    });

    revalidatePath("/life-timeline");
    revalidatePath("/manage");
    return { ok: true, parentId: savedParentId, count: savedCount };
  } catch (e) {
    console.error("[saveFreeRecordingSegments]", e instanceof Error ? e.message : e);
    return { ok: false, error: "저장에 실패했어요. 다시 시도해 주세요." };
  }
}
