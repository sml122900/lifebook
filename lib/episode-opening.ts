// 에피소드 대화 오프닝 질문(결정적 템플릿). 순수 모듈 — /chat-v3(ChatV3Client)와
// 오늘의 인터뷰가 함께 쓴다(2026-10-25 ChatV3Client 에서 옮김, 본문 무변).
import type { LifeEventType } from "./generated/prisma/enums";

// P4-1 — 에피소드 대화 오프닝 질문. 예전엔 내부 골격 라벨을 그대로
// 노출했다(예: "1963년 출생, 이때 기억나는 거 있으세요?"). 이벤트 종류별로
// 자연스러운 질문을 만든다. 학령기 라벨은 " 입학" 접미사를 떼어(예:
// "국민학교 입학" → "국민학교") 개칭 이력(getElemSchoolLabel)이 반영된
// 정확한 학제 명칭을 그대로 살린다.
export function schoolPhaseName(label: string, fallback: string): string {
  const stripped = label.replace(/\s*입학$/, "").trim();
  return stripped || fallback;
}

export function buildEpisodeOpeningPrompt(type: LifeEventType, label: string): string {
  switch (type) {
    case "BIRTH":
      return "태어나서 자란 동네는 어떤 곳이었어요?";
    case "ELEM_SCHOOL":
      return `${schoolPhaseName(label, "학교")} 다닐 때 기억나는 일 있으세요?`;
    case "MIDDLE_SCHOOL":
      return `${schoolPhaseName(label, "중학교")} 다닐 때 기억나는 일 있으세요?`;
    case "HIGH_SCHOOL":
      return `${schoolPhaseName(label, "고등학교")} 다닐 때 기억나는 일 있으세요?`;
    case "UNIVERSITY":
      return `${schoolPhaseName(label, "대학교")} 다닐 때 기억나는 일 있으세요?`;
    case "MILITARY":
      return "군대에서 기억나는 일 있으세요?";
    case "FIRST_JOB":
      return "처음 일하셨을 때 기억나는 일 있으세요?";
    case "MARRIAGE":
      return "결혼하실 때 기억나는 일 있으세요?";
    case "CUSTOM":
    default:
      return `${label}, 이때 기억나는 거 있으세요?`;
  }
}

// v3 P6 — 인물 모드 진입 질문. 에피소드 오프닝과 짝을 이루되 "무슨 일"이 아닌 "누구"에 초점.
// (2026-11-01 My Life 개편 2단계 — ChatV3Client 에서 옮김, 본문 무변. 자유 대화 주제 오프닝이 서버에서 쓴다.)
export function buildPersonAskPrompt(type: LifeEventType, label: string): string {
  switch (type) {
    case "ELEM_SCHOOL":
      return `${schoolPhaseName(label, "학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "MIDDLE_SCHOOL":
      return `${schoolPhaseName(label, "중학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "HIGH_SCHOOL":
      return `${schoolPhaseName(label, "고등학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "UNIVERSITY":
      return `${schoolPhaseName(label, "대학교")} 다닐 때 친하게 지낸 사람 있으세요?`;
    case "MILITARY":
      return "군대에서 가깝게 지낸 전우 있으세요?";
    case "FIRST_JOB":
      return "그때 가깝게 지낸 동료 있으세요?";
    case "BIRTH":
    case "MARRIAGE":
    case "CUSTOM":
    default:
      return "그 시절 가까이 지내신 분 있으세요?";
  }
}
