// v3 P6 — 인물 모드 핵심 로직. "use server" 아닌 순수 모듈 — app/actions/
// person-chat.ts(auth 게이트) 와 검증 스크립트(db/test-*.ts, auth 우회)가
// 이 파일의 함수를 그대로 공유한다. lib/account-deletion.ts 와 같은 이유
// (재현본으로 갈라지면 검증 의미가 없어짐).

import { prisma } from "./db";
import { chat } from "./ai";
import { createPerson } from "./people";
import { linkPersonToLifeEvent } from "./person-life-event";
import {
  PERSON_EXTRACT_SYSTEM_PROMPT,
  buildPersonExtractUserMessage,
} from "./prompts/person-extract";

// 추출/분류는 항상 Sonnet 고정 — life-event-confirm.ts 와 같은 이유(전역
// aiModel 라이브 응답과 무관).
const PARSE_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const NAME_MAX = 50;
const MAX_CANDIDATES = 3;

type PersonCandidate = { name: string | null; relation: string };

// P12-3 — 이름 정규화(공백 무시). lib/companion-extraction.ts 의 v2 dedup 과
// 같은 기준("배 숙재" == "배숙재").
function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

export async function extractPersonCandidates(
  question: string,
  answer: string,
): Promise<PersonCandidate[]> {
  try {
    const res = await chat(
      [{ role: "user", content: buildPersonExtractUserMessage(question, answer) }],
      { system: PERSON_EXTRACT_SYSTEM_PROMPT, model: PARSE_MODEL, maxTokens: 300, temperature: 0.1 },
    );
    const match = stripJsonFence(res.text).match(/\[[\s\S]*\]/);
    if (!match) return [];
    const arr = JSON.parse(match[0]) as unknown[];
    return arr
      .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
      .filter((x) => typeof x.relation === "string" && String(x.relation).trim())
      .map((x) => ({
        relation: String(x.relation).trim(),
        name: typeof x.name === "string" && x.name.trim() ? x.name.trim() : null,
      }))
      .slice(0, MAX_CANDIDATES);
  } catch (e) {
    console.error("[person-chat]", e instanceof Error ? e.message : e);
    return [];
  }
}

type SavedPerson = { id: string; name: string; relation: string | null; created: boolean };

// P12-3 — 같은 사용자의 같은 이름(공백 무시) 인물이 이미 등록돼 있으면 새로
// 만들지 않고 기존 Person 에 PersonLifeEvent 링크만 추가한다(이전엔 갭마다
// createPerson 을 무조건 호출해 "박정호/1955년" · "박정호/1962년" 처럼 같은
// 사람이 둘로 쌓였다). metYear 는 첫 등록값 유지(먼저 물어본 시절이 보통
// 더 이른 연결이고, 갱신 경쟁을 안 만든다).
//
// 이름이 없어 관계를 이름 자리에 쓰는 경우("친구"·"어머니")는 dedup 대상이
// 아니다 — 이름 없는 "친구" 둘을 한 사람으로 합치면 안 된다. isDraft 인물
// (말동무 AI 추론 초안)은 /people 정식 등록이 아니라 매칭 대상에서 뺀다.
export async function saveOrLinkPerson(
  userId: string,
  lifeEventId: string,
  candidate: PersonCandidate,
  metYear: number | null,
): Promise<SavedPerson> {
  if (candidate.name) {
    const norm = normalizeName(candidate.name);
    const rows = await prisma.person.findMany({
      where: { userId, subjectType: "person", isDraft: false },
      select: { id: true, name: true, relation: true },
    });
    const existing = rows.find((r) => normalizeName(r.name) === norm);
    if (existing) {
      await linkPersonToLifeEvent(userId, existing.id, lifeEventId);
      return { id: existing.id, name: existing.name, relation: existing.relation, created: false };
    }
  }
  // 이름 없이 호칭만 나온 경우(name=null) 관계를 이름 자리에 대신 써서
  // 저장을 막지 않는다 — "이름이 뭐예요?" 되묻는 추가 왕복은 존엄 원칙의
  // "캐묻지 않기" 취지에 안 맞다고 판단(사용자 지시).
  const name = (candidate.name ?? candidate.relation).slice(0, NAME_MAX);
  const person = await createPerson(userId, {
    subjectType: "person",
    name,
    relation: candidate.relation,
    birthYear: null,
    category: null,
    metYear,
    memo: null,
  });
  await linkPersonToLifeEvent(userId, person.id, lifeEventId);
  return { id: person.id, name, relation: candidate.relation, created: true };
}

// P12-2 — 에피소드 대화(STAGE4) 본인 발화에서 언급된 인물을 마무리(저장)
// 시점에 함께 저장한다. 이전엔 인물 모드(submitPersonAnswer) 답변에서만
// 추출해, 에피소드 대화 중 "국어 선생님 이순자 씨가 기억나요" 처럼 새로
// 나온 사람은 후속 질문엔 반영되면서 /people·칩에는 영영 안 남았다.
// 인물 모드와 달리 이름이 있는 후보만 저장한다 — 이야기 도중 스치는
// "친구들"·"어머니" 류 호칭만으로 Person 을 만들면 과생성이 된다(인물
// 모드는 "누구랑 지냈어요?" 라고 직접 물은 답이라 호칭만이어도 저장).
// 이미 등록된 인물(이 이야기의 주인공 포함)은 saveOrLinkPerson 의 dedup
// 으로 링크만 보강된다.
export async function savePeopleMentionedInEpisode(
  userId: string,
  lifeEventId: string,
  question: string,
  userText: string,
): Promise<number> {
  if (!userText.trim()) return 0;
  const event = await prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { year: true, correctedYear: true },
  });
  if (!event) return 0;
  const candidates = (await extractPersonCandidates(question, userText)).filter((c) => c.name);
  const metYear = event.correctedYear ?? event.year;
  for (const c of candidates) {
    await saveOrLinkPerson(userId, lifeEventId, c, metYear);
  }
  return candidates.length;
}

export type SubmitPersonAnswerResult = {
  savedCount: number;
  firstPersonId: string | null;
  firstPersonName: string | null;
  // P10-4 — 호칭 판정(lib/person-honorific.ts)에 필요.
  firstPersonRelation: string | null;
};

// question 은 방금 사용자에게 던진 질문 문구(추출 프롬프트에 맥락으로 씀).
export async function submitPersonAnswer(
  userId: string,
  lifeEventId: string,
  question: string,
  answer: string,
): Promise<SubmitPersonAnswerResult> {
  const event = await prisma.lifeEvent.findFirst({
    where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, year: true, correctedYear: true },
  });
  const empty: SubmitPersonAnswerResult = {
    savedCount: 0,
    firstPersonId: null,
    firstPersonName: null,
    firstPersonRelation: null,
  };
  if (!event) return empty;

  // P8-4 — 저장 성공 여부(인물을 저장했든 "없어요"로 거절했든)와 무관하게
  // "물어봤다"로 기록. gap-detector 의 person 갭 재노출만 막고, 다른
  // 경로(자유 발화 등)로 인물을 추가하는 것까지 막지는 않는다.
  await prisma.lifeEvent.update({
    where: { id: event.id },
    data: { personAsked: true },
  });

  const candidates = await extractPersonCandidates(question, answer);
  if (candidates.length === 0) return empty;

  const metYear = event.correctedYear ?? event.year;
  let first: SavedPerson | null = null;
  let savedCount = 0;

  for (const c of candidates) {
    const saved = await saveOrLinkPerson(userId, lifeEventId, c, metYear);
    savedCount += 1;
    if (!first) first = saved;
  }

  return {
    savedCount,
    firstPersonId: first?.id ?? null,
    firstPersonName: first?.name ?? null,
    firstPersonRelation: first?.relation ?? null,
  };
}

export type PersonEpisodeTarget = { personName: string; personRelation: string | null } | null;

// 갭 카드/딥링크로 "이 인물 + 이 이벤트" 조합을 지정해 돌아올 때, 두 ID 가
// 실제로 이 사용자 소유이고 서로 연결돼 있는지 확인하며 인물 이름을 가져온다.
export async function getPersonEpisodeTarget(
  userId: string,
  lifeEventId: string,
  personId: string,
): Promise<PersonEpisodeTarget> {
  const [event, link] = await Promise.all([
    prisma.lifeEvent.findFirst({
      where: { id: lifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
      select: { id: true },
    }),
    prisma.personLifeEvent.findFirst({
      where: { lifeEventId, personId, userId },
      select: { person: { select: { name: true, relation: true } } },
    }),
  ]);
  if (!event || !link) return null;
  return { personName: link.person.name, personRelation: link.person.relation };
}
