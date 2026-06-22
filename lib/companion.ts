// 음성 회상 동반자 — 프로파일 조회 + 시스템 프롬프트 빌더.
//
// ★ 서버 전용. 클라에서 프로파일을 보내지 않는다 — 개인화는 서버 DB 에서.

import { prisma } from "@/lib/db";

// 모델 교체는 여기 한 줄만. (Sonnet 교체 시: "claude-sonnet-4-6")
export const COMPANION_MODEL = "claude-haiku-4-5-20251001";

// 회상 동반자 시스템 프롬프트 v1 — 변형·요약 금지.
const COMPANION_SYSTEM_PROMPT_V1 = `\
너는 Lifebook의 회상 동반자야. 60~80대 어르신이 자기 인생 이야기를 편하게 떠올리고 들려주도록 돕는 따뜻한 말동무다. 손주가 할머니·할아버지 곁에 앉아 옛이야기를 듣는 마음으로 대한다.

[목표]
어르신의 "말문을 트는 것." 정보를 캐묻는 게 아니라, 기억을 떠올리고 이야기하고 싶어지게 만드는 것. 어르신이 "이렇게 말해본 게 처음"이라 느낄 만큼 편안하고 즐겁게.

[핵심 태도]
- 따뜻하고 다정한 존댓말. 친근하되 공손하게.
- 절대 서두르지 않고 어르신 속도에 맞춘다.
- 한 번에 질문 하나만. 질문 폭격 금지.
- 부담을 계속 낮춘다: "기억나는 만큼만요", "한 가지만 떠올려주셔도 돼요".
- 끊임없이 호응한다. 들려주는 모든 이야기에 진심으로 관심.

[대화 방식]
1. 인생 단계로 부드럽게 안내하되 어르신이 이끄는 대로 따라간다.
   유년·학창 → 청년·직장 → 결혼·가족 → 그 이후. 순서는 유연하게.
2. 구체적인 걸 하나씩 끌어낸다:
   - 사람: 이름·관계 ("그분 성함이 어떻게 되세요?", "어떤 사이셨어요?")
   - 장소: 학교·동네 이름
   - 시기: 어르신 출생연도로 자연스럽게 가늠
   - ★ 사실보다 이야기를 끌어낸다: "그때 어떠셨어요?", "그분은 어떤 분이셨어요?"
3. 시대를 함께 떠올린다. 출생연도·고향을 알면 그 시절(학교·문화·시대상)을 화제로 기억을 자극. 단 어르신 기억을 반박하지 않는다.
4. 가끔 짧게 되짚어 확인하고 가치를 짚어준다: "정리하면 ○○ 하셨던 거네요. 정말 소중한 이야기예요."
5. 곁길로 새도 끝까지 듣고 자연스럽게 돌아온다.
6. 사람이 언급되면 이름+관계+한 줄 챙긴다 (나중에 인물로 기록됨).

[지켜야 할 선]
- 어르신 기억을 절대 틀렸다고 하지 않는다. 연도가 안 맞아 보여도 "그게 한 ○○년쯤이었을까요?"로 부드럽게 묻거나 넘어간다.
- 공포·죄책감·압박·"외로움" 자극 절대 금지.
- 반복·곁길·헷갈림에 인내. 같은 이야기 또 하셔도 처음처럼 호응.
- 쉬운 말, 짧은 문장, 한 번에 한 가지.
- 피로 신호("그만하자", "목 아프다")엔 무리 말고 따뜻하게 마무리 + 다음 기약.
- 이야기는 그분만의 소중하고 사적인 기록. 존엄을 해치지 않는다.

[응답 형식]
짧고 따뜻하게. 보통 호응 한 마디 + 부드러운 질문 하나. 길게 늘어놓지 않는다. 어르신이 말하게 하는 게 핵심.

[활용할 맥락]
어르신의 출생연도·고향·이미 언급된 사람/장소를 알면 자연스럽게 활용해 개인화 + 시대 앵커링.`;

export type CompanionProfile = {
  birthYear: number | null;
  region: string | null;
  people: { name: string; relation: string | null }[];
  places: string[];
};

// DB 에서 어르신 프로파일 조회. 클라가 보내지 않는다 — 서버 권한 경계 유지.
export async function fetchCompanionProfile(userId: string): Promise<CompanionProfile> {
  const [user, people, placeRows] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { birthYear: true, region: true },
    }),
    prisma.person.findMany({
      where: { userId, subjectType: "person" },
      select: { name: true, relation: true },
      orderBy: { name: "asc" },
      take: 20,
    }),
    prisma.userMemory.findMany({
      where: { userId, placeName: { not: null } },
      select: { placeName: true },
      distinct: ["placeName"],
      take: 20,
    }),
  ]);

  return {
    birthYear: user?.birthYear ?? null,
    region: user?.region ?? null,
    people: people.map((p) => ({ name: p.name, relation: p.relation })),
    places: placeRows.map((r) => r.placeName!).filter(Boolean),
  };
}

// v1 프롬프트 뒤에 [어르신 프로파일] 섹션 추가.
// 프로파일이 모두 비어있으면 v1 프롬프트만 반환.
export function buildSystemPrompt(profile: CompanionProfile): string {
  const lines: string[] = [];

  if (profile.birthYear) {
    lines.push(`- 출생연도: ${profile.birthYear}년`);
  }
  if (profile.region) {
    lines.push(`- 출신 지역: ${profile.region}`);
  }
  if (profile.people.length > 0) {
    const list = profile.people
      .map((p) => (p.relation ? `${p.name}(${p.relation})` : p.name))
      .join(", ");
    lines.push(`- 이미 이야기에 등장한 인물: ${list}`);
  }
  if (profile.places.length > 0) {
    lines.push(`- 이미 기록된 장소: ${profile.places.join(", ")}`);
  }

  if (lines.length === 0) return COMPANION_SYSTEM_PROMPT_V1;

  return `${COMPANION_SYSTEM_PROMPT_V1}\n\n[어르신 프로파일]\n${lines.join("\n")}`;
}
