// Phase L1 — 인생 연혁(v3) 헬퍼.
//
// "인생 연혁" 은 사용자의 큰 줄기를 시간축에 놓는다(앵커=정확, 사이=대략).
// 데이터는 새 모델을 만들지 않고 기존 UserMemory 에 createdVia="life_event"
// 디스크리미네이터로 얹는다 (스키마 주석 참조). 가족 룸·반응·진척 시각화는
// 기존 year/month/title 컬럼 기준으로 이미 작동하므로, life_event 행은
// year/month/title 에 eventYear/eventMonth/eventTitle 와 동일 값을 미러링해
// 추가 코드 없이 자동 호환된다.
//
// L1: 읽기 헬퍼(getLifeEvents). L2: 쓰기 헬퍼(upsertLifeEvent) + 인덱스용
// 답한 카테고리 집합(getAnsweredCategories). L4: 자유 추가/수정/삭제용
// createLifeEvent(여러 행 허용) + updateLifeEvent + deleteLifeEvent +
// getLifeEventById.

import type { EventPrecision, LifeCategory } from "./generated/prisma/enums";
import { EMPTY_PLACE, type PlaceInfo } from "./place-types";
import { prisma } from "./db";

// 클라 컴포넌트가 PlaceInfo / EMPTY_PLACE 를 가져갈 때 prisma 가 끌려오면
// 안 되므로 정의는 lib/place-types.ts 로 분리. 서버 코드는 여기서 re-export
// 받아도 OK (동일 객체 / 동일 타입).
export { EMPTY_PLACE, type PlaceInfo };

export const CREATED_VIA_LIFE_EVENT = "life_event";

export type LifeEvent = {
  id: string;
  title: string;
  eventYear: number;
  eventMonth: number | null;
  precision: EventPrecision;
  category: LifeCategory | null;
  content: string | null;
  // L2(+) — 기간 카테고리(SCHOOL/WORK/MILITARY/RESIDENCE)의 끝 연도.
  // 시간축 렌더가 이 값이 있으면 "시작"·"끝" 두 점으로 split.
  endYear: number | null;
  // Phase Place — 모두 nullable. 8개 카테고리(BIRTH·KINDERGARTEN·학령기·
  // MILITARY·WORK)만 폼에서 입력받지만, 타입은 전 카테고리 공통.
  place: PlaceInfo;
  createdAt: Date;
};

// 기간이 의미 있는 카테고리. UI(폼) 와 헬퍼(저장 검증) 가 공유.
// 학령기·군대·첫 직장은 "입학~졸업", "입대~제대", "입사~퇴사" 의 양 끝점이
// 의미 있음. BIRTH·RELATIONSHIP(결혼)·FAMILY(자녀)는 단일 시점.
const PERIOD_CATEGORIES: ReadonlySet<LifeCategory> = new Set([
  "KINDERGARTEN",
  "ELEMENTARY",
  "MIDDLE",
  "HIGH",
  "UNIVERSITY",
  "MILITARY",
  "WORK",
]);

export function isPeriodCategory(category: LifeCategory): boolean {
  return PERIOD_CATEGORIES.has(category);
}

// Phase Place — 모든 인생 기록에 장소 첨부 허용(2026-06-03 사용자 결정).
// 이전엔 8개 카테고리에만 노출했으나 RELATIONSHIP(결혼식장)·FAMILY(자녀
// 태어난 곳) 도 의미 있어 게이트 제거. 헬퍼 시그니처는 호환을 위해 남기되
// 항상 true (모든 카테고리에서 장소 입력 노출).

// 사용자의 인생 이벤트를 시간순으로 반환.
//
// 정렬 규칙:
//   1차) eventYear ASC                — 인생의 흐름 (오래된 것부터)
//   2차) eventMonth ASC NULLS LAST    — 같은 해 안에서 정확한 달이 앞,
//                                       사이 이벤트(month=null)는 뒤
//   3차) createdAt ASC                — 같은 (연,월) 안에서 사용자가 답한 순서
//
// 사이 이벤트(eventMonth=null) 의 같은 연도 내 정렬을 별도 order 필드 대신
// createdAt 으로 잡는 이유: 사용자가 인생을 떠올려 답하는 순서가 곧 그
// 사람의 머릿속 흐름과 가깝다. 데이터가 많이 쌓이면 그때 order 도입.
//
// life_event 행은 eventYear 가 항상 채워져 있는 게 약속(L1 스키마 주석).
// 방어적으로 NULL 행은 결과에서 제외한다.
export async function getLifeEvents(userId: string): Promise<LifeEvent[]> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      eventYear: { not: null },
    },
    select: {
      id: true,
      eventTitle: true,
      eventYear: true,
      eventMonth: true,
      endYear: true,
      precision: true,
      category: true,
      content: true,
      createdAt: true,
      title: true, // eventTitle 이 비어있는 방어 경로용
      placeName: true,
      placeAddress: true,
      lat: true,
      lng: true,
      placeSource: true,
    },
    orderBy: [
      { eventYear: "asc" },
      { eventMonth: { sort: "asc", nulls: "last" } },
      { createdAt: "asc" },
    ],
  });

  return rows.map((r) => ({
    id: r.id,
    title: r.eventTitle ?? r.title,
    eventYear: r.eventYear as number, // where 절에서 not null 보장
    eventMonth: r.eventMonth,
    precision: r.precision ?? "APPROXIMATE", // 기본은 사이 이벤트
    category: r.category,
    content: r.content,
    endYear: r.endYear,
    place: {
      placeName: r.placeName,
      placeAddress: r.placeAddress,
      lat: r.lat,
      lng: r.lng,
      placeSource: r.placeSource,
    },
    createdAt: r.createdAt,
  }));
}

// L2(+) — 사용자의 출생 연도 1회 조회. BIRTH 카테고리에 답한 행이 있으면
// 그 eventYear, 없으면 null. 나이 자동 표시·SCHOOL 역계산 힌트에 사용.
export async function getBirthYear(userId: string): Promise<number | null> {
  const row = await prisma.userMemory.findFirst({
    where: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      category: "BIRTH",
      eventYear: { not: null },
    },
    select: { eventYear: true },
    orderBy: { createdAt: "desc" },
  });
  return row?.eventYear ?? null;
}

// L2(+) — 사용자가 "건너뛰기" 처리한 카테고리 셋.
// nextUnansweredCategory 가 *답함 ∪ 건너뜀* 둘 다 끝난 것으로 취급.
export async function getSkippedCategories(
  userId: string,
): Promise<Set<LifeCategory>> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { skippedLifeCategories: true },
  });
  return new Set(row?.skippedLifeCategories ?? []);
}

// L2(+) — 한 카테고리를 "건너뜀" 으로 표시 (idempotent + race-safe).
// Postgres array_append/array_remove 로 한 statement 처리 — read→modify→write
// 사이 race window 제거. array_remove 로 먼저 빼고 array_append 로 추가
// = 항상 정확히 1개 (중복 X). 동시 두 요청이 와도 둘 다 결과는 같다.
export async function markCategorySkipped(
  userId: string,
  category: LifeCategory,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "skippedLifeCategories" = array_append(
      array_remove("skippedLifeCategories", ${category}::"LifeCategory"),
      ${category}::"LifeCategory"
    )
    WHERE id = ${userId}
  `;
}

// L2(+) — 한 카테고리를 "건너뜀" 셋에서 제거 (idempotent + race-safe).
// 사용자가 같은 카테고리에 답을 저장하면 자동 호출됨(upsertLifeEvent).
export async function unmarkCategorySkipped(
  userId: string,
  category: LifeCategory,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "User"
    SET "skippedLifeCategories" = array_remove(
      "skippedLifeCategories",
      ${category}::"LifeCategory"
    )
    WHERE id = ${userId}
  `;
}

// 인덱스(/life-record) 진행 상태용 — 해당 사용자가 답한 카테고리 집합.
// "답함"의 정의: createdVia="life_event" + category 가 채워진 행이 1건
// 이상. L2 폼이 항상 category 와 eventYear 를 함께 채우는 규약(저장
// 헬퍼에서 강제) 이므로 distinct category 가 곧 진행도.
export async function getAnsweredCategories(
  userId: string,
): Promise<Set<LifeCategory>> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      category: { not: null },
    },
    select: { category: true },
    distinct: ["category"],
  });
  return new Set(
    rows
      .map((r) => r.category)
      .filter((c): c is LifeCategory => c !== null),
  );
}

// L2 — 카테고리 한 칸의 답 가져오기 (수정 폼 prefill 용). 같은 카테고리에
// 여러 행이 있으면 가장 최근(createdAt desc 1행) — L2 는 카테고리당 1답
// 정책이지만, 미래에 L4 가 같은 카테고리에 추가로 넣더라도 L2 폼은 최신
// 한 행만 다룬다 (수정 흐름의 동일성을 위해).
export async function getLifeEventForCategory(
  userId: string,
  category: LifeCategory,
): Promise<{
  id: string;
  eventTitle: string;
  eventYear: number;
  eventMonth: number | null;
  endYear: number | null;
  content: string | null;
  precision: EventPrecision;
  place: PlaceInfo;
} | null> {
  const row = await prisma.userMemory.findFirst({
    where: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      category,
    },
    select: {
      id: true,
      eventTitle: true,
      title: true,
      eventYear: true,
      eventMonth: true,
      endYear: true,
      content: true,
      precision: true,
      placeName: true,
      placeAddress: true,
      lat: true,
      lng: true,
      placeSource: true,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.eventYear === null) return null;
  return {
    id: row.id,
    eventTitle: row.eventTitle ?? row.title,
    eventYear: row.eventYear,
    eventMonth: row.eventMonth,
    endYear: row.endYear,
    content: row.content,
    precision: row.precision ?? "APPROXIMATE",
    place: {
      placeName: row.placeName,
      placeAddress: row.placeAddress,
      lat: row.lat,
      lng: row.lng,
      placeSource: row.placeSource,
    },
  };
}

export type LifeRecordInput = {
  title: string;
  year: number;
  month: number | null;
  // L2(+) — 기간 카테고리의 끝 연도. 비기간 카테고리·끝 모름이면 null.
  endYear: number | null;
  content: string | null;
  // Phase Place — 입력 안 했거나 카테고리가 장소 비대상이면 EMPTY_PLACE.
  place?: PlaceInfo;
};

// L2 저장 — 카테고리당 최신 1행을 upsert.
//
// 호출 규약 (server action 에서 검증 후 들어옴):
//   - title 비어있지 않음 (trim 후 빈 문자열 거부)
//   - year 는 정수, 1900 ≤ year ≤ 현재 연도 +1
//   - month 가 채워진 경우 1~12
//   - content 는 빈 문자열이면 null 로 정규화
//
// 동작:
//   - 같은 (userId, category) life_event 행이 있으면 update
//   - 없으면 create
//   - precision : year+month 둘 다 채워지면 EXACT, 그 외 APPROXIMATE
//   - year/month/title 미러링 (기존 컬럼) — 가족 룸·반응 자동 호환.
//   - L2 는 카테고리당 1답이 정책 — 여러 행이 이미 있으면 가장 최근 1행만
//     건드린다 (남은 행은 그대로 — L4 가 만든 다른 항목 보존).
export async function upsertLifeEvent(
  userId: string,
  category: LifeCategory,
  input: LifeRecordInput,
): Promise<{ id: string; precision: EventPrecision }> {
  const precision: EventPrecision =
    input.month !== null ? "EXACT" : "APPROXIMATE";

  const existing = await prisma.userMemory.findFirst({
    where: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      category,
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  // 답을 저장하면 "건너뜀" 셋에서 자동 해제 (사용자가 마음 바꾼 케이스).
  await unmarkCategorySkipped(userId, category);

  // 비기간 카테고리에서 endYear 가 잘못 들어오면 null 로 정규화.
  const endYear = isPeriodCategory(category) ? input.endYear : null;
  const place = input.place ?? EMPTY_PLACE;

  if (existing) {
    const updated = await prisma.userMemory.update({
      where: { id: existing.id },
      data: {
        // life_event 전용
        eventTitle: input.title,
        eventYear: input.year,
        eventMonth: input.month,
        endYear,
        precision,
        // category 는 그대로 (where 로 잡았으므로)
        // 미러링
        year: input.year,
        month: input.month,
        title: input.title,
        content: input.content,
        // 장소
        placeName: place.placeName,
        placeAddress: place.placeAddress,
        lat: place.lat,
        lng: place.lng,
        placeSource: place.placeSource,
      },
      select: { id: true },
    });
    return { id: updated.id, precision };
  }

  const created = await prisma.userMemory.create({
    data: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      // life_event 전용
      eventTitle: input.title,
      eventYear: input.year,
      eventMonth: input.month,
      endYear,
      precision,
      category,
      // 미러링
      year: input.year,
      month: input.month,
      title: input.title,
      content: input.content,
      // 장소
      placeName: place.placeName,
      placeAddress: place.placeAddress,
      lat: place.lat,
      lng: place.lng,
      placeSource: place.placeSource,
    },
    select: { id: true },
  });
  return { id: created.id, precision };
}

// L4 — 자유 추가(카테고리당 여러 행 허용). 항상 새 행을 만든다.
//
// precision 결정:
//   - 명시값(forcePrecision) 이 있으면 그것을 사용 (예: "앵커 사이" 모드는
//     호출자가 APPROXIMATE 강제).
//   - 없으면 month 유무로 자동 — month 있으면 EXACT, 없으면 APPROXIMATE.
//   - 단, 명시값이 EXACT 인데 month 가 없으면 APPROXIMATE 로 다운그레이드
//     (점 시각·"년쯤" 라벨이 사이 이벤트와 동일해지므로 시각적 일관성).
export async function createLifeEvent(
  userId: string,
  category: LifeCategory,
  input: LifeRecordInput,
  forcePrecision?: EventPrecision,
): Promise<{ id: string; precision: EventPrecision }> {
  let precision: EventPrecision =
    forcePrecision ?? (input.month !== null ? "EXACT" : "APPROXIMATE");
  if (precision === "EXACT" && input.month === null) precision = "APPROXIMATE";

  const endYear = isPeriodCategory(category) ? input.endYear : null;
  const place = input.place ?? EMPTY_PLACE;

  const created = await prisma.userMemory.create({
    data: {
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
      eventTitle: input.title,
      eventYear: input.year,
      eventMonth: input.month,
      endYear,
      precision,
      category,
      year: input.year,
      month: input.month,
      title: input.title,
      content: input.content,
      placeName: place.placeName,
      placeAddress: place.placeAddress,
      lat: place.lat,
      lng: place.lng,
      placeSource: place.placeSource,
    },
    select: { id: true },
  });
  return { id: created.id, precision };
}

// L4 — 한 행 수정. userId 일치하는 life_event 행만 갱신 (소유 검증).
// 없거나 권한이 없으면 null.
export async function updateLifeEvent(
  userId: string,
  eventId: string,
  category: LifeCategory,
  input: LifeRecordInput,
  forcePrecision?: EventPrecision,
): Promise<{ id: string; precision: EventPrecision } | null> {
  let precision: EventPrecision =
    forcePrecision ?? (input.month !== null ? "EXACT" : "APPROXIMATE");
  if (precision === "EXACT" && input.month === null) precision = "APPROXIMATE";

  const endYear = isPeriodCategory(category) ? input.endYear : null;
  const place = input.place ?? EMPTY_PLACE;

  // 소유 확인 후 update — updateMany 로 한 트랜잭션, 일치 안 하면 count=0.
  const result = await prisma.userMemory.updateMany({
    where: {
      id: eventId,
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
    },
    data: {
      eventTitle: input.title,
      eventYear: input.year,
      eventMonth: input.month,
      endYear,
      precision,
      category,
      year: input.year,
      month: input.month,
      title: input.title,
      content: input.content,
      placeName: place.placeName,
      placeAddress: place.placeAddress,
      lat: place.lat,
      lng: place.lng,
      placeSource: place.placeSource,
    },
  });
  if (result.count === 0) return null;
  return { id: eventId, precision };
}

// L4 — 삭제. userId 일치 + life_event 만. 다른 행은 절대 안 건드림.
export async function deleteLifeEvent(
  userId: string,
  eventId: string,
): Promise<boolean> {
  const result = await prisma.userMemory.deleteMany({
    where: {
      id: eventId,
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
    },
  });
  return result.count > 0;
}

// L4 — 수정 폼 prefill 용 단일 조회. userId 일치 + life_event 만.
export async function getLifeEventById(
  userId: string,
  eventId: string,
): Promise<{
  id: string;
  category: LifeCategory;
  eventTitle: string;
  eventYear: number;
  eventMonth: number | null;
  endYear: number | null;
  content: string | null;
  precision: EventPrecision;
  place: PlaceInfo;
} | null> {
  const row = await prisma.userMemory.findFirst({
    where: {
      id: eventId,
      userId,
      createdVia: CREATED_VIA_LIFE_EVENT,
    },
    select: {
      id: true,
      category: true,
      eventTitle: true,
      title: true,
      eventYear: true,
      eventMonth: true,
      endYear: true,
      content: true,
      precision: true,
      placeName: true,
      placeAddress: true,
      lat: true,
      lng: true,
      placeSource: true,
    },
  });
  if (!row || row.eventYear === null || row.category === null) return null;
  return {
    id: row.id,
    category: row.category,
    eventTitle: row.eventTitle ?? row.title,
    eventYear: row.eventYear,
    eventMonth: row.eventMonth,
    endYear: row.endYear,
    content: row.content,
    precision: row.precision ?? "APPROXIMATE",
    place: {
      placeName: row.placeName,
      placeAddress: row.placeAddress,
      lat: row.lat,
      lng: row.lng,
      placeSource: row.placeSource,
    },
  };
}
