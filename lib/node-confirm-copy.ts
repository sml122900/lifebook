// 노드 그래프 2b-2 — 이야기에 나온 인물 확인(/story-review/confirm) 화면 문구 단일 출처.
// 전부 임시 문구다. 성민이 확정하면 이 파일만 고친다(docs/phase/node-graph-self.md §4.5).
// 순수 모듈(클라·서버 공용).

export const CONFIRM_COPY = {
  // ── /story-review/confirm ──
  title: "이야기에 나온 분들", // [임시 — 성민 확정 필요]
  desc: "이야기 속에서 말씀하신 분들이에요. 맞는지 한 번만 봐 주세요.", // [임시 — 성민 확정 필요]
  storyHeading: (title: string) => `‘${title}’에 나온 분`, // [임시 — 성민 확정 필요]
  registered: "이미 등록된 분", // [임시 — 성민 확정 필요] (기존 확정 인물과 맞춰진 행 꼬리표)
  yes: "맞아요", // [임시 — 성민 확정 필요]
  no: "아니에요", // [임시 — 성민 확정 필요]
  edit: "고칠게요", // [임시 — 성민 확정 필요]
  allYes: "모두 맞아요", // [임시 — 성민 확정 필요]
  nameLabel: "이름", // [임시 — 성민 확정 필요]
  relationLabel: "관계", // [임시 — 성민 확정 필요]
  editSave: "이렇게 고칠게요", // [임시 — 성민 확정 필요]
  editCancel: "취소", // [임시 — 성민 확정 필요]
  editInvalid: "이름을 적어 주세요. 이름은 50자, 관계는 30자까지예요.", // [임시 — 성민 확정 필요]
  saving: "담고 있어요…", // [임시 — 성민 확정 필요]
  rowConfirmed: "확인했어요", // [임시 — 성민 확정 필요]
  rowRejected: "뺐어요", // [임시 — 성민 확정 필요]
  error: "처리하지 못했어요. 다시 해 볼까요?", // [임시 — 성민 확정 필요]
  allDone: "다 확인했어요. 고맙습니다.", // [임시 — 성민 확정 필요]
  finish: "확인 마치기", // [임시 — 성민 확정 필요]
  emptyTitle: "확인할 분이 없어요", // [임시 — 성민 확정 필요]
  emptyDesc: "이야기를 나누다 새로운 분이 나오면 여기서 확인해 드릴게요.", // [임시 — 성민 확정 필요]
  emptyButton: "지금까지 채운 이야기 보기", // [임시 — 성민 확정 필요]

  // ── /story-review 상단 카드(정리할 것 N개) ──
  reviewCardTitle: "정리할 것이 있어요", // [임시 — 성민 확정 필요]
  reviewCardDesc: (n: number) => `이야기에 나온 분 ${n}명이 맞는지 확인해 주세요.`, // [임시 — 성민 확정 필요]
  reviewCardButton: "확인하러 가기", // [임시 — 성민 확정 필요]

  // ── 오늘의 인터뷰 종료 요약 카드 ──
  interviewCardDesc: (n: number) => `이야기에 나온 분 ${n}명, 맞는지 확인해 주세요.`, // [임시 — 성민 확정 필요] (대기 전체 수)
  interviewCardButton: "확인하러 가기", // [임시 — 성민 확정 필요]
} as const;
