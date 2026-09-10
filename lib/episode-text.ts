// v3 P14-1 — 에피소드 대화 텍스트 순수 헬퍼. prisma/auth 없음 — 클라
// (app/chat-v3/ChatV3Client.tsx)와 서버 액션(app/actions/episode.ts), 검증
// 스크립트(db/test-p14.ts)가 같은 함수를 공유한다.

// P8-2 — "그걸로 된 것 같아요"/"충분해요" 류의 완곡한 종료 의사. LLM 이
// 종종 "잘 됐다"는 뜻으로 오독해 마무리 대신 되묻는다 — 에피소드 대화 중엔
// AI 판단 전에 키워드로 먼저 거른다(존엄 원칙상 오탐(조기 종료)이 미탐
// (계속 캐물음)보다 안전).
export const EPISODE_DONE_PHRASES = [
  "그걸로된것같아요",
  "그정도면됐어요",
  "이정도면됐어요",
  "이정도면",
  "그정도면",
  "이만하면",
  "충분해요",
  "충분한것같아요",
  "됐어요",
  "됐습니다",
];

// 명시적 종료 의사 — 모든 단계에서 세션을 닫는다(STAGE4 의 "종료 의사는
// 항상 즉시 존중" 원칙을 LLM 판단 대신 가벼운 키워드로 재현).
export const EXIT_PHRASES = [
  "그만할래요",
  "그만할게요",
  "그만하고싶어요",
  "그만",
  "여기까지",
  "다음에할게요",
  "쉬고싶어요",
];

function hasAny(text: string, phrases: string[]): boolean {
  const normalized = text.replace(/\s+/g, "");
  return phrases.some((p) => normalized.includes(p));
}

export function isExitIntent(text: string): boolean {
  return hasAny(text, EXIT_PHRASES);
}

export function isEpisodeDoneIntent(text: string): boolean {
  return hasAny(text, EPISODE_DONE_PHRASES);
}

function hasDonePhrase(text: string): boolean {
  return hasAny(text, EPISODE_DONE_PHRASES) || hasAny(text, EXIT_PHRASES);
}

// P14-1(3) — 같은 메시지에 이야기 내용과 종료 신호가 함께 있는 경우
// ("역사 수업 시간에 재밌는 이야기를 많이 해주셨어요. 그걸로 된 것 같아요")
// 종료 문장만 떼고 내용은 살린다. P10-3 은 메시지를 통째로 요약 입력에서
// 뺐는데, 그러면 1턴 대화가 "내용 없음"이 돼 요약 모델이 안내문을 만들어
// 그대로 저장되던 원인이었다. 문장 단위(마침표·물음표·느낌표·줄바꿈)로
// 나눠 종료 신호가 든 문장만 버린다. 남는 게 없으면 빈 문자열.
export function stripEpisodeDoneSignal(text: string): string {
  return text
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s && !hasDonePhrase(s))
    .join(" ")
    .trim();
}

// P14-1(2) — 요약 결과가 "이야기 정리"가 아니라 사용자에게 말을 거는
// 안내문("더 들려주세요", "정리해 드리겠습니다", "~있으신가요?")인지.
// 요약 프롬프트가 내용 부족을 이유로 이런 문구를 만들면 Episode.content 에
// 그대로 들어가 데이터가 유실된다 — 저장 전에 거른다.
//
// v3 P21-1 — 예전엔 `/습니다/`(어디든 등장)와 `/[?？]\s*$/`(끝이 물음표)도
// 있었는데, 이 함수가 finishEpisodeChat 저장 실패 폴백(rawUserText, 본인이
// 실제로 한 말 그대로)에도 그대로 재사용된다(isSubstantiveEpisodeContent).
// 어르신 원문은 "-습니다"체나 되묻는 말("고생 많았죠?")이 흔해 진짜 이야기가
// 안내문으로 오판되고, gap-detector 가 영원히 "아직 못 들었어요"로 되띄우는
// 버그로 이어졌다(실측 test30). 나머지 패턴만으로도 알려진 안내문 예시는
// 전부 걸러진다(db/test-p14.ts 참조) — 더 넓은 두 패턴만 제거.
const GUIDANCE_PATTERNS: RegExp[] = [
  /주세요/,
  /주시면/,
  /주시겠/,
  /드리겠/,
  /드릴\s*수/,
  /드릴게요/,
  /정리할\s*(내용|이야기)/,
  /내용이\s*없/,
  /이야기가\s*없/,
  /(있|하|계)(으)?(신가요|세요|셨나요|시나요)/,
];

export function isSummaryGuidance(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return GUIDANCE_PATTERNS.some((re) => re.test(t));
}

// P16-1 — 갭 감지기가 LifeEvent.hasEpisode 플래그(배지 표시용, 저장만
// 되면 무조건 true) 대신 "실질 내용 있는 Episode 가 있는가"로 판단하기
// 위한 기준. 저장은 됐지만 안내문/빈 문자열뿐인 Episode 는 실질 아님 —
// P14 이전 데이터(안내문이 그대로 저장된 것)가 갭을 영구히 막던 문제의
// 재발을 감지기 쪽에서도 막는다(가드가 뚫려도 감지기가 다시 물어봄).
//
// P21-1 — "-습니다"체 정상 회상이 안내문으로 오탐되던 문제(운영 실측,
// test30)는 GUIDANCE_PATTERNS 에서 그 두 넓은 패턴을 제거해 고쳤다(위 주석
// 참조). 남은 패턴들도 휴리스틱이라 여전히 드문 오탐 여지는 있을 수 있다 —
// 그 경우도 이미 답한 이벤트가 갭 카드로 다시 뜨는 정도라(빈 내용이 영구히
// 안 물어봐지는 쪽보다 안전, P8-2 와 같은 원칙) 완전 제거 대신 최소한으로만
// 남겼다.
export function isSubstantiveEpisodeContent(content: string): boolean {
  return content.trim().length > 0 && !isSummaryGuidance(content);
}

// P16-2 — EPISODE/PERSON 대기 컨텍스트를 조용히 이어받을 때 붙이는 안내
// 한 줄. 형식이 고정돼 있어(항상 "아까 " 로 시작·" 이야기 이어서 들을게요."
// 로 끝) lastNonResumeAssistantText 가 정규식으로 알아본다.
export function buildResumeAnnouncement(label: string): string {
  return `아까 ${label} 이야기 이어서 들을게요.`;
}
const RESUME_ANNOUNCEMENT_RE = /^아까 .+ 이야기 이어서 들을게요\.$/;

// ChatV3Client 의 tryResumePendingContext 가 "실제로 답을 기다리던 마지막
// 질문"을 찾을 때 쓴다. 답 없이 재진입을 반복하면 로그 끝이 매번 이
// 안내문 자신이 되므로(addBot 자체 연속-중복 방지 덕에 안내문이 여러 줄
// 쌓이진 않는다 — 클라의 buildResumeAnnouncement 호출부 참고), 그걸 원래
// 질문으로 착각해 다음 재진입의 컨텍스트 앵커·person/period 판정용 텍스트로
// 삼지 않도록 건너뛰고 그 위의 진짜 질문을 찾는다.
export function lastNonResumeAssistantText(
  loaded: readonly { role: string; content: string }[],
): string | null {
  for (let i = loaded.length - 1; i >= 0; i--) {
    const m = loaded[i];
    if (m.role === "assistant" && RESUME_ANNOUNCEMENT_RE.test(m.content)) continue;
    return m.role === "assistant" ? m.content : null;
  }
  return null;
}

// P14-4 — 에피소드 저장 뒤 마무리 멘트. 한 세션에 6회 이상 같은 문구가
// 반복돼 단조롭다는 관찰 — 순서대로 돌려 쓴다(연속 중복 0).
export const EPISODE_CLOSINGS = [
  "소중한 이야기 들려주셔서 고마워요. 다른 이야기도 있으세요?",
  "네, 잘 담아뒀어요. 또 떠오르는 이야기 있으세요?",
  "이야기 잘 들었어요. 더 나누고 싶은 이야기 있으세요?",
  "고마워요, 잘 기록해 뒀어요. 다른 시절 이야기도 있으세요?",
];

// P15-1 — 복원된 로그에서 마지막으로 쓴 마무리 문구를 찾아 "다음" 인덱스를
// 돌려준다. 클라의 순환 인덱스(useRef)가 리마운트·재진입마다 0 으로 돌아가
// 실사용에선 항상 첫 문구만 나오던 원인 — 로그는 DB 에 남으므로 여기서
// 이어받으면 저장소 추가 없이 순환이 계속된다. 문구가 없으면 0.
export function nextClosingIndexFromLog(
  log: readonly { role: string; content: string }[],
): number {
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i].role !== "assistant") continue;
    const idx = EPISODE_CLOSINGS.indexOf(log[i].content);
    if (idx >= 0) return (idx + 1) % EPISODE_CLOSINGS.length;
  }
  return 0;
}
