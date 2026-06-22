// Phase P1 — 인물(Person) 헬퍼.
//
// "인물" 은 사용자의 인생에 등장하는 사람(친구·동료·가족 등). 한 인물이
// 0~N 개 life_event 와 PersonEvent 조인으로 연결된다. 시각화·룸 노출·반응
// 같은 기존 기능은 무수정 — Person/PersonEvent 는 additive only.
//
// Phase 8 — subjectType 확장: "person"|"location"|"thing".
//   - location/thing 은 이름+메모만 (birthYear/relation/metYear/category 검증 스킵).
//   - geo 장소(UserMemory.placeName/lat/lng) 와 완전히 별개 — 혼동 금지.
//   - PersonEvent 조인·linkPersonToEvent·LINKABLE_CREATED_VIA 무변.
//
// 모든 함수는 userId 를 첫 인자로 받고 서버 세션 값만 신뢰한다.
//
// P1 범위: CRUD + 링크/언링크 + 두 가지 조회 (이벤트→인물, 인물→이벤트).
// P2(화면)·P3(고급) 는 별도.

import {
  CREATED_VIA_LIFE_EVENT,
  CREATED_VIA_PHOTO,
  type LifeEvent,
} from "./life-events";

// Phase Photo (B) — 이야기 주체를 붙일 수 있는 메모리 종류. *인생* 이벤트 + *사진*.
// era_event(시대 자료)·ai_chat·timemachine_event·manual 등은 거부.
const LINKABLE_CREATED_VIA: ReadonlySet<string> = new Set([
  CREATED_VIA_LIFE_EVENT,
  CREATED_VIA_PHOTO,
]);
import type { EventPrecision, LifeCategory } from "./generated/prisma/enums";
import { prisma } from "./db";

// Phase 8 — 이야기 주체 유형.
export const SUBJECT_TYPE = {
  PERSON: "person",
  LOCATION: "location",
  THING: "thing",
} as const;
export type SubjectType = (typeof SUBJECT_TYPE)[keyof typeof SUBJECT_TYPE];

function isSubjectType(v: unknown): v is SubjectType {
  return v === "person" || v === "location" || v === "thing";
}

// ────────────────────────────────────────────────────────────────────
// 입력 검증 — 길이 상한은 스키마 주석과 같은 값. 자유 텍스트는 trim 후
// 빈 문자열이면 null 로 정규화 (저장은 nullable, 표시는 일관).
// ────────────────────────────────────────────────────────────────────

const NAME_MAX = 50;
const RELATION_MAX = 30;
const CATEGORY_MAX = 30;
const MET_YEAR_MIN = 1900;

function clampYearRange(): { min: number; max: number } {
  return { min: MET_YEAR_MIN, max: new Date().getFullYear() + 1 };
}

export type PersonInput = {
  subjectType: SubjectType;
  name: string;
  relation: string | null;
  birthYear: number | null;
  category: string | null;
  metYear: number | null;
  memo: string | null;
};

export type Person = {
  id: string;
  subjectType: SubjectType;
  name: string;
  relation: string | null;
  birthYear: number | null;
  category: string | null;
  metYear: number | null;
  memo: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// "ok" 시 정규화된 입력 반환. 실패 시 사용자에게 노출할 한국어 에러.
// location/thing 은 person 전용 필드(relation/birthYear/metYear/category) 검증 스킵.
function validatePersonInput(
  input: PersonInput,
): { ok: true; value: PersonInput } | { ok: false; error: string } {
  const subjectType: SubjectType = isSubjectType(input.subjectType)
    ? input.subjectType
    : SUBJECT_TYPE.PERSON;
  const isPerson = subjectType === SUBJECT_TYPE.PERSON;

  const name = input.name?.trim() ?? "";
  if (name === "") return { ok: false, error: "이름을 입력해주세요." };
  if (name.length > NAME_MAX) {
    return { ok: false, error: `이름은 ${NAME_MAX}자 이하로 적어주세요.` };
  }

  // person 전용 필드 — location/thing 은 스킵 (폼에서 애초에 안 받음)
  let relation: string | null = null;
  let category: string | null = null;
  let birthYear: number | null = null;
  let metYear: number | null = null;
  if (isPerson) {
    const r = input.relation?.trim() ?? "";
    if (r.length > RELATION_MAX) {
      return { ok: false, error: `관계는 ${RELATION_MAX}자 이하로 적어주세요.` };
    }
    const c = input.category?.trim() ?? "";
    if (c.length > CATEGORY_MAX) {
      return { ok: false, error: `카테고리는 ${CATEGORY_MAX}자 이하로 적어주세요.` };
    }
    if (input.birthYear !== null) {
      const { min, max } = clampYearRange();
      if (!Number.isInteger(input.birthYear) || input.birthYear < min || input.birthYear > max) {
        return { ok: false, error: `출생년도는 ${min}~${max} 사이여야 해요.` };
      }
    }
    if (input.metYear !== null) {
      const { min, max } = clampYearRange();
      if (!Number.isInteger(input.metYear) || input.metYear < min || input.metYear > max) {
        return { ok: false, error: `처음 만난 연도는 ${min}~${max} 사이여야 해요.` };
      }
    }
    relation = r === "" ? null : r;
    category = c === "" ? null : c;
    birthYear = input.birthYear;
    metYear = input.metYear;
  }

  const memo = input.memo?.trim() ?? "";
  return {
    ok: true,
    value: {
      subjectType,
      name,
      relation,
      birthYear,
      category,
      metYear,
      memo: memo === "" ? null : memo,
    },
  };
}

// ────────────────────────────────────────────────────────────────────
// CRUD
// ────────────────────────────────────────────────────────────────────

const PERSON_SELECT = {
  id: true,
  subjectType: true,
  name: true,
  relation: true,
  birthYear: true,
  category: true,
  metYear: true,
  memo: true,
  createdAt: true,
  updatedAt: true,
} as const;

// 새 주체 생성. 검증 실패 시 throw (server action 이 잡아 폼 에러로 변환).
export async function createPerson(
  userId: string,
  input: PersonInput,
): Promise<Person> {
  const v = validatePersonInput(input);
  if (!v.ok) throw new Error(v.error);
  const row = await prisma.person.create({
    data: { userId, ...v.value },
    select: PERSON_SELECT,
  });
  return row as Person;
}

// 본인 주체만 수정. 권한 불일치 시 null (server action 이 404/403 매핑).
export async function updatePerson(
  userId: string,
  personId: string,
  input: PersonInput,
): Promise<Person | null> {
  const v = validatePersonInput(input);
  if (!v.ok) throw new Error(v.error);
  const result = await prisma.person.updateMany({
    where: { id: personId, userId },
    data: v.value,
  });
  if (result.count === 0) return null;
  // updateMany 는 갱신된 행을 반환하지 않으므로 다시 조회.
  const row = await prisma.person.findUnique({
    where: { id: personId },
    select: PERSON_SELECT,
  });
  return row as Person | null;
}

// 본인 인물만 삭제. cascade 로 PersonEvent 행도 함께 사라짐.
export async function deletePerson(
  userId: string,
  personId: string,
): Promise<boolean> {
  const result = await prisma.person.deleteMany({
    where: { id: personId, userId },
  });
  return result.count > 0;
}

// 사용자 전체 주체 목록 (person+location+thing). 탭 필터는 호출자(UI)에서.
// 이름 한글 정렬은 DB locale 이슈가 있으므로 기본 ASC + 후처리 안 함.
export async function listPeople(userId: string): Promise<Person[]> {
  const rows = await prisma.person.findMany({
    where: { userId },
    select: PERSON_SELECT,
    orderBy: { name: "asc" },
  });
  return rows as Person[];
}

// 본인 주체만 단일 조회. 권한 불일치 시 null.
export async function getPerson(
  userId: string,
  personId: string,
): Promise<Person | null> {
  const row = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: PERSON_SELECT,
  });
  return row as Person | null;
}

// ────────────────────────────────────────────────────────────────────
// Person ↔ Event 링크
// ────────────────────────────────────────────────────────────────────

function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

export type LinkResult = "linked" | "already" | "not_found" | "not_linkable";

// PersonEvent 생성. 두 ID 모두 같은 userId 소유여야 하고, memoryId 는
// 연결 가능한 종류(life_event 또는 photo)여야 함. era_event 등은 거부.
// 이미 연결돼 있으면 "already" (idempotent).
export async function linkPersonToEvent(
  userId: string,
  personId: string,
  memoryId: string,
): Promise<LinkResult> {
  // 두 행을 동시에 검증 — 한 번의 findMany 보다 명시적인 두 read 가 가독.
  const person = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: { id: true },
  });
  if (!person) return "not_found";

  const memory = await prisma.userMemory.findFirst({
    where: { id: memoryId, userId },
    select: { createdVia: true },
  });
  if (!memory) return "not_found";
  if (!LINKABLE_CREATED_VIA.has(memory.createdVia)) return "not_linkable";

  try {
    await prisma.personEvent.create({
      data: { personId, memoryId, userId },
    });
    return "linked";
  } catch (e) {
    if (isP2002(e)) return "already"; // 동시 클릭/재전송 — idempotent
    throw e;
  }
}

// PersonEvent 삭제. 권한 검증은 userId 일치 필수 — 다른 사용자가 같은
// (personId, memoryId) 를 요청해도 deleteMany 가 count=0.
export async function unlinkPersonFromEvent(
  userId: string,
  personId: string,
  memoryId: string,
): Promise<boolean> {
  const result = await prisma.personEvent.deleteMany({
    where: { personId, memoryId, userId },
  });
  return result.count > 0;
}

// ────────────────────────────────────────────────────────────────────
// 조회 — 이벤트→인물, 인물→이벤트
// ────────────────────────────────────────────────────────────────────

// /people 목록 — 인물별 연결 이벤트 수. groupBy 1쿼리로 N+1 회피.
// 카드에 "N개 사건과 함께한 분" 표시용. 0 인 인물은 맵에 없으므로
// 호출자가 ?? 0 처리.
export async function countEventsPerPerson(
  userId: string,
): Promise<Map<string, number>> {
  const rows = await prisma.personEvent.groupBy({
    by: ["personId"],
    where: { userId },
    _count: { _all: true },
  });
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.personId, r._count._all);
  return m;
}

// 연혁 화면 미리보기 — 여러 memoryId 에 대해 한 번에 주체 이름 목록 조회.
// /life-timeline 의 인물 칩(👤 철수, 영희) 용도. 이벤트 N개에 대해 매번
// listPeopleByEvent 부르면 N 쿼리 → 단일 IN 쿼리 1회로 회피.
//
// 반환: Map<memoryId, {id, name, subjectType}[]> — name ko-locale 정렬.
export async function listPeopleByEventBatch(
  userId: string,
  memoryIds: string[],
): Promise<Map<string, { id: string; name: string; subjectType: SubjectType }[]>> {
  const result = new Map<string, { id: string; name: string; subjectType: SubjectType }[]>();
  if (memoryIds.length === 0) return result;
  const rows = await prisma.personEvent.findMany({
    where: { userId, memoryId: { in: memoryIds } },
    select: {
      memoryId: true,
      person: { select: { id: true, name: true, subjectType: true } },
    },
  });
  for (const r of rows) {
    const arr = result.get(r.memoryId) ?? [];
    arr.push({ ...r.person, subjectType: (r.person.subjectType as SubjectType) });
    result.set(r.memoryId, arr);
  }
  for (const arr of result.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  return result;
}

// 특정 이벤트에 연결된 인물 목록. P2 의 이벤트 상세 화면이 사용.
// 정렬: name ASC (listPeople 와 동일).
export async function listPeopleByEvent(
  userId: string,
  memoryId: string,
): Promise<Person[]> {
  const rows = await prisma.personEvent.findMany({
    where: { memoryId, userId },
    select: {
      person: { select: PERSON_SELECT },
    },
  });
  return rows
    .map((r) => r.person as Person)
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// 특정 인물에 연결된 이벤트 목록. getLifeEvents 와 같은 LifeEvent 형태로
// 돌려줘 호출자(P2 인물 상세 화면) 가 같은 카드 컴포넌트를 재사용 가능.
// 정렬: eventYear ASC → eventMonth ASC NULLS LAST → createdAt ASC.
export async function listEventsByPerson(
  userId: string,
  personId: string,
): Promise<LifeEvent[]> {
  // 권한 1차 — 인물이 본인 소유인지.
  const owns = await prisma.person.findFirst({
    where: { id: personId, userId },
    select: { id: true },
  });
  if (!owns) return [];

  const rows = await prisma.personEvent.findMany({
    where: { personId, userId },
    select: {
      memory: {
        select: {
          id: true,
          eventTitle: true,
          title: true,
          eventYear: true,
          eventMonth: true,
          endYear: true,
          endMonth: true,
          precision: true,
          category: true,
          content: true,
          createdAt: true,
          createdVia: true,
          placeName: true,
          placeAddress: true,
          lat: true,
          lng: true,
          placeSource: true,
        },
      },
    },
  });

  // 연결 가능한 종류(life_event + photo)만 반환 (방어 — 링크 헬퍼가 거르지만
  // 데이터 손상 케이스 보호). eventYear NULL 도 제외 (getLifeEvents 와 동일 약속).
  const filtered = rows
    .map((r) => r.memory)
    .filter(
      (m) => LINKABLE_CREATED_VIA.has(m.createdVia) && m.eventYear !== null,
    );

  filtered.sort((a, b) => {
    if (a.eventYear !== b.eventYear) {
      return (a.eventYear as number) - (b.eventYear as number);
    }
    // NULLS LAST
    const am = a.eventMonth;
    const bm = b.eventMonth;
    if (am === null && bm === null) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    if (am === null) return 1;
    if (bm === null) return -1;
    if (am !== bm) return am - bm;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return filtered.map((m) => ({
    // B — life_event + photo 둘 다 연결 가능. era 행은 거부 정책이라 도달 X.
    // 실제 createdVia 로 kind 반영 → /people/[id] 가 "철수 나온 사진"도 표시.
    kind:
      m.createdVia === CREATED_VIA_PHOTO
        ? ("photo" as const)
        : ("life_event" as const),
    id: m.id,
    title: m.eventTitle ?? m.title,
    eventYear: m.eventYear as number,
    eventMonth: m.eventMonth,
    precision: (m.precision ?? "APPROXIMATE") as EventPrecision,
    category: m.category as LifeCategory | null,
    content: m.content,
    endYear: m.endYear,
    endMonth: m.endMonth,
    place: {
      placeName: m.placeName,
      placeAddress: m.placeAddress,
      lat: m.lat,
      lng: m.lng,
      placeSource: m.placeSource,
    },
    createdAt: m.createdAt,
    eraDescription: null,
    eraSource: null,
    eraSection: null,
    monthEventId: null,
    // 인물 연결은 life_event 만 — 첨부 사진 미리보기는 이 화면 범위 밖이라 빈 배열.
    photos: [],
    audioPath: null,
  }));
}
