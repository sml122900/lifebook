"use client";

// P4/P6 — SVG 포스터 합성 엔진 + 액티브 편집 (클라이언트).
//
// 빈 배경 PNG 위에 노드(둥근사각)·메모(멀티라인 text)를 SVG 레이어로 합성.
// getBBox/getComputedTextLength 실측 + offscreen canvas luminance 는 브라우저
// 전용이라 여기서 수행한다. 배치 계산은 lib/poster/compose-layout(순수).
//
// P6 편집(editable): 항목 클릭 선택 → 드래그 이동 / 글자 크기(A±) / 내용 수정 /
// 삭제. 수정분은 per-item override 로 저장(없으면 자동배치). override 는 view
// 모드에서도 항상 렌더에 반영(저장된 커스터마이징). 편집 모드만 상호작용 추가.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  POSTER_W,
  POSTER_H,
  LUM_THRESHOLD,
  LIGHT_TEXT,
  MEMO_MAX,
  placeNodes,
  distributeMemos,
  memoTone,
  seededRotation,
  detectMemoCrowding,
  type NodePos,
  type MemoSlot,
} from "@/lib/poster/compose-layout";
import {
  NODE_SAFE_MARGIN,
  MEMO_SAFE_MARGIN,
  FONT_SCALE_MIN,
  FONT_SCALE_MAX,
  FONT_SCALE_STEP,
  NODE_TITLE_MAX,
  MEMO_TEXT_MAX,
  type ItemOverride,
  type PosterSelectionFull,
} from "@/lib/poster/overrides";
import { exportPosterPng } from "./print-export";

export const POSTER_BG_SRC = "/poster/river-bg.png";

const FONT_SANS = "Noto Sans KR";
const FONT_SERIF = "Noto Serif KR";

// 노드 둥근사각 패딩(글자 기준). 위 모서리만 NODE_TOP_TRIM 으로 깎아 비대칭.
const NODE_PAD_X = 7;
const NODE_PAD_Y = 3;
const NODE_LINE_GAP = 2;
const NODE_TOP_TRIM = 8;

const GFONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400&family=Noto+Serif+KR:wght@400;500;700&display=swap";

export type PosterNode = {
  eventId: string;
  order: number;
  year: number | null;
  label: string;
  override?: ItemOverride;
};
export type PosterMemo = {
  eventId: string;
  order: number;
  text: string;
  override?: ItemOverride;
};

type SaveResult = { ok: boolean; error?: string };

type RenderNode = {
  key: string;
  cx: number; cy: number; boxW: number; boxH: number; radius: number;
  topY: number;
  year: string; title: string;
};
type RenderMemo = {
  key: string;
  x: number; y: number; anchor: "start" | "end"; rotation: number;
  color: string; halo: string; lines: string[]; lineHeight: number; maxW: number;
};
type RenderModel = {
  nodes: RenderNode[];
  memos: RenderMemo[];
  crowded: boolean;
};

const nodeKey = (eventId: string) => `node:${eventId}`;
const memoKey = (eventId: string) => `memo:${eventId}`;

// ── 측정 도구(off-DOM SVG) ───────────────────────────────────────────
function makeMeasurer(): { svg: SVGSVGElement; cleanup: () => void } {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("style", "position:absolute;left:-9999px;top:-9999px;visibility:hidden;");
  document.body.appendChild(svg);
  return { svg, cleanup: () => svg.remove() };
}

function measure(svg: SVGSVGElement, text: string, family: string, size: number, weight: number): { w: number; h: number } {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
  t.setAttribute("font-family", `"${family}"`);
  t.setAttribute("font-size", String(size));
  t.setAttribute("font-weight", String(weight));
  t.textContent = text || " ";
  svg.appendChild(t);
  const bb = t.getBBox();
  t.remove();
  return { w: bb.width, h: bb.height };
}

function lineLength(svg: SVGSVGElement, text: string, family: string, size: number, weight: number): number {
  const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
  t.setAttribute("font-family", `"${family}"`);
  t.setAttribute("font-size", String(size));
  t.setAttribute("font-weight", String(weight));
  t.textContent = text;
  svg.appendChild(t);
  const len = (t as SVGTextContentElement).getComputedTextLength();
  t.remove();
  return len;
}

function wrapText(svg: SVGSVGElement, text: string, maxW: number, family: string, size: number, weight: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (cur && lineLength(svg, trial, family, size, weight) > maxW) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function sampleLuminance(ctx: CanvasRenderingContext2D | null, x: number, y: number, w: number, h: number): number {
  if (!ctx) return 255;
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(POSTER_W - sx, Math.ceil(w)));
  const sh = Math.max(1, Math.min(POSTER_H - sy, Math.ceil(h)));
  try {
    const data = ctx.getImageData(sx, sy, sw, sh).data;
    let sum = 0, n = 0;
    for (let i = 0; i < data.length; i += 16) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
    return n ? sum / n : 255;
  } catch {
    return 255;
  }
}

export function PosterCompose({
  ownerName,
  nodes,
  memos,
  editable = false,
  onSave,
  bgSrc = POSTER_BG_SRC,
}: {
  ownerName: string;
  nodes: PosterNode[];
  memos: PosterMemo[];
  editable?: boolean;
  onSave?: (items: PosterSelectionFull[]) => Promise<SaveResult>;
  // P5-5c — 배경 분기(river=고정 PNG / custom=/api/poster/background). canvas-safe
  // 위해 same-origin 권장. 기본은 river.
  bgSrc?: string;
}) {
  const [model, setModel] = useState<RenderModel | null>(null);
  const [failed, setFailed] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  // 편집 상태.
  const [editMode, setEditMode] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, ItemOverride>>(() => {
    const rec: Record<string, ItemOverride> = {};
    for (const n of nodes) if (n.override) rec[nodeKey(n.eventId)] = n.override;
    for (const m of memos) if (m.override) rec[memoKey(m.eventId)] = m.override;
    return rec;
  });
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // 살아있는 항목(삭제 제외).
  const activeNodes = useMemo(
    () => nodes.filter((n) => !deleted.has(nodeKey(n.eventId))),
    [nodes, deleted],
  );
  const activeMemos = useMemo(
    () => memos.filter((m) => !deleted.has(memoKey(m.eventId))),
    [memos, deleted],
  );

  // 텍스트(재측정 트리거) 시그니처 — x/y/scale 변경은 재측정 X(렌더서 transform).
  const textSig = useMemo(() => {
    const parts: string[] = [];
    for (const n of activeNodes) {
      const o = overrides[nodeKey(n.eventId)];
      parts.push(`n:${n.eventId}:${o?.textOverride ?? ""}:${o?.yearOverride ?? ""}`);
    }
    for (const m of activeMemos) {
      const o = overrides[memoKey(m.eventId)];
      parts.push(`m:${m.eventId}:${o?.textOverride ?? ""}`);
    }
    return parts.join("|");
  }, [activeNodes, activeMemos, overrides]);

  useEffect(() => {
    let cancelled = false;

    if (!document.querySelector(`link[href="${GFONTS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = GFONTS_HREF;
      document.head.appendChild(link);
    }

    async function build() {
      try {
        await Promise.all([
          document.fonts.load(`400 18px "${FONT_SANS}"`),
          document.fonts.load(`700 21px "${FONT_SERIF}"`),
          document.fonts.load(`500 16px "${FONT_SERIF}"`),
        ]);
        await document.fonts.ready;
        if (cancelled) return;

        const { svg, cleanup } = makeMeasurer();

        // 효과 텍스트(override 반영)로 실측.
        const effNodeLabel = (n: PosterNode) =>
          overrides[nodeKey(n.eventId)]?.textOverride ?? n.label;
        const effNodeYear = (n: PosterNode) => {
          const yo = overrides[nodeKey(n.eventId)]?.yearOverride;
          if (yo != null) return yo;
          return n.year != null ? String(n.year) : "";
        };
        const effMemoText = (m: PosterMemo) =>
          overrides[memoKey(m.eventId)]?.textOverride ?? m.text;

        // 2) 노드 박스 실측 → 배치.
        const boxes = activeNodes.map((n) => {
          const yearStr = effNodeYear(n);
          const ym = measure(svg, yearStr || " ", FONT_SANS, 18, 400);
          const tm = measure(svg, effNodeLabel(n) || " ", FONT_SERIF, 21, 700);
          const boxW = Math.max(ym.w, tm.w) + NODE_PAD_X * 2;
          const boxH = ym.h + tm.h + NODE_LINE_GAP + NODE_PAD_Y * 2;
          return { boxW, boxH };
        });
        const positions: NodePos[] = placeNodes(boxes);
        const renderNodes: RenderNode[] = positions.map((p, i) => {
          const h = p.boxH - NODE_TOP_TRIM;
          const n = activeNodes[i];
          return {
            key: nodeKey(n.eventId),
            cx: p.cx, cy: p.cy, boxW: p.boxW, boxH: h, radius: h * 0.46,
            topY: p.cy - p.boxH / 2 + NODE_TOP_TRIM,
            year: effNodeYear(n),
            title: effNodeLabel(n),
          };
        });

        // 3) 메모 배치 + 워드랩.
        const memoTexts = activeMemos.map(effMemoText);
        const slots: MemoSlot[] = distributeMemos(Math.min(memoTexts.length, MEMO_MAX));
        const sampleH = measure(svg, "한글Ay", FONT_SERIF, 16, 500).h;
        const lineHeight = sampleH - 3;
        const wrapped = slots.map((s) =>
          wrapText(svg, memoTexts[s.memoIndex] ?? "", s.maxW, FONT_SERIF, 16, 500),
        );
        const heights = wrapped.map((lines) => lines.length * lineHeight);
        const crowded = detectMemoCrowding(slots, heights, lineHeight);
        cleanup();

        // 4) 배경 luminance.
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          const img = await loadImage(bgSrc);
          const canvas = document.createElement("canvas");
          canvas.width = POSTER_W;
          canvas.height = POSTER_H;
          const c = canvas.getContext("2d", { willReadFrequently: true });
          if (c) {
            c.drawImage(img, 0, 0, POSTER_W, POSTER_H);
            ctx = c;
          }
        } catch {
          ctx = null;
        }
        if (cancelled) return;

        const renderMemos: RenderMemo[] = slots.map((s, i) => {
          const lines = wrapped[i];
          const h = heights[i];
          const regionX = s.anchor === "start" ? s.x : s.x - s.maxW;
          const lum = sampleLuminance(ctx, regionX, s.y, s.maxW, h);
          const light = lum < LUM_THRESHOLD;
          const m = activeMemos[s.memoIndex];
          return {
            key: memoKey(m.eventId),
            x: s.x, y: s.y, anchor: s.anchor,
            rotation: seededRotation(s.memoIndex),
            color: light ? LIGHT_TEXT : memoTone(s.memoIndex),
            halo: light ? "rgba(35,28,20,0.82)" : "rgba(250,245,230,0.80)",
            lines, lineHeight, maxW: s.maxW,
          };
        });

        if (!cancelled) setModel({ nodes: renderNodes, memos: renderMemos, crowded });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    build();
    return () => { cancelled = true; };
    // textSig 가 텍스트·삭제·항목 변화를 모두 포괄(드래그 x/y 는 미포함 → 재측정 X).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerName, textSig, bgSrc]);

  // ── 항목 기하(override 반영) — 안전여백·선택 외곽선 공용 ──────────────
  const geom = useMemo(() => {
    const map = new Map<string, { left: number; top: number; right: number; bottom: number; cx: number; cy: number; out: boolean }>();
    if (!model) return map;
    for (const n of model.nodes) {
      const o = overrides[n.key];
      const cx = o?.x ?? n.cx;
      const cy = o?.y ?? n.cy;
      const s = o?.fontScale ?? 1;
      const left = cx - (n.boxW / 2) * s;
      const right = cx + (n.boxW / 2) * s;
      const top = cy + (n.topY - n.cy) * s;
      const bottom = cy + (n.topY + n.boxH - n.cy) * s;
      const out =
        left < NODE_SAFE_MARGIN || right > POSTER_W - NODE_SAFE_MARGIN ||
        top < NODE_SAFE_MARGIN || bottom > POSTER_H - NODE_SAFE_MARGIN;
      map.set(n.key, { left, top, right, bottom, cx, cy, out });
    }
    for (const m of model.memos) {
      const o = overrides[m.key];
      const ax = o?.x ?? m.x;
      const ay = o?.y ?? m.y;
      const s = o?.fontScale ?? 1;
      const w = m.maxW * s;
      const left = m.anchor === "start" ? ax : ax - w;
      const right = m.anchor === "start" ? ax + w : ax;
      const top = ay - m.lineHeight * 0.8 * s;
      const bottom = ay + ((m.lines.length - 1) * m.lineHeight + m.lineHeight * 0.3) * s;
      const out =
        left < MEMO_SAFE_MARGIN || right > POSTER_W - MEMO_SAFE_MARGIN ||
        top < MEMO_SAFE_MARGIN || bottom > POSTER_H - MEMO_SAFE_MARGIN;
      map.set(m.key, { left, top, right, bottom, cx: ax, cy: ay, out });
    }
    return map;
  }, [model, overrides]);

  const anyOut = useMemo(() => {
    for (const g of geom.values()) if (g.out) return true;
    return false;
  }, [geom]);

  // ── 드래그 ───────────────────────────────────────────────────────────
  const dragRef = useRef<{ key: string; offX: number; offY: number } | null>(null);

  const clientToLogical = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const onMove = useCallback((e: PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const lp = clientToLogical(e.clientX, e.clientY);
    if (!lp) return;
    const nx = Math.max(0, Math.min(POSTER_W, lp.x - d.offX));
    const ny = Math.max(0, Math.min(POSTER_H, lp.y - d.offY));
    setOverrides((prev) => ({ ...prev, [d.key]: { ...prev[d.key], x: nx, y: ny } }));
    setSavedMsg(null);
  }, [clientToLogical]);

  const onUp = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }, [onMove]);

  const startDrag = useCallback(
    (e: React.PointerEvent, key: string, baseX: number, baseY: number) => {
      if (!editMode) return;
      e.stopPropagation();
      setSelected(key);
      const lp = clientToLogical(e.clientX, e.clientY);
      if (!lp) return;
      const cur = overrides[key];
      const startX = cur?.x ?? baseX;
      const startY = cur?.y ?? baseY;
      dragRef.current = { key, offX: lp.x - startX, offY: lp.y - startY };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [editMode, overrides, clientToLogical, onMove, onUp],
  );

  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  // ── 편집 동작 ────────────────────────────────────────────────────────
  function patchOverride(key: string, patch: Partial<ItemOverride>) {
    setOverrides((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setSavedMsg(null);
  }
  function bumpFont(key: string, dir: 1 | -1) {
    setOverrides((prev) => {
      const cur = prev[key] ?? {};
      const next = Math.round(((cur.fontScale ?? 1) + dir * FONT_SCALE_STEP) * 10) / 10;
      const s = Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, next));
      return { ...prev, [key]: { ...cur, fontScale: s } };
    });
    setSavedMsg(null);
  }
  function removeItem(key: string) {
    setDeleted((prev) => new Set(prev).add(key));
    setSelected(null);
    setSavedMsg(null);
  }

  // 선택 항목 정보.
  const selectedItem = useMemo(() => {
    if (!selected) return null;
    const n = activeNodes.find((x) => nodeKey(x.eventId) === selected);
    if (n) {
      const o = overrides[selected];
      return {
        key: selected, type: "node" as const,
        text: o?.textOverride ?? n.label,
        year: o?.yearOverride ?? (n.year != null ? String(n.year) : ""),
        scale: o?.fontScale ?? 1,
      };
    }
    const m = activeMemos.find((x) => memoKey(x.eventId) === selected);
    if (m) {
      const o = overrides[selected];
      return {
        key: selected, type: "memo" as const,
        text: o?.textOverride ?? m.text,
        year: "",
        scale: o?.fontScale ?? 1,
      };
    }
    return null;
  }, [selected, activeNodes, activeMemos, overrides]);

  // 패널 입력(선택 바뀌면 로드).
  const [panelText, setPanelText] = useState("");
  const [panelYear, setPanelYear] = useState("");
  useEffect(() => {
    if (selectedItem) {
      setPanelText(selectedItem.text);
      setPanelYear(selectedItem.year);
    }
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyPanelText() {
    if (!selectedItem) return;
    const t = panelText.trim();
    const patch: Partial<ItemOverride> = { textOverride: t === "" ? undefined : t };
    if (selectedItem.type === "node") {
      const y = panelYear.trim();
      patch.yearOverride = y === "" ? undefined : y;
    }
    patchOverride(selectedItem.key, patch);
  }

  // ── 저장 ─────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!onSave) return;
    const items: PosterSelectionFull[] = [];
    for (const n of activeNodes) {
      items.push({ eventId: n.eventId, type: "node", order: n.order, override: overrides[nodeKey(n.eventId)] });
    }
    for (const m of activeMemos) {
      items.push({ eventId: m.eventId, type: "memo", order: m.order, override: overrides[memoKey(m.eventId)] });
    }
    items.sort((a, b) => a.order - b.order);
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await onSave(items);
      setSavedMsg(res.ok ? "저장했어요. 다음에 와도 그대로예요." : (res.error ?? "저장하지 못했어요."));
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    if (!model) return;
    if (
      anyOut &&
      !window.confirm(
        "안전여백을 벗어난 글상자가 있어요. 인쇄 때 잘릴 수 있어요. 그래도 내려받을까요?",
      )
    ) {
      return;
    }
    setExporting(true);
    setSavedMsg(null);
    try {
      await exportPosterPng(model, overrides, ownerName);
    } catch {
      setSavedMsg("인쇄 파일을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setExporting(false);
    }
  }

  if (failed) return <p className="text-sm text-danger">포스터를 그리지 못했어요.</p>;
  if (!model) return <p className="text-base text-ink-soft">포스터를 그리는 중이에요…</p>;

  // 항목 transform(이동+크기). baseX/Y = 자동배치 기준점.
  const itemTransform = (baseX: number, baseY: number, o?: ItemOverride): string | undefined => {
    const dx = (o?.x ?? baseX) - baseX;
    const dy = (o?.y ?? baseY) - baseY;
    const s = o?.fontScale ?? 1;
    const parts: string[] = [];
    if (dx || dy) parts.push(`translate(${dx} ${dy})`);
    if (s !== 1) parts.push(`translate(${baseX} ${baseY}) scale(${s}) translate(${-baseX} ${-baseY})`);
    return parts.length ? parts.join(" ") : undefined;
  };

  return (
    <div className="flex flex-col gap-3">
      {/* 편집 툴바 */}
      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border-2 border-line bg-surface px-4 py-3">
          <button
            type="button"
            data-tour="poster-edit"
            onClick={() => { setEditMode((v) => !v); setSelected(null); }}
            className={
              "inline-flex min-h-[48px] items-center justify-center rounded-md px-5 py-2 text-base font-bold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand " +
              (editMode ? "bg-ink text-white hover:bg-ink/90" : "border-2 border-action bg-surface text-action hover:bg-banner")
            }
          >
            {editMode ? "✓ 편집 끝내기" : "✏️ 편집하기"}
          </button>
          {editMode && (
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:bg-line"
            >
              {saving ? "저장 중…" : "저장하기"}
            </button>
          )}
        </div>
      )}

      {editable && editMode && (
        <p className="text-sm text-ink-soft">
          글상자를 눌러 고르고, 끌어서 옮기세요. 아래에서 글자 크기·내용을 고치거나 뺄 수 있어요.
        </p>
      )}

      {/* 인쇄용 파일 내려받기 — 항상 노출(최종 출력물). */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-action bg-surface px-5 py-2 text-base font-bold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:opacity-60"
        >
          {exporting ? "인쇄 파일 만드는 중…" : "🖨️ 인쇄용 파일 내려받기"}
        </button>
        <span className="text-sm text-ink-faint">고화질 5008×7063 · 300dpi</span>
      </div>

      {savedMsg && (
        <p className="rounded-md border-2 border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {savedMsg}
        </p>
      )}

      {anyOut && (
        <p role="alert" className="rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          빨간 테두리 글상자가 인쇄 안전여백을 벗어났어요. 안쪽으로 옮기지 않으면 인쇄 때 잘릴 수 있어요.
        </p>
      )}

      {model.crowded && !anyOut && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          메모가 공간에 빠듯해요. 긴 메모를 줄이거나 개수를 줄이면 더 깔끔해요.
        </p>
      )}

      <div className="w-full overflow-hidden rounded-md border border-line bg-surface">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
          width="100%"
          className="block h-auto w-full select-none"
          xmlns="http://www.w3.org/2000/svg"
          onPointerDown={editMode ? () => setSelected(null) : undefined}
        >
          <defs>
            <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="4" dy="6" stdDeviation="7" floodColor="rgb(70,55,35)" floodOpacity="0.216" />
            </filter>
            <filter id="bandBlur" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          <image href={bgSrc} x={0} y={0} width={POSTER_W} height={POSTER_H} preserveAspectRatio="xMidYMid slice" />

          <rect x={0} y={0} width={POSTER_W} height={170} fill="rgba(250,244,228,0.804)" filter="url(#bandBlur)" />
          <text x={POSTER_W / 2} y={70} textAnchor="middle" fontFamily={`"${FONT_SERIF}"`} fontWeight={700} fontSize={52} fill="#28221C">
            {ownerName ? `${ownerName} 님의 인생` : "나의 인생"}
          </text>
          <text x={POSTER_W / 2} y={120} textAnchor="middle" fontFamily={`"${FONT_SERIF}"`} fontWeight={400} fontSize={26} fill="#6A644C">
            강물처럼 흘러온 한 생애
          </text>

          {/* 안전여백 가이드(편집 모드만) */}
          {editMode && (
            <rect
              x={NODE_SAFE_MARGIN} y={NODE_SAFE_MARGIN}
              width={POSTER_W - NODE_SAFE_MARGIN * 2}
              height={POSTER_H - NODE_SAFE_MARGIN * 2}
              fill="none" stroke="rgba(120,92,52,0.35)" strokeWidth={1.5} strokeDasharray="10 8"
            />
          )}

          {/* 2) 메모 */}
          {model.memos.map((m) => {
            const o = overrides[m.key];
            return (
              <g
                key={m.key}
                transform={itemTransform(m.x, m.y, o)}
                onPointerDown={editMode ? (e) => startDrag(e, m.key, m.x, m.y) : undefined}
                style={editMode ? { cursor: "move", touchAction: "none" } : undefined}
              >
                {editMode && (
                  <rect
                    x={m.anchor === "start" ? m.x - 4 : m.x - m.maxW - 4}
                    y={m.y - m.lineHeight}
                    width={m.maxW + 8}
                    height={m.lines.length * m.lineHeight + m.lineHeight * 0.6}
                    fill="transparent"
                  />
                )}
                <text
                  x={m.x} y={m.y} textAnchor={m.anchor}
                  transform={`rotate(${m.rotation} ${m.x} ${m.y})`}
                  fontFamily={`"${FONT_SERIF}"`} fontWeight={500} fontSize={16}
                  fill={m.color} stroke={m.halo} strokeWidth={1}
                  style={{ paintOrder: "stroke" }} strokeLinejoin="round"
                >
                  {m.lines.map((ln, k) => (
                    <tspan key={k} x={m.x} dy={k === 0 ? 0 : m.lineHeight}>{ln}</tspan>
                  ))}
                </text>
              </g>
            );
          })}

          {/* 3) 노드 */}
          {model.nodes.map((n) => {
            const o = overrides[n.key];
            return (
              <g
                key={n.key}
                transform={itemTransform(n.cx, n.cy, o)}
                filter="url(#nodeShadow)"
                onPointerDown={editMode ? (e) => startDrag(e, n.key, n.cx, n.cy) : undefined}
                style={editMode ? { cursor: "move", touchAction: "none" } : undefined}
              >
                <rect
                  x={n.cx - n.boxW / 2} y={n.topY} width={n.boxW} height={n.boxH}
                  rx={n.radius} ry={n.radius}
                  fill="rgba(252,247,235,0.91)" stroke="rgba(160,130,90,0.784)" strokeWidth={2}
                />
                {n.year && (
                  <text x={n.cx} y={n.cy - 8} textAnchor="middle" dominantBaseline="central" fontFamily={`"${FONT_SANS}"`} fontWeight={400} fontSize={18} fill="#785C34">
                    {n.year}
                  </text>
                )}
                <text x={n.cx} y={n.cy + 11} textAnchor="middle" dominantBaseline="central" fontFamily={`"${FONT_SERIF}"`} fontWeight={700} fontSize={21} fill="#28221C">
                  {n.title}
                </text>
              </g>
            );
          })}

          {/* 선택 외곽선(편집 모드, 항목 위) */}
          {editMode && selected && geom.get(selected) && (() => {
            const g = geom.get(selected)!;
            const stroke = g.out ? "#DC2626" : "#2563EB";
            return (
              <rect
                x={g.left - 6} y={g.top - 6}
                width={g.right - g.left + 12} height={g.bottom - g.top + 12}
                fill="none" stroke={stroke} strokeWidth={2.5} strokeDasharray="8 5"
                pointerEvents="none"
              />
            );
          })()}

          <text x={POSTER_W / 2} y={1448} textAnchor="middle" fontFamily={`"${FONT_SANS}"`} fontWeight={400} fontSize={22} fill="#6A644C" letterSpacing={6}>
            L I F E B O O K
          </text>
        </svg>
      </div>

      {/* 선택 항목 편집 패널 */}
      {editMode && selectedItem && (
        <div className="flex flex-col gap-3 rounded-md border-2 border-action bg-banner px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-ink">
              {selectedItem.type === "node" ? "큰 사건(노드)" : "작은 이야기(메모)"} 고치기
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm font-semibold text-ink-soft hover:text-ink"
            >
              닫기
            </button>
          </div>

          {selectedItem.type === "node" && (
            <label className="flex flex-col gap-1 text-sm font-semibold text-ink-soft">
              연도
              <input
                type="text" value={panelYear} maxLength={12}
                onChange={(e) => setPanelYear(e.target.value)}
                className="rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink-soft">
            {selectedItem.type === "node" ? "제목" : "문장"}
            {selectedItem.type === "node" ? (
              <input
                type="text" value={panelText} maxLength={NODE_TITLE_MAX}
                onChange={(e) => setPanelText(e.target.value)}
                className="rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              />
            ) : (
              <textarea
                value={panelText} rows={3} maxLength={MEMO_TEXT_MAX}
                onChange={(e) => setPanelText(e.target.value)}
                className="rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              />
            )}
          </label>
          <button
            type="button"
            onClick={applyPanelText}
            className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-action px-4 py-2 text-sm font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            내용 적용
          </button>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="text-sm font-semibold text-ink-soft">글자 크기</span>
            <button
              type="button" onClick={() => bumpFont(selectedItem.key, -1)}
              aria-label="글자 작게"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border-2 border-line bg-surface text-lg font-bold text-ink hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
            >
              A−
            </button>
            <span className="min-w-[3.5rem] text-center text-sm text-ink-soft">
              {Math.round(selectedItem.scale * 100)}%
            </span>
            <button
              type="button" onClick={() => bumpFont(selectedItem.key, 1)}
              aria-label="글자 크게"
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border-2 border-line bg-surface text-xl font-bold text-ink hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
            >
              A＋
            </button>

            <button
              type="button"
              onClick={() => removeItem(selectedItem.key)}
              className="ml-auto inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-danger bg-surface px-4 py-2 text-sm font-bold text-danger hover:bg-danger hover:text-white focus:outline-none focus-visible:ring-4 focus-visible:ring-danger"
            >
              포스터에서 빼기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
