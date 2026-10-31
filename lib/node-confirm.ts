// 노드 그래프 2b-2(Q6) — 이야기에 나온 인물 확인(/story-review/confirm). docs/phase/node-graph-self.md §6 2b.3.
// 순수 모듈(auth 없음) — app/actions/node-confirm.ts 가 auth 만 씌우고, 회귀(db/test-node-confirm.ts)가
// 같은 함수를 userId 로 직접 부른다(lib/account-deletion.ts 와 같은 이유).
//
// 확인 대기 = NodeLink(EPISODE→PERSON, PROPOSED). 만드는 곳은 lib/person-chat.ts saveProposedPeople
// (이야기 마무리 추출). 새 이름은 초안 인물(isDraft, companionSessionId null)로 만들어져 있다.
//   맞아요   — 초안이면 확정 · 연결 CONFIRMED · PersonLifeEvent(인물, 이야기의 주 소속 중심) 추가.
//              단 이름이 같은 확정 인물이 있으면(관계 무관) 합치지 않고 되묻는다(ask, 상태 무변) →
//              같은 분이에요(same) = 그 인물로 합침(초안의 다른 대기 연결도 옮기고 초안 삭제) /
//              다른 분이에요(different) = 초안을 새 인물로 확정
//   아니에요 — 그 연결만 삭제 · 남은 연결 0 인 초안은 삭제(확정 인물은 안 지움)
//   고칠게요 — 이름·관계를 고쳐서 맞아요. 고친 이름과 같은 확정 인물이 있으면 똑같이 되묻는다.
//              다른 분이면 초안은 고친 이름으로 확정, 확정 인물로 맞춰졌던 행은 새 인물(원래 인물 정보는 안 바꿈)
// 결정 1건 = 트랜잭션 1개. 이미 처리된(대기가 아닌) 연결 id 는 건너뛴다 — 두 번 눌러도 안전.

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import { saveNodeLink } from "./node-graph";
import { findSameNamePeople } from "./person-chat";

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
  personId: string;
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
    g.rows.push({ linkId: l.id, personId: person.id, name: person.name, relation: person.relation, registered: !person.isDraft });
  }
  return [...groups.values()];
}

export type SameNamePerson = { id: string; name: string; relation: string | null };

export type PersonDecision =
  | { linkId: string; kind: "yes" }
  | { linkId: string; kind: "no" }
  | { linkId: string; kind: "edit"; name: string; relation: string }
  // 되물음(ask) 답. different 가 고칠게요에서 왔으면 고친 이름·관계를 같이 보낸다.
  | { linkId: string; kind: "same"; personId: string }
  | { linkId: string; kind: "different"; name?: string; relation?: string };

export type DecideResult = {
  done: string[];
  skipped: string[];
  invalid: string[];
  ask: { linkId: string; candidates: SameNamePerson[] }[];
};

type Outcome = "done" | "skipped" | "invalid" | { ask: SameNamePerson[] };

export async function decidePeople(userId: string, decisions: PersonDecision[]): Promise<DecideResult> {
  const result: DecideResult = { done: [], skipped: [], invalid: [], ask: [] };
  const seen = new Set<string>();
  for (const d of decisions.slice(0, MAX_DECISIONS)) {
    if (typeof d?.linkId !== "string" || seen.has(d.linkId)) continue;
    seen.add(d.linkId);
    const r = await decideOne(userId, d);
    if (typeof r === "string") result[r].push(d.linkId);
    else result.ask.push({ linkId: d.linkId, candidates: r.ask });
  }
  return result;
}

async function decideOne(userId: string, d: PersonDecision): Promise<Outcome> {
  let edit: { name: string; relation: string | null } | null = null;
  if (d.kind === "edit" || (d.kind === "different" && d.name !== undefined)) {
    const name = String(d.name ?? "").trim();
    const relation = String(d.relation ?? "").trim();
    if (!name || name.length > NAME_MAX || relation.length > RELATION_MAX) return "invalid";
    edit = { name, relation: relation || null };
  } else if (d.kind === "same") {
    if (typeof d.personId !== "string") return "invalid";
  } else if (d.kind !== "yes" && d.kind !== "no" && d.kind !== "different") {
    return "invalid";
  }

  return prisma.$transaction(async (tx): Promise<Outcome> => {
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
    if (d.kind === "same") {
      const target = await tx.person.findFirst({
        where: { id: d.personId, userId, subjectType: "person", isDraft: false },
        select: { id: true },
      });
      if (!target) return "invalid";
      targetId = target.id;
      if (person.isDraft && targetId !== person.id) await moveDraftLinks(tx, person.id, targetId, link.id);
    } else {
      // 맞아요(초안)·고칠게요 — 이름이 같은 확정 인물이 있으면 합칠지 사용자에게 묻는다(자동 병합 안 함).
      if (d.kind !== "different" && (edit || person.isDraft)) {
        const candidates = await findSameNamePeople(tx, userId, edit?.name ?? person.name);
        if (candidates.length > 0) return { ask: candidates };
      }
      if (person.isDraft) {
        await tx.person.update({ where: { id: person.id }, data: { ...edit, isDraft: false } });
      } else if (edit || d.kind === "different") {
        const metYear = episode.lifeEvent.correctedYear ?? episode.lifeEvent.year;
        targetId = (
          await tx.person.create({
            data: {
              userId,
              subjectType: "person",
              name: edit?.name ?? person.name,
              relation: edit ? edit.relation : person.relation,
              metYear,
            },
            select: { id: true },
          })
        ).id;
      }
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

// 같은 분이에요 — 초안은 한 사람이라 다른 이야기의 확인 대기 연결도 그 인물로 옮긴다. 연결 id 를
// 유지해(제자리 갱신) 화면이 들고 있는 그 행의 [맞아요]가 그대로 이어진다. 같은 쌍이 이미 있거나
// 그 이야기의 대상 인물이면 옮기지 않고 지운다(한 쌍 = 한 곳).
async function moveDraftLinks(tx: Prisma.TransactionClient, draftId: string, targetId: string, exceptLinkId: string) {
  const links = await tx.nodeLink.findMany({
    where: { fromType: "EPISODE", toType: "PERSON", toId: draftId, id: { not: exceptLinkId } },
    select: { id: true, fromId: true },
  });
  for (const l of links) {
    const [ep, dup] = await Promise.all([
      tx.episode.findUnique({ where: { id: l.fromId }, select: { personId: true } }),
      tx.nodeLink.count({ where: { fromType: "EPISODE", fromId: l.fromId, toType: "PERSON", toId: targetId } }),
    ]);
    if (ep?.personId === targetId || dup > 0) await tx.nodeLink.deleteMany({ where: { id: l.id } });
    else await tx.nodeLink.update({ where: { id: l.id }, data: { toId: targetId } });
  }
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
