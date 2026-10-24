// P2·P6 — 포스터 선택 저장·편집(override) 저장·사건 문구 정정 본체. 순수 모듈(auth 없음) —
// app/poster/select/actions.ts·app/poster/view/actions.ts 가 auth 게이트 + revalidate 만 씌워 재노출한다.
// 검증 스크립트(db/test-v3-poster-bridge.ts)가 같은 함수를 직접 호출할 수 있게
// lib/life-event-query.ts 와 같은 패턴으로 분리했다(2026-10-24).

import { prisma } from "../db";
import { previewSentenceOf } from "./ai-cache";
import {
  parseSelectionsFull,
  sanitizeOverride,
  toStoredSelection,
  type PosterSelectionFull,
} from "./overrides";
import {
  BODILESS_MEMO_MESSAGE,
  BRIDGE_BODILESS_EDIT_BLOCKED_MESSAGE,
  BRIDGE_EDIT_BLOCKED_MESSAGE,
  MAX_MEMO_ITEMS,
  type PosterSelectionItem,
} from "./select-constants";
import { CREATED_VIA_V3_BRIDGE, POSTER_EVENT_CREATED_VIA } from "./v3-bridge";

export type SaveResult =
  | { ok: true; count: number }
  | { ok: false; error: string };

export async function persistPosterSelections(
  userId: string,
  selections: PosterSelectionItem[],
): Promise<SaveResult> {
  // 소유·존재 검증 + 기존 override 보존을 위해 현재 selections(+미리보기 보관함)도 함께 읽는다.
  const [owned, existing] = await Promise.all([
    prisma.userMemory.findMany({
      where: { userId, createdVia: { in: POSTER_EVENT_CREATED_VIA }, eventYear: { not: null } },
      select: { id: true, createdVia: true, content: true },
    }),
    prisma.poster.findUnique({
      where: { userId },
      select: { selections: true, design: true },
    }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.id));
  // v3 브릿지 행 중 본문(실질 Episode)이 없는 것 — node 로만 담을 수 있다.
  const bodilessBridgeIds = new Set(
    owned
      .filter((o) => o.createdVia === CREATED_VIA_V3_BRIDGE && !o.content?.trim())
      .map((o) => o.id),
  );

  // 기존 항목 맵 — /poster/view 의 P6 편집(위치·크기·내용 수정)과 생성 문장을
  // selection 재저장에도 보존한다. 키는 eventId+type: 같은 항목(eventId·type
  // 동일)만 override·문장을 잇고, 새 항목·type 이 바뀐 항목(노드↔메모 — x/y·텍스트
  // 의미가 달라짐)은 자동배치·새 문장으로, 빠진 항목은 자연히 버린다.
  // 새 항목은 선택 화면 미리보기 보관함에 같은 항목 문장이 있으면 그걸 붙인다(미리보기 = 시안).
  const prevItems = previousItemMap(existing?.selections);

  const clean: PosterSelectionFull[] = [];
  for (const s of selections) {
    if (!ownedIds.has(s.eventId)) continue;
    if (s.type !== "node" && s.type !== "memo") continue;
    if (s.type === "memo" && bodilessBridgeIds.has(s.eventId)) {
      return { ok: false, error: BODILESS_MEMO_MESSAGE };
    }
    const prev = prevItems.get(`${s.eventId}\u0000${s.type}`);
    clean.push({
      eventId: s.eventId,
      type: s.type,
      order: s.order,
      override: prev?.override,
      ...(prev?.generatedText !== undefined
        ? generatedOf(prev)
        : previewSentenceOf(existing?.design, s.eventId, s.type)),
    });
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

  const toStore = clean.map(toStoredSelection);

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, selections: toStore },
    update: { selections: toStore },
  });

  return { ok: true, count: clean.length };
}

// P6 — /poster/view 편집 저장 본체(app/poster/view/actions.ts savePosterOverrides).
// 편집기가 *현재 화면의 전체 항목*(삭제분 제외)을 override 포함해 보낸다.
// 소유·존재 검증 후 Poster.selections 를 통째로 교체(삭제 = 빠진 항목).
// 생성 문장은 클라가 보낸 값이 아니라 DB 의 기존 항목에서 잇는다.
export async function persistPosterOverrides(
  userId: string,
  items: PosterSelectionFull[],
): Promise<SaveResult> {
  // 소유·존재 검증 — 본인 life_event·v3 브릿지 id 만 허용(select 와 동일 가드).
  const [owned, existing] = await Promise.all([
    prisma.userMemory.findMany({
      where: { userId, createdVia: { in: POSTER_EVENT_CREATED_VIA }, eventYear: { not: null } },
      select: { id: true },
    }),
    prisma.poster.findUnique({
      where: { userId },
      select: { selections: true },
    }),
  ]);
  const ownedIds = new Set(owned.map((o) => o.id));
  const prevItems = previousItemMap(existing?.selections);

  const clean: PosterSelectionFull[] = [];
  for (const s of items) {
    if (!s || typeof s.eventId !== "string") continue;
    if (!ownedIds.has(s.eventId)) continue;
    if (s.type !== "node" && s.type !== "memo") continue;
    clean.push({
      eventId: s.eventId,
      type: s.type,
      order: typeof s.order === "number" ? s.order : 0,
      override: sanitizeOverride(s.override),
      ...generatedOf(prevItems.get(`${s.eventId}\u0000${s.type}`)),
    });
  }

  // order 조밀화(0..n) — 화면 순서 보존.
  clean.sort((a, b) => a.order - b.order);
  clean.forEach((s, i) => (s.order = i));

  const toStore = clean.map(toStoredSelection);

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, selections: toStore },
    update: { selections: toStore },
  });

  return { ok: true, count: toStore.length };
}

// 저장돼 있던 selections → eventId+type 키 맵.
function previousItemMap(raw: unknown): Map<string, PosterSelectionFull> {
  return new Map(parseSelectionsFull(raw).map((p) => [`${p.eventId}\u0000${p.type}`, p]));
}

// 이어 붙일 생성 문장 필드(없으면 빈 객체).
function generatedOf(prev: PosterSelectionFull | undefined): Partial<PosterSelectionFull> {
  return prev?.generatedText !== undefined
    ? { generatedText: prev.generatedText, sourceHash: prev.sourceHash, generatedAt: prev.generatedAt }
    : {};
}

export type EditResult = { ok: true } | { ok: false; error: string };

// 사건 제목/내용 인라인 정정 — life_event 원본 수정. content 가 바뀌면 다듬기
// 교정본(refined 3필드)은 stale 이라 초기화(updateLifeEvent 와 동일 정책).
// v3 브릿지 행은 원본이 채팅(LifeEvent/Episode)이라 여기서 고치지 않는다.
export async function editPosterEventText(
  userId: string,
  eventId: string,
  title: string,
  content: string | null,
): Promise<EditResult> {
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
    where: { id: eventId, userId, createdVia: { in: POSTER_EVENT_CREATED_VIA } },
    select: { content: true, createdVia: true },
  });
  if (!current) return { ok: false, error: "사건을 찾을 수 없어요." };
  if (current.createdVia === CREATED_VIA_V3_BRIDGE) {
    return {
      ok: false,
      error: current.content?.trim() ? BRIDGE_EDIT_BLOCKED_MESSAGE : BRIDGE_BODILESS_EDIT_BLOCKED_MESSAGE,
    };
  }
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

  return { ok: true };
}
