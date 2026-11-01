// 이야기를 다른 시절로 옮기기(Q34) — docs/phase/node-graph-self.md §6 2b.1 의 5 · my-life-restructure.md §4.3.
// 순수 모듈(auth 없음) — app/my-life/actions.ts 가 auth 뒤 부르고, 회귀(db/test-my-life-edit.ts)가 같은 함수를 부른다.
//
// 트랜잭션 1개:
//   1 소유·상태 — 이야기의 시기·대상 시기 모두 본인 것, 대상은 확정(CONFIRMED·CORRECTED). 같은 시기면 아무것도 안 함.
//   2 주 소속(Episode.lifeEventId) = 대상. 대상과의 추가 소속 NodeLink(LIFE_EVENT→EPISODE)는 지움(이제 주 소속 —
//     한 쌍 = 한 곳). 옛 시기와의 추가 소속은 만들지 않는다.
//   3 브릿지 UserMemory 연도 = 대상 시기 연도(createEpisodeBridge 와 같은 규칙 — 연도 없으면 올해 자리 표시).
//     제목은 그대로(이야기 제목 — 시기 이름 자리 표시는 저장 규칙이 이미 비움).
//   4 두 시기의 hasEpisode 다시 계산(일반 이야기 STORY 의 실질 본문만 — deleteEpisode 와 같은 규칙).
//   5 이 이야기의 확정 인물(대상 인물 + 확정 NodeLink EPISODE→PERSON): 대상 시기에 PersonLifeEvent(saveNodeLink 입구).
//     옛 시기의 PersonLifeEvent 는 지우지 않는다 — 출처 칸이 없어 직접 넣은 연결과 구별할 수 없다(Q48).
//     만난 해 규칙 3: 그 인물이 이 이야기로만 이어져 있고 만난 해 = 옛 시기 연도면 새 시기 연도로(출생 시기 + 비가족이면 비움 — Q33).
//   6 확인 대기(PROPOSED) 연결은 이야기에 붙어 있어 그대로 따라간다(할 일 없음).

import { prisma } from "./db";
import { isSubstantiveEpisodeContent } from "./episode-text";
import type { Prisma } from "./generated/prisma/client";
import { saveNodeLink } from "./node-graph";
import { relationGroup } from "./person-relation";

// lib/node-proposal 의 만난 해 규칙과 같은 가족 관계(출생 시기에 만난 비가족은 연도를 비운다 — Q33).
const FAMILY_GROUPS = new Set(["parent", "grandparent", "sibling", "relative", "spouse", "child"]);

export type MoveEpisodeResult =
  | { ok: true; moved: boolean; fromEventId: string; toEventId: string }
  | { ok: false; reason: "not_found" | "target_not_found" };

async function recomputeHasEpisode(tx: Prisma.TransactionClient, lifeEventId: string) {
  const rows = await tx.episode.findMany({ where: { lifeEventId, kind: "STORY" }, select: { content: true } });
  await tx.lifeEvent.update({ where: { id: lifeEventId }, data: { hasEpisode: rows.some((r) => isSubstantiveEpisodeContent(r.content)) } });
}

export async function moveEpisodeToLifeEvent(userId: string, episodeId: string, targetLifeEventId: string): Promise<MoveEpisodeResult> {
  const ep = await prisma.episode.findFirst({
    where: { id: episodeId, lifeEvent: { userId } },
    select: { id: true, lifeEventId: true, memoryId: true, personId: true, lifeEvent: { select: { year: true, correctedYear: true } } },
  });
  if (!ep) return { ok: false, reason: "not_found" };
  const target = await prisma.lifeEvent.findFirst({
    where: { id: targetLifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, type: true, year: true, correctedYear: true },
  });
  if (!target) return { ok: false, reason: "target_not_found" };
  if (target.id === ep.lifeEventId) return { ok: true, moved: false, fromEventId: ep.lifeEventId, toEventId: target.id };

  const fromId = ep.lifeEventId;
  const oldYear = ep.lifeEvent.correctedYear ?? ep.lifeEvent.year;
  const newYear = target.correctedYear ?? target.year;

  await prisma.$transaction(async (tx) => {
    await tx.episode.update({ where: { id: ep.id }, data: { lifeEventId: target.id } });
    await tx.nodeLink.deleteMany({ where: { userId, fromType: "LIFE_EVENT", fromId: target.id, toType: "EPISODE", toId: ep.id } });
    await tx.userMemory.update({ where: { id: ep.memoryId }, data: { year: newYear ?? new Date().getFullYear() } });
    await recomputeHasEpisode(tx, fromId);
    await recomputeHasEpisode(tx, target.id);

    const linked = await tx.nodeLink.findMany({
      where: { userId, fromType: "EPISODE", fromId: ep.id, toType: "PERSON", status: "CONFIRMED" },
      select: { toId: true },
    });
    const personIds = [...new Set([...(ep.personId ? [ep.personId] : []), ...linked.map((l) => l.toId)])];
    const people = await tx.person.findMany({
      where: { id: { in: personIds }, userId, subjectType: "person", isDraft: false },
      select: { id: true, metYear: true, relation: true },
    });
    for (const p of people) {
      const r = await saveNodeLink(userId, { type: "LIFE_EVENT", id: target.id }, { type: "PERSON", id: p.id }, { db: tx });
      if (!r.ok) throw new Error(`move: person link ${r.reason}`);
      // 만난 해 규칙 3 — 이 이야기로만 이어진 분이고 만난 해가 옛 시기 연도일 때만.
      if (oldYear === null || p.metYear !== oldYear) continue;
      const otherStories = await tx.episode.count({
        where: { id: { not: ep.id }, lifeEvent: { userId }, OR: [{ personId: p.id }] },
      });
      const otherLinks = await tx.nodeLink.count({ where: { userId, fromType: "EPISODE", fromId: { not: ep.id }, toType: "PERSON", toId: p.id } });
      if (otherStories + otherLinks > 0) continue;
      const family = FAMILY_GROUPS.has(relationGroup(p.relation) ?? "");
      await tx.person.update({ where: { id: p.id }, data: { metYear: target.type === "BIRTH" && !family ? null : newYear } });
    }
  });
  return { ok: true, moved: true, fromEventId: fromId, toEventId: target.id };
}
