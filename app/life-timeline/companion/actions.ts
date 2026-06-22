"use server";

// 동반자 세션 종료 → transcript + audio 저장 + 사건/인물 추출(DRAFT).
//
// 흐름:
//   Phase 1: CompanionSession 생성 + transcript 원본 UserMemory 저장 (필수)
//   Phase 2: splitRecordingTranscript → draft life_event N개 (실패 무시)
//   Phase 3: extractPeopleFromTranscript → draft Person M개 (실패 무시)
//
// Phase 1 이 성공하면 ok:true 반환. Phase 2·3 실패는 draftMemoryCount/draftPeopleCount=0.
// transcript+audio 는 Phase 1 실패 시에만 ok:false.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { splitRecordingTranscript } from "@/lib/free-recording-split";
import {
  historyToTranscript,
  transcriptToSplitText,
  extractPeopleFromTranscript,
} from "@/lib/companion-extraction";

type ChatMessage = { role: "user" | "assistant"; content: string };

const VALID_CATEGORIES = new Set([
  "BIRTH", "KINDERGARTEN", "ELEMENTARY", "MIDDLE", "HIGH",
  "UNIVERSITY", "MILITARY", "WORK", "RELATIONSHIP", "FAMILY",
]);

export async function saveCompanionSessionAction(input: {
  history: ChatMessage[];
  audioPaths: string[];
}): Promise<{
  ok: boolean;
  sessionId?: string;
  draftMemoryCount?: number;
  draftPeopleCount?: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const userId = session.user.id;

  // birthYear 는 split 추론용. 서버에서 직접 조회.
  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { birthYear: true },
  });
  const birthYear = userRow?.birthYear ?? null;

  const transcriptMessages = historyToTranscript(input.history);
  const transcriptJson = JSON.stringify(transcriptMessages);
  const splitText = transcriptToSplitText(transcriptMessages);

  const nowKst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentYear = nowKst.getUTCFullYear();

  // ── Phase 1: 저장 (실패 시 ok:false) ─────────────────────────────────

  let sessionId: string;
  let parentMemoryId: string;

  try {
    const [cSession, parentMemory] = await prisma.$transaction([
      prisma.companionSession.create({
        data: { userId, transcriptJson, audioPaths: input.audioPaths },
        select: { id: true },
      }),
      // 트랜잭션 안에서는 ID 예측 불가 → companionSessionId 는 이후 업데이트
      prisma.userMemory.create({
        data: {
          userId,
          year: currentYear,
          title: "동반자 대화",
          content: splitText.slice(0, 10000) || null,
          createdVia: "companion",
          isDraft: false, // 원본 transcript 는 항상 live
        },
        select: { id: true },
      }),
    ]);

    sessionId = cSession.id;
    parentMemoryId = parentMemory.id;

    // 원본 메모리에 companionSessionId 역참조 연결
    await prisma.userMemory.update({
      where: { id: parentMemoryId },
      data: { companionSessionId: sessionId },
    });
  } catch (e) {
    console.error("[companion/save] phase-1 failed", e instanceof Error ? e.message : e);
    return { ok: false, error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." };
  }

  // ── Phase 2: 사건 분할 → draft life_event ────────────────────────────

  let draftMemoryCount = 0;
  try {
    const splitResult = await splitRecordingTranscript(splitText, "동반자 대화", birthYear);

    for (const seg of splitResult.segments.slice(0, 10)) {
      const eventYear = typeof seg.estimatedYear === "number" ? seg.estimatedYear : null;
      const eventMonth = typeof seg.estimatedMonth === "number" ? seg.estimatedMonth : null;
      const category =
        typeof seg.category === "string" && VALID_CATEGORIES.has(seg.category)
          ? seg.category
          : null;

      await prisma.userMemory.create({
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
          parentMemoryId,
          companionSessionId: sessionId,
          isDraft: true, // ★ 검토 전까지 타임라인 미노출
        },
      });
      draftMemoryCount++;
    }
  } catch (e) {
    console.error("[companion/save] phase-2 split failed", e instanceof Error ? e.message : e);
    // Phase 1 이미 성공 — 계속 진행
  }

  // ── Phase 3: 인물 추출 → draft Person ────────────────────────────────

  let draftPeopleCount = 0;
  try {
    const people = await extractPeopleFromTranscript(splitText);

    for (const p of people.slice(0, 20)) {
      await prisma.person.create({
        data: {
          userId,
          name: p.name,
          relation: p.relation ?? null,
          memo: p.memo ?? null,
          subjectType: "person",
          companionSessionId: sessionId,
          isDraft: true, // ★ 검토 전까지 인물 목록 미노출
        },
      });
      draftPeopleCount++;
    }
  } catch (e) {
    console.error("[companion/save] phase-3 people failed", e instanceof Error ? e.message : e);
  }

  revalidatePath("/life-timeline/manage");
  revalidatePath("/life-timeline");

  return { ok: true, sessionId, draftMemoryCount, draftPeopleCount };
}
