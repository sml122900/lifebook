"use server";

// P2 — 포스터 선택/분류/정정 서버 액션.
//
//   loadPosterEditor      : P1 후보(AI 분류) + 저장된 Poster.selections 로드
//   savePosterSelections  : 사용자 확정 선택을 Poster 에 upsert
//   previewPosterSentence : P3 refineForPoster 로 노드/메모 문장 미리보기
//   updatePosterEventText : 사건 제목/내용 인라인 정정(life_event 원본 수정)
//
// 후보(P1)는 임시(매번 AI). 확정 선택만 Poster.selections 에 영속(P4 합성이 읽음).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import {
  selectPosterCandidates,
  type PosterCandidate,
  type PosterCandidateInput,
} from "@/lib/poster/poster-candidates";
import { refineForPoster } from "@/lib/poster/poster-sentences";

// 메모는 포스터 좌우 컬럼 슬롯(좌10+우10=20)이라 상한이 있다. 노드는 강을
// 따라 linspace 배치라 개수 유연(별도 상한 없음).
export const MAX_MEMO_ITEMS = 20;

export type PosterSelectionItem = {
  eventId: string;
  type: "node" | "memo";
  order: number;
};

export type PosterEditorData = {
  candidates: PosterCandidate[];
  savedSelections: PosterSelectionItem[];
};

// life_event → 후보 입력. era_event·photo 제외(나무는 본인 골격만).
function toCandidateInputs(
  events: Awaited<ReturnType<typeof getLifeEvents>>,
): PosterCandidateInput[] {
  return events
    .filter((e) => e.kind === "life_event")
    .map((e) => ({
      eventId: e.id,
      year: e.eventYear,
      title: e.title,
      content: e.content,
      category: e.category,
    }));
}

function parseSavedSelections(raw: unknown): PosterSelectionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PosterSelectionItem[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.eventId !== "string") continue;
    const type = o.type === "memo" ? "memo" : "node";
    const order = typeof o.order === "number" ? o.order : 0;
    out.push({ eventId: o.eventId, type, order });
  }
  return out;
}

export async function loadPosterEditor(): Promise<PosterEditorData> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const events = await getLifeEvents(userId);
  const inputs = toCandidateInputs(events);

  const [candidates, poster] = await Promise.all([
    selectPosterCandidates(inputs),
    prisma.poster.findUnique({
      where: { userId },
      select: { selections: true },
    }),
  ]);

  // 저장된 선택은 현재 존재하는 life_event 만(삭제된 사건 잔재 제거).
  const validIds = new Set(inputs.map((i) => i.eventId));
  const savedSelections = parseSavedSelections(poster?.selections).filter((s) =>
    validIds.has(s.eventId),
  );

  return { candidates, savedSelections };
}

export type SaveResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function savePosterSelections(
  selections: PosterSelectionItem[],
): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  // 소유·존재 검증 — 본인 life_event id 만 허용.
  const owned = await prisma.userMemory.findMany({
    where: { userId, createdVia: "life_event", eventYear: { not: null } },
    select: { id: true },
  });
  const ownedIds = new Set(owned.map((o) => o.id));

  const clean: PosterSelectionItem[] = [];
  for (const s of selections) {
    if (!ownedIds.has(s.eventId)) continue;
    if (s.type !== "node" && s.type !== "memo") continue;
    clean.push({ eventId: s.eventId, type: s.type, order: s.order });
  }

  const memoCount = clean.filter((s) => s.type === "memo").length;
  if (memoCount > MAX_MEMO_ITEMS) {
    return {
      ok: false,
      error: `메모는 최대 ${MAX_MEMO_ITEMS}개까지 담을 수 있어요(노드는 제한 없어요).`,
    };
  }

  // order 재정렬(0..n) — 클라가 보낸 순서 보존하되 조밀하게.
  clean.sort((a, b) => a.order - b.order);
  clean.forEach((s, i) => (s.order = i));

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, selections: clean },
    update: { selections: clean },
  });

  revalidatePath("/poster/select");
  revalidatePath("/poster");
  return { ok: true, count: clean.length };
}

export type PreviewResult =
  | { ok: true; nodeLabel: string; memoText: string }
  | { ok: false; error: string };

export async function previewPosterSentence(
  eventId: string,
): Promise<PreviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const row = await prisma.userMemory.findFirst({
    where: { id: eventId, userId: session.user.id, createdVia: "life_event" },
    select: { eventTitle: true, title: true, content: true, eventYear: true },
  });
  if (!row) return { ok: false, error: "사건을 찾을 수 없어요." };

  const { nodeLabel, memoText } = await refineForPoster({
    title: row.eventTitle ?? row.title,
    content: row.content,
    year: row.eventYear,
  });
  return { ok: true, nodeLabel, memoText };
}

export type EditResult = { ok: true } | { ok: false; error: string };

// 사건 제목/내용 인라인 정정 — life_event 원본 수정. content 가 바뀌면 다듬기
// 교정본(refined 3필드)은 stale 이라 초기화(updateLifeEvent 와 동일 정책).
export async function updatePosterEventText(
  eventId: string,
  title: string,
  content: string | null,
): Promise<EditResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const userId = session.user.id;

  const trimmedTitle = title.trim();
  if (trimmedTitle === "") return { ok: false, error: "제목을 적어주세요." };
  if (trimmedTitle.length > 100) {
    return { ok: false, error: "제목이 너무 길어요(100자 이내)." };
  }
  const trimmedContent =
    typeof content === "string" && content.trim() !== "" ? content.trim() : null;
  if (trimmedContent && trimmedContent.length > 2000) {
    return { ok: false, error: "내용이 너무 길어요." };
  }

  const current = await prisma.userMemory.findFirst({
    where: { id: eventId, userId, createdVia: "life_event" },
    select: { content: true },
  });
  if (!current) return { ok: false, error: "사건을 찾을 수 없어요." };
  const contentChanged = (current.content ?? null) !== trimmedContent;

  const result = await prisma.userMemory.updateMany({
    where: { id: eventId, userId, createdVia: "life_event" },
    data: {
      eventTitle: trimmedTitle,
      title: trimmedTitle,
      content: trimmedContent,
      ...(contentChanged
        ? { refinedText: null, refinedAt: null, displayRefined: false }
        : {}),
    },
  });
  if (result.count === 0) return { ok: false, error: "사건을 찾을 수 없어요." };

  revalidatePath("/poster/select");
  revalidatePath("/life-timeline");
  return { ok: true };
}
