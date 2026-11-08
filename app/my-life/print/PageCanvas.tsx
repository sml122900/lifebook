"use client";

// 인쇄본 한 쪽 그림(미리보기·관리자 발주 화면 공용) — lib/print-render 로 Canvas 에 그림. 글꼴을 받은 뒤(fonts)에만 그린다.

import { useEffect, useRef } from "react";

import type { PrintPage } from "@/lib/print-layout";
import { drawPrintPage, pageSize, type PrintFonts } from "@/lib/print-render";

export function PageCanvas({ page, no, total, width, fonts }: { page: PrintPage; no: number; total: number; width: number; fonts: PrintFonts | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { w, h } = pageSize(page, false);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !fonts) return;
    const scale = (width * (window.devicePixelRatio || 1)) / w;
    c.width = Math.round(w * scale);
    c.height = Math.round(h * scale);
    drawPrintPage(ctx, page, no, total, { scale, withBleed: false, fonts });
  }, [page, no, total, width, fonts, w, h]);
  return <canvas ref={ref} style={{ width, height: (width * h) / w }} className="block rounded-sm border border-line bg-paper" aria-hidden />;
}
