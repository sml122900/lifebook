// 노드 그래프 2b-2(Q6) — 이야기에 나온 인물 확인(/story-review/confirm). docs/phase/node-graph-self.md §6 2b.3.
// 순수 모듈(auth 없음) — app/actions/node-confirm.ts 가 auth 만 씌우고, 회귀(db/test-node-confirm.ts)가
// 같은 함수를 userId 로 직접 부른다(lib/account-deletion.ts 와 같은 이유).
//
// 확인 대기 = NodeLink(EPISODE→PERSON, PROPOSED). 만드는 곳은 lib/person-chat.ts saveProposedPeople
// (이야기 마무리 추출). 새 이름은 초안 인물(isDraft, companionSessionId null)로 만들어져 있다.
//   맞아요   — 초안이면 확정(같은 이름·호환 관계의 확정 인물이 그새 생겼으면 그 인물로 합침) ·
//              연결 CONFIRMED · PersonLifeEvent(인물, 이야기의 주 소속 중심) 추가
//   아니에요 — 그 연결만 삭제 · 남은 연결 0 인 초안은 삭제(확정 인물은 안 지움)
//   고칠게요 — 이름·관계를 고쳐서 맞아요. 고친 이름이 다른 확정 인물과 맞으면 그 인물에 연결하고
//              초안 삭제, 확정 인물로 잘못 맞춰진 행이면 새 인물(원래 인물 정보는 안 바꿈)
// 결정 1건 = 트랜잭션 1개. 이미 처리된(대기가 아닌) 연결 id 는 건너뛴다 — 두 번 눌러도 안전.

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import { saveNodeLink } from "./node-graph";
import { findCompatiblePerson } from "./person-chat";

const NAME_MAX = 50;
const RELATION_MAX = 30;
const MAX_DECISIONS = 100;

function pendingWhere(userId: string) {
  return { userId, status: "PROPOSED", fromType: "EPISODE", toType: "PERSON" } as const;
}

export async function countPendingPeople(userId: string): Promise<number> {
  return prisma.nodeLink.count({ where: pendingWhere(userId) });
}

export type PendingPersonRow = {
  linkId: string;
  name: string;
  relation: string | null;
  registered: boolean; // 기존 확정 인물과 맞춰진 행
};
export type PendingStoryGroup = { episodeId: string; title: string; year: number | null; rows: PendingPersonRow[] };

// 이야기별 묶음(이야기 저장 순). 쿼리 3회 고정.
export async function getPendingPeopleGroups(userId: string): Promise<PendingStoryGroup[]> {
  const links = await prisma.nodeLink.findMany({
    where: pendingWhere(userId),
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, fromId: true, toId: true },
  });
  if (links.length === 0) return [];
  const [episodes, people] = await Promise.all([
    prisma.episode.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.fromId))] }, lifeEvent: { userId } },
      select: {
        id: true,
        year: true,
        memory: { select: { title: true } },
        lifeEvent: { select: { year: true, correctedYear: true } },
      },
    }),
    prisma.person.findMany({
      where: { id: { in: [...new Set(links.map((l) => l.toId))] }, userId },
      select: { id: true, name: true, relation: true, isDraft: true },
    }),
  ]);
  const epById = new Map(episodes.map((e) => [e.id, e]));
  const personById = new Map(people.map((p) => [p.id, p]));
  const groups = new Map<string, PendingStoryGroup>();
  for (const l of links) {
    const ep = epById.get(l.fromId);
    const person = personById.get(l.toId);
    if (!ep || !person) continue;
    let g = groups.get(ep.id);
    if (!g) {
      g = {
        episodeId: ep.id,
        title: ep.memory.title,
        year: ep.year ?? ep.lifeEvent.correctedYear ?? ep.lifeEvent.year,
        rows: [],
      };
      groups.set(ep.id, g);
    }
    g.rows.push({ linkId: l.id, name: person.name, relation: person.relation, registered: !person.isDraft });
  }
  return [...groups.values()];
}

export type PersonDecision =
  | { linkId: string; kind: "yes" }
  | { linkId: string; kind: "no" }
  | { linkId: string; kind: "edit"; name: string; relation: string };

export type DecideResult = { done: string[]; skipped: string[]; invalid: string[] };

export async function decidePeople(userId: string, decisions: PersonDecision[]): Promise<DecideResult> {
  const result: DecideResult = { done: [], skipped: [], invalid: [] };
  const seen = new Set<string>();
  for (const d of decisions.slice(0, MAX_DECISIONS)) {
    if (typeof d?.linkId !== "string" || seen.has(d.linkId)) continue;
    seen.add(d.linkId);
    result[await decideOne(userId, d)].push(d.linkId);
  }
  return result;
}

async function decideOne(userId: string, d: PersonDecision): Promise<keyof DecideResult> {
  let edit: { name: string; relation: string | null } | null = null;
  if (d.kind === "edit") {
    const name = String(d.name ?? "").trim();
    const relation = String(d.relation ?? "").trim();
    if (!name || name.length > NAME_MAX || relation.length > RELATION_MAX) return "invalid";
    edit = { name, relation: relation || null };
  } else if (d.kind !== "yes" && d.kind !== "no") {
    return "invalid";
  }

  return prisma.$transaction(async (tx) => {
    const link = await tx.nodeLink.findFirst({
      where: { id: d.linkId, ...pendingWhere(userId) },
      select: { id: true, fromId: true, toId: true },
    });
    if (!link) return "skipped";
    const [episode, person] = await Promise.all([
      tx.episode.findFirst({
        where: { id: link.fromId, lifeEvent: { userId } },
        select: { id: true, lifeEventId: true, personId: true, lifeEvent: { select: { year: true, correctedYear: true } } },
      }),
      tx.person.findFirst({
        where: { id: link.toId, userId },
        select: { id: true, name: true, relation: true, isDraft: true },
      }),
    ]);
    if (!episode || !person) return "skipped";

    if (d.kind === "no") {
      await tx.nodeLink.deleteMany({ where: { id: link.id } });
      await deleteDraftIfOrphan(tx, userId, person.id);
      return "done";
    }

    // 확정 대상 인물 고르기.
    let targetId = person.id;
    if (edit) {
      const match = await findCompatiblePerson(tx, userId, edit.name, edit.relation, false);
      if (match) {
        targetId = match.id;
      } else if (person.isDraft) {
        await tx.person.update({ where: { id: person.id }, data: { name: edit.name, relation: edit.relation, isDraft: false } });
      } else {
        const metYear = episode.lifeEvent.correctedYear ?? episode.lifeEvent.year;
        targetId = (
          await tx.person.create({
            data: { userId, subjectType: "person", name: edit.name, relation: edit.relation, metYear },
            select: { id: true },
          })
        ).id;
      }
    } else if (person.isDraft) {
      const match = await findCompatiblePerson(tx, userId, person.name, person.relation, false);
      if (match) targetId = match.id;
      else await tx.person.update({ where: { id: person.id }, data: { isDraft: false } });
    }

    // 연결 — 이야기의 대상 인물이면 Episode.personId 가 이미 그 쌍이다(한 쌍 = 한 곳).
    if (targetId !== episode.personId) {
      const r = await saveNodeLink(
        userId,
        { type: "EPISODE", id: episode.id },
        { type: "PERSON", id: targetId },
        { status: "CONFIRMED", db: tx },
      );
      if (!r.ok) throw new Error(`확인 연결 실패: ${r.reason}`);
    }
    if (targetId !== person.id || targetId === episode.personId) {
      await tx.nodeLink.deleteMany({ where: { id: link.id } });
    }
    await tx.personLifeEvent.upsert({
      where: { personId_lifeEventId: { personId: targetId, lifeEventId: episode.lifeEventId } },
      create: { personId: targetId, lifeEventId: episode.lifeEventId, userId },
      update: {},
    });
    if (targetId !== person.id) await deleteDraftIfOrphan(tx, userId, person.id);
    return "done";
  });
}

// 확인 대기 초안이 어디에도 안 이어져 있으면 지운다(정합 점검 8 "고아 초안"과 같은 기준).
async function deleteDraftIfOrphan(tx: Prisma.TransactionClient, userId: string, personId: string) {
  const draft = await tx.person.findFirst({
    where: { id: personId, userId, isDraft: true, companionSessionId: null },
    select: { id: true },
  });
  if (!draft) return;
  const counts = await Promise.all([
    tx.nodeLink.count({ where: { OR: [{ fromType: "PERSON", fromId: personId }, { toType: "PERSON", toId: personId }] } }),
    tx.personLifeEvent.count({ where: { personId } }),
    tx.episode.count({ where: { personId } }),
    tx.personEvent.count({ where: { personId } }),
    tx.personGroupMember.count({ where: { personId } }),
  ]);
  if (counts.every((n) => n === 0)) await tx.person.deleteMany({ where: { id: personId } });
}
