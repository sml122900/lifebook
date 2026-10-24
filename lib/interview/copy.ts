// 오늘의 인터뷰 — 화면 문구 단일 출처(docs/phase/today-interview.md §13).
// 전부 임시 문구다. 성민이 확정하면 이 파일만 고친다(로직 파일에 문구 하드코딩 금지).
// 순수 모듈(클라·서버 공용).

import { withJosa } from "../josa";

export const INTERVIEW_COPY = {
  // ── /story-review 진입 카드 ──
  cardTitle: "오늘의 인터뷰", // [임시 — 성민 확정 필요]
  cardBefore: "짧은 질문 몇 가지를 여쭤볼게요.", // [임시 — 성민 확정 필요]
  cardInProgress: (done: number, total: number) => `${total}개 중 ${done}개 답하셨어요.`, // [임시 — 성민 확정 필요]
  cardDone: "오늘 인터뷰를 마쳤어요.", // [임시 — 성민 확정 필요]
  cardButtonStart: "시작하기", // [임시 — 성민 확정 필요]
  cardButtonContinue: "이어서 하기", // [임시 — 성민 확정 필요]
  cardButtonDone: "오늘 답 보기", // [임시 — 성민 확정 필요]

  // ── 시작 화면 ──
  startTitle: "오늘의 인터뷰", // [임시 — 성민 확정 필요]
  startDesc: (n: number) => `오늘은 질문 ${n}개를 여쭤볼게요. 짧게 답하셔도 괜찮아요.`, // [임시 — 성민 확정 필요]
  startButton: "시작할게요", // [임시 — 성민 확정 필요]

  // ── 문항 화면 ──
  progress: (index: number, total: number) => `${index} / ${total}`, // [임시 — 성민 확정 필요]
  resumeNotice: "아까 하던 곳부터 이어서 여쭤볼게요.", // [임시 — 성민 확정 필요]
  answerPlaceholder: "여기에 말씀해 주세요", // [임시 — 성민 확정 필요]
  answerLabel: "답", // [임시 — 성민 확정 필요] (입력칸 이름 — 화면 읽기 프로그램용)
  send: "답하기", // [임시 — 성민 확정 필요]
  skip: "이 질문은 건너뛸게요", // [임시 — 성민 확정 필요]
  pause: "오늘은 그만할게요", // [임시 — 성민 확정 필요]
  storyEnough: "이 이야기는 여기까지", // [임시 — 성민 확정 필요]
  thinking: "잠깐만요, 생각하고 있어요…", // [임시 — 성민 확정 필요]
  saving: "이야기를 담고 있어요…", // [임시 — 성민 확정 필요]
  storySaved: "들려주신 이야기를 담아뒀어요.", // [임시 — 성민 확정 필요]
  saveFailed: "저장하지 못했어요. 다시 해 볼까요?", // [임시 — 성민 확정 필요]
  retry: "다시 하기", // [임시 — 성민 확정 필요]
  errorGeneric: "잠시 문제가 생겼어요. 다시 해 볼까요?", // [임시 — 성민 확정 필요]

  // ── 연도 문항 ──
  yearQuestion: (label: string) => `${label}${withJosa(label, "은/는")} 몇 년도였어요?`, // [임시 — 성민 확정 필요]
  yearHint: "기억나는 만큼만요. 나이로 말씀하셔도 돼요.", // [임시 — 성민 확정 필요]
  yearUnknownButton: "기억이 안 나요", // [임시 — 성민 확정 필요]
  yearSaved: (label: string, year: number) => `${label}, ${year}년으로 담아뒀어요.`, // [임시 — 성민 확정 필요]
  yearRetry: "죄송해요, 잘 못 알아들었어요. 몇 년도쯤이었는지 다시 말씀해 주시겠어요?", // [임시 — 성민 확정 필요]
  yearUnknown: "괜찮아요. 나중에 떠오르면 알려주세요.", // [임시 — 성민 확정 필요]

  // ── 중단 화면(오늘은 그만) ──
  pausedTitle: "오늘은 여기까지 할게요", // [임시 — 성민 확정 필요]
  pausedDesc: "다음에 오시면 이어서 여쭤볼게요.", // [임시 — 성민 확정 필요]
  pausedResume: "이어서 하기", // [임시 — 성민 확정 필요]

  // ── 종료 요약(같은 날 다시 들어와도 이 화면) ──
  summaryTitle: "오늘 인터뷰를 마쳤어요", // [임시 — 성민 확정 필요]
  summaryCounts: (answered: number, skipped: number) =>
    skipped > 0 ? `${answered}개 답해주셨고, ${skipped}개는 건너뛰었어요.` : `${answered}개 답해주셨어요.`, // [임시 — 성민 확정 필요]
  summarySavedHeading: "오늘 담긴 이야기", // [임시 — 성민 확정 필요]
  summaryYearItem: (label: string, year: number) => `${label} — ${year}년`, // [임시 — 성민 확정 필요]
  summaryNextDay: "내일 또 새로운 질문을 준비해 둘게요.", // [임시 — 성민 확정 필요]
  summaryReview: "지금까지 채운 이야기 보기", // [임시 — 성민 확정 필요]
  summaryChat: "더 이야기 나누기", // [임시 — 성민 확정 필요]

  // ── 빈 계획 ──
  emptyTitle: "오늘은 여쭤볼 질문이 없어요", // [임시 — 성민 확정 필요]
  emptyDesc: "하고 싶은 이야기가 있으시면 언제든 들려주세요.", // [임시 — 성민 확정 필요]
} as const;
