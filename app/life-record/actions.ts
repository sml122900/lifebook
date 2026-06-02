"use server";

// Phase L2 — 인생 골격 잡기 폼의 서버 액션.
//
// 클라가 보낸 카테고리 + 폼 값을 검증하고 upsertLifeEvent 로 저장한다.
// userId 는 항상 서버 세션에서 — 클라가 보낸 값은 절대 신뢰하지 않는다.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { upsertLifeEvent } from "@/lib/life-events";
import { getLifeQuestion } from "@/lib/life-record/questions";
import type { LifeCategory } from "@/lib/generated/prisma/enums";

export type SubmitLifeRecordResult =
  | { ok: true }
  | { ok: false; error: string };

// 폼 입력 검증 규칙(저장 정책 동기):
//   - title : trim 후 비어있지 않음 (1~80자)
//   - year  : 정수, 1900 ≤ year ≤ 현재연도 + 1
//   - month : 없거나, 1~12 정수
//   - content : 0~2000자 (없으면 null)
//
// year 가 없으면 정렬 불가 → 저장 거부. 사용자에게 "연도를 적어주세요
// (대략이라도)" 안내. 진짜 모르겠으면 그냥 건너뛰기(라우터 push, 저장 X).
const YEAR_MIN = 1900;
const TITLE_MAX = 80;
const CONTENT_MAX = 2000;

function isLifeCategory(v: unknown): v is LifeCategory {
  return typeof v === "string" && getLifeQuestion(v as LifeCategory) !== null;
}

export async function submitLifeRecord(
  rawCategory: string,
  raw: {
    title: string;
    year: number | null;
    month: number | null;
    content: string | null;
  },
): Promise<SubmitLifeRecordResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "로그인이 필요해요." };
  }
  const userId = session.user.id;

  if (!isLifeCategory(rawCategory)) {
    return { ok: false, error: "알 수 없는 카테고리예요." };
  }
  const category: LifeCategory = rawCategory;

  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (title === "") {
    return { ok: false, error: "한 줄로라도 적어주세요." };
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
      error: "연도를 적어주세요 (대략이라도). 정말 모르시면 건너뛰셔도 돼요.",
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

  await upsertLifeEvent(userId, category, { title, year, month, content });

  // 인덱스의 진행 상태 / 카테고리 폼의 prefill 둘 다 갱신.
  revalidatePath("/life-record");
  revalidatePath(`/life-record/${category}`);
  return { ok: true };
}
