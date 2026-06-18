"use server";

// Phase P2 — 인물(Person) 서버 액션.
//
// 정책 (P1 헬퍼와 동일):
//   - userId 는 서버 세션에서만. 클라가 보낸 값 절대 신뢰 X.
//   - 입력 검증은 헬퍼(validatePersonInput) 가 throw 로 알리므로 try/catch
//     로 잡아 폼 친화 ActionResult 로 변환.
//   - 링크/언링크는 LinkResult enum 을 그대로 노출 (UI 안내 분기용).
//   - revalidatePath 는 영향받는 화면만 — /people, /people/[id], 미리보기에
//     쓰는 /life-timeline.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import {
  createPerson,
  deletePerson,
  type LinkResult,
  linkPersonToEvent,
  type PersonInput,
  type SubjectType,
  unlinkPersonFromEvent,
  updatePerson,
} from "@/lib/people";

export type PersonInputRaw = {
  subjectType: SubjectType;
  name: string;
  relation: string | null;
  birthYear: number | null;
  category: string | null;
  metYear: number | null;
  memo: string | null;
};

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type UpdateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type DeleteResult = { ok: boolean; error?: string };

export type LinkActionResult = { ok: true; result: LinkResult } | { ok: false; error: string };

// 입력 정규화 — 빈/공백 → null. 헬퍼가 trim/길이 검사 한 번 더.
function normalize(raw: PersonInputRaw): PersonInput {
  const subjectType: SubjectType =
    raw.subjectType === "location" || raw.subjectType === "thing"
      ? raw.subjectType
      : "person";
  const name = typeof raw.name === "string" ? raw.name : "";
  const relation =
    typeof raw.relation === "string" && raw.relation.trim() !== ""
      ? raw.relation
      : null;
  const category =
    typeof raw.category === "string" && raw.category.trim() !== ""
      ? raw.category
      : null;
  const memo =
    typeof raw.memo === "string" && raw.memo.trim() !== "" ? raw.memo : null;
  const metYear =
    raw.metYear !== null && Number.isInteger(raw.metYear) ? raw.metYear : null;
  const birthYear =
    raw.birthYear !== null && Number.isInteger(raw.birthYear) ? raw.birthYear : null;
  return { subjectType, name, relation, birthYear, category, memo, metYear };
}

function errMessage(e: unknown): string {
  return e instanceof Error && e.message
    ? e.message
    : "처리 중 문제가 발생했어요.";
}

export async function createPersonAction(
  raw: PersonInputRaw,
): Promise<CreateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  try {
    const person = await createPerson(session.user.id, normalize(raw));
    revalidatePath("/people");
    return { ok: true, id: person.id };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

export async function updatePersonAction(
  personId: string,
  raw: PersonInputRaw,
): Promise<UpdateResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  try {
    const updated = await updatePerson(
      session.user.id,
      personId,
      normalize(raw),
    );
    if (!updated) {
      return { ok: false, error: "인물을 찾을 수 없거나 권한이 없어요." };
    }
    revalidatePath("/people");
    revalidatePath(`/people/${personId}`);
    revalidatePath(`/people/${personId}/edit`);
    return { ok: true, id: updated.id };
  } catch (e) {
    return { ok: false, error: errMessage(e) };
  }
}

// 삭제는 cascade — PersonEvent 도 함께 사라지므로 연혁 미리보기도 영향.
export async function deletePersonAction(
  personId: string,
): Promise<DeleteResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const ok = await deletePerson(session.user.id, personId);
  if (!ok) return { ok: false, error: "인물을 찾을 수 없거나 권한이 없어요." };
  revalidatePath("/people");
  revalidatePath("/life-timeline");
  return { ok: true };
}

// 삭제 후 목록으로 — DeleteButton 호환용 분기 액션.
export async function deletePersonAndRedirect(
  personId: string,
): Promise<DeleteResult> {
  const r = await deletePersonAction(personId);
  if (!r.ok) return r;
  redirect("/people");
}

export async function linkPersonAction(
  personId: string,
  memoryId: string,
): Promise<LinkActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const result = await linkPersonToEvent(session.user.id, personId, memoryId);
  revalidatePath(`/people/${personId}`);
  revalidatePath(`/people/${personId}/link`);
  revalidatePath("/life-timeline");
  return { ok: true, result };
}

export async function unlinkPersonAction(
  personId: string,
  memoryId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };
  const ok = await unlinkPersonFromEvent(session.user.id, personId, memoryId);
  revalidatePath(`/people/${personId}`);
  revalidatePath(`/people/${personId}/link`);
  revalidatePath("/life-timeline");
  return { ok };
}
