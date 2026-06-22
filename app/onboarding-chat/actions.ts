"use server";

// 채팅 온보딩 완료 액션.
// User.birthYear / User.region / User.onboardingCompletedAt + LifeProfile 저장.
// redirect 는 호출자(클라)가 담당.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { chat } from "@/lib/ai";
import { createPerson } from "@/lib/people";
import type { PlaceInfo } from "@/lib/place-types";

// companion-extraction.ts 와 동일 모델 (가족 관계 disambiguation)
const PEOPLE_EXTRACT_MODEL =
  process.env.COMPANION_EXTRACT_MODEL ?? "claude-sonnet-4-6";

export type ParsedAnswers = {
  birthYear?: number;
  region?: string;
  interests?: string[];
  residences?: string[];
  schools?: string[];
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
    "interests", "schools", "residences", "favMovies", "favGames", "favMusic",
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
