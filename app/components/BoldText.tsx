// 모델 답 글자 그리기 — "**굵게**" 만 <strong>, 나머지는 글자 그대로(lib/bold-text). HTML 주입 없음(React 글자 노드만).
// 쓰는 곳 = 글로벌 비서(사용법 챗 답·그 시절 이야기/물어보기 답·저장한 답 — app/timemachine/[year]/[month]/AssistantPanel).

import { splitBold } from "@/lib/bold-text";

export function BoldText({ text }: { text: string }) {
  return (
    <>
      {splitBold(text).map((p, i) => (p.bold ? <strong key={i}>{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </>
  );
}
