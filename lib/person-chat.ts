// v3 P6 — 인물 모드 핵심 로직. "use server" 아닌 순수 모듈 — app/actions/
// person-chat.ts(auth 게이트) 와 검증 스크립트(db/test-*.ts, auth 우회)가
// 이 파일의 함수를 그대로 공유한다. lib/account-deletion.ts 와 같은 이유
// (재현본으로 갈라지면 검증 의미가 없어짐).

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import { isRelationCompatible } from "./person-relation";

// P12-3 — 이름 정규화(공백 무시). lib/companion-extraction.ts 의 v2 dedup 과
// 같은 기준("배 숙재" == "배숙재").
function normalizeName(name: string): string {
  return name.replace(/\s+/g, "");
}

// 같은 사람 찾기 — 확정 인물 중 이름(공백 무시) 같고 관계 호환(P14-2). 제안 카드 사람 행(lib/node-proposal)이
// 이걸로 이미 계신 분을 맞추고, 못 맞추면 findSameNamePeople 로 되묻는다(자동 병합 안 함).
export async function findCompatiblePerson(
  db: Prisma.TransactionClient,
  userId: string,
  name: string,
  relation: string | null,
): Promise<{ id: string; name: string; relation: string | null } | null> {
  const norm = normalizeName(name);
  const rows = await db.person.findMany({
    where: { userId, subjectType: "person", isDraft: false },
    select: { id: true, name: true, relation: true },
    orderBy: { createdAt: "asc" },
  });
  return rows.find((r) => normalizeName(r.name) === norm && isRelationCompatible(r.relation, relation)) ?? null;
}

// 이름(공백 무시)만 같은 확정 인물 전부(관계 무관). 자동으로 합치지 않고 "같은 분인가요?" 를 물을 때 쓴다
// (제안 카드 lib/node-proposal · 지도에서 사람 만들기 lib/my-life-edit).
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
// (savePeopleMentionedInEpisode) 삭제(docs/phase/my-life-restructure.md §15.4). 확인 대기 저장(saveProposedPeople —
// 초안 + PROPOSED 연결)은 인물 확인 화면(/story-review/confirm)과 함께 삭제(§15.6). 지금 이야기 속 인물은 제안
// 카드(lib/node-proposal)가 확정 인물 + CONFIRMED 연결로 저장한다.

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
