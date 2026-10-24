"use server";

// P2 — 포스터 선택/분류/정정 서버 액션.
//
//   loadPosterEditor      : P1 후보(AI 분류) + 저장된 Poster.selections 로드
//   savePosterSelections  : 사용자 확정 선택을 Poster 에 upsert
//   previewPosterSentence : P3 refineForPoster 로 노드/메모 문장 미리보기
//   updatePosterEventText : 사건 제목/내용 인라인 정정(life_event 원본 수정)
//
// 후보(P1)는 입력이 같으면 저장해 둔 결과(lib/poster/ai-cache.ts, 바뀌었을 때만 AI).
// 확정 선택만 Poster.selections 에 영속(P4 합성이 읽음).
// 저장·정정 본체는 lib/poster/selections.ts(auth 없음) — 여기선 auth·revalidate 만.
// v3 가입자의 사건은 lib/poster/v3-bridge.ts 가 브릿지 행으로 동기화해 함께 다룬다.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import { getPosterCandidates } from "@/lib/poster/ai-cache";
import {
  type PosterCandidate,
  type PosterCandidateInput,
} from "@/lib/poster/poster-candidates";
import { refineForPoster } from "@/lib/poster/poster-sentences";
import { type PosterSelectionItem } from "@/lib/poster/select-constants";
import {
  editPosterEventText,
  persistPosterSelections,
  type EditResult,
  type SaveResult,
} from "@/lib/poster/selections";
import {
  POSTER_EVENT_CREATED_VIA,
  applyBridgeTypeRules,
  syncV3Bridge,
  type V3BridgeRow,
} from "@/lib/poster/v3-bridge";

export type PosterEditorData = {
  candidates: PosterCandidate[];
  savedSelections: PosterSelectionItem[];
  // v3 브릿지 행 id(편집 대신 차단 안내) / 그중 본문 없는 것(메모 버튼 비활성).
  bridgeIds: string[];
  bodilessIds: string[];
};

// life_event + v3 브릿지 행 → 후보 입력(연도순). era_event·photo 제외(나무는 본인 골격만).
function toCandidateInputs(
  events: Awaited<ReturnType<typeof getLifeEvents>>,
  bridge: V3BridgeRow[],
): PosterCandidateInput[] {
  const life = events
    .filter((e) => e.kind === "life_event")
    .map((e) => ({
      eventId: e.id,
      year: e.eventYear,
      title: e.title,
      content: e.content,
      category: e.category,
    }));
  const v3 = bridge.map((b) => ({
    eventId: b.id,
    year: b.year,
    title: b.title,
    content: b.content,
    category: null,
  }));
  return [...life, ...v3].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
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

  const [events, bridge] = await Promise.all([getLifeEvents(userId), syncV3Bridge(userId)]);
  const inputs = toCandidateInputs(events, bridge);

  const [candidates, poster] = await Promise.all([
    getPosterCandidates(userId, inputs),
    prisma.poster.findUnique({
      where: { userId },
      select: { selections: true },
    }),
  ]);

  // 저장된 선택은 현재 존재하는 사건만(삭제된 사건 잔재 제거).
  const validIds = new Set(inputs.map((i) => i.eventId));
  const savedSelections = parseSavedSelections(poster?.selections).filter((s) =>
    validIds.has(s.eventId),
  );

  // 본문 없는 v3 사건은 node 고정(P1 후보 + 저장돼 있던 선택), 구간 이야기는 기본 memo 후보.
  return {
    ...applyBridgeTypeRules(candidates, savedSelections, bridge),
    bridgeIds: bridge.map((b) => b.id),
    bodilessIds: bridge.filter((b) => b.content === null).map((b) => b.id),
  };
}

export async function savePosterSelections(
  selections: PosterSelectionItem[],
): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = await persistPosterSelections(session.user.id, selections);
  if (result.ok) {
    revalidatePath("/poster/select");
    revalidatePath("/poster");
  }
  return result;
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
    where: { id: eventId, userId: session.user.id, createdVia: { in: POSTER_EVENT_CREATED_VIA } },
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

// 사건 제목/내용 인라인 정정 — life_event 원본 수정(v3 브릿지 행은 차단).
export async function updatePosterEventText(
  eventId: string,
  title: string,
  content: string | null,
): Promise<EditResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const result = await editPosterEventText(session.user.id, eventId, title, content);
  if (result.ok) {
    revalidatePath("/poster/select");
    revalidatePath("/life-timeline");
  }
  return result;
}
