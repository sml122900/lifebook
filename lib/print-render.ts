// My Life 인쇄본 그리기(2026-11-08 — print-mylife.md §2.4·§3.3·§4). Canvas 2D 하나로 미리보기(작게)와 발주 PDF(300dpi)를 같이 그린다.
// 브라우저 전용(document·Canvas) — 서버 import 금지. 배치는 lib/print-layout(순수)이 정하고 여기서는 그리기만.
// 속지 = 종이용 밝은 판(편지지 카드 색 — app/globals.css .paper), 표지 = 밤 판(Q3). 공전·빛남·버튼은 안 그림, 꾸미기는 정지 그림.

import { PRINT_COPY as T } from "./print-copy";
import { PRINT, type PrintPage, type PrintSystem, type SatKind } from "./print-layout";

// 종이 판(밝은 바탕 #fbf6ea 위 대비 — 글자 ink 14.07 · soft 6.98 · 선 3.73, 위성 테두리 3:1 이상)
const PAPER = {
  bg: "#fbf6ea",
  ink: "#2a2520",
  soft: "#5c534a",
  line: "#8c7d60",
  accent: "#8a5f1a",
  periodFill: "#f3e8cf",
  storyFill: "#fffdf8",
  self: "#4f7a3f",
  dark: "#1b1530", // 블랙홀 면
  gold: "#b07d1e",
};
const SAT_COLOR: Record<SatKind, string> = { person: "#2e7350", group: "#6b4f8a", place: "#2c5d8c" };
// 밤 판(표지) — 앱 밤 토큰 값
const NIGHT = { bg: "#221d52", ink: "#f1eeff", soft: "#d3ccf5", accent: "#ffb884", star: "#ffd27a" };
// 연대 색 세로 줄(앱 --color-decade-strip-*)
const DECADE: Record<number, string> = {
  1940: "#b5a380", 1950: "#b8a989", 1960: "#86a7a4", 1970: "#aa9b5f", 1980: "#aa8880",
  1990: "#9b8998", 2000: "#8995b8", 2010: "#839a7d", 2020: "#8f88a0",
};

export type PrintFonts = { sans: string; serif: string };

// 쪽 크기(인쇄 px) — 표지만 도련 포함(발주 PDF). 미리보기는 도련 없이.
export function pageSize(page: PrintPage, withBleed: boolean): { w: number; h: number; bleed: number } {
  const bleed = withBleed && page.kind === "cover" ? PRINT.BLEED : 0;
  return { w: PRINT.PAGE_W + 2 * bleed, h: PRINT.PAGE_H + 2 * bleed, bleed };
}

export function pageLabel(page: PrintPage): string {
  if (page.kind === "cover") return T.coverTitle;
  if (page.kind === "period") return page.periods.map((p) => p.label).join(" · ");
  if (page.kind === "people") return page.title ?? T.peopleTitle;
  if (page.kind === "places") return page.title ?? T.placesTitle;
  return T.customTitle;
}

// 글자를 maxW 안에서 줄바꿈(띄어쓰기 우선, 긴 낱말은 글자 단위). maxLines 넘으면 마지막 줄 "…".
function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  const pushChar = (ch: string) => {
    if (ctx.measureText(line + ch).width > maxW && line) {
      lines.push(line);
      line = ch.trimStart();
    } else line += ch;
  };
  for (const word of text.split(/(\s+)/)) {
    if (!word) continue;
    if (ctx.measureText(line + word).width <= maxW) line += word;
    else if (ctx.measureText(word.trim()).width <= maxW) {
      if (line.trim()) lines.push(line.trimEnd());
      line = word.trimStart();
    } else for (const ch of word) pushChar(ch);
  }
  if (line.trim()) lines.push(line.trimEnd());
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = out[maxLines - 1];
  while (last && ctx.measureText(`${last}…`).width > maxW) last = last.slice(0, -1);
  out[maxLines - 1] = `${last}…`;
  return out;
}

function lines(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, lh: number) {
  rows.forEach((r, i) => ctx.fillText(r, x, y + i * lh));
}

function circle(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
}

// 꾸미기 8종 정지 그림(§2.4 — 멈춘 틀만, 빛은 밝은 판 대비 3:1 이상 색).
function drawDecor(ctx: CanvasRenderingContext2D, key: string, cx: number, cy: number, r: number, phase: "back" | "front") {
  ctx.save();
  ctx.strokeStyle = PAPER.accent;
  ctx.fillStyle = PAPER.accent;
  ctx.lineWidth = 3;
  if (key === "ring") {
    ctx.beginPath();
    if (phase === "back") ctx.ellipse(cx, cy, r * 1.45, r * 0.38, -0.25, Math.PI, Math.PI * 2);
    else ctx.ellipse(cx, cy, r * 1.45, r * 0.38, -0.25, 0, Math.PI);
    ctx.stroke();
  } else if (phase === "back" && key === "comet") {
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.9 - k * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.7, cy - r * 0.7 + k * 10);
      ctx.lineTo(cx - r * 1.6, cy - r * 1.25 + k * 14);
      ctx.stroke();
    }
  } else if (phase === "back" && key === "aurora") {
    ctx.strokeStyle = "#2f7d6b";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.22, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.strokeStyle = "#5a5aa6";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.36, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else if (phase === "front" && key === "stardust") {
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + 0.3;
      circle(ctx, cx + Math.cos(a) * r * 1.2, cy + Math.sin(a) * r * 1.2, k % 2 ? 2.5 : 4);
      ctx.fill();
    }
  } else if (phase === "back" && key === "flare") {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * 1.08);
      ctx.lineTo(cx + Math.cos(a) * r * (k % 2 ? 1.25 : 1.38), cy + Math.sin(a) * r * (k % 2 ? 1.25 : 1.38));
      ctx.stroke();
    }
  } else if (phase === "back" && key === "vortex") {
    ctx.beginPath();
    for (let t = 0; t <= 1; t += 0.02) {
      const a = t * Math.PI * 3;
      const rr = r * (1.05 + t * 0.4);
      const px = cx + Math.cos(a) * rr;
      const py = cy + Math.sin(a) * rr * 0.8;
      if (t === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  } else if (phase === "back" && key === "binary") {
    ctx.fillStyle = PAPER.periodFill;
    circle(ctx, cx + r * 1.05, cy - r * 0.85, r * 0.3);
    ctx.fill();
    ctx.stroke();
  } else if (phase === "front" && key === "blackhole") {
    ctx.strokeStyle = PAPER.gold;
    ctx.lineWidth = 5;
    circle(ctx, cx, cy, r + 4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSystem(ctx: CanvasRenderingContext2D, s: PrintSystem, f: PrintFonts) {
  const r = s.d / 2;
  const cx = s.x;
  const cy = s.y + r;
  const hole = s.decor === "blackhole";
  if (s.decor) drawDecor(ctx, s.decor, cx, cy, r, "back");
  // 행성 — 시기 = 채운 원, 이야기 = 테두리 원, 그때의 나 = 초록 테두리(지도와 같은 구분)
  ctx.fillStyle = hole ? PAPER.dark : s.kind === "period" ? PAPER.periodFill : PAPER.storyFill;
  circle(ctx, cx, cy, r);
  ctx.fill();
  ctx.lineWidth = s.self ? 4 : 3;
  ctx.strokeStyle = s.self ? PAPER.self : s.kind === "period" ? PAPER.line : PAPER.accent;
  ctx.stroke();
  if (s.decor) drawDecor(ctx, s.decor, cx, cy, r, "front");
  // 이름(행성 안 — 시기 20 굵게 + 연도, 이야기 18)
  ctx.fillStyle = hole ? "#f1eeff" : PAPER.ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = s.kind === "period" ? 20 : 18;
  ctx.font = `${s.kind === "period" ? 700 : 600} ${size}px ${f.sans}`;
  const rows = wrap(ctx, s.label, s.d * 0.78, s.kind === "period" ? 2 : 3);
  const lh = size + 4;
  const block = rows.length * lh + (s.year ? lh : 0);
  lines(ctx, rows, cx, cy - block / 2 + lh / 2, lh);
  if (s.year) {
    ctx.font = `500 16px ${f.sans}`;
    ctx.fillStyle = hole ? "#d3ccf5" : PAPER.soft;
    ctx.fillText(s.year, cx, cy - block / 2 + lh / 2 + rows.length * lh);
  }
  // 위성(정지 자리 — 행성 아래 3칸 줄) + 이름표 2줄
  for (const sat of s.sats) {
    ctx.fillStyle = PAPER.storyFill;
    circle(ctx, sat.x, sat.y, PRINT.SAT_D / 2);
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = SAT_COLOR[sat.kind];
    if (sat.kind === "group") ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = SAT_COLOR[sat.kind];
    circle(ctx, sat.x, sat.y, 8);
    ctx.fill();
    ctx.fillStyle = PAPER.ink;
    ctx.font = `500 18px ${f.sans}`;
    ctx.textBaseline = "top";
    lines(ctx, wrap(ctx, sat.name, PRINT.SAT_CELL_W - 4, 2), sat.x, sat.y + PRINT.SAT_D / 2 + 4, 22);
    ctx.textBaseline = "middle";
  }
}

function drawCover(ctx: CanvasRenderingContext2D, page: Extract<PrintPage, { kind: "cover" }>, bleed: number, f: PrintFonts) {
  ctx.fillStyle = NIGHT.bg;
  ctx.fillRect(-bleed, -bleed, PRINT.PAGE_W + 2 * bleed, PRINT.PAGE_H + 2 * bleed);
  // 별(고정 무늬 — 주문마다 같은 그림). 흩뿌림 = 정해진 의사 난수, 제목·차례 자리는 비움.
  ctx.fillStyle = NIGHT.star;
  const rand = (n: number) => {
    const v = Math.sin(n * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  const tocBottom = 568 + Math.min(page.toc.length, 24) * 30;
  for (let k = 0; k < 90; k++) {
    const x = rand(k + 1) * PRINT.PAGE_W;
    const y = rand(k + 101) * PRINT.PAGE_H;
    if ((y > 220 && y < 410) || (y > 480 && y < tocBottom && x > 100 && x < PRINT.PAGE_W - 100)) continue;
    circle(ctx, x, y, k % 6 === 0 ? 2.5 : 1.3);
    ctx.fill();
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = NIGHT.accent;
  ctx.font = `700 64px ${f.serif}`;
  ctx.fillText(T.coverTitle, PRINT.PAGE_W / 2, 300);
  if (page.owner) {
    ctx.fillStyle = NIGHT.ink;
    ctx.font = `700 44px ${f.serif}`;
    ctx.fillText(T.coverOwner(page.owner), PRINT.PAGE_W / 2, 380);
  }
  // 차례 — 시기 이름 · 장 번호
  ctx.textAlign = "left";
  ctx.fillStyle = NIGHT.soft;
  ctx.font = `700 26px ${f.sans}`;
  ctx.fillText(T.tocTitle, 120, 520);
  ctx.font = `500 20px ${f.sans}`;
  const max = Math.min(page.toc.length, 24);
  for (let i = 0; i < max; i++) {
    const t = page.toc[i];
    const y = 568 + i * 30;
    ctx.fillStyle = NIGHT.ink;
    ctx.textAlign = "left";
    ctx.fillText(wrap(ctx, t.label, 520, 1)[0] ?? "", 120, y);
    ctx.textAlign = "right";
    ctx.fillText(String(t.page), PRINT.PAGE_W - 120, y);
  }
}

function drawPeriod(ctx: CanvasRenderingContext2D, page: Extract<PrintPage, { kind: "period" }>, f: PrintFonts) {
  const bx = PRINT.BODY_X;
  const by = PRINT.BODY_Y;
  ctx.save();
  ctx.translate(bx, by);
  // 연대 색 세로 줄 — 계마다 그 시기 연대 색, 장 아래 끝까지(다음 장으로 이어지면)
  const lineX = 6;
  page.systems.forEach((s, i) => {
    const next = page.systems[i + 1];
    const top = i === 0 && page.continued ? 0 : s.y;
    const bottom = next ? next.y : page.continues ? PRINT.BODY_H : s.y + s.h;
    const dec = s.startYear == null ? null : Math.floor(s.startYear / 10) * 10;
    ctx.fillStyle = (dec != null && DECADE[dec]) || PAPER.line;
    ctx.fillRect(lineX, top, 8, bottom - top);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  if (page.continued) {
    ctx.fillStyle = PAPER.soft;
    ctx.font = `500 16px ${f.sans}`;
    ctx.fillText(T.contTop, 24, 12);
    ctx.fillStyle = PAPER.ink;
    ctx.font = `700 22px ${f.sans}`;
    ctx.fillText(T.continuedLabel(page.periods[0]?.label ?? ""), 24, 36);
  }
  // 점선(위성 → 오른쪽 목록 점) — 행성·위성보다 먼저
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 5]);
  for (const e of page.edges) {
    ctx.strokeStyle = SAT_COLOR[e.kind];
    ctx.beginPath();
    ctx.moveTo(e.from.x, e.from.y);
    ctx.bezierCurveTo((e.from.x + e.to.x) / 2, e.from.y, (e.from.x + e.to.x) / 2, e.to.y, e.to.x, e.to.y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const s of page.systems) drawSystem(ctx, s, f);
  if (page.continues && page.nextLabel) {
    ctx.textAlign = "left";
    ctx.fillStyle = PAPER.soft;
    ctx.font = `500 16px ${f.sans}`;
    ctx.fillText(T.contBottom(page.nextLabel), 24, PRINT.BODY_H - 10);
  }
  // 오른쪽 목록
  const lx = PRINT.LIST_X;
  ctx.fillStyle = PAPER.ink;
  ctx.font = `700 20px ${f.sans}`;
  ctx.textAlign = "left";
  ctx.fillText(T.listTitle, lx, PRINT.LIST_ROW / 2);
  ctx.strokeStyle = PAPER.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(lx, PRINT.LIST_ROW - 4);
  ctx.lineTo(lx + PRINT.LIST_W, PRINT.LIST_ROW - 4);
  ctx.stroke();
  for (const l of page.list) {
    ctx.fillStyle = SAT_COLOR[l.kind];
    circle(ctx, lx, l.y, 7);
    ctx.fill();
    ctx.fillStyle = PAPER.ink;
    ctx.font = `500 18px ${f.sans}`;
    ctx.fillText(wrap(ctx, l.name, PRINT.LIST_W - 20, 1)[0] ?? "", lx + 16, l.y);
  }
  if (page.listMore > 0) {
    ctx.fillStyle = PAPER.soft;
    ctx.font = `500 16px ${f.sans}`;
    ctx.fillText(T.listMore(page.listMore), lx + 16, (page.list.length + 1) * PRINT.LIST_ROW + PRINT.LIST_ROW / 2);
  }
  ctx.restore();
}

function drawList(ctx: CanvasRenderingContext2D, page: Extract<PrintPage, { kind: "people" | "places" | "custom" }>, f: PrintFonts) {
  ctx.save();
  ctx.translate(PRINT.BODY_X, PRINT.BODY_Y);
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillStyle = PAPER.ink;
  ctx.font = `700 28px ${f.serif}`;
  ctx.fillText(pageLabel(page), 0, 28);
  page.rows.forEach((row, i) => {
    const y = 64 + i * 48 + 24;
    const x = row.indent ? 32 : 0;
    ctx.fillStyle = PAPER.ink;
    ctx.font = `${row.indent ? 500 : 700} 20px ${f.sans}`;
    const name = wrap(ctx, row.name + (row.sub ? ` · ${row.sub}` : ""), 440 - x, 1)[0] ?? "";
    ctx.fillText(name, x, y);
    if (row.pages.length) {
      ctx.fillStyle = PAPER.soft;
      ctx.font = `500 18px ${f.sans}`;
      ctx.textAlign = "right";
      ctx.fillText(wrap(ctx, T.appearsOn(row.pages), 300, 1)[0] ?? "", PRINT.BODY_W, y);
      ctx.textAlign = "left";
    }
    ctx.strokeStyle = "#e4dac3";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 24);
    ctx.lineTo(PRINT.BODY_W, y + 24);
    ctx.stroke();
  });
  ctx.restore();
}

// 한 쪽 그리기 — ctx 는 비어 있는 캔버스. scale = 화면 px / 인쇄 px. 머리말·꼬리말 = 속지만.
export function drawPrintPage(
  ctx: CanvasRenderingContext2D,
  page: PrintPage,
  no: number,
  total: number,
  opts: { scale: number; withBleed: boolean; fonts: PrintFonts },
) {
  const { bleed } = pageSize(page, opts.withBleed);
  ctx.save();
  ctx.setTransform(opts.scale, 0, 0, opts.scale, 0, 0);
  ctx.translate(bleed, bleed);
  if (page.kind === "cover") {
    drawCover(ctx, page, bleed, opts.fonts);
    ctx.restore();
    return;
  }
  ctx.fillStyle = PAPER.bg;
  ctx.fillRect(0, 0, PRINT.PAGE_W, PRINT.PAGE_H);
  // 머리말: "N / 전체 · 시기 이름 · 연도"
  const f = opts.fonts;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillStyle = PAPER.soft;
  ctx.font = `500 15px ${f.sans}`;
  const years = page.kind === "period" ? page.periods.map((p) => p.years).filter(Boolean) : [];
  const yearSpan = years.length ? (years.length === 1 ? years[0]! : `${years[0]!.split("~")[0]}~${years[years.length - 1]!.split("~").pop()}`) : null;
  ctx.fillText(wrap(ctx, T.headerLine(no, total, pageLabel(page), yearSpan), PRINT.BODY_W, 1)[0] ?? "", PRINT.BODY_X, 52);
  ctx.strokeStyle = PAPER.line;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PRINT.BODY_X, 68);
  ctx.lineTo(PRINT.BODY_X + PRINT.BODY_W, 68);
  ctx.stroke();
  if (page.kind === "period") drawPeriod(ctx, page, f);
  else drawList(ctx, page, f);
  // 꼬리말: "← 앞 장 · 다음 장 →"
  const fy = PRINT.BODY_Y + PRINT.BODY_H + 24;
  ctx.fillStyle = PAPER.soft;
  ctx.font = `500 15px ${f.sans}`;
  if (page.kind === "period") {
    if (page.prevLabel) {
      ctx.textAlign = "left";
      ctx.fillText(wrap(ctx, T.footPrev(page.prevLabel), 360, 1)[0] ?? "", PRINT.BODY_X, fy);
    }
    if (page.nextLabel) {
      ctx.textAlign = "right";
      ctx.fillText(wrap(ctx, T.footNext(page.nextLabel), 360, 1)[0] ?? "", PRINT.BODY_X + PRINT.BODY_W, fy);
    }
  }
  ctx.textAlign = "center";
  ctx.fillText(String(no), PRINT.PAGE_W / 2, fy);
  ctx.restore();
}

// 화면 글꼴(본문 sans · 제목 serif)을 읽고 다 받을 때까지 기다림 — Canvas 는 아직 안 받은 글꼴을 대체 글꼴로 그린다.
export async function loadPrintFonts(): Promise<PrintFonts> {
  const probe = document.createElement("span");
  probe.className = "font-serif";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const fonts = { sans: getComputedStyle(document.body).fontFamily, serif: getComputedStyle(probe).fontFamily };
  probe.remove();
  try {
    await Promise.all([
      document.fonts.load(`700 20px ${fonts.sans}`, "가나다"),
      document.fonts.load(`500 18px ${fonts.sans}`, "가나다"),
      document.fonts.load(`700 44px ${fonts.serif}`, "가나다"),
    ]);
    await document.fonts.ready;
  } catch {
    // 글꼴을 못 받아도 대체 글꼴로 그림
  }
  return fonts;
}
