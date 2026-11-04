// 모델 답 글자 — "**굵게**" 만 굵게, 그 밖의 마크다운(#·-·별표 하나 등)은 글자 그대로(2026-11-04). 순수 모듈.
// HTML 로 넣지 않는다 — 글자를 조각으로 나눠 굵은 조각만 표시하고, 그리는 쪽(app/components/BoldText)은 React 글자 노드로만 그린다.
// 한 줄 안의 "**…**" 만(줄을 넘는 것·짝이 안 맞는 별표는 그대로 둔다).

export type TextPiece = { text: string; bold: boolean };

const BOLD = /\*\*([^\n*][^\n]*?)\*\*/g;

export function splitBold(text: string): TextPiece[] {
  const out: TextPiece[] = [];
  let last = 0;
  for (const m of text.matchAll(BOLD)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at), bold: false });
    out.push({ text: m[1], bold: true });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}
