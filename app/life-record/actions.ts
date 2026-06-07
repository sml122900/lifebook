"use server";

// Phase L2 — 인생 골격 잡기 폼의 서버 액션.
//
// 클라가 보낸 카테고리 + 폼 값을 검증하고 upsertLifeEvent 로 저장한다.
// userId 는 항상 서버 세션에서 — 클라가 보낸 값은 절대 신뢰하지 않는다.
//
// L2(+) — skipLifeRecord: "건너뛰기" 누르면 카테고리를 User.skippedLifeCategories
// 에 기록. nextUnansweredCategory 가 다시 후보로 잡지 않도록.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  isPeriodCategory,
  markCategorySkipped,
  type PlaceInfo,
  upsertLifeEvent,
} from "@/lib/life-events";
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

// Phase Place — 폼 측에서 보내는 raw 장소 입력. 모두 nullable + placeSource
// 는 "naver"/"google" 화이트리스트. lat/lng 는 둘 다 있거나 둘 다 null.
export type RawPlaceInput = {
  placeName: string | null;
  placeAddress: string | null;
  lat: number | null;
  lng: number | null;
  placeSource: string | null;
};

const PLACE_NAME_MAX = 200;
const PLACE_ADDR_MAX = 300;

function validatePlace(
  raw: RawPlaceInput | undefined,
): { ok: true; place: PlaceInfo } | { ok: false; error: string } {
  if (!raw || raw.placeName === null) {
    return {
      ok: true,
      place: {
        placeName: null,
        placeAddress: null,
        lat: null,
        lng: null,
        placeSource: null,
      },
    };
  }
  const name = typeof raw.placeName === "string" ? raw.placeName.trim() : "";
  if (name === "") {
    return {
      ok: true,
      place: {
        placeName: null,
        placeAddress: null,
        lat: null,
        lng: null,
        placeSource: null,
      },
    };
  }
  if (name.length > PLACE_NAME_MAX) {
    return { ok: false, error: "장소 이름이 너무 길어요." };
  }
  const addr =
    typeof raw.placeAddress === "string" && raw.placeAddress.trim() !== ""
      ? raw.placeAddress.trim()
      : null;
  if (addr && addr.length > PLACE_ADDR_MAX) {
    return { ok: false, error: "장소 주소가 너무 길어요." };
  }
  // H7 — placeSource 가 알 수 없는 값이면 전체 거부(모두 null). 이전엔
  // lat/lng 만 저장되고 source 만 null 로 떨어져 외부 지도 링크 폴백이
  // 일관성 없었음. 신뢰할 수 있는 source 가 없으면 데이터 전체를 신뢰 X.
  if (raw.placeSource !== "naver" && raw.placeSource !== "google") {
    return {
      ok: true,
      place: {
        placeName: null,
        placeAddress: null,
        lat: null,
        lng: null,
        placeSource: null,
      },
    };
  }
  const source = raw.placeSource;
  // 좌표는 둘 다 숫자 + 정상 범위거나, 둘 다 null. 한쪽만이면 둘 다 null.
  let lat: number | null = null;
  let lng: number | null = null;
  if (
    typeof raw.lat === "number" &&
    typeof raw.lng === "number" &&
    Number.isFinite(raw.lat) &&
    Number.isFinite(raw.lng) &&
    raw.lat >= -90 &&
    raw.lat <= 90 &&
    raw.lng >= -180 &&
    raw.lng <= 180
  ) {
    lat = raw.lat;
    lng = raw.lng;
  }
  return {
    ok: true,
    place: {
      placeName: name,
      placeAddress: addr,
      lat,
      lng,
      placeSource: source,
    },
  };
}

export async function submitLifeRecord(
  rawCategory: string,
  raw: {
    title: string;
    year: number | null;
    month: number | null;
    endYear: number | null;
    // 2026-06-07 — 끝 월(선택). endYear 가 있고 기간 카테고리일 때만 의미.
    endMonth?: number | null;
    content: string | null;
    place?: RawPlaceInput;
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

  // L2(+) — endYear 검증. 비기간 카테고리에서 보내면 무시(헬퍼가 null 정규화).
  // 기간 카테고리에서: 비어있어도 OK(끝 모름·진행 중), 있으면 정수 + 범위.
  let endYear: number | null = null;
  if (isPeriodCategory(category) && raw.endYear !== null) {
    if (
      !Number.isInteger(raw.endYear) ||
      raw.endYear < YEAR_MIN ||
      raw.endYear > yearMax
    ) {
      return {
        ok: false,
        error: "끝난 해는 1900년부터 내년 사이로 적어주세요.",
      };
    }
    if (raw.endYear < year) {
      return {
        ok: false,
        error: "끝난 해가 시작한 해보다 앞일 수 없어요.",
      };
    }
    endYear = raw.endYear;
  }

  // 2026-06-07 — endMonth 검증. endYear 가 있어야 의미 있음. 같은 해 안에서
  // 끝 월이 시작 월보다 앞이면 거부(시작 월이 비어있으면 비교 안 함).
  let endMonth: number | null = null;
  if (isPeriodCategory(category) && endYear !== null && raw.endMonth != null) {
    if (
      !Number.isInteger(raw.endMonth) ||
      raw.endMonth < 1 ||
      raw.endMonth > 12
    ) {
      return { ok: false, error: "끝난 달은 1부터 12 사이로 적어주세요." };
    }
    if (endYear === year && month !== null && raw.endMonth < month) {
      return {
        ok: false,
        error: "끝난 달이 시작한 달보다 앞일 수 없어요.",
      };
    }
    endMonth = raw.endMonth;
  }

  let content: string | null = null;
  if (typeof raw.content === "string" && raw.content.trim() !== "") {
    if (raw.content.length > CONTENT_MAX) {
      return { ok: false, error: `자유 응답은 ${CONTENT_MAX}자 이내로 적어주세요.` };
    }
    content = raw.content;
  }

  const placeResult = validatePlace(raw.place);
  if (!placeResult.ok) return { ok: false, error: placeResult.error };

  await upsertLifeEvent(userId, category, {
    title,
    year,
    month,
    endYear,
    endMonth,
    content,
    place: placeResult.place,
  });

  // 인덱스의 진행 상태 / 카테고리 폼의 prefill / 연혁 둘 다 갱신.
  revalidatePath("/life-record");
  revalidatePath(`/life-record/${category}`);
  revalidatePath("/life-timeline");
  return { ok: true };
}

// L2(+) — "건너뛰기" 액션. User.skippedLifeCategories 에 카테고리 기록.
// upsertLifeEvent 가 답 저장 시 자동 해제하므로 일방향 표시만으로 충분.
export async function skipLifeRecord(
  rawCategory: string,
): Promise<SubmitLifeRecordResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "로그인이 필요해요." };
  }
  if (!isLifeCategory(rawCategory)) {
    return { ok: false, error: "알 수 없는 카테고리예요." };
  }
  await markCategorySkipped(session.user.id, rawCategory);

  revalidatePath("/life-record");
  revalidatePath(`/life-record/${rawCategory}`);
  return { ok: true };
}
