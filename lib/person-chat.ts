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

export type SubmitPersonAnswerResult = {
  savedCount: number;
  firstPersonId: string | null;
  firstPersonName: string | null;
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
  const empty: SubmitPersonAnswerResult = { savedCount: 0, firstPersonId: null, firstPersonName: null };
  if (!event) return empty;

  const candidates = await extractPersonCandidates(question, answer);
  if (candidates.length === 0) return empty;

  const metYear = event.correctedYear ?? event.year;
  let first: { id: string; name: string } | null = null;
  let savedCount = 0;

  for (const c of candidates) {
    // 이름 없이 호칭만 나온 경우(name=null) 관계를 이름 자리에 대신 써서
    // 저장을 막지 않는다 — "이름이 뭐예요?" 되묻는 추가 왕복은 존엄 원칙의
    // "캐묻지 않기" 취지에 안 맞다고 판단(사용자 지시).
    const name = (c.name ?? c.relation).slice(0, NAME_MAX);
    const person = await createPerson(userId, {
      subjectType: "person",
      name,
      relation: c.relation,
      birthYear: null,
      category: null,
      metYear,
      memo: null,
    });
    await linkPersonToLifeEvent(userId, person.id, lifeEventId);
    savedCount += 1;
    if (!first) first = { id: person.id, name };
  }

  return { savedCount, firstPersonId: first?.id ?? null, firstPersonName: first?.name ?? null };
}

export type PersonEpisodeTarget = { personName: string } | null;

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
      select: { person: { select: { name: true } } },
    }),
  ]);
  if (!event || !link) return null;
  return { personName: link.person.name };
}
