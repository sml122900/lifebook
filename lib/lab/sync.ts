// 기억 에이전트 연구 트랙 — 동기화 실행기 (R1-7). 원본은 읽기만, 쓰기는 lab 테이블만.
//
// 1) diffSources 로 원본 ↔ 원장 비교(LLM 0)
// 2) 소멸 원본: 카드 삭제 + 원장 GONE
// 3) 신규·변경 원본: 추출 → 원장 갱신과 카드 교체를 한 트랜잭션으로.
//    추출 실패 시 원장 해시를 비워 다음 동기화에서 다시 시도하고, 옛 카드는 지운다
//    (수정 전 내용이 인용되지 않게).
// 4) 시기 컨텍스트가 바뀌었으면 시기 표현이 있는 카드의 연도만 다시 계산(LLM 0)
// 5) 임베딩이 없는 카드 임베딩(voyage-3.5 document)
// maxLlmUnits 로 한 번에 LLM 을 부를 원본 수를 제한한다(서버 액션 20 — Vercel 시간 초과 대비).

import { randomUUID } from "node:crypto";

import { prisma } from "../db";
import { EMBEDDING_MODEL } from "../embeddings";
import { loadPeriodContext } from "./context";
import { diffSources } from "./diff";
import { labEmbed } from "./embed";
import { extractUnit, llmExtractor, needsLlm, type Extractor } from "./extract";
import { CONTEXT_DEPENDENT_BASES, resolvePeriod } from "./period";
import { EXTRACTOR_VERSION, loadSourceUnits } from "./sources";

export type SyncReport = {
  runId: string;
  units: { new: number; changed: number; unchanged: number; gone: number };
  llmUnits: number;
  deterministicUnits: number;
  remaining: number;
  cardsCreated: number;
  cardsDeleted: number;
  droppedQuote: number;
  droppedSensitive: number;
  contextRecomputed: number;
  embedded: number;
  errors: { sourceType: string; message: string }[];
};

function errMsg(e: unknown): string {
  return (e instanceof Error ? e.message : String(e)).slice(0, 300);
}

export async function syncSubject(
  userId: string,
  opts: { maxLlmUnits?: number; extractor?: Extractor; embed?: boolean } = {},
): Promise<SyncReport> {
  const runId = `sync:${new Date().toISOString().slice(0, 19)}:${randomUUID().slice(0, 8)}`;
  const maxLlm = opts.maxLlmUnits ?? Number.POSITIVE_INFINITY;
  const [diff, { ctx, contextHash }, people] = await Promise.all([
    diffSources(userId),
    loadPeriodContext(userId),
    prisma.person.findMany({
      where: { userId, isDraft: false },
      select: { id: true, name: true, relation: true },
    }),
  ]);
  const report: SyncReport = {
    runId,
    units: {
      new: diff.new.length,
      changed: diff.changed.length,
      unchanged: diff.unchanged.length,
      gone: diff.gone.length,
    },
    llmUnits: 0,
    deterministicUnits: 0,
    remaining: 0,
    cardsCreated: 0,
    cardsDeleted: 0,
    droppedQuote: 0,
    droppedSensitive: 0,
    contextRecomputed: 0,
    embedded: 0,
    errors: [],
  };
  const now = new Date();

  // 2) 소멸.
  if (diff.gone.length > 0) {
    const goneRows = await prisma.memorySourceUnit.findMany({
      where: {
        userId,
        OR: diff.gone.map((g) => ({
          sourceType: g.sourceType,
          sourceId: g.sourceId,
        })),
      },
      select: { id: true },
    });
    const ids = goneRows.map((r) => r.id);
    const del = await prisma.memoryCard.deleteMany({
      where: { unitId: { in: ids } },
    });
    await prisma.memorySourceUnit.updateMany({
      where: { id: { in: ids } },
      data: { status: "GONE", lastSyncedAt: now },
    });
    report.cardsDeleted += del.count;
  }

  // 3) 신규·변경.
  for (const unit of [...diff.new, ...diff.changed]) {
    const key = {
      userId_sourceType_sourceId: {
        userId,
        sourceType: unit.sourceType,
        sourceId: unit.sourceId,
      },
    };
    const llm = needsLlm(unit);
    if (llm && report.llmUnits >= maxLlm) {
      report.remaining += 1;
      continue;
    }
    if (llm) report.llmUnits += 1;
    else report.deterministicUnits += 1;
    try {
      const r = await extractUnit(
        unit,
        ctx,
        people,
        { userId, refId: runId },
        opts.extractor ?? llmExtractor,
      );
      report.droppedQuote += r.droppedQuote;
      report.droppedSensitive += r.droppedSensitive;
      const unitData = {
        sourceHash: unit.hash,
        contextHash,
        status: r.cards.length > 0 ? "ACTIVE" : "EMPTY",
        extractorVersion: EXTRACTOR_VERSION,
        lastSyncedAt: now,
        lastError: null,
      };
      await prisma.$transaction(async (tx) => {
        const row = await tx.memorySourceUnit.upsert({
          where: key,
          create: {
            userId,
            sourceType: unit.sourceType,
            sourceId: unit.sourceId,
            ...unitData,
          },
          update: unitData,
          select: { id: true },
        });
        const del = await tx.memoryCard.deleteMany({
          where: { unitId: row.id },
        });
        report.cardsDeleted += del.count;
        if (r.cards.length > 0) {
          await tx.memoryCard.createMany({
            data: r.cards.map((c, i) => ({
              ...c,
              userId,
              unitId: row.id,
              sourceType: unit.sourceType,
              sourceId: unit.sourceId,
              ordinal: i,
              sessionKey: unit.sessionKey,
              extractorVersion: EXTRACTOR_VERSION,
            })),
          });
        }
      });
      report.cardsCreated += r.cards.length;
    } catch (e) {
      report.errors.push({ sourceType: unit.sourceType, message: errMsg(e) });
      const failed = {
        sourceHash: "",
        contextHash,
        status: "ERROR",
        extractorVersion: EXTRACTOR_VERSION,
        lastSyncedAt: now,
        lastError: errMsg(e),
      };
      const row = await prisma.memorySourceUnit.upsert({
        where: key,
        create: {
          userId,
          sourceType: unit.sourceType,
          sourceId: unit.sourceId,
          ...failed,
        },
        update: failed,
        select: { id: true },
      });
      const del = await prisma.memoryCard.deleteMany({
        where: { unitId: row.id },
      });
      report.cardsDeleted += del.count;
    }
  }

  // 4) 시기 컨텍스트 변화 → 시기 표현이 있는 카드의 연도만 재계산. 컨텍스트에 따라
  //    값이 바뀌는 해석(나이·골격·출생연도 기본값)만 — 명시 연도·현재·시대 사건은 그대로,
  //    시대 사건 회상 카드는 담은 사건 연도가 정답이라 제외.
  if (diff.contextChanged) {
    const cards = await prisma.memoryCard.findMany({
      where: {
        userId,
        timeExpression: { not: null },
        sourceType: { not: "ERA_MEMORY" },
      },
      select: { id: true, timeExpression: true },
    });
    for (const c of cards) {
      const r = resolvePeriod(c.timeExpression as string, ctx);
      if (!r.ok || !CONTEXT_DEPENDENT_BASES.includes(r.basis)) continue;
      await prisma.memoryCard.update({
        where: { id: c.id },
        data: {
          yearFrom: r.yearFrom,
          yearTo: r.yearTo,
          timePrecision: r.precision,
          timeBasis: r.basis,
        },
      });
      report.contextRecomputed += 1;
    }
    await prisma.memorySourceUnit.updateMany({
      where: { userId, status: { not: "GONE" } },
      data: { contextHash },
    });
  }

  // 5) 임베딩.
  if (opts.embed !== false) {
    try {
      const pending = await prisma.$queryRaw<{ id: string; summary: string }[]>`
        SELECT id, summary FROM "MemoryCard" WHERE "userId" = ${userId} AND embedding IS NULL`;
      if (pending.length > 0) {
        const vectors = await labEmbed(
          pending.map((p) => p.summary),
          "document",
          { userId, refId: runId },
        );
        for (let i = 0; i < pending.length; i++) {
          await prisma.$executeRaw`
            UPDATE "MemoryCard" SET embedding = ${`[${vectors[i].join(",")}]`}::vector(1024),
              "embeddingModel" = ${EMBEDDING_MODEL}
            WHERE id = ${pending[i].id}`;
        }
        report.embedded = pending.length;
      }
    } catch (e) {
      // 임베딩 없는 카드는 다음 동기화에서 다시 시도(검색은 키워드로 대체 가능).
      report.errors.push({ sourceType: "EMBED", message: errMsg(e) });
    }
  }

  return report;
}

// 저장된 카드의 인용이 원문 필드의 [quoteStart, quoteEnd) 구간과 글자 그대로 같은지.
// R1 완료 기준 llmCardQuoteVerbatimRate 의 근거.
export async function verifyStoredQuotes(userId: string): Promise<{
  llmCards: number;
  llmVerbatim: number;
  deterministicCards: number;
  deterministicVerbatim: number;
}> {
  const units = await loadSourceUnits(userId);
  const byKey = new Map(
    units.map((u) => [`${u.sourceType}\u0000${u.sourceId}`, u]),
  );
  const cards = await prisma.memoryCard.findMany({
    where: { userId, quote: { not: null } },
    select: {
      sourceType: true,
      sourceId: true,
      quote: true,
      quoteField: true,
      quoteStart: true,
      quoteEnd: true,
      extractorModel: true,
    },
  });
  const out = {
    llmCards: 0,
    llmVerbatim: 0,
    deterministicCards: 0,
    deterministicVerbatim: 0,
  };
  for (const c of cards) {
    const text = byKey.get(`${c.sourceType}\u0000${c.sourceId}`)?.fields[
      c.quoteField ?? ""
    ];
    const ok =
      !!text &&
      c.quoteStart !== null &&
      c.quoteEnd !== null &&
      text.slice(c.quoteStart, c.quoteEnd) === c.quote;
    if (c.extractorModel === "deterministic") {
      out.deterministicCards += 1;
      if (ok) out.deterministicVerbatim += 1;
    } else {
      out.llmCards += 1;
      if (ok) out.llmVerbatim += 1;
    }
  }
  return out;
}
