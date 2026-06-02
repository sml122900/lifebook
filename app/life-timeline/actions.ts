"use server";

// Phase L4 — 인생 이벤트 추가/수정/삭제 서버 액션.
//
// 동일한 검증을 add/update 모두에 적용 — 같은 유효성 정책. delete 는 권한
// 만 확인하고 행을 지운다. userId 는 항상 서버 세션에서 — 클라가 보낸 값
// 절대 신뢰하지 않는다.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import type { EventPrecision, LifeCategory } from "@/lib/generated/prisma/enums";
import {
  createLifeEvent,
  deleteLifeEvent,
  updateLifeEvent,
} from "@/lib/life-events";
import { getLifeQuestion } from "@/lib/life-record/questions";

const YEAR_MIN = 1900;
const TITLE_MAX = 80;
const CONTENT_MAX = 2000;

export type LifeEventInputRaw = {
  category: string;
  precision: string; // "EXACT" | "APPROXIMATE"
  title: string;
  year: number | null;
  month: number | null;
  content: string | null;
};

export type ActionResult =
  | { ok: true; id: string; precision: EventPrecision }
  | { ok: false; error: string };

type ValidationOk = {
  ok: true;
  category: LifeCategory;
  precision: EventPrecision;
  title: string;
  year: number;
  month: number | null;
  content: string | null;
};
type ValidationFail = { ok: false; error: string };

function isCategory(v: string): v is LifeCategory {
  return getLifeQuestion(v as LifeCategory) !== null;
}

function isPrecision(v: string): v is EventPrecision {
  return v === "EXACT" || v === "APPROXIMATE";
}

function validate(raw: LifeEventInputRaw): ValidationOk | ValidationFail {
  if (!isCategory(raw.category)) {
    return { ok: false, error: "알 수 없는 카테고리예요." };
  }
  if (!isPrecision(raw.precision)) {
    return { ok: false, error: "시점 정확도가 올바르지 않아요." };
  }
  const category = raw.category;
  const precisionHint = raw.precision;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title === "") {
    return { ok: false, error: "어떤 일이었는지 한 줄로 적어주세요." };
  }
  if (title.length > TITLE_MAX) {
    return { ok: false, error: `${TITLE_MAX}자 이내로 줄여주세요.` };
  }

  const yearMax = new Date().getFullYear() + 1;
  if (
    raw.year === null ||
    !Number.isInteger(raw.year) ||
    raw.year < YEAR_MIN ||
    raw.year > yearMax
  ) {
    return {
      ok: false,
      error: "연도를 적어주세요 (대략이라도). 정말 모르시면 사이 모드로 골라주세요.",
    };
  }
  const year = raw.year;

  let month: number | null = null;
  if (raw.month !== null) {
    if (!Number.isInteger(raw.month) || raw.month < 1 || raw.month > 12) {
      return { ok: false, error: "월은 1부터 12 사이로 적어주세요." };
    }
    month = raw.month;
  }

  let content: string | null = null;
  if (typeof raw.content === "string" && raw.content.trim() !== "") {
    if (raw.content.length > CONTENT_MAX) {
      return { ok: false, error: `자유 응답은 ${CONTENT_MAX}자 이내로 적어주세요.` };
    }
    content = raw.content;
  }

  return {
    ok: true,
    category,
    precision: precisionHint, // 헬퍼가 month 없을 때 EXACT→APPROXIMATE 다운그레이드 처리
    title,
    year,
    month,
    content,
  };
}

export async function addLifeEventAction(
  raw: LifeEventInputRaw,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const v = validate(raw);
  if (!v.ok) return v;

  const result = await createLifeEvent(
    session.user.id,
    v.category,
    { title: v.title, year: v.year, month: v.month, content: v.content },
    v.precision,
  );

  revalidatePath("/life-timeline");
  revalidatePath("/life-timeline/manage");
  return { ok: true, id: result.id, precision: result.precision };
}

export async function updateLifeEventAction(
  eventId: string,
  raw: LifeEventInputRaw,
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const v = validate(raw);
  if (!v.ok) return v;

  const result = await updateLifeEvent(
    session.user.id,
    eventId,
    v.category,
    { title: v.title, year: v.year, month: v.month, content: v.content },
    v.precision,
  );
  if (!result) {
    return { ok: false, error: "이벤트를 찾을 수 없거나 권한이 없어요." };
  }

  revalidatePath("/life-timeline");
  revalidatePath("/life-timeline/manage");
  revalidatePath(`/life-timeline/${eventId}/edit`);
  return { ok: true, id: result.id, precision: result.precision };
}

export async function deleteLifeEventAction(
  eventId: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "로그인이 필요해요." };

  const ok = await deleteLifeEvent(session.user.id, eventId);
  if (!ok) return { ok: false, error: "이벤트를 찾을 수 없거나 권한이 없어요." };

  revalidatePath("/life-timeline");
  revalidatePath("/life-timeline/manage");
  return { ok: true };
}
