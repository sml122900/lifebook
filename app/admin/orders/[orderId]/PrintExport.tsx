"use client";

// 관리자 발주 — My Life 인쇄본 PDF 받기(2026-11-08 — print-mylife.md §4.2·Q13). 주문 스냅샷(printSnapshot)의 배치를 그대로 그린다
// (주문 뒤 지도를 고쳐도 인쇄 내용 고정). 장마다 A4 300dpi(2480 × 3508) JPEG → PDF 한 쪽. 표지(밤 판)는 도련 3mm 포함 + 재단선(TrimBox).

import { useEffect, useState } from "react";

import { PageCanvas } from "@/app/my-life/print/PageCanvas";
import { Button } from "@/components/ui/Button";
import { PRINT_COPY as T } from "@/lib/print-copy";
import type { PrintLayout } from "@/lib/print-layout";
import { buildPdf, type PdfPage } from "@/lib/print-pdf";
import { drawPrintPage, loadPrintFonts, pageLabel, pageSize, type PrintFonts } from "@/lib/print-render";

const DPI_SCALE = 2480 / 840; // A4 폭 300dpi ÷ 인쇄 px
const MM_PER_PX = 0.25;

export function PrintExport({ layout, orderId }: { layout: PrintLayout; orderId: string }) {
  const [fonts, setFonts] = useState<PrintFonts | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => {
    loadPrintFonts().then(setFonts);
  }, []);

  async function download() {
    if (!fonts) return;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const out: PdfPage[] = [];
    for (let i = 0; i < layout.pages.length; i++) {
      setBusy(i + 1);
      const page = layout.pages[i];
      const { w, h, bleed } = pageSize(page, true);
      canvas.width = Math.round(w * DPI_SCALE);
      canvas.height = Math.round(h * DPI_SCALE);
      drawPrintPage(ctx, page, i + 1, layout.pageCount, { scale: DPI_SCALE, withBleed: true, fonts });
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.92));
      if (!blob) throw new Error("JPEG 변환 실패");
      out.push({
        jpeg: new Uint8Array(await blob.arrayBuffer()),
        pxW: canvas.width,
        pxH: canvas.height,
        mmW: w * MM_PER_PX,
        mmH: h * MM_PER_PX,
        trimMm: bleed ? bleed * MM_PER_PX : undefined,
      });
    }
    const pdf = buildPdf(out);
    const url = URL.createObjectURL(new Blob([pdf.slice().buffer], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `mylife-print-${orderId}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {layout.pages.map((p, i) => (
          <li key={i} className="flex flex-col items-center gap-1" aria-label={T.pageAria(i + 1, pageLabel(p))}>
            <PageCanvas page={p} no={i + 1} total={layout.pageCount} width={120} fonts={fonts} />
            <span className="text-sm text-ink-soft">{i + 1}</span>
          </li>
        ))}
      </ol>
      <Button variant="primary" disabled={!fonts || busy !== null} onClick={() => download().catch((e) => (console.error("[print] PDF", e), setBusy(null)))}>
        {busy !== null ? T.adminPdfBusy(busy, layout.pageCount) : T.adminPdf}
      </Button>
    </div>
  );
}
