// P7-a — 포스터 인쇄용 고해상도 export (클라이언트, 브라우저 전용).
//
// PosterCompose 가 이미 계산한 model(위치·워드랩·색·override 반영 텍스트)을
// Canvas 2D 로 SCALE 4.8293 배 재렌더 → 5008×7063px(424×598mm @300dpi) PNG.
// SVG 직렬화·CJK 폰트 임베드 없이, 이미 로드된 Noto 폰트로 직접 fillText 해
// 선명도 확보. 마지막에 pHYs 청크(300dpi)를 박아 인쇄소 72dpi 오인 방지.
//
// 배경은 cover-fit(폭 기준 업스케일 + 세로 잉여 crop, edge-stretch 금지).
// override(이동·크기) 는 SVG 와 동일한 transform 으로 적용.

import { POSTER_W, POSTER_H } from "@/lib/poster/compose-layout";
import type { ItemOverride } from "@/lib/poster/overrides";

export const PRINT_SCALE = 4.8293; // viewBox 1037 → 5008폭
export const PRINT_W = 5008;
export const PRINT_H = 7063;
const CROP_TOP = 131; // 세로 잉여 crop(상단131·하단132=263). 디자인방 명세.
const PRINT_DPI = 300;

const POSTER_BG_SRC = "/poster/river-bg.png";
const FONT_SANS = "Noto Sans KR";
const FONT_SERIF = "Noto Serif KR";

// PosterCompose 의 RenderNode/RenderMemo 와 구조 호환(필요 필드만).
export type ExportNode = {
  key: string;
  cx: number; cy: number; boxW: number; boxH: number; radius: number; topY: number;
  year: string; title: string;
};
export type ExportMemo = {
  key: string;
  x: number; y: number; anchor: "start" | "end"; rotation: number;
  color: string; halo: string; lines: string[]; lineHeight: number;
};
export type ExportModel = { nodes: ExportNode[]; memos: ExportMemo[] };

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// 둥근사각 경로 — roundRect 미지원(구형 Safari) 폴백.
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 항목 이동·크기 override 를 SVG itemTransform 과 동일하게 ctx 에 적용.
function applyItem(
  ctx: CanvasRenderingContext2D,
  baseX: number,
  baseY: number,
  o: ItemOverride | undefined,
  draw: () => void,
) {
  ctx.save();
  const dx = (o?.x ?? baseX) - baseX;
  const dy = (o?.y ?? baseY) - baseY;
  const s = o?.fontScale ?? 1;
  if (dx || dy) ctx.translate(dx, dy);
  if (s !== 1) {
    ctx.translate(baseX, baseY);
    ctx.scale(s, s);
    ctx.translate(-baseX, -baseY);
  }
  draw();
  ctx.restore();
}

export async function exportPosterPng(
  model: ExportModel,
  overrides: Record<string, ItemOverride>,
  ownerName: string,
): Promise<void> {
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = PRINT_W;
  canvas.height = PRINT_H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d 컨텍스트를 만들 수 없어요.");

  // 세로 잉여 crop = 위로 131px 밀고, 논리좌표 스케일.
  ctx.translate(0, -CROP_TOP);
  ctx.scale(PRINT_SCALE, PRINT_SCALE);

  // 1) 배경 cover-fit(논리 1037×1517 박스에 slice). edge-stretch 금지.
  try {
    const bg = await loadImage(POSTER_BG_SRC);
    const sw = bg.naturalWidth || POSTER_W;
    const sh = bg.naturalHeight || POSTER_H;
    const cover = Math.max(POSTER_W / sw, POSTER_H / sh);
    const dw = sw * cover;
    const dh = sh * cover;
    ctx.drawImage(bg, (POSTER_W - dw) / 2, (POSTER_H - dh) / 2, dw, dh);
  } catch {
    // 배경 없으면 크림 바탕.
    ctx.fillStyle = "#F7F2E6";
    ctx.fillRect(0, 0, POSTER_W, POSTER_H);
  }

  // 상단 크림 밴드(블러는 생략, 인쇄 가독 우선).
  ctx.fillStyle = "rgba(250,244,228,0.804)";
  ctx.fillRect(0, 0, POSTER_W, 170);

  // 타이틀/부제.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#28221C";
  ctx.font = `700 52px "${FONT_SERIF}"`;
  ctx.fillText(ownerName ? `${ownerName} 님의 인생` : "나의 인생", POSTER_W / 2, 70);
  ctx.fillStyle = "#6A644C";
  ctx.font = `400 26px "${FONT_SERIF}"`;
  ctx.fillText("강물처럼 흘러온 한 생애", POSTER_W / 2, 120);

  // 2) 메모(배경 위, 노드 아래).
  for (const m of model.memos) {
    applyItem(ctx, m.x, m.y, overrides[m.key], () => {
      ctx.save();
      ctx.translate(m.x, m.y);
      ctx.rotate((m.rotation * Math.PI) / 180);
      ctx.translate(-m.x, -m.y);
      ctx.font = `500 16px "${FONT_SERIF}"`;
      ctx.textAlign = m.anchor === "start" ? "left" : "right";
      ctx.textBaseline = "alphabetic";
      ctx.lineJoin = "round";
      ctx.lineWidth = 1;
      m.lines.forEach((ln, k) => {
        const ly = m.y + k * m.lineHeight;
        // 후광(paint-order stroke) → 외곽선 먼저, 글자 나중.
        ctx.strokeStyle = m.halo;
        ctx.strokeText(ln, m.x, ly);
        ctx.fillStyle = m.color;
        ctx.fillText(ln, m.x, ly);
      });
      ctx.restore();
    });
  }

  // 3) 노드(둥근사각 + 그림자 + 연도/제목).
  for (const n of model.nodes) {
    applyItem(ctx, n.cx, n.cy, overrides[n.key], () => {
      ctx.save();
      // 그림자(feDropShadow dx4 dy6 stdDev7 → blur≈14).
      ctx.shadowColor = "rgba(70,55,35,0.216)";
      ctx.shadowOffsetX = 4;
      ctx.shadowOffsetY = 6;
      ctx.shadowBlur = 14;
      roundRectPath(ctx, n.cx - n.boxW / 2, n.topY, n.boxW, n.boxH, n.radius);
      ctx.fillStyle = "rgba(252,247,235,0.91)";
      ctx.fill();
      // 테두리는 그림자 끄고.
      ctx.shadowColor = "transparent";
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(160,130,90,0.784)";
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      if (n.year) {
        ctx.fillStyle = "#785C34";
        ctx.font = `400 18px "${FONT_SANS}"`;
        ctx.fillText(n.year, n.cx, n.cy - 8);
      }
      ctx.fillStyle = "#28221C";
      ctx.font = `700 21px "${FONT_SERIF}"`;
      ctx.fillText(n.title, n.cx, n.cy + 11);
      ctx.restore();
    });
  }

  // 푸터.
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#6A644C";
  ctx.font = `400 22px "${FONT_SANS}"`;
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = "6px";
  }
  ctx.fillText("L I F E B O O K", POSTER_W / 2, 1448);

  // PNG → 300dpi 메타 주입 → 다운로드.
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/png"),
  );
  if (!blob) throw new Error("이미지를 만들지 못했어요.");
  const withDpi = await injectPngDpi(blob, PRINT_DPI);
  downloadBlob(withDpi, `${ownerName || "나"}_인생_포스터_${PRINT_W}x${PRINT_H}_300dpi.png`);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── PNG pHYs(해상도) 청크 주입 — IHDR 뒤에 삽입. 300dpi=11811ppm. ──────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function injectPngDpi(blob: Blob, dpi: number): Promise<Blob> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  // PNG 시그니처(8) + IHDR(length4+type4+data13+crc4=25) → 33 바이트 뒤에 삽입.
  const IHDR_END = 8 + 25;
  if (buf.length < IHDR_END) return blob;

  const ppm = Math.round(dpi / 0.0254); // px per meter
  const data = new Uint8Array(9);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, ppm); // x
  dv.setUint32(4, ppm); // y
  data[8] = 1; // unit = meter

  const type = new Uint8Array([0x70, 0x48, 0x59, 0x73]); // "pHYs"
  const typeData = new Uint8Array(type.length + data.length);
  typeData.set(type, 0);
  typeData.set(data, type.length);
  const crc = crc32(typeData);

  const chunk = new Uint8Array(12 + data.length); // len4+type4+data9+crc4
  const cdv = new DataView(chunk.buffer);
  cdv.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  cdv.setUint32(8 + data.length, crc);

  const out = new Uint8Array(buf.length + chunk.length);
  out.set(buf.subarray(0, IHDR_END), 0);
  out.set(chunk, IHDR_END);
  out.set(buf.subarray(IHDR_END), IHDR_END + chunk.length);
  return new Blob([out], { type: "image/png" });
}
