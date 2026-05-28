// 동기부여 ② — 감정 스탬프 정책. 클라이언트 컴포넌트(StampBar)에서도
// import 하므로 prisma 의존 없는 별도 파일.
//
// 댓글(글쓰기)보다 가벼운 한 탭 반응. "좋아요" 하나보다 어떤 마음인지
// 전해서 어르신껜 더 따뜻. 3~4종 (기획 8번 결정 1).

export const STAMP_KINDS = ["touched", "remember", "proud", "thanks"] as const;

export type StampKind = (typeof STAMP_KINDS)[number];

export const STAMPS: Record<StampKind, { emoji: string; label: string }> = {
  touched: { emoji: "❤️", label: "뭉클해요" },
  remember: { emoji: "😊", label: "기억나요" },
  proud: { emoji: "👏", label: "대단해요" },
  thanks: { emoji: "🙏", label: "고마워요" },
};

export function isStampKind(v: unknown): v is StampKind {
  return typeof v === "string" && (STAMP_KINDS as readonly string[]).includes(v);
}

// "○○님이 '뭉클해요'를 남겼어요" 식 표시용 — 이모지+라벨.
export function stampText(stamp: StampKind): string {
  const s = STAMPS[stamp];
  return `${s.emoji} ${s.label}`;
}
