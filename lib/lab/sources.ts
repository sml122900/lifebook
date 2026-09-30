// 기억 에이전트 연구 트랙 — 원본 어댑터 7종 (R1-6). 원본 테이블은 읽기만 한다.
//
// 원본 1건 → SourceUnit 1개(카드 추출 입력). phase/기억에이전트_R1-R4_기획.md §1-2·§2-3.
//   SKELETON_EVENT    v3 LifeEvent CONFIRMED·CORRECTED (UNCONFIRMED = 시스템 추정값, SKIPPED 제외)
//   EPISODE           v3 Episode(content + rawTranscript) — 연도는 연결된 골격에서
//   LIFE_EVENT_MEMORY v2 UserMemory life_event, isDraft=false (미승인 초안 제외)
//   ERA_MEMORY        UserMemory era_event 중 본인 회상(content)이 있는 것
//   PHOTO_MEMORY      UserMemory photo 중 캡션(content)이 있는 것
//   PERSON_MEMO       Person(isDraft=false) 중 memo 또는 metYear 가 있는 것
//   PROFILE           LifeProfile + User.userPreferences (사용자 직접 입력만)
// 원본으로 쓰지 않는 것: UserMemory episode(Episode 복제 브릿지 — 연도가 placeholder),
// companion·free_recording 전사(R4), timemachine_*·ai_chat·manual(레거시),
// timemachine_assistant·User.extractedPreferences(AI 생성물), 가족 댓글·반응(타인 발화).
//
// 해시 = sha256(정규화 본문 + 메타 + EXTRACTOR_VERSION + sessionKey). 공백만 바뀐 수정은
// 같은 해시, 인물·장소 순서도 무관. 버전을 올리면 전체가 "변경"으로 잡혀 재추출된다.

import { createHash } from "node:crypto";

import { prisma } from "../db";
import {
  LIFE_CATEGORY_STAGE,
  LIFE_EVENT_TYPE_STAGE,
  STAGE_DURATION,
  type LifeStage,
} from "./period";

export const EXTRACTOR_VERSION = "r1-v1";

export const SOURCE_TYPES = [
  "SKELETON_EVENT",
  "EPISODE",
  "LIFE_EVENT_MEMORY",
  "ERA_MEMORY",
  "PHOTO_MEMORY",
  "PERSON_MEMO",
  "PROFILE",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export type SourceUnit = {
  sourceType: SourceType;
  sourceId: string;
  // 추출 입력 본문. 키 = 카드의 quoteField(인용 위치 검증 대상). 빈 값은 넣지 않는다.
  fields: Record<string, string>;
  title: string | null;
  yearFrom: number | null;
  yearTo: number | null;
  month: number | null;
  timeBasis: "SOURCE_FIELD" | "SKELETON" | "NONE";
  lifeStage: LifeStage | null;
  personIds: string[];
  placeNames: string[];
  // 해시에 들어가는 그 밖의 메타(상태·관계 등).
  extra: Record<string, string | number | boolean | null>;
  createdAt: Date;
  sessionKey: string; // createdAt 의 KST 날짜 — L2 "서로 다른 날" 판정 키
  hash: string;
};

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
export function kstDate(d: Date): string {
  return new Date(d.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

export function normText(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim();
}

type UnitDraft = Omit<SourceUnit, "sessionKey" | "hash">;

export function finalizeUnit(d: UnitDraft): SourceUnit {
  const sessionKey = kstDate(d.createdAt);
  const fields = Object.fromEntries(
    Object.entries(d.fields)
      .map(([k, v]) => [k, normText(v)] as const)
      .filter(([, v]) => v !== "")
      .sort(([a], [b]) => a.localeCompare(b)),
  );
  const canonical = JSON.stringify([
    EXTRACTOR_VERSION,
    d.sourceType,
    d.sourceId,
    fields,
    d.title === null ? null : normText(d.title),
    d.yearFrom,
    d.yearTo,
    d.month,
    d.timeBasis,
    d.lifeStage,
    [...d.personIds].sort(),
    d.placeNames.map(normText).sort(),
    Object.entries(d.extra).sort(([a], [b]) => a.localeCompare(b)),
    sessionKey,
  ]);
  return {
    ...d,
    fields,
    sessionKey,
    hash: createHash("sha256").update(canonical).digest("hex"),
  };
}

function nonEmpty(s: string | null | undefined): s is string {
  return typeof s === "string" && s.trim() !== "";
}

function joinList(xs: readonly string[]): string {
  return xs
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
}

export async function loadSourceUnits(userId: string): Promise<SourceUnit[]> {
  const [
    skeleton,
    episodes,
    lifeMemories,
    eraMemories,
    photoMemories,
    people,
    profile,
    user,
  ] = await Promise.all([
    prisma.lifeEvent.findMany({
      where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
      select: {
        id: true,
        type: true,
        label: true,
        year: true,
        status: true,
        correctedYear: true,
        correctedLabel: true,
        confirmedAt: true,
        createdAt: true,
        people: { select: { personId: true } },
      },
    }),
    prisma.episode.findMany({
      where: { lifeEvent: { userId } },
      select: {
        id: true,
        content: true,
        rawTranscript: true,
        personId: true,
        isPeriod: true,
        createdAt: true,
        lifeEvent: {
          select: {
            type: true,
            label: true,
            correctedLabel: true,
            year: true,
            correctedYear: true,
          },
        },
        memory: {
          select: {
            places: {
              select: { placeName: true },
              orderBy: { sortOrder: "asc" },
            },
          },
        },
      },
    }),
    prisma.userMemory.findMany({
      where: { userId, createdVia: "life_event", isDraft: false },
      select: {
        id: true,
        title: true,
        eventTitle: true,
        content: true,
        year: true,
        month: true,
        eventYear: true,
        eventMonth: true,
        endYear: true,
        category: true,
        createdAt: true,
        personEvents: { select: { personId: true } },
        places: { select: { placeName: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.userMemory.findMany({
      where: { userId, createdVia: "era_event", content: { not: null } },
      select: {
        id: true,
        content: true,
        year: true,
        month: true,
        createdAt: true,
        monthEvent: { select: { title: true } },
      },
    }),
    prisma.userMemory.findMany({
      where: { userId, createdVia: "photo", content: { not: null } },
      select: {
        id: true,
        content: true,
        year: true,
        month: true,
        eventYear: true,
        eventMonth: true,
        createdAt: true,
        personEvents: { select: { personId: true } },
        places: { select: { placeName: true }, orderBy: { sortOrder: "asc" } },
      },
    }),
    prisma.person.findMany({
      where: { userId, isDraft: false },
      select: {
        id: true,
        subjectType: true,
        name: true,
        relation: true,
        category: true,
        birthYear: true,
        metYear: true,
        memo: true,
        createdAt: true,
      },
    }),
    prisma.lifeProfile.findUnique({ where: { userId } }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { userPreferences: true, createdAt: true },
    }),
  ]);

  const units: SourceUnit[] = [];

  // 골격 연도(정정 우선) — 기간 에피소드의 끝을 "다음 골격 사건 직전 해"로 잡는 데 쓴다.
  const skeletonYears = skeleton
    .map((e) => e.correctedYear ?? e.year)
    .filter((y): y is number => y !== null)
    .sort((a, b) => a - b);

  // ── SKELETON_EVENT ──
  for (const e of skeleton) {
    const year = e.correctedYear ?? e.year;
    units.push(
      finalizeUnit({
        sourceType: "SKELETON_EVENT",
        sourceId: e.id,
        fields: { label: e.correctedLabel ?? e.label },
        title: e.correctedLabel ?? e.label,
        yearFrom: year,
        yearTo: year,
        month: null,
        timeBasis: year === null ? "NONE" : "SKELETON",
        lifeStage: LIFE_EVENT_TYPE_STAGE[e.type] ?? null,
        personIds: e.people.map((p) => p.personId),
        placeNames: [],
        extra: { type: e.type, status: e.status },
        createdAt: e.confirmedAt ?? e.createdAt,
      }),
    );
  }

  // ── EPISODE ──
  for (const ep of episodes) {
    const ev = ep.lifeEvent;
    const start = ev.correctedYear ?? ev.year;
    const stage = LIFE_EVENT_TYPE_STAGE[ev.type] ?? null;
    let yearTo = start;
    if (start !== null && ep.isPeriod) {
      // 앵커 사건 "이후" 구간 — 다음 골격 사건 직전 해까지(없으면 5년).
      const next = skeletonYears.find((y) => y > start);
      yearTo = next !== undefined ? next - 1 : start + 5;
    } else if (
      start !== null &&
      stage &&
      stage !== "MARRIAGE" &&
      stage !== "FIRST_JOB"
    ) {
      // 학교·군 복무 이야기는 그 기간 전체(입학·입대 연도 + 기본 기간).
      yearTo = start + STAGE_DURATION[stage];
    }
    units.push(
      finalizeUnit({
        sourceType: "EPISODE",
        sourceId: ep.id,
        fields: {
          content: ep.content,
          ...(nonEmpty(ep.rawTranscript)
            ? { rawTranscript: ep.rawTranscript }
            : {}),
        },
        title: ev.correctedLabel ?? ev.label,
        yearFrom: start,
        yearTo,
        month: null,
        timeBasis: start === null ? "NONE" : "SKELETON",
        lifeStage: stage,
        personIds: ep.personId ? [ep.personId] : [],
        placeNames: ep.memory.places.map((p) => p.placeName),
        extra: { lifeEventType: ev.type, isPeriod: ep.isPeriod },
        createdAt: ep.createdAt,
      }),
    );
  }

  // ── LIFE_EVENT_MEMORY ──
  for (const m of lifeMemories) {
    const year = m.eventYear ?? m.year;
    units.push(
      finalizeUnit({
        sourceType: "LIFE_EVENT_MEMORY",
        sourceId: m.id,
        fields: {
          title: m.eventTitle ?? m.title,
          ...(nonEmpty(m.content) ? { content: m.content } : {}),
        },
        title: m.eventTitle ?? m.title,
        yearFrom: year,
        yearTo: m.endYear ?? year,
        month: m.eventMonth ?? m.month,
        timeBasis: "SOURCE_FIELD",
        lifeStage: m.category
          ? (LIFE_CATEGORY_STAGE[m.category] ?? null)
          : null,
        personIds: m.personEvents.map((p) => p.personId),
        placeNames: m.places.map((p) => p.placeName),
        extra: { category: m.category },
        createdAt: m.createdAt,
      }),
    );
  }

  // ── ERA_MEMORY ── (시대 사건 자체는 맥락일 뿐 — 카드 대상은 본인 회상)
  for (const m of eraMemories) {
    if (!nonEmpty(m.content)) continue;
    units.push(
      finalizeUnit({
        sourceType: "ERA_MEMORY",
        sourceId: m.id,
        fields: { content: m.content },
        title: m.monthEvent?.title ?? null,
        yearFrom: m.year,
        yearTo: m.year,
        month: m.month,
        timeBasis: "SOURCE_FIELD",
        lifeStage: null,
        personIds: [],
        placeNames: [],
        extra: { eraTitle: m.monthEvent?.title ?? null },
        createdAt: m.createdAt,
      }),
    );
  }

  // ── PHOTO_MEMORY ── (이미지 분석 없음 — 캡션만)
  for (const m of photoMemories) {
    if (!nonEmpty(m.content)) continue;
    const year = m.eventYear ?? m.year;
    units.push(
      finalizeUnit({
        sourceType: "PHOTO_MEMORY",
        sourceId: m.id,
        fields: { content: m.content },
        title: null,
        yearFrom: year,
        yearTo: year,
        month: m.eventMonth ?? m.month,
        timeBasis: "SOURCE_FIELD",
        lifeStage: null,
        personIds: m.personEvents.map((p) => p.personId),
        placeNames: m.places.map((p) => p.placeName),
        extra: {},
        createdAt: m.createdAt,
      }),
    );
  }

  // ── PERSON_MEMO ── (민감정보 걸러내기는 추출 단계 — 여기선 원문 그대로)
  for (const p of people) {
    if (!nonEmpty(p.memo) && p.metYear === null) continue;
    units.push(
      finalizeUnit({
        sourceType: "PERSON_MEMO",
        sourceId: p.id,
        fields: nonEmpty(p.memo) ? { memo: p.memo } : {},
        title: p.name,
        yearFrom: p.metYear,
        yearTo: p.metYear,
        month: null,
        timeBasis: p.metYear === null ? "NONE" : "SOURCE_FIELD",
        lifeStage: null,
        personIds: [p.id],
        placeNames: [],
        extra: {
          subjectType: p.subjectType,
          relation: p.relation,
          category: p.category,
          birthYear: p.birthYear,
        },
        createdAt: p.createdAt,
      }),
    );
  }

  // ── PROFILE ──
  const profileFields: Record<string, string> = {};
  if (profile) {
    const lists: [string, readonly string[]][] = [
      ["interests", profile.interests],
      ["schools", profile.schools],
      ["residences", profile.residences],
      ["favMovies", profile.favMovies],
      ["favGames", profile.favGames],
      ["favMusic", profile.favMusic],
    ];
    for (const [k, v] of lists) if (joinList(v)) profileFields[k] = joinList(v);
    const texts: [string, string | null][] = [
      ["parentsInfo", profile.parentsInfo],
      ["siblings", profile.siblings],
      ["closeFriends", profile.closeFriends],
      ["hobbies", profile.hobbies],
    ];
    for (const [k, v] of texts) if (nonEmpty(v)) profileFields[k] = v;
  }
  if (user && joinList(user.userPreferences))
    profileFields.userPreferences = joinList(user.userPreferences);
  if (Object.keys(profileFields).length > 0 && user) {
    units.push(
      finalizeUnit({
        sourceType: "PROFILE",
        sourceId: userId,
        fields: profileFields,
        title: null,
        yearFrom: null,
        yearTo: null,
        month: null,
        timeBasis: "NONE",
        lifeStage: null,
        personIds: [],
        placeNames: [],
        extra: {},
        createdAt: profile?.updatedAt ?? user.createdAt,
      }),
    );
  }

  return units;
}
