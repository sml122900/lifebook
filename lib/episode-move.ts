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
//
// 되돌리기(옮기기 직후 [되돌리기] — 3단계 E2E 2026-11-02): 옮기기가 바꾼 것을 undo 값으로 돌려준다 —
//   옛 시기 · 브릿지 연도 · 대상 시기에 새로 생긴 시기↔사람 · 지운 대상 시기 추가 소속(되살림 값) · 이 이야기 확정 인물의 만난 해.
//   undoMoveEpisode = 옛 시기로 다시 옮기고 → 새로 생긴 시기↔사람을 빼고 → 추가 소속을 되살리고 → 연도·만난 해를 옮기기 전 값으로.
//   화면을 거쳐 돌아오는 값이라 다시 검사한다(이야기·시기 소유는 옮기기가, 연결은 node-graph 입구가, 만난 해는 이 이야기의 인물만).

import { prisma } from "./db";
import { isSubstantiveEpisodeContent } from "./episode-text";
import type { Prisma } from "./generated/prisma/client";
import { removeNodeLink, restoreNodeLink, saveNodeLink, type RemovedLink, type RemovedLinkRow } from "./node-graph";
import { relationGroup } from "./person-relation";

// lib/node-proposal 의 만난 해 규칙과 같은 가족 관계(출생 시기에 만난 비가족은 연도를 비운다 — Q33).
const FAMILY_GROUPS = new Set(["parent", "grandparent", "sibling", "relative", "spouse", "child"]);

export type MoveUndo = {
  episodeId: string;
  fromEventId: string;
  toEventId: string;
  memoryYear: number; // 옮기기 전 브릿지 UserMemory 연도
  createdPersonIds: string[]; // 이번 옮기기로 대상 시기에 새로 생긴 시기↔사람
  removed: RemovedLink[]; // 이번 옮기기로 지운 연결(대상 시기의 추가 소속) — restoreNodeLink 로 되살림
  metYears: { personId: string; before: number | null }[]; // 이 이야기 확정 인물의 옮기기 전 만난 해
};

export type MoveEpisodeResult =
  | { ok: true; moved: boolean; fromEventId: string; toEventId: string; undo: MoveUndo | null }
  | { ok: false; reason: "not_found" | "target_not_found" };

async function recomputeHasEpisode(tx: Prisma.TransactionClient, lifeEventId: string) {
  const rows = await tx.episode.findMany({ where: { lifeEventId, kind: "STORY" }, select: { content: true } });
  await tx.lifeEvent.update({ where: { id: lifeEventId }, data: { hasEpisode: rows.some((r) => isSubstantiveEpisodeContent(r.content)) } });
}

export async function moveEpisodeToLifeEvent(userId: string, episodeId: string, targetLifeEventId: string): Promise<MoveEpisodeResult> {
  const ep = await prisma.episode.findFirst({
    where: { id: episodeId, lifeEvent: { userId } },
    select: { id: true, lifeEventId: true, memoryId: true, personId: true, memory: { select: { year: true } }, lifeEvent: { select: { year: true, correctedYear: true } } },
  });
  if (!ep) return { ok: false, reason: "not_found" };
  const target = await prisma.lifeEvent.findFirst({
    where: { id: targetLifeEventId, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    select: { id: true, type: true, year: true, correctedYear: true },
  });
  if (!target) return { ok: false, reason: "target_not_found" };
  if (target.id === ep.lifeEventId) return { ok: true, moved: false, fromEventId: ep.lifeEventId, toEventId: target.id, undo: null };

  const fromId = ep.lifeEventId;
  const oldYear = ep.lifeEvent.correctedYear ?? ep.lifeEvent.year;
  const newYear = target.correctedYear ?? target.year;
  const undo: MoveUndo = { episodeId: ep.id, fromEventId: fromId, toEventId: target.id, memoryYear: ep.memory.year, createdPersonIds: [], removed: [], metYears: [] };

  await prisma.$transaction(async (tx) => {
    await tx.episode.update({ where: { id: ep.id }, data: { lifeEventId: target.id } });
    // 대상 시기와의 추가 소속은 이제 주 소속 — 지우되 되살림 값을 남긴다(되돌리기).
    const extra = await tx.nodeLink.findMany({
      where: { userId, fromType: "LIFE_EVENT", fromId: target.id, toType: "EPISODE", toId: ep.id },
      select: { id: true, role: true, status: true, source: true, createdAt: true, confirmedAt: true },
    });
    await tx.nodeLink.deleteMany({ where: { id: { in: extra.map((x) => x.id) } } });
    if (extra.length > 0) {
      const rows: RemovedLinkRow[] = extra.map((x) => ({
        createdAt: x.createdAt.toISOString(),
        role: x.role,
        status: x.status,
        source: x.source === "AI" || x.source === "MIGRATION" ? x.source : "USER",
        confirmedAt: x.confirmedAt ? x.confirmedAt.toISOString() : null,
      }));
      undo.removed.push({ a: { type: "LIFE_EVENT", id: target.id }, b: { type: "EPISODE", id: ep.id }, rows });
    }
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
      undo.metYears.push({ personId: p.id, before: p.metYear });
      const r = await saveNodeLink(userId, { type: "LIFE_EVENT", id: target.id }, { type: "PERSON", id: p.id }, { db: tx });
      if (!r.ok) throw new Error(`move: person link ${r.reason}`);
      if (r.created) undo.createdPersonIds.push(p.id);
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
  return { ok: true, moved: true, fromEventId: fromId, toEventId: target.id, undo };
}

// 옮기기 되돌리기 — 옮기기 직후 [되돌리기](다음 동작 전까지). 옮기기 전 상태 그대로.
export async function undoMoveEpisode(userId: string, u: MoveUndo): Promise<{ ok: true } | { ok: false; reason: "not_found" | "bad_undo" }> {
  const str = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 64;
  const yearOk = (v: unknown) => v === null || (Number.isInteger(v) && (v as number) >= 1800 && (v as number) <= 2200);
  if (
    !u || !str(u.episodeId) || !str(u.fromEventId) || !str(u.toEventId) || u.memoryYear === null || !yearOk(u.memoryYear) ||
    !Array.isArray(u.createdPersonIds) || !u.createdPersonIds.every(str) || u.createdPersonIds.length > 50 ||
    !Array.isArray(u.removed) || u.removed.length > 5 ||
    !Array.isArray(u.metYears) || u.metYears.length > 50 || !u.metYears.every((m) => m && str(m.personId) && yearOk(m.before))
  ) {
    return { ok: false, reason: "bad_undo" };
  }
  const back = await moveEpisodeToLifeEvent(userId, u.episodeId, u.fromEventId);
  if (!back.ok) return { ok: false, reason: "not_found" };
  // 옮기기가 대상 시기에 새로 만든 시기↔사람만 뺀다(그 전부터 있던 연결은 그대로).
  for (const pid of u.createdPersonIds) {
    const r = await removeNodeLink(userId, { type: "LIFE_EVENT", id: u.toEventId }, { type: "PERSON", id: pid });
    if (!r.ok && r.reason !== "not_found") return { ok: false, reason: "bad_undo" };
  }
  for (const l of u.removed) {
    const r = await restoreNodeLink(userId, l.a, l.b, l.rows);
    if (!r.ok) return { ok: false, reason: r.reason === "not_found" ? "not_found" : "bad_undo" };
  }
  // 연도·만난 해 — 이 이야기(이 계정)의 것만.
  const ep = await prisma.episode.findFirst({ where: { id: u.episodeId, lifeEvent: { userId } }, select: { memoryId: true, personId: true } });
  if (!ep) return { ok: false, reason: "not_found" };
  await prisma.userMemory.updateMany({ where: { id: ep.memoryId, userId }, data: { year: u.memoryYear } });
  const linked = await prisma.nodeLink.findMany({ where: { userId, fromType: "EPISODE", fromId: u.episodeId, toType: "PERSON" }, select: { toId: true } });
  const mine = new Set([...(ep.personId ? [ep.personId] : []), ...linked.map((l) => l.toId)]);
  for (const m of u.metYears) {
    if (mine.has(m.personId)) await prisma.person.updateMany({ where: { id: m.personId, userId }, data: { metYear: m.before } });
  }
  return { ok: true };
}
