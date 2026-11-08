// My Life 개편 2단계 — /chat-v3 자유 대화·제안 카드 문구. 72키 전부 성민 확정(2026-11-04 — 들어옴 10·대화 중 8·제안 카드와 오류·한도 54).
// docs/phase/my-life-restructure.md §7.4 "자유 대화(2단계)" 행. 클라이언트에서도 쓰는 순수 모듈.
// 대화창에 남는 안내 말을 바꾸면 lib/free-chat.ts 대화창 말 판정(APP_NOTICES)이 새 문구를 따라가고, 옛 문구는
// LEGACY_APP_NOTICES(·옛 created 꼴)에 남겨 그 전에 쌓인 대화 기록도 알아본다.

export const FREE_CHAT_COPY = {
  // ── 자유 대화 ──
  greeting: "편하게 아무 이야기나 들려주세요. 떠오르는 대로 말씀하시면 돼요.",
  setupDone: "이제 준비가 끝났어요. 떠오르는 이야기를 편하게 들려주세요.",
  resume: "아까 하시던 이야기, 이어서 들려주세요.",
  staleNotice: "지난번에 나누던 이야기를 남겨 둘까요?",
  chipsTitle: "이런 이야기는 어떠세요?",
  saveNow: "지금 이야기 남기기",
  proposing: "이야기를 정리하고 있어요…",
  budgetPaused: "오늘은 이야기 친구가 쉬는 시간이에요. 내일 다시 이야기 나눠요.",
  // 테스트 계정 하루 한도(2026-11-08 — lib/chat-v3-usage budgetBlock "test"). [임시 — 성민 확정 필요]
  testBudgetPaused: "테스트 계정의 오늘 AI 사용 한도를 다 써서 쉬어요. 내일 다시 이야기 나눠요.",
  topicGone: "그 이야기 거리는 지금 없어요. 다른 이야기를 들려주세요.",
  cardFirst: "먼저 위 카드를 정해 주세요.",
  confirmApplied: "네, 반영했어요. 다른 이야기도 편하게 해 주세요.",
  confirmAlready: "그 이야기는 이미 확인했어요. 다른 이야기도 들려주세요.",
  exitAfterCard: "카드를 정하시면 오늘은 여기까지 할게요.",

  // ── 제안 카드 ──
  cardTitle: "이 이야기를 남길까요?",
  fieldTitle: "제목",
  titlePlaceholder: "비워 두면 내용 첫 문장이 제목이 돼요",
  fieldCenter: "시기",
  fieldPeople: "사람",
  fieldPlaces: "장소",
  fieldSummary: "내용",
  existingPerson: "이미 계신 분",
  newTag: "새로",
  existingPlace: "이미 있는 곳",
  newCenter: (label: string, year: number | null) => `${year ? `${year} ` : ""}${label} (새 시기)`,
  centerText: (label: string, year: number | null) => `${year ? `${year} ` : ""}${label}`,
  // 시기 미지정 카드(시기 id·이름이 안 맞음) — 보기 줄 + [고치기] 시기 고르기 첫 칸.
  centerUnset: "아직 못 정했어요 — [고치기]에서 골라 주세요",
  centerPick: "시기 고르기",
  none: "없음",
  showMore: "내용 더 보기",
  showLess: "내용 접기",
  create: "만들기",
  edit: "고치기",
  decline: "안 만들기",
  cancelEdit: "고치기 그만",
  remove: "빼기",
  addPerson: "사람 더하기",
  addPlace: "장소 더하기",
  newCenterOption: "새 시기 만들기",
  newCenterLabel: "새 시기 이름",
  newCenterYear: "연도 (모르면 비워 두세요)",
  personName: "이름",
  personRelation: "관계 (예: 친구)",
  placeName: "장소 이름",
  sameNameQuestion: (name: string, relation: string | null) =>
    `이미 계신 ${name}${relation ? `(${relation})` : ""} 님과 같은 분인가요?`,
  same: "같은 분이에요",
  different: "다른 분이에요",
  answerAskFirst: "같은 분인지 먼저 골라 주세요.",
  // 이름 뒤 조사를 쓰지 않는 문장(2026-11-04) — 영문·숫자로 끝나는 장소 이름도 늘 맞게.
  samePlaceQuestion: (name: string) => `같은 곳인가요? (이미 있는 장소: ${name})`,
  samePlace: "같은 곳이에요",
  separatePlace: "다른 곳이에요",
  answerPlaceAskFirst: "같은 곳인지 먼저 골라 주세요.",
  createFailed: "남기지 못했어요. 다시 해 주세요.",
  // 카드 [만들기] 때 저장 쪽이 다시 확인하고 막는 문구 — 카드 아래 빨간 글씨(/chat-v3·/interview). lib/node-proposal createFromCard.
  needSummary: "내용을 적어 주세요.",
  needCenter: "시기를 골라 주세요.",
  centerNotFound: "그 시기를 찾지 못했어요.",
  needNewCenterLabel: "새 시기 이름을 적어 주세요.",
  repickSamePerson: "같은 분을 다시 골라 주세요.",
  repickSamePlace: "같은 곳을 다시 골라 주세요.",
  created: (title: string) => `'${title}' 이야기를 My Life에 남겼어요.`,
  viewOnMap: "My Life에서 보기",
  declined: "네, 남기지 않을게요.",
  saving: "남기는 중이에요…",
  // [안 만들기] 가 실패했을 때(2026-11-04 — 전엔 createFailed "남기지 못했어요"가 나와 뜻이 안 맞았음).
  declineFailed: "처리하지 못했어요. 다시 해 주세요.",

  // ── 화면 코드(app/chat-v3/ChatV3Client.tsx)에 직접 적혀 있던 같은 화면 문구 — 2026-11-04 옮김 ──
  replyEmpty: "잠시 문제가 있었어요. 다시 말씀해 주세요.", // 대화 답이 비어 왔을 때 이야기 친구의 말
  loadFailed: "이야기를 불러오지 못했어요.", // 자유 대화 들어오기 실패(오류 화면 — [다시 시도])
  topicFailed: "이야기를 준비하지 못했어요.", // 주제(이야기 거리)로 시작 실패(오류 화면)
  replyFailed: "답변을 처리하지 못했어요.", // 자유 대화 답 처리 실패(오류 화면)
  inputPlaceholder: "하고 싶은 이야기를 적어 주세요", // 입력칸 안내
  inputNewlineHint: "(Shift+Enter 줄바꿈)", // 입력칸 안내 뒤 — 키보드 있는 기기에서만 붙임(app/components/chat-input useHasKeyboard)
  // 마무리 말(그만할 때) — 질문 상한(설정 단계) · 이야기를 남기고 그만 · 그냥 그만
  endCapped: "오늘은 여기까지 여쭤볼게요. 나머지는 다음에 이어서 여쭤볼게요.",
  endSaved: "네, 들려주신 이야기는 잘 담아뒀어요. 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요.",
  endPlain: "네, 오늘은 여기까지 할게요. 다음에 오시면 이어서 여쭤볼게요.",
} as const;
