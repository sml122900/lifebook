import type { ReactNode } from "react";

// 긴 글 편지지 카드(밤 우주 2단계 — docs/phase/ui-night.md Q144 (b)). 밤하늘 위 밝은 종이 한 장.
// 안쪽은 app/globals.css 의 .paper 가 토큰 변수를 편지지 값으로 다시 정의해, 안에 든 글·입력칸·버튼·포커스 고리가
// 코드 수정 없이 밝은 종이 위 색으로 따라온다(카드 밖 = 밤). 쓰는 곳: 이야기 상세·글 고치기·이전 판·사람 글 고치기·
// 처리방침·약관·환불·도움말.
export function Paper({ children, className = "", as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "article" | "section" }) {
  return <Tag className={`paper rounded-[14px] border px-5 py-7 sm:px-8 ${className}`}>{children}</Tag>;
}
