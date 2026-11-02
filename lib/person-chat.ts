// v3 P6 — 인물 모드 핵심 로직. "use server" 아닌 순수 모듈 — app/actions/
// person-chat.ts(auth 게이트) 와 검증 스크립트(db/test-*.ts, auth 우회)가
// 이 파일의 함수를 그대로 공유한다. lib/account-deletion.ts 와 같은 이유
// (재현본으로 갈라지면 검증 의미가 없어짐).

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import { saveNodeLink } from "./node-graph";
import { isRelationCompatible } from "./person-relation";

const NAME_MAX = 50;
const RELATION_MAX = 30;

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

// 2026-11-03 — 옛 온보딩 이야기 대화 마무리가 쓰던 인물 추출(extractPersonCandidates — 모델 호출)·저장
// (savePeopleMentionedInEpisode) 삭제(앱 안 호출 0 — docs/phase/my-life-restructure.md §15.4). 지금 이야기 속 인물은
// 제안 카드(lib/node-proposal)가 확정 인물로 저장한다. 아래 saveProposedPeople 은 남은 확인 대기 데이터가 있는
// 인물 확인 화면(/story-review/confirm) 회귀가 확인 대기 데이터를 만들 때 쓴다(앱 안 호출 0).

// 확인 대기 인물 저장 본체(LLM 0 — 회귀가 후보를 직접 넣어 부른다). 후보마다 대상 인물:
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
