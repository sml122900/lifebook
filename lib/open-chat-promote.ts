// P13-4(b) — open 모드 자유 발화 승격. 순수 모듈(auth 없음) — app/actions/
// open-chat.ts 가 auth 게이트만 씌우고, 검증 스크립트(db/test-open-promote.ts)
// 가 같은 함수를 그대로 호출한다(lib/person-chat.ts 패턴).
//
// 배경: "하고 싶은 이야기 있으세요?"(open 단계)는 원래 짧게 듣고 반응만
// 하는 자리였는데, 어르신은 여기서 실제 이야기를 꺼낸다 — 그게 로그에만
// 남고 Episode/Person 으로는 안 가 통째로 유실됐다. 한 턴을 Sonnet 으로
// 분류해 "실질 이야기"면 CUSTOM LifeEvent 를 만들고 에피소드 엔진(STAGE4)
// 으로 넘긴다(마무리 시 Episode 저장 + 인물 추출은 기존 finishEpisodeChat
// 그대로). 인사·짧은 반응("잘 지내요", "고마워요")은 승격 안 함.
//
// 판단 정책(사용자 지시): 애매하면 승격 — 유실보다 과저장이 낫고, 나중에
// 사용자가 지울 수 있다. 분류와 비-승격 응답을 한 번의 호출로 받는다
// (호출 2회는 어르신 체감 지연).

import { prisma } from "./db";
import { chat } from "./ai";

// 분류는 Sonnet 고정 — 추출/분류 정책(lib/person-chat.ts 와 동일).
const CLASSIFY_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const TITLE_MAX = 30;
const MIN_YEAR = 1900;

export type OpenTurnClassification =
  | { story: true; title: string; year: number | null }
  | { story: false; reply: string };

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

function buildClassifySystemPrompt(birthYear: number | null): string {
  const birthLine = birthYear
    ? `어르신은 ${birthYear}년생입니다. "스무 살 때", "국민학교 3학년 때" 처럼 나이·학년으로 말하면 그걸로 연도를 계산하세요(예: 스무 살 → ${birthYear + 20}, 국민학교 3학년(만 9세) → ${birthYear + 9}).`
    : `어르신의 출생 연도는 모릅니다. 나이·학년 표현만으로는 연도를 계산하지 말고 null 로 두세요.`;
  return `당신은 어르신의 인생 이야기를 듣는 따뜻한 말동무이자, 방금 들은 한 마디가 "인생 연혁에 남길 만한 이야기"인지 판단하는 편집자입니다.

방금 어르신이 자유롭게 한 말을 보고 두 가지를 하세요.

1) story 판단
- true: 살아온 일·사건·사람·장소·시절에 대한 이야기(예: "스무 살 때 서울로 올라와 공장에서 일했어요", "국어 선생님 이순자 씨가 기억나요", "결혼하고 부산에서 가게를 했지요"). 짧아도 구체적인 삶의 내용이 있으면 true.
- false: 인사·안부·짧은 반응·감사·잡담·서비스 질문(예: "잘 지내요", "고마워요", "네", "오늘 날씨가 좋네요", "이건 어떻게 써요?").
- 애매하면 true 로 하세요(놓치는 것보다 담아두는 게 낫습니다).

2) story 가 true 이면
- title: 이야기를 한 줄 제목으로(명사형, 최대 15자, 예: "서울 상경과 공장 일", "국어 선생님 이순자"). 어르신이 말한 내용만 쓰고 지어내지 마세요.
- year: 이야기의 시점 연도(4자리 정수). ${birthLine} 연도를 알 수 없으면 null.
story 가 false 이면
- reply: 어르신이 방금 한 말에 맞는 짧고 존중하는 반응 1~2문장. 재촉 금지. 필요하면 자연스럽게 한 가지만 되물어도 됩니다. 구어체("~네요", "~군요", "~어요")로만 답하고 "-습니다/-였습니다" 같은 문어체 높임 어미는 쓰지 마세요. 한국어만, 한자 금지.

다음 JSON 형식으로만 답하세요(다른 텍스트 금지):
{"story": true, "title": "제목", "year": 1970 또는 null}
또는
{"story": false, "reply": "반응"}`;
}

const FALLBACK_REPLY = "네, 잘 들었어요. 편하게 더 말씀해주세요.";

export async function classifyOpenTurn(
  text: string,
  birthYear: number | null,
): Promise<OpenTurnClassification> {
  try {
    const res = await chat([{ role: "user", content: text.slice(0, 1500) }], {
      system: buildClassifySystemPrompt(birthYear),
      model: CLASSIFY_MODEL,
      maxTokens: 300,
      temperature: 0.2,
    });
    const parsed = JSON.parse(stripJsonFence(res.text)) as {
      story?: unknown;
      title?: unknown;
      year?: unknown;
      reply?: unknown;
    };
    if (parsed.story === true) {
      const title =
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, TITLE_MAX)
          : text.trim().slice(0, TITLE_MAX);
      const year =
        typeof parsed.year === "number" &&
        Number.isInteger(parsed.year) &&
        parsed.year >= MIN_YEAR &&
        parsed.year <= new Date().getFullYear()
          ? parsed.year
          : null;
      return { story: true, title, year };
    }
    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : FALLBACK_REPLY;
    return { story: false, reply };
  } catch (e) {
    console.error("[open-chat-promote] classify", e instanceof Error ? e.message : e);
    return { story: false, reply: FALLBACK_REPLY };
  }
}

// CUSTOM LifeEvent 생성 — 처음부터 CONFIRMED(본인이 직접 꺼낸 이야기라
// 확인질문이 필요 없다). 자리(sequenceOrder):
//   - 연도 있음 → 연도가 그 이하인 마지막 이벤트 바로 뒤(뒤 이벤트들은 +1
//     밀림). 타임라인/갭 감지/확인질문 조회가 전부 sequenceOrder 순이라
//     연도순 자리를 여기서 잡아줘야 /story-review 에서 제자리에 보인다.
//   - 연도 없음 → 맨 뒤(사용자 결정: "시기 미상 섹션" 대신 맨 뒤).
export async function createCustomLifeEvent(
  userId: string,
  title: string,
  year: number | null,
): Promise<{ id: string; label: string; year: number | null }> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId },
    orderBy: { sequenceOrder: "asc" },
    select: { sequenceOrder: true, year: true, correctedYear: true },
  });
  const maxOrder = events.length ? events[events.length - 1].sequenceOrder : -1;

  let sequenceOrder = maxOrder + 1;
  if (year !== null) {
    let anchorOrder: number | null = null;
    for (const e of events) {
      const y = e.correctedYear ?? e.year;
      if (y !== null && y <= year) anchorOrder = e.sequenceOrder;
    }
    if (anchorOrder !== null && anchorOrder < maxOrder) {
      sequenceOrder = anchorOrder + 1;
      await prisma.lifeEvent.updateMany({
        where: { userId, sequenceOrder: { gt: anchorOrder } },
        data: { sequenceOrder: { increment: 1 } },
      });
    }
  }

  const created = await prisma.lifeEvent.create({
    data: {
      userId,
      type: "CUSTOM",
      label: title,
      year,
      isOptional: true,
      status: "CONFIRMED",
      confirmedAt: new Date(),
      sequenceOrder,
    },
    select: { id: true, label: true, year: true },
  });
  return created;
}

export type PromoteOpenTurnResult =
  | { kind: "reply"; reply: string }
  | { kind: "promoted"; eventId: string; label: string; year: number | null };

async function resolveBirthYear(userId: string): Promise<number | null> {
  const [profile, user] = await Promise.all([
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { birthYear: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } }),
  ]);
  return profile?.birthYear ?? user?.birthYear ?? null;
}

export async function promoteOpenTurn(userId: string, text: string): Promise<PromoteOpenTurnResult> {
  const birthYear = await resolveBirthYear(userId);
  const c = await classifyOpenTurn(text, birthYear);
  if (!c.story) return { kind: "reply", reply: c.reply };
  const created = await createCustomLifeEvent(userId, c.title, c.year);
  return { kind: "promoted", eventId: created.id, label: created.label, year: created.year };
}
