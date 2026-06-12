"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  saveEraMemory,
  stashEraEvent,
  unstashEraEvent,
  type SaveEraMemoryResult,
  type StashResult,
} from "@/lib/era-stash";

// Phase E2 — /era 의 "내 연혁에 담기" / "빼기" server actions.
// 인증 가드는 양쪽 모두 — proxy.ts 가 1차로 보호하지만 actions 도 defense.
// revalidatePath 는 두 경로:
//   /era            — 카드 "담음" 표시 토글
//   /life-timeline  — 연혁에 새 era 행 등장/제거

export async function stashEraEventAction(
  monthEventId: string,
): Promise<StashResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const result = await stashEraEvent(session.user.id, monthEventId);
  if (result === "stashed" || result === "already") {
    revalidatePath("/era");
    revalidatePath("/life-timeline");
  }
  return result;
}

export async function unstashEraEventAction(
  monthEventId: string,
): Promise<{ removed: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const r = await unstashEraEvent(session.user.id, monthEventId);
  revalidatePath("/era");
  revalidatePath("/life-timeline");
  return r;
}

// Phase E3 — 담은 시대 사건의 본인 회상(content) 저장.
// 양쪽 진입(/era 펼침 + /life-timeline EraCard) 공용. 길이 검증은
// saveEraMemory 가 단일 결정자(서버 측). 클라이언트도 1차 가드 권장.
// revalidatePath 는 세 경로 — 회상이 룸·연혁 양쪽에 노출되므로 가족 룸도.
export async function saveEraMemoryAction(
  monthEventId: string,
  content: string,
): Promise<SaveEraMemoryResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");

  const result = await saveEraMemory(session.user.id, monthEventId, content);
  if (result === "saved" || result === "cleared") {
    revalidatePath("/era");
    revalidatePath("/life-timeline");
    // 가족 룸의 PersonalMemoryCard 가 content 즉시 반영하도록.
    revalidatePath("/rooms");
  }
  return result;
}

// 온보딩 — 첫 시대 사건 회상. 아직 안 담긴 사건이라 stash + 회상저장을
// 한 번에 한다("저장 시 첫 기록 생성"). 시그니처는 saveEraMemoryAction 과
// 동일 → EraMemoryEditor 의 saveAction prop 으로 그대로 주입 가능.
// 빈 입력은 editor 가 막으므로 빈 stash 는 생기지 않는다(방어적으로 cleared
// 면 revalidate 만, 빈 행은 idempotent unique 로 1행 유지).
export async function stashAndSaveFirstEraMemoryAction(
  monthEventId: string,
  content: string,
): Promise<SaveEraMemoryResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("로그인이 필요해요.");
  const userId = session.user.id;

  // 먼저 담기(idempotent — 이미 있으면 already). 없는 사건이면 저장도 불가.
  const stash = await stashEraEvent(userId, monthEventId);
  if (stash === "not_found" || stash === "year_missing") {
    return "not_stashed";
  }
  const result = await saveEraMemory(userId, monthEventId, content);
  if (result === "saved" || result === "cleared") {
    revalidatePath("/era");
    revalidatePath("/life-timeline");
    revalidatePath("/rooms");
  }
  return result;
}
