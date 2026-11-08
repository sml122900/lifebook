// 인쇄 PDF 묶기(2026-11-08 — print-mylife.md Q13). 장마다 300dpi JPEG 한 장을 PDF 한 쪽으로(의존성 0, 순수 함수).
// 그림은 브라우저(관리자 발주 화면)가 Canvas 로 그린다 — 글꼴을 PDF 에 넣지 않아도 화면과 같은 글자. 글자는 래스터(300dpi).
// 표지(밤 판)는 도련 3mm 를 포함한 쪽 크기 + TrimBox(재단선).

export type PdfPage = {
  jpeg: Uint8Array; // JPEG 바이트(DCTDecode 그대로)
  pxW: number;
  pxH: number;
  mmW: number; // 쪽 크기(도련 포함)
  mmH: number;
  trimMm?: number; // 도련 — 있으면 TrimBox
};

const PT_PER_MM = 72 / 25.4;
const enc = new TextEncoder();

export function buildPdf(pages: PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = []; // 객체 번호 1.. 의 시작 위치
  let pos = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    pos += b.length;
  };
  const text = (s: string) => push(enc.encode(s));
  const obj = (n: number, body: string) => {
    offsets[n] = pos;
    text(`${n} 0 obj\n${body}\nendobj\n`);
  };
  const r = (n: number) => Math.round(n * 100) / 100;

  // 객체 번호: 1 카탈로그 · 2 쪽 묶음 · 쪽마다 3개(쪽 · 내용 · 그림)
  const pageObj = (i: number) => 3 + i * 3;
  text("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // 이진 파일 표시
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  pages.forEach((p, i) => {
    const w = r(p.mmW * PT_PER_MM);
    const h = r(p.mmH * PT_PER_MM);
    const t = p.trimMm ? r(p.trimMm * PT_PER_MM) : 0;
    const n = pageObj(i);
    obj(
      n,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}]${t ? ` /TrimBox [${t} ${t} ${r(w - t)} ${r(h - t)}]` : ""} /Resources << /XObject << /Im0 ${n + 2} 0 R >> >> /Contents ${n + 1} 0 R >>`,
    );
    const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q`;
    obj(n + 1, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[n + 2] = pos;
    text(`${n + 2} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.pxW} /Height ${p.pxH} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
    push(p.jpeg);
    text("\nendstream\nendobj\n");
  });

  const count = 3 + pages.length * 3;
  const xref = pos;
  text(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let n = 1; n < count; n++) text(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(pos);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
