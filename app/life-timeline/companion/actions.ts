"use server";

// 동반자 세션 종료 → transcript + audio 저장 + 사건/인물/장소/물건 추출(DRAFT).
//
// 흐름:
//   Phase 1: CompanionSession 생성 + transcript 원본 UserMemory 저장 (필수)
//   Phase 2: splitRecordingTranscript → draft life_event N개 (실패 무시)
//   Phase 3: extractPeopleFromTranscript → draft Person(person) M개 (실패 무시)
//   Phase 4: extractLocationsFromTranscript → draft Person(location) K개 (실패 무시)
//   Phase 5: extractThingsFromTranscript → draft Person(thing) L개 (실패 무시)
//
// Phase 1 이 성공하면 ok:true 반환. Phase 2~5 실패는 각 count=0.
// transcript+audio 는 Phase 1 실패 시에만 ok:false.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { splitRecordingTranscript } from "@/lib/free-recording-split";
import {
  historyToTranscript,
  transcriptToSplitText,
  extractPeopleFromTranscript,
  extractLocationsFromTranscript,
  extractThingsFromTranscript,
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
  draftLocationCount?: number;
  draftThingCount?: number;
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

  // ── Phase 3~5: 인물·장소·물건 추출 병렬 ─────────────────────────────
  // 셋 모두 같은 splitText 입력, 독립적 → Promise.all

  let draftPeopleCount = 0;
  let draftLocationCount = 0;
  let draftThingCount = 0;

  const [peopleResult, locationsResult, thingsResult] = await Promise.allSettled([
    extractPeopleFromTranscript(splitText),
    extractLocationsFromTranscript(splitText),
    extractThingsFromTranscript(splitText),
  ]);

  // Phase 3: 인물
  if (peopleResult.status === "fulfilled") {
    for (const p of peopleResult.value.slice(0, 20)) {
      try {
        await prisma.person.create({
          data: {
            userId,
            name: p.name,
            relation: p.relation ?? null,
            memo: p.memo ?? null,
            subjectType: "person",
            companionSessionId: sessionId,
            isDraft: true,
          },
        });
        draftPeopleCount++;
      } catch (e) {
        console.error("[companion/save] phase-3 person row", e instanceof Error ? e.message : e);
      }
    }
  } else {
    console.error("[companion/save] phase-3 people failed", peopleResult.reason);
  }

  // Phase 4: 장소
  if (locationsResult.status === "fulfilled") {
    for (const l of locationsResult.value.slice(0, 10)) {
      try {
        await prisma.person.create({
          data: {
            userId,
            name: l.name,
            memo: l.memo ?? null,
            subjectType: "location",
            companionSessionId: sessionId,
            isDraft: true,
          },
        });
        draftLocationCount++;
      } catch (e) {
        console.error("[companion/save] phase-4 location row", e instanceof Error ? e.message : e);
      }
    }
  } else {
    console.error("[companion/save] phase-4 locations failed", locationsResult.reason);
  }

  // Phase 5: 물건
  if (thingsResult.status === "fulfilled") {
    for (const t of thingsResult.value.slice(0, 10)) {
      try {
        await prisma.person.create({
          data: {
            userId,
            name: t.name,
            memo: t.memo ?? null,
            subjectType: "thing",
            companionSessionId: sessionId,
            isDraft: true,
          },
        });
        draftThingCount++;
      } catch (e) {
        console.error("[companion/save] phase-5 thing row", e instanceof Error ? e.message : e);
      }
    }
  } else {
    console.error("[companion/save] phase-5 things failed", thingsResult.reason);
  }

  revalidatePath("/life-timeline/manage");
  revalidatePath("/life-timeline");

  return { ok: true, sessionId, draftMemoryCount, draftPeopleCount, draftLocationCount, draftThingCount };
}
