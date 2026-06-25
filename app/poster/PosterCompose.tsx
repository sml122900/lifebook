"use client";

// P4 — SVG 포스터 합성 엔진 (클라이언트).
//
// 빈 배경 PNG 위에 노드(둥근사각)·메모(멀티라인 text)를 SVG 레이어로 합성.
// getBBox/getComputedTextLength 실측 + offscreen canvas luminance 는 브라우저
// 전용이라 여기서 수행한다. 배치 계산은 lib/poster/compose-layout(순수).
//
// 폰트(Noto Sans/Serif KR)가 로드된 *뒤에* 실측해야 폭이 맞는다.
// 정적 렌더(미리보기). 드래그·크기 편집은 P6, 인쇄 export 는 P7.

import { useEffect, useRef, useState } from "react";

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

export const POSTER_BG_SRC = "/poster/river-bg.png";

const FONT_SANS = "Noto Sans KR";
const FONT_SERIF = "Noto Serif KR";

// 노드 둥근사각 패딩(글자 기준). 시제품처럼 글자에 딱 붙게 — 배경 덜 가림.
// ★ 텍스트는 cy∓ 고정 오프셋(연도 cy-8·제목 cy+11)이라 박스가 cy 중심 대칭이면
//   위쪽 여백이 아래보다 크다. NODE_TOP_TRIM 으로 위 모서리만 깎아 비대칭으로.
const NODE_PAD_X = 7; // 좌우 여백(15→10→7)
const NODE_PAD_Y = 3; // 상하 기본 여백(11→7→3, 과감히)
const NODE_LINE_GAP = 2; // 연도-제목 두 줄 간격(5→4→2)
// 위 모서리만 추가로 깎기(아래·텍스트 무변). 연도 글자 닿는 한계 ~10 부근,
// 여유 두고 8. 더 줄이려면 키우되 연도 위 테두리 닿으면 1씩 내려 미세조정.
const NODE_TOP_TRIM = 8;

const GFONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400&family=Noto+Serif+KR:wght@400;500;700&display=swap";

export type PosterNode = { year: number | null; label: string };

type RenderNode = {
  cx: number; cy: number; boxW: number; boxH: number; radius: number;
  topY: number; // 박스 위 모서리(비대칭 trim 반영). cy 중심 아님.
  year: string; title: string;
};
type RenderMemo = {
  x: number; y: number; anchor: "start" | "end"; rotation: number;
  color: string; halo: string; lines: string[]; lineHeight: number;
};
type RenderModel = {
  nodes: RenderNode[];
  memos: RenderMemo[];
  crowded: boolean;
};

// ── 측정 도구(off-DOM SVG) ───────────────────────────────────────────
function makeMeasurer(): { svg: SVGSVGElement; cleanup: () => void } {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("style", "position:absolute;left:-9999px;top:-9999px;visibility:hidden;");
  document.body.appendChild(svg);
  return { svg, cleanup: () => svg.remove() };
}

function measure(
  svg: SVGSVGElement,
  text: string,
  family: string,
  size: number,
  weight: number,
): { w: number; h: number } {
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

function lineLength(
  svg: SVGSVGElement,
  text: string,
  family: string,
  size: number,
  weight: number,
): number {
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

// 어절 단위 워드랩 — getComputedTextLength 로 maxW 체크.
function wrapText(
  svg: SVGSVGElement,
  text: string,
  maxW: number,
  family: string,
  size: number,
  weight: number,
): string[] {
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

// 배경에서 메모 영역 평균 luminance 측정.
function sampleLuminance(
  ctx: CanvasRenderingContext2D | null,
  x: number,
  y: number,
  w: number,
  h: number,
): number {
  if (!ctx) return 255; // 측정 불가 시 밝다고 가정(톤색 사용)
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(POSTER_W - sx, Math.ceil(w)));
  const sh = Math.max(1, Math.min(POSTER_H - sy, Math.ceil(h)));
  try {
    const data = ctx.getImageData(sx, sy, sw, sh).data;
    let sum = 0;
    let n = 0;
    // 4픽셀 간격 샘플(성능).
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
}: {
  ownerName: string;
  nodes: PosterNode[];
  memos: string[];
}) {
  const [model, setModel] = useState<RenderModel | null>(null);
  const [failed, setFailed] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    // 폰트 링크 1회 주입.
    if (!document.querySelector(`link[href="${GFONTS_HREF}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = GFONTS_HREF;
      document.head.appendChild(link);
    }

    async function build() {
      try {
        // 1) 폰트 로드 대기(실측 정확도).
        await Promise.all([
          document.fonts.load(`400 18px "${FONT_SANS}"`),
          document.fonts.load(`700 21px "${FONT_SERIF}"`),
          document.fonts.load(`500 16px "${FONT_SERIF}"`),
        ]);
        await document.fonts.ready;
        if (cancelled) return;

        const { svg, cleanup } = makeMeasurer();

        // 2) 노드 박스 실측 → 배치.
        const boxes = nodes.map((n) => {
          const yearStr = n.year != null ? String(n.year) : "";
          const ym = measure(svg, yearStr || " ", FONT_SANS, 18, 400);
          const tm = measure(svg, n.label || " ", FONT_SERIF, 21, 700);
          const boxW = Math.max(ym.w, tm.w) + NODE_PAD_X * 2;
          const boxH = ym.h + tm.h + NODE_LINE_GAP + NODE_PAD_Y * 2;
          return { boxW, boxH };
        });
        const positions: NodePos[] = placeNodes(boxes);
        const renderNodes: RenderNode[] = positions.map((p, i) => {
          // 위 모서리만 NODE_TOP_TRIM 만큼 내려 비대칭. 아래 모서리(cy+boxH/2)·
          // 텍스트(cy∓)는 그대로 → 위쪽 여백만 줄어듦.
          const h = p.boxH - NODE_TOP_TRIM;
          return {
            cx: p.cx, cy: p.cy, boxW: p.boxW, boxH: h, radius: h * 0.46,
            topY: p.cy - p.boxH / 2 + NODE_TOP_TRIM,
            year: nodes[i].year != null ? String(nodes[i].year) : "",
            title: nodes[i].label,
          };
        });

        // 3) 메모 배치 + 워드랩 + 라인높이.
        const slots: MemoSlot[] = distributeMemos(Math.min(memos.length, MEMO_MAX));
        const sampleH = measure(svg, "한글Ay", FONT_SERIF, 16, 500).h;
        const lineHeight = sampleH - 3; // (asc+desc)-3 근사
        const wrapped = slots.map((s) =>
          wrapText(svg, memos[s.memoIndex] ?? "", s.maxW, FONT_SERIF, 16, 500),
        );
        const heights = wrapped.map((lines) => lines.length * lineHeight);
        const crowded = detectMemoCrowding(slots, heights, lineHeight);
        cleanup();

        // 4) 배경 luminance 측정용 canvas.
        let ctx: CanvasRenderingContext2D | null = null;
        try {
          const img = await loadImage(POSTER_BG_SRC);
          const canvas = document.createElement("canvas");
          canvas.width = POSTER_W;
          canvas.height = POSTER_H;
          const c = canvas.getContext("2d", { willReadFrequently: true });
          if (c) {
            c.drawImage(img, 0, 0, POSTER_W, POSTER_H);
            ctx = c;
          }
        } catch {
          ctx = null; // 배경 없으면 밝다고 가정.
        }
        if (cancelled) return;

        const renderMemos: RenderMemo[] = slots.map((s, i) => {
          const lines = wrapped[i];
          const h = heights[i];
          const regionX = s.anchor === "start" ? s.x : s.x - s.maxW;
          const lum = sampleLuminance(ctx, regionX, s.y, s.maxW, h);
          const light = lum < LUM_THRESHOLD;
          return {
            x: s.x,
            y: s.y,
            anchor: s.anchor,
            rotation: seededRotation(s.memoIndex),
            color: light ? LIGHT_TEXT : memoTone(s.memoIndex),
            halo: light ? "rgba(35,28,20,0.82)" : "rgba(250,245,230,0.80)",
            lines,
            lineHeight,
          };
        });

        if (!cancelled) setModel({ nodes: renderNodes, memos: renderMemos, crowded });
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    build();
    return () => { cancelled = true; };
  }, [ownerName, nodes, memos]);

  if (failed) {
    return <p className="text-sm text-danger">포스터를 그리지 못했어요.</p>;
  }
  if (!model) {
    return <p className="text-base text-ink-soft">포스터를 그리는 중이에요…</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {model.crowded && (
        <p className="rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          메모가 공간에 빠듯해요. 긴 메모를 줄이거나 개수를 줄이면 더 깔끔해요.
        </p>
      )}
      <div ref={boxRef} className="w-full overflow-hidden rounded-md border border-line bg-surface">
        <svg
          viewBox={`0 0 ${POSTER_W} ${POSTER_H}`}
          width="100%"
          className="block h-auto w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="4" dy="6" stdDeviation="7" floodColor="rgb(70,55,35)" floodOpacity="0.216" />
            </filter>
            <filter id="bandBlur" x="-10%" y="-50%" width="120%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>

          {/* 1) 배경 */}
          <image href={POSTER_BG_SRC} x={0} y={0} width={POSTER_W} height={POSTER_H} preserveAspectRatio="xMidYMid slice" />

          {/* 상단 크림 밴드 */}
          <rect x={0} y={0} width={POSTER_W} height={170} fill="rgba(250,244,228,0.804)" filter="url(#bandBlur)" />

          {/* 타이틀/부제 */}
          <text x={POSTER_W / 2} y={70} textAnchor="middle" fontFamily={`"${FONT_SERIF}"`} fontWeight={700} fontSize={52} fill="#28221C">
            {ownerName ? `${ownerName} 님의 인생` : "나의 인생"}
          </text>
          <text x={POSTER_W / 2} y={120} textAnchor="middle" fontFamily={`"${FONT_SERIF}"`} fontWeight={400} fontSize={26} fill="#6A644C">
            강물처럼 흘러온 한 생애
          </text>

          {/* 2) 메모 (배경 위, 노드 아래) */}
          {model.memos.map((m, i) => (
            <text
              key={`memo-${i}`}
              x={m.x}
              y={m.y}
              textAnchor={m.anchor}
              transform={`rotate(${m.rotation} ${m.x} ${m.y})`}
              fontFamily={`"${FONT_SERIF}"`}
              fontWeight={500}
              fontSize={16}
              fill={m.color}
              stroke={m.halo}
              strokeWidth={1}
              style={{ paintOrder: "stroke" }}
              strokeLinejoin="round"
            >
              {m.lines.map((ln, k) => (
                <tspan key={k} x={m.x} dy={k === 0 ? 0 : m.lineHeight}>{ln}</tspan>
              ))}
            </text>
          ))}

          {/* 3) 노드 */}
          {model.nodes.map((n, i) => (
            <g key={`node-${i}`} filter="url(#nodeShadow)">
              <rect
                x={n.cx - n.boxW / 2}
                y={n.topY}
                width={n.boxW}
                height={n.boxH}
                rx={n.radius}
                ry={n.radius}
                fill="rgba(252,247,235,0.91)"
                stroke="rgba(160,130,90,0.784)"
                strokeWidth={2}
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
          ))}

          {/* 푸터 */}
          <text x={POSTER_W / 2} y={1448} textAnchor="middle" fontFamily={`"${FONT_SANS}"`} fontWeight={400} fontSize={22} fill="#6A644C" letterSpacing={6}>
            L I F E B O O K
          </text>
        </svg>
      </div>
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
