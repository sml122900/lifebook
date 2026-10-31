"use server";

// 노드 그래프 2b-2 — 이야기에 나온 인물 확인(/story-review/confirm). 본체는 lib/node-confirm.ts
// (순수, auth 없음 — 회귀가 같은 함수를 부른다). 이 파일은 auth 게이트 + revalidate 만.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  countPendingPeople,
  decidePeople,
  type DecideResult,
  type PersonDecision,
} from "@/lib/node-confirm";

export type { DecideResult, PersonDecision } from "@/lib/node-confirm";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// /chat-v3 대화 종료 때 확인 화면으로 보낼지(대기 ≥1) 판단용.
export async function countPendingPeopleAction(): Promise<number> {
  return countPendingPeople(await requireUserId());
}

// 행별 [맞아요]·[아니에요]·[고칠게요]와 화면 전체 [모두 맞아요] 공용 — 연결 id 목록을 받는다.
// /story-review 는 revalidate 하지 않는다(P20-1 — app/actions/episode.ts). 확정 인물이 생기면
// /people 목록·상세가 바뀌므로 그쪽만 무효화(P23-2 와 같은 이유).
export async function decidePeopleAction(decisions: PersonDecision[]): Promise<DecideResult> {
  const userId = await requireUserId();
  const result = await decidePeople(userId, Array.isArray(decisions) ? decisions : []);
  if (result.done.length > 0) {
    revalidatePath("/people");
    revalidatePath("/people/[personId]", "page");
  }
  return result;
}
