// 기억 에이전트 연구 트랙 — 원본 ↔ 색인 원장 해시 비교 (R1-6). LLM 0, 쓰기 0.
//
// 트리거 대신 필요할 때 끌어오는 동기화(phase/기억에이전트_R1-R4_기획.md §2-2):
// 원본 전체를 다시 읽어 해시를 내고 MemorySourceUnit 과 비교한다.
//   new       원장에 없거나 GONE 으로 표시됐던 원본(되살아남 포함) → 추출
//   changed   해시가 달라진 원본 → 재추출
//   unchanged 그대로
//   gone      원장엔 ACTIVE/EMPTY 인데 원본이 사라짐(삭제·초안 반려·캐스케이드) → 카드 삭제
// 원장 반영(추출·GONE 표시)은 R1-7 동기화 실행기가 한다.

import { prisma } from "../db";
import { loadPeriodContext } from "./context";
import { loadSourceUnits, SOURCE_TYPES, type SourceUnit } from "./sources";

export type StoredUnit = {
  sourceType: string;
  sourceId: string;
  sourceHash: string;
  status: string;
  contextHash: string | null;
};

export type UnitDiff = {
  new: SourceUnit[];
  changed: SourceUnit[];
  unchanged: SourceUnit[];
  gone: StoredUnit[];
};

const keyOf = (sourceType: string, sourceId: string) =>
  `${sourceType}\u0000${sourceId}`;

export function diffUnits(
  current: SourceUnit[],
  stored: StoredUnit[],
): UnitDiff {
  const storedByKey = new Map(
    stored.map((s) => [keyOf(s.sourceType, s.sourceId), s]),
  );
  const currentKeys = new Set(
    current.map((u) => keyOf(u.sourceType, u.sourceId)),
  );
  const out: UnitDiff = { new: [], changed: [], unchanged: [], gone: [] };
  for (const u of current) {
    const s = storedByKey.get(keyOf(u.sourceType, u.sourceId));
    if (!s || s.status === "GONE") out.new.push(u);
    else if (s.sourceHash !== u.hash) out.changed.push(u);
    else out.unchanged.push(u);
  }
  for (const s of stored) {
    if (
      s.status !== "GONE" &&
      !currentKeys.has(keyOf(s.sourceType, s.sourceId))
    )
      out.gone.push(s);
  }
  return out;
}

export type SourceDiff = UnitDiff & {
  contextHash: string;
  contextChanged: boolean;
};

export async function diffSources(userId: string): Promise<SourceDiff> {
  const [current, stored, { contextHash }] = await Promise.all([
    loadSourceUnits(userId),
    prisma.memorySourceUnit.findMany({
      where: { userId },
      select: {
        sourceType: true,
        sourceId: true,
        sourceHash: true,
        status: true,
        contextHash: true,
      },
    }),
    loadPeriodContext(userId),
  ]);
  const diff = diffUnits(current, stored);
  const contextChanged = stored.some(
    (s) =>
      s.status !== "GONE" &&
      s.contextHash !== null &&
      s.contextHash !== contextHash,
  );
  return { ...diff, contextHash, contextChanged };
}

export type SourceDiffSummary = {
  total: number;
  contextChanged: boolean;
  byType: {
    sourceType: string;
    new: number;
    changed: number;
    unchanged: number;
    gone: number;
  }[];
};

export function summarizeDiff(d: SourceDiff): SourceDiffSummary {
  const count = (xs: { sourceType: string }[], t: string) =>
    xs.filter((x) => x.sourceType === t).length;
  return {
    total: d.new.length + d.changed.length + d.unchanged.length,
    contextChanged: d.contextChanged,
    byType: SOURCE_TYPES.map((t) => ({
      sourceType: t,
      new: count(d.new, t),
      changed: count(d.changed, t),
      unchanged: count(d.unchanged, t),
      gone: count(d.gone, t),
    })),
  };
}
