"use server";

// 채팅 온보딩 완료 액션.
// User.birthYear / User.region / User.onboardingCompletedAt + LifeProfile 저장.
// redirect 는 호출자(클라)가 담당.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import { createPerson } from "@/lib/people";
import { createLifeEvent } from "@/lib/life-events";
import type { LifeCategory } from "@/lib/generated/prisma/enums";
import type { PlaceInfo } from "@/lib/place-types";

// companion-extraction.ts 와 동일 모델 (가족 관계 disambiguation)
const PEOPLE_EXTRACT_MODEL =
  process.env.COMPANION_EXTRACT_MODEL ?? "claude-sonnet-4-6";

// F3 이야기형 질문 사건 추출 모델 — 추출은 Sonnet 고정(전역 모델 무관·opus 차단).
const STORY_EXTRACT_MODEL =
  process.env.ONBOARDING_STORY_MODEL ?? "claude-sonnet-4-6";

const VALID_CATEGORIES = new Set([
  "BIRTH", "KINDERGARTEN", "ELEMENTARY", "MIDDLE", "HIGH",
  "UNIVERSITY", "MILITARY", "WORK", "MARRIAGE", "FAMILY",
]);

export type ParsedAnswers = {
  birthYear?: number;
  region?: string;
  residences?: string[];
  schools?: string[];
  // F3 보류: 이야기형 전환 예정 (아래 필드는 현재 온보딩에서 수집 안 함)
  favMovies?: string[];
  favGames?: string[];
  favMusic?: string[];
  siblings?: string;
  parentsInfo?: string;
  closeFriends?: string;
  hobbies?: string;
  // 장소 매핑 — residences/schools 의 PlaceInfo 배열 (병렬). lat=null 이면 미선택.
  residencePlaces?: PlaceInfo[];
  schoolPlaces?: PlaceInfo[];
};

// 인물 후보 — relation(관계/호칭) + name(알려진 경우)
export type PersonCandidate = {
  relation: string;
  name: string | null;
};

export async function completeOnboardingChat(answers: ParsedAnswers): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  const userUpdate: Record<string, unknown> = { onboardingCompletedAt: new Date() };
  if (answers.birthYear !== undefined) userUpdate.birthYear = answers.birthYear;
  if (answers.region?.trim()) userUpdate.region = answers.region.trim();

  await prisma.user.update({ where: { id: userId }, data: userUpdate });

  const profileData: Record<string, string | string[] | unknown> = {};
  const arrayFields = [
    "schools", "residences", "favMovies", "favGames", "favMusic",
  ] as const;
  for (const key of arrayFields) {
    const v = answers[key];
    if (v && v.length > 0) profileData[key] = v;
  }
  const strFields = ["parentsInfo", "siblings", "closeFriends", "hobbies"] as const;
  for (const key of strFields) {
    const v = answers[key];
    if (v?.trim()) profileData[key] = v.trim();
  }

  // 좌표가 있는 항목만 저장 (lat !== null 필터)
  const hasCoord = (p: PlaceInfo) => p.lat !== null;
  if (answers.residencePlaces?.some(hasCoord)) {
    profileData.residencePlaces = answers.residencePlaces;
  }
  if (answers.schoolPlaces?.some(hasCoord)) {
    profileData.schoolPlaces = answers.schoolPlaces;
  }

  if (Object.keys(profileData).length > 0) {
    await prisma.lifeProfile.upsert({
      where: { userId },
      create: { userId, ...profileData },
      update: profileData,
    });
  }
}

// 온보딩 텍스트 답변에서 인물 후보 추출 (Sonnet, 무료).
// 실패 시 [] — 호출자가 빈 후보=직행으로 처리.
export async function extractOnboardingPeople(
  answers: ParsedAnswers,
): Promise<PersonCandidate[]> {
  const parts: string[] = [];
  if (answers.siblings?.trim()) parts.push(`형제자매: ${answers.siblings}`);
  if (answers.parentsInfo?.trim()) parts.push(`부모님: ${answers.parentsInfo}`);
  if (answers.closeFriends?.trim()) parts.push(`친한 친구: ${answers.closeFriends}`);

  if (parts.length === 0) return [];

  const text = parts.join("\n");

  const userMsg = `사용자의 온보딩 답변에서 언급된 실제 인물을 추출하세요.
포함: 가족 구성원(어머니·아버지·오빠·언니·남동생·여동생·할머니·할아버지 등), 친한 친구, 중요한 지인.
제외: 역사 인물, 연예인, 단순 직책만 언급("선생님 한 분" 처럼 특정 인물 아닌 경우).
이름이 언급됐으면 name에 넣고, 없으면 null.
중복 없이 최대 5명.
반드시 유효한 JSON 배열만 출력: [{"name":"이름 또는 null","relation":"관계/호칭"}]
인물 없으면: []

---답변---
${text.slice(0, 600)}
---끝---`;

  try {
    const res = await chat([{ role: "user", content: userMsg }], {
      system: "유효한 JSON 배열만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.",
      model: PEOPLE_EXTRACT_MODEL,
      maxTokens: 256,
      temperature: 0.1,
    });

    const match = res.text.match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]) as unknown[];
    return arr
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => typeof x.relation === "string" && String(x.relation).trim())
      .map((x) => ({
        relation: String(x.relation).trim(),
        name:
          typeof x.name === "string" && x.name.trim()
            ? x.name.trim()
            : null,
      }))
      .slice(0, 5);
  } catch (e) {
    console.error("[extractOnboardingPeople]", e instanceof Error ? e.message : e);
    return [];
  }
}

// F3 — 이야기형 답변에서 인생 사건 추출 → life_event 즉시 등록.
//
// 동작:
//   1. Sonnet 으로 사건 추출 (birthYear 로 연도 추정 보조)
//   2. 연도가 있는 사건만 createLifeEvent(isDraft=false) — 바로 연혁 표시
//   3. 이야기당 최대 5건 cap
//   빈 이야기/추출 실패/연도 없는 사건 → count=0, 호출자가 넘어가기 처리
export async function extractAndSaveStoryEvents(
  story: string,
  birthYear?: number,
): Promise<{ count: number }> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  if (!story.trim()) return { count: 0 };

  const yearHint = birthYear
    ? `사용자는 ${birthYear}년생입니다. 연도가 명시되지 않으면 생년 + 카테고리 나이로 추정하세요: KINDERGARTEN=생년+5, ELEMENTARY=생년+8, MIDDLE=생년+14, HIGH=생년+16, UNIVERSITY=생년+20, MILITARY=생년+22, WORK=생년+25. 추정 불가능하면 null.`
    : "연도가 불확실하면 null.";

  const userMsg = `다음 이야기에서 사용자 인생의 구체적 사건을 추출하세요. ${yearHint}
제목은 간결하게(30자 이내). content는 이야기 내용을 한 문장(100자 이내)으로 요약.
카테고리는 다음 중 하나(맞는 게 없으면 null): ELEMENTARY, MIDDLE, HIGH, UNIVERSITY, MILITARY, WORK, MARRIAGE, FAMILY, KINDERGARTEN.
JSON 배열만 출력: [{"title":"...","year":숫자|null,"month":숫자|null,"content":"...","category":"..."|null}]
사건 없으면: []

---이야기---
${story.slice(0, 800)}
---끝---`;

  type RawEvent = {
    title: string;
    year: number | null;
    month: number | null;
    content: string | null;
    category: string | null;
  };

  let events: RawEvent[] = [];
  try {
    const res = await chat([{ role: "user", content: userMsg }], {
      system: "유효한 JSON 배열만 출력하세요. 다른 텍스트는 절대 출력하지 마세요.",
      model: STORY_EXTRACT_MODEL,
      maxTokens: 512,
      temperature: 0.1,
    });

    const match = res.text.match(/\[[\s\S]*\]/);
    if (match) {
      const arr = JSON.parse(match[0]) as unknown[];
      events = arr
        .filter(
          (x): x is Record<string, unknown> =>
            x !== null &&
            typeof x === "object" &&
            typeof (x as Record<string, unknown>).title === "string",
        )
        .map((x) => ({
          title: String(x.title).trim().slice(0, 100),
          year: typeof x.year === "number" ? Math.trunc(x.year) : null,
          month: typeof x.month === "number" ? Math.trunc(x.month) : null,
          content:
            typeof x.content === "string"
              ? x.content.trim().slice(0, 500) || null
              : null,
          category:
            typeof x.category === "string" && VALID_CATEGORIES.has(x.category)
              ? x.category
              : null,
        }))
        .filter((e) => e.title.length > 0);
    }
  } catch (e) {
    console.error("[extractAndSaveStoryEvents/extract]", e instanceof Error ? e.message : e);
    return { count: 0 };
  }

  // 연도 있는 사건만 저장, 이야기당 최대 5건
  let count = 0;
  for (const ev of events.slice(0, 5)) {
    if (!ev.year) continue;
    try {
      await createLifeEvent(
        userId,
        (ev.category ?? "FAMILY") as LifeCategory,
        {
          title: ev.title,
          year: ev.year,
          month: ev.month,
          content: ev.content,
          endYear: null,
          endMonth: null,
        },
      );
      count++;
    } catch (e) {
      console.error("[extractAndSaveStoryEvents/save]", e instanceof Error ? e.message : e);
    }
  }
  return { count };
}

// 온보딩에서 확인된 인물 저장 (isDraft=false 기본값).
// companion 추출과 달리 사용자가 채팅에서 직접 확인·입력한 것이므로 즉시 확정.
export async function saveOnboardingPerson(
  name: string,
  relation: string,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  await createPerson(session.user.id, {
    subjectType: "person",
    name: name.trim(),
    relation: relation.trim() || null,
    birthYear: null,
    category: null,
    metYear: null,
    memo: null,
  });
}
