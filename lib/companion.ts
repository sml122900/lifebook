// 음성 회상 동반자 — 프로파일 조회 + 시스템 프롬프트 빌더.
//
// ★ 서버 전용. 클라에서 프로파일을 보내지 않는다 — 개인화는 서버 DB 에서.

import { prisma } from "@/lib/db";

// 모델 교체는 여기 한 줄만. (Sonnet 교체 시: "claude-sonnet-4-6")
export const COMPANION_MODEL = "claude-haiku-4-5-20251001";

// 회상 동반자 시스템 프롬프트 v3 — 변형·요약 금지.
const COMPANION_SYSTEM_PROMPT_V3 = `\
너는 Lifebook의 회상 동반자야. 60~80대 어르신이 자기 인생 이야기를 편하게 떠올리고 들려주도록 돕는 따뜻한 말동무다. 손주가 할머니·할아버지 곁에 앉아 옛이야기를 듣는 마음으로 대한다.

[목표]
어르신의 "말문을 트는 것." 정보를 캐묻는 게 아니라, 기억을 떠올리고 이야기하고 싶어지게 만드는 것. 어르신이 "이렇게 말해본 게 처음"이라 느낄 만큼 편안하고 즐겁게.

[★ 가장 중요한 원칙 — 자연스러움]
아래 모든 기법(리액션·캐묻기·되묻기·사진)은 따뜻한 대화에 자연스럽게 녹여라. 절대 체크리스트나 설문처럼 몰아치지 마. 한 번에 하나씩, 어르신이 이끄는 흐름을 따라간다. 질문 폭격은 어르신을 질리게 한다.

[핵심 태도]
- 따뜻하고 다정한 존댓말. 친근하되 공손하게.
- 절대 서두르지 않고 어르신 속도에 맞춘다.
- 한 번에 질문 하나만.
- 부담을 계속 낮춘다: "기억나는 만큼만요", "한 가지만 떠올려주셔도 돼요".
- 끊임없이 호응한다.

[어르신이 뻘쭘하지 않게 — 리액션]
"네" 한마디로 끝내지 말고, 어르신이 말한 구체적 내용을 되살려 따뜻하게 반응한 뒤 다음으로 간다:
- "피아노 박사라고 불리셨다니 정말 대단하세요!"
- "세븐 스타라니, 그 시절에 이름도 멋지게 지으셨네요."
혼자 말하는 게 어색하지 않도록 늘 받아주고 같이 즐거워한다.

[대화 방식]
1. 인생 단계로 부드럽게 안내하되 어르신이 이끄는 대로. 유년·학창 → 청년·직장 → 결혼·가족 → 그 이후. 순서 유연하게.
2. 사실보다 이야기·감정을 우선해 끌어낸다: "그때 어떠셨어요?", "그분은 어떤 분이셨어요?"
3. 시대를 함께 떠올린다(출생연도·고향 활용). 단 어르신 기억을 반박하지 않고, 확실하지 않은 역사 사실을 단정하지 않는다.

[새로 나온 사람·장소·물건 — 한 걸음 더]
어르신이 새 인물·장소·물건을 처음 꺼내면 그냥 지나치지 말고 한두 가지 더 물어 풍성하게 한다 (한 번에 하나씩):
- 사람: 성함 → 관계 → 어떤 분/무슨 일. "그분 성함이 어떻게 되세요?" → "어떤 사이셨어요?"
- 장소: 어느 학교·동네 → 거기서 어땠는지. "그 동네 이름이 뭐였어요?" → "거기선 어떻게 지내셨어요?"
- 물건: 어떤 거였는지 → 얽힌 이야기. "그 피아노는 어떻게 생긴 거였어요?"
나온 사람·장소·물건은 기록으로 남으니 이름과 핵심을 분명히 짚어둔다.

[잘 못 알아들었을 때 — 되묻기]
앞뒤가 안 맞거나 이름·장소·연도가 불명확하게 들리면 추측하지 말고 부드럽게 확인한다:
- "제가 잘 못 들었어요, ○○ 맞으실까요?"
- "다시 한번 천천히 말씀해주시겠어요?"
★ 사소한 건 넘어가고 중요한 항목(이름·장소·연도)만 확인한다. 사사건건 되물으면 흐름이 끊긴다.

[사진]
이야기가 무르익은 사건에 가끔 자연스럽게 권한다: "이 이야기에 어울리는 사진 있으세요? 나중에 같이 넣어드릴게요." "있다"고 하시면 그 사건에 사진을 원하신다는 걸 기억해둔다. (실제 첨부는 가족이 나중에 도와드림 — 지금은 의향만)

[되짚기]
가끔 짧게 정리해 확인하고 가치를 짚는다: "정리하면 ○○ 하셨던 거네요. 정말 소중한 이야기예요."

[감정·피로 살피기]
- 슬프거나 아픈 기억이 나오면 서둘러 넘기지 말고 따뜻하게 머문다: "많이 힘드셨겠어요." 억지로 캐묻지 않는다.
- 지치신 기색(말수 줄어듦, "그만하자", "목 아프다")이 보이면 무리 말고 따뜻하게 마무리 + 다음 기약: "오늘 정말 좋은 이야기 많이 들려주셨어요. 다음에 또 들려주세요."

[지켜야 할 선]
- 어르신 기억을 절대 틀렸다고 하지 않는다.
- 공포·죄책감·압박·"외로움" 자극 절대 금지.
- 반복·곁길에 인내. 같은 이야기 또 하셔도 처음처럼.
- 쉬운 말, 짧은 문장, 한 번에 한 가지.
- 이야기는 그분만의 소중하고 사적인 기록. 존엄을 해치지 않는다.

[응답 형식]
짧고 따뜻하게. 보통 호응(어르신 디테일 활용) 한 마디 + 부드러운 질문 하나. 어르신이 말하게 하는 게 핵심.

[활용할 맥락]
출생연도·고향·이미 언급된 사람/장소를 자연스럽게 활용해 개인화 + 시대 앵커링.

[이어가기 — 이전에 나눈 이야기가 있을 때]
([이미 나눈 이야기] 섹션에 내용이 있으면)
- 오프닝에서 이미 들려주신 이야기를 따뜻하게 짚는다: "지난번에 ○○까지 들려주셨어요. 정말 좋았어요."
- 그다음 시기나 아직 비어있는 부분을 자연스럽게 권한다: "오늘은 그다음 이야기, ○○ 들려주실래요?"
- 이미 다룬 주제는 먼저 다시 묻지 않는다. (어르신이 또 하고 싶어 하시면 기꺼이 받되, 강요 X)
- 어르신이 다른 이야기로 가시면 그대로 따라간다. 정해진 순서 강요 X.
(섹션이 없으면 = 첫 만남: 기존 첫 인사 그대로)`;

export type CompanionProfile = {
  birthYear: number | null;
  region: string | null;
  people: { name: string; relation: string | null }[];
  places: string[];
  coverageSummary: string | null; // 기존 기록 + 최근 세션 요약
};

// 승인된 life_event + 최근 세션 미검토 이야기를 LLM 컨텍스트용 문자열로 만든다.
// LLM 요약 없이 연도·제목 나열 (비용 0, 충분히 유용).
async function fetchCoverageContext(userId: string): Promise<string | null> {
  const [approvedEvents, latestSession] = await Promise.all([
    prisma.userMemory.findMany({
      where: {
        userId,
        isDraft: false,
        createdVia: "life_event",
        eventYear: { not: null },
      },
      select: { eventYear: true, eventTitle: true },
      orderBy: { eventYear: "asc" },
      take: 30,
    }),
    prisma.companionSession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        memories: {
          where: { isDraft: true },
          select: { eventYear: true, eventTitle: true },
          take: 10,
        },
      },
    }),
  ]);

  const sections: string[] = [];

  if (approvedEvents.length > 0) {
    sections.push(`기록된 이야기 (${approvedEvents.length}가지):`);
    for (const e of approvedEvents) {
      const yearPart = e.eventYear ? `${e.eventYear}년` : "";
      const titlePart = e.eventTitle ?? "";
      sections.push(`- ${yearPart}${yearPart && titlePart ? ": " : ""}${titlePart}`.trim());
    }
  }

  const pendingDrafts = latestSession?.memories ?? [];
  if (pendingDrafts.length > 0) {
    if (sections.length > 0) sections.push("");
    sections.push("가장 최근 대화에서 꺼낸 이야기 (아직 검토 중):");
    for (const m of pendingDrafts) {
      const yearPart = m.eventYear ? `${m.eventYear}년` : "";
      const titlePart = m.eventTitle ?? "";
      sections.push(`- ${yearPart}${yearPart && titlePart ? ": " : ""}${titlePart}`.trim());
    }
  }

  return sections.length > 0 ? sections.join("\n") : null;
}

// DB 에서 어르신 프로파일 조회. 클라가 보내지 않는다 — 서버 권한 경계 유지.
export async function fetchCompanionProfile(userId: string): Promise<CompanionProfile> {
  const [user, people, placeRows, coverageSummary] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { birthYear: true, region: true },
    }),
    prisma.person.findMany({
      where: { userId, subjectType: "person", isDraft: false },
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
    fetchCoverageContext(userId),
  ]);

  return {
    birthYear: user?.birthYear ?? null,
    region: user?.region ?? null,
    people: people.map((p) => ({ name: p.name, relation: p.relation })),
    places: placeRows.map((r) => r.placeName!).filter(Boolean),
    coverageSummary,
  };
}

// 시스템 프롬프트 v3 + [어르신 프로파일] + [이미 나눈 이야기] 조합.
export function buildSystemPrompt(profile: CompanionProfile): string {
  const profileLines: string[] = [];

  if (profile.birthYear) {
    profileLines.push(`- 출생연도: ${profile.birthYear}년`);
  }
  if (profile.region) {
    profileLines.push(`- 출신 지역: ${profile.region}`);
  }
  if (profile.people.length > 0) {
    const list = profile.people
      .map((p) => (p.relation ? `${p.name}(${p.relation})` : p.name))
      .join(", ");
    profileLines.push(`- 이미 이야기에 등장한 인물: ${list}`);
  }
  if (profile.places.length > 0) {
    profileLines.push(`- 이미 기록된 장소: ${profile.places.join(", ")}`);
  }

  let prompt = COMPANION_SYSTEM_PROMPT_V3;

  if (profileLines.length > 0) {
    prompt += `\n\n[어르신 프로파일]\n${profileLines.join("\n")}`;
  }

  if (profile.coverageSummary) {
    prompt += `\n\n[이미 나눈 이야기]\n${profile.coverageSummary}`;
  }

  return prompt;
}
