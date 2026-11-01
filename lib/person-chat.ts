// v3 P6 — 인물 모드 핵심 로직. "use server" 아닌 순수 모듈 — app/actions/
// person-chat.ts(auth 게이트) 와 검증 스크립트(db/test-*.ts, auth 우회)가
// 이 파일의 함수를 그대로 공유한다. lib/account-deletion.ts 와 같은 이유
// (재현본으로 갈라지면 검증 의미가 없어짐).

import { prisma } from "./db";
import { chat } from "./ai";
import type { Prisma } from "./generated/prisma/client";
import { saveNodeLink } from "./node-graph";
import { isRelationCompatible } from "./person-relation";
import {
  PERSON_EXTRACT_SYSTEM_PROMPT,
  buildPersonExtractUserMessage,
} from "./prompts/person-extract";

// 추출/분류는 항상 Sonnet 고정 — life-event-confirm.ts 와 같은 이유(전역
// aiModel 라이브 응답과 무관).
const PARSE_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
const NAME_MAX = 50;
const RELATION_MAX = 30;
const MAX_CANDIDATES = 3;

export type PersonCandidate = { name: string | null; relation: string };

// P12-3 — 이름 정규화(공백 무시). lib/companion-extraction.ts 의 v2 dedup 과
// 같은 기준("배 숙재" == "배숙재").
function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

// 같은 사람 찾기 — 이름(공백 무시) 같고 관계 호환(P14-2). draft=false 는 확정 인물,
// draft=true 는 이야기 마무리 추출이 만든 확인 대기 초안(말동무 초안은 companionSessionId
// 가 있어 제외). 확인 화면(lib/node-confirm.ts)은 이걸로 자동 병합하지 않고 findSameNamePeople 로 되묻는다.
export async function findCompatiblePerson(
  db: Prisma.TransactionClient,
  userId: string,
  name: string,
  relation: string | null,
  draft: boolean,
): Promise<{ id: string; name: string; relation: string | null } | null> {
  const norm = normalizeName(name);
  const rows = await db.person.findMany({
    where: { userId, subjectType: "person", isDraft: draft, ...(draft ? { companionSessionId: null } : {}) },
    select: { id: true, name: true, relation: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.find((r) => normalizeName(r.name) === norm && isRelationCompatible(r.relation, relation)) ?? null;
}

// 이름(공백 무시)만 같은 확정 인물 전부(관계 무관). 확인 화면이 자동으로 합치지 않고
// "같은 분인가요?" 를 물을 때 쓴다(lib/node-confirm.ts).
export async function findSameNamePeople(
  db: Prisma.TransactionClient,
  userId: string,
  name: string,
): Promise<{ id: string; name: string; relation: string | null }[]> {
  const norm = normalizeName(name);
  const rows = await db.person.findMany({
    where: { userId, subjectType: "person", isDraft: false },
    select: { id: true, name: true, relation: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.filter((r) => normalizeName(r.name) === norm);
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

// P12-2 — 에피소드 대화(STAGE4) 본인 발화에서 언급된 인물을 마무리(저장)
// 시점에 함께 저장한다. 이전엔 인물 모드(submitPersonAnswer) 답변에서만
// 추출해, 에피소드 대화 중 "국어 선생님 이순자 씨가 기억나요" 처럼 새로
// 나온 사람은 후속 질문엔 반영되면서 /people·칩에는 영영 안 남았다.
// 인물 모드와 달리 이름이 있는 후보만 저장한다 — 이야기 도중 스치는
// "친구들"·"어머니" 류 호칭만으로 Person 을 만들면 과생성이 된다(인물
// 모드는 "누구랑 지냈어요?" 라고 직접 물은 답이라 호칭만이어도 저장).
//
// 노드 그래프 2b-2(Q6) — 이제 확인 없이 확정하지 않는다. 후보는 이 이야기와의
// 확인 대기 연결(NodeLink EPISODE→PERSON, PROPOSED)로만 남고, 새 이름은 초안
// 인물(isDraft)로 만든다. PersonLifeEvent(중심과의 연결)는 /story-review/confirm
// 에서 확인할 때 만든다(lib/node-confirm.ts) — 그래서 확정 인물만 보는 기존 화면
// (타임라인 칩·갭·인터뷰 후보·/people)에 확인 전 초안이 안 보인다.
export async function savePeopleMentionedInEpisode(
  userId: string,
  lifeEventId: string,
  episodeId: string,
  question: string,
  userText: string,
): Promise<number> {
  if (!userText.trim()) return 0;
  const candidates = (await extractPersonCandidates(question, userText)).filter((c) => c.name);
  return saveProposedPeople(userId, lifeEventId, episodeId, candidates);
}

// 추출 뒤 저장 본체(LLM 0 — 회귀가 후보를 직접 넣어 부른다). 후보마다 대상 인물:
//   1) 확정 인물 중 같은 사람 → 그 인물  2) 확인 대기 초안 중 같은 사람 → 그 초안
//   (두 이야기에 같은 새 이름이 나와도 초안은 1명)  3) 없으면 새 초안.
// 대상이 이 이야기의 대상 인물(Episode.personId)이면 연결을 만들지 않는다(한 쌍 = 한 곳).
// 이미 확정된 연결은 saveNodeLink 가 내리지 않는다. 돌려주는 값 = 만든(또는 이미 있던) 연결 수.
export async function saveProposedPeople(
  userId: string,
  lifeEventId: string,
  episodeId: string,
  candidates: PersonCandidate[],
): Promise<number> {
  const episode = await prisma.episode.findFirst({
    where: {
      id: episodeId,
      lifeEventId,
      lifeEvent: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    },
    select: { personId: true, lifeEvent: { select: { year: true, correctedYear: true } } },
  });
  if (!episode) return 0;
  const metYear = episode.lifeEvent.correctedYear ?? episode.lifeEvent.year;
  let linked = 0;
  for (const c of candidates) {
    if (!c.name) continue;
    const name = c.name.slice(0, NAME_MAX);
    const relation = c.relation.slice(0, RELATION_MAX);
    const target =
      (await findCompatiblePerson(prisma, userId, name, relation, false)) ??
      (await findCompatiblePerson(prisma, userId, name, relation, true)) ??
      (await prisma.person.create({
        data: { userId, subjectType: "person", name, relation, metYear, isDraft: true },
        select: { id: true },
      }));
    if (target.id === episode.personId) continue;
    const r = await saveNodeLink(
      userId,
      { type: "EPISODE", id: episodeId },
      { type: "PERSON", id: target.id },
      { status: "PROPOSED", source: "AI" },
    );
    if (r.ok) linked += 1;
    else console.error("[person-chat] proposed link failed", { reason: r.reason });
  }
  return linked;
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
