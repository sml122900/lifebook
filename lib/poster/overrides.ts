// P6 — 포스터 항목 수동 편집(override) 공용 타입·상수·정규화 (순수 모듈).
//
// Poster.selections 각 항목에 optional override 를 둔다. override 없으면 P4
// 자동배치(linspace·river_x·실측)값을 쓰고, 편집한 항목만 수동값으로 덮어쓴다
// → 자동/수동 공존. 좌표는 논리캔버스(1037×1517) 기준(인쇄 스케일에 그대로 곱).
//
// 서버(액션·뷰 페이지)·클라(PosterCompose) 양쪽이 import 하므로 prisma·DOM
// 의존 없는 순수 모듈로 둔다("use server" 값 export 함정 회피).

import { POSTER_W, POSTER_H, CLAMP_MARGIN, MEMO_LEFT_X } from "./compose-layout";

// 인쇄 안전여백 — 이 밖으로 나가면 재단 시 잘릴 수 있어 경고.
export const NODE_SAFE_MARGIN = CLAMP_MARGIN; // 150
export const MEMO_SAFE_MARGIN = MEMO_LEFT_X; // 34

export const FONT_SCALE_MIN = 0.6;
export const FONT_SCALE_MAX = 1.8;
export const FONT_SCALE_STEP = 0.1;

const NODE_TITLE_MAX = 100;
const YEAR_MAX = 12;
const MEMO_TEXT_MAX = 300;

export type ItemOverride = {
  x?: number; // 논리캔버스 중심 X(없으면 자동배치)
  y?: number; // 논리캔버스 중심 Y
  fontScale?: number; // 글자 배율(없으면 1)
  textOverride?: string; // 노드=제목 / 메모=문장
  yearOverride?: string; // 노드 연도(메모엔 무의미)
};

export type PosterSelectionFull = {
  eventId: string;
  type: "node" | "memo";
  order: number;
  override?: ItemOverride;
};

function clampNum(v: unknown, lo: number, hi: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(lo, Math.min(hi, v));
}

function clampStr(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  if (t === "") return undefined;
  return t.slice(0, max);
}

// 들어온 override 를 안전 범위로 정규화. 유효 필드 0개면 undefined(자동배치).
export function sanitizeOverride(raw: unknown): ItemOverride | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  const out: ItemOverride = {};
  const x = clampNum(o.x, 0, POSTER_W);
  const y = clampNum(o.y, 0, POSTER_H);
  const fs = clampNum(o.fontScale, FONT_SCALE_MIN, FONT_SCALE_MAX);
  const t = clampStr(o.textOverride, MEMO_TEXT_MAX);
  const yr = clampStr(o.yearOverride, YEAR_MAX);
  if (x != null) out.x = x;
  if (y != null) out.y = y;
  if (fs != null) out.fontScale = fs;
  // 노드 제목은 100, 메모 문장은 300 — 더 짧은 노드는 호출부에서 보장하나
  // 여기선 보수적으로 MEMO_TEXT_MAX 까지 허용(노드는 UI maxLength 로 제한).
  if (t != null) out.textOverride = t;
  if (yr != null) out.yearOverride = yr;
  return Object.keys(out).length > 0 ? out : undefined;
}

export { NODE_TITLE_MAX, MEMO_TEXT_MAX };

// selections JSON → PosterSelectionFull[] (override 포함). 깨진 항목은 건너뜀.
export function parseSelectionsFull(raw: unknown): PosterSelectionFull[] {
  if (!Array.isArray(raw)) return [];
  const out: PosterSelectionFull[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (typeof o.eventId !== "string") continue;
    const type = o.type === "memo" ? "memo" : "node";
    const order = typeof o.order === "number" ? o.order : 0;
    const override = sanitizeOverride(o.override);
    out.push({ eventId: o.eventId, type, order, override });
  }
  return out;
}
