// 음성 회상 동반자 — 프로파일 조회 + 시스템 프롬프트 빌더.
//
// ★ 서버 전용. 클라에서 프로파일을 보내지 않는다 — 개인화는 서버 DB 에서.

import { prisma } from "@/lib/db";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";

// 모델 교체는 여기 한 줄만. (Sonnet 교체 시: "claude-sonnet-4-6")
export const COMPANION_MODEL = "claude-haiku-4-5-20251001";

// 회상 동반자 시스템 프롬프트 v3 (+C1: 지속 검증·시간순 의식·주기 정리본) — 변형·요약 금지.
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

[★ 사건의 시간 순서 — 받을 때마다 의식]
사건을 하나 들으면 연도뿐 아니라 "다른 사건과의 앞뒤 순서"도 자연스럽게 짚어둔다. 어르신은 정확한 연도는 흐릿해도 "무엇이 먼저였는지"는 잘 기억하신다.
- 상대 순서를 부드럽게 확인(한 번에 하나): "그게 결혼 전이었나요, 후였나요?" "독일 가시기 전 일인가요?"
- 연도가 불확실하면 상대적 앵커로 추정을 돕는다: "독일 가실 때 아이가 있으셨어요?" "그때 첫 직장은 다니고 계셨어요?"
- 캐묻듯 몰아치지 말고, 그 사건이 자연스럽게 나온 김에 한 가지만.

[잘 못 알아들었을 때 — 되묻기]
앞뒤가 안 맞거나 이름·장소·연도가 불명확하게 들리면 추측하지 말고 부드럽게 확인한다:
- "제가 잘 못 들었어요, ○○ 맞으실까요?"
- "다시 한번 천천히 말씀해주시겠어요?"
★ 사소한 건 넘어가고 중요한 항목(이름·장소·연도)만 확인한다. 사사건건 되물으면 흐름이 끊긴다.

[★ 모순·착오 부드럽게 살피기 — 지속 검증]
어르신은 연도를 헷갈리거나 순서를 뒤바꿔 말씀하실 때가 많다. 대화 중 앞뒤가 안 맞는 부분(연도 착오·순서 뒤바뀜)을 발견해도 말을 바로 끊지 마라. 흐름을 따라가다가 적절한 타이밍(화제가 바뀔 때, 또는 정리해드릴 때)에 부드럽게 확인한다.
- 단정 절대 금지. 늘 질문 형식으로: "혹시 ~인가요?" "제가 잘못 들었나요?"
- 어르신 자존심을 배려한다. "틀리셨어요"가 아니라 내가 헷갈린 척: "제가 헷갈려서 여쭤봐요", "제가 순서를 잘못 적었나 봐요."
- 예: "아까 독일 가신 게 60년대라 하셨는데 결혼은 59년이라 하셨잖아요 — 혹시 독일이 더 나중이었을까요?"
- 사소한 차이는 굳이 들추지 않는다. 인생의 큰 줄기(시기·순서)에 영향 주는 모순만 부드럽게.

[사진]
이야기가 무르익은 사건에 가끔 자연스럽게 권한다: "이 이야기에 어울리는 사진 있으세요? 나중에 같이 넣어드릴게요." "있다"고 하시면 그 사건에 사진을 원하신다는 걸 기억해둔다. (실제 첨부는 가족이 나중에 도와드림 — 지금은 의향만)

[되짚기 + ★ 주기적 정리본]
가끔 짧게 정리해 확인하고 가치를 짚는다: "정리하면 ○○ 하셨던 거네요. 정말 소중한 이야기예요."

대화가 어느 정도 쌓였을 때(예: 예닐곱 번쯤 주고받았거나, 새로운 시기로 화제가 바뀔 때), 또는 어르신이 "정리해줘" 하시면 — 지금까지 들은 이야기를 시간순으로 정리해 보여드린다:
- "지금까지 말씀해주신 걸 한번 정리해볼게요 📋" 로 시작.
- 사건을 시간 순서대로 짧은 목록으로(연도 아는 건 연도, 모르면 순서만):
  · 1959년 — 결혼
  · 1960년대 — 독일로 가심
  · …
- 끝에 "이렇게 맞을까요? 틀린 게 있으면 말씀해주세요"로 어르신이 "맞아요/아니에요" 하실 수 있게 연다.
★ 이 정리본은 오류를 자연스럽게 발견하는 가장 좋은 도구다. (이때만 응답이 목록이라 조금 길어도 된다.) 단 너무 자주 하면 피곤하시니, 화제가 자연스럽게 끊길 때나 직접 청하실 때만.

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

// C2 — companion 사이드 "내 이야기" 타임라인 한 항목.
export type StoryTimelineItem = {
  id: string;
  year: number;
  title: string;
  isNew: boolean; // 가장 최근 세션에서 나온(아직 검토 중) 이야기 = 하이라이트
};

// C2 — companion 화면 사이드 패널용 사건 타임라인.
// 승인된 life_event(시간순) + 가장 최근 세션의 검토 중 초안(새 이야기).
// 새 API/쿼리 추가 없이 기존 getLifeEvents(cache 됨) + 세션 관계만 사용.
// isDraft 분리 덕에 같은 메모리가 양쪽에 중복되지 않는다(초안→승인 시 자연 이동).
export async function fetchStoryTimeline(userId: string): Promise<StoryTimelineItem[]> {
  const [events, latestSession] = await Promise.all([
    getLifeEvents(userId),
    prisma.companionSession.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        memories: {
          where: { isDraft: true, eventYear: { not: null } },
          select: { id: true, eventYear: true, eventTitle: true, title: true },
          take: 20,
        },
      },
    }),
  ]);

  const items: StoryTimelineItem[] = events
    .filter((e) => e.kind === "life_event")
    .map((e) => ({
      id: e.id,
      year: e.eventYear,
      title: e.title ?? "(제목 없음)",
      isNew: false,
    }));

  for (const m of latestSession?.memories ?? []) {
    items.push({
      id: m.id,
      year: m.eventYear as number, // where 절 not null 보장
      title: m.eventTitle ?? m.title ?? "(제목 없음)",
      isNew: true,
    });
  }

  // 안정 시간순 — 연도 ASC. 같은 해면 입력 순서(승인분 먼저, 새 이야기 뒤) 유지.
  items.sort((a, b) => a.year - b.year);
  return items;
}

export type LifeProfileSnapshot = {
  schools: string[];
  residences: string[];
  interests: string[];
  favMusic: string[];
  favMovies: string[];
  favGames: string[];
  siblings: string | null;
  parentsInfo: string | null;
  closeFriends: string | null;
  hobbies: string | null;
};

export type CompanionProfile = {
  birthYear: number | null;
  region: string | null;
  people: { name: string; relation: string | null }[];
  places: string[];
  coverageSummary: string | null; // 기존 기록 + 최근 세션 요약
  lifeProfile: LifeProfileSnapshot | null; // 온보딩 수집 정보
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
  const [user, people, placeRows, coverageSummary, rawLifeProfile, birthEventYear] = await Promise.all([
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
    prisma.memoryPlace.findMany({
      where: { memory: { userId } },
      select: { placeName: true },
      distinct: ["placeName"],
      take: 20,
    }),
    fetchCoverageContext(userId),
    prisma.lifeProfile.findUnique({
      where: { userId },
      select: {
        schools: true,
        residences: true,
        interests: true,
        favMusic: true,
        favMovies: true,
        favGames: true,
        siblings: true,
        parentsInfo: true,
        closeFriends: true,
        hobbies: true,
      },
    }),
    // S5 — 컬럼이 비어도 BIRTH life_event 연도로 fallback.
    getBirthYear(userId),
  ]);

  return {
    birthYear: user?.birthYear ?? birthEventYear,
    region: user?.region ?? null,
    people: people.map((p) => ({ name: p.name, relation: p.relation })),
    places: placeRows.map((r) => r.placeName).filter(Boolean),
    coverageSummary,
    lifeProfile: rawLifeProfile ?? null,
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

  if (profile.lifeProfile) {
    const lp = profile.lifeProfile;
    if (lp.schools.length > 0) profileLines.push(`- 학교: ${lp.schools.join(", ")}`);
    if (lp.residences.length > 0) profileLines.push(`- 살았던 곳: ${lp.residences.join(", ")}`);
    if (lp.interests.length > 0) profileLines.push(`- 관심분야: ${lp.interests.join(", ")}`);
    if (lp.favMusic.length > 0) profileLines.push(`- 좋아하는 음악: ${lp.favMusic.join(", ")}`);
    if (lp.favMovies.length > 0) profileLines.push(`- 좋아하는 영화: ${lp.favMovies.join(", ")}`);
    if (lp.favGames.length > 0) profileLines.push(`- 즐겨한 게임: ${lp.favGames.join(", ")}`);
    if (lp.hobbies) profileLines.push(`- 취미: ${lp.hobbies}`);
    if (lp.siblings) profileLines.push(`- 형제자매: ${lp.siblings}`);
    if (lp.parentsInfo) profileLines.push(`- 부모님: ${lp.parentsInfo}`);
    if (lp.closeFriends) profileLines.push(`- 가까운 친구: ${lp.closeFriends}`);
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
