// Phase L2 — 인생 골격 잡기 질문 정의.
//
// 9개 카테고리(LifeCategory enum) 를 순서대로. 카테고리당 핵심 1가지 +
// 시점(연/월) + 자유 보조(content). 한 카테고리에 너무 많이 묻지 않는다
// — 어르신 부담 0. 학교가 여러 곳, 자녀가 여럿이면 L4("인생의 한 장면
// 추가하기") 에서 더 채운다. L2 단계는 *골격* 만.
//
// 시니어 친화 톤:
//   - prompt: 한 문장. 큰 글씨로 노출.
//   - hint  : 입력 어떻게 하라는 친근한 안내. 작은 글씨.
//   - titleLabel/titlePlaceholder: 제목(eventTitle) 입력의 라벨·예시.
//   - dateRequired: true면 연도 필수(저장 정렬용), false면 연도 없이도 OK.
//     단, eventYear 가 null 이면 시간축에 노출되지 않으므로(L1 헬퍼가
//     NULL 제외) UI 에서도 "이 카테고리는 시점이 흐려도 괜찮아요" 안내.
//
// 이 배열의 순서가 곧 인덱스 화면의 표시 순서이자 "다음 카테고리" 자동
// 진행 순서다.

import type { LifeCategory } from "../generated/prisma/enums";

export type LifeQuestion = {
  category: LifeCategory;
  // 인덱스 카드 + 폼 헤더에 표시되는 큰 라벨 ("학교", "결혼" 등)
  shortLabel: string;
  // 폼 상단에 노출되는 주 질문 (한 문장, 큰 글씨)
  prompt: string;
  // 폼 보조 안내 (작은 글씨)
  hint: string;
  // 제목(eventTitle) 입력 라벨 + placeholder
  titleLabel: string;
  titlePlaceholder: string;
  // 자유 보조(content) 입력 라벨 + placeholder
  contentLabel: string;
  contentPlaceholder: string;
  // 카테고리 자체가 "선택" (어르신이 해당 없을 가능성 큼) — 인덱스에서
  // "선택" 뱃지로 표시. 저장 안 해도 진척 % 계산엔 동일하게 가산.
  optional: boolean;
};

export const LIFE_QUESTIONS: LifeQuestion[] = [
  {
    category: "BIRTH",
    shortLabel: "출생",
    prompt: "어느 지역에서, 언제 태어나셨어요?",
    hint: "정확한 월은 모르셔도 괜찮아요. 연도만 적어주세요.",
    titleLabel: "태어난 곳",
    titlePlaceholder: "예: 서울 종로, 경상남도 의령",
    contentLabel: "더 떠오르는 게 있다면",
    contentPlaceholder: "예: 부모님 첫째였어요, 시골 외할머니 댁에서…",
    optional: false,
  },
  {
    category: "CHILDHOOD",
    shortLabel: "유년기",
    prompt: "어렸을 때 어디서 자라셨어요?",
    hint: "이사가 있었다면 가장 오래 살았던 곳으로 적어주세요.",
    titleLabel: "자란 곳",
    titlePlaceholder: "예: 부산 동래, 강원도 시골 마을",
    contentLabel: "그곳에서 떠오르는 장면",
    contentPlaceholder: "예: 골목에서 친구들과 술래잡기…",
    optional: false,
  },
  {
    category: "SCHOOL",
    shortLabel: "학교",
    prompt: "가장 기억에 남는 학교는 어디였어요?",
    hint: "한 곳만 먼저 적으셔도 돼요. 더 있으면 나중에 추가할 수 있어요.",
    titleLabel: "학교 이름",
    titlePlaceholder: "예: 종로초등학교, 부산대학교",
    contentLabel: "그 시절 떠오르는 친구나 장면",
    contentPlaceholder: "예: 점심 시간에 운동장에서…",
    optional: false,
  },
  {
    category: "MILITARY",
    shortLabel: "군 복무",
    prompt: "군 복무를 하셨다면 언제, 어디서 하셨어요?",
    hint: "해당 없으시면 건너뛰셔도 됩니다.",
    titleLabel: "복무지 / 부대",
    titlePlaceholder: "예: 강원도 OO사단, 해병대",
    contentLabel: "그 시절 기억",
    contentPlaceholder: "예: 첫 휴가, 동기들…",
    optional: true,
  },
  {
    category: "WORK",
    shortLabel: "첫 직장",
    prompt: "첫 직장은 어디였어요? 언제부터 다니셨어요?",
    hint: "회사 이름이 정확하지 않으셔도 괜찮아요.",
    titleLabel: "직장 이름 / 하던 일",
    titlePlaceholder: "예: OO은행 종로지점, 동네 슈퍼 운영",
    contentLabel: "그 시절 떠오르는 것",
    contentPlaceholder: "예: 첫 월급 받던 날…",
    optional: false,
  },
  {
    category: "RELATIONSHIP",
    shortLabel: "결혼",
    prompt: "결혼하셨다면 언제, 누구와 하셨어요?",
    hint: "해당 없으시면 건너뛰셔도 됩니다.",
    titleLabel: "배우자 (별명·이니셜도 OK)",
    titlePlaceholder: "예: 김OO, 우리집 안주인",
    contentLabel: "결혼 즈음 떠오르는 장면",
    contentPlaceholder: "예: 첫 만남, 결혼식 그날의 날씨…",
    optional: true,
  },
  {
    category: "FAMILY",
    shortLabel: "자녀",
    prompt: "첫 자녀가 태어난 해를 적어주세요.",
    hint: "자녀가 여럿이시면 한 분 먼저, 나머지는 나중에 추가하셔도 돼요. 해당 없으시면 건너뛰기.",
    titleLabel: "자녀 (별명·이니셜도 OK)",
    titlePlaceholder: "예: 첫째 OO, 우리 큰아이",
    contentLabel: "그 즈음 떠오르는 것",
    contentPlaceholder: "예: 태어난 병원, 부모님 반응…",
    optional: true,
  },
  {
    category: "RESIDENCE",
    shortLabel: "큰 이사",
    prompt: "인생에서 가장 큰 이사가 있었다면?",
    hint: "정확한 연도가 안 떠오르시면 대략이라도 괜찮아요.",
    titleLabel: "이사 간 곳",
    titlePlaceholder: "예: 서울에서 부산으로, 시골에서 도시로",
    contentLabel: "그때 떠오르는 것",
    contentPlaceholder: "예: 짐 싸던 날, 새 동네 첫 인상…",
    optional: true,
  },
  {
    category: "OTHER",
    shortLabel: "그 외",
    prompt: "이 외에 인생의 큰 사건이 있다면 적어주세요.",
    hint: "큰 병·사고, 종교, 오래된 취미 등 무엇이든 좋아요. 해당 없으시면 건너뛰기.",
    titleLabel: "사건 이름",
    titlePlaceholder: "예: 큰 병원 입원, 등산 시작",
    contentLabel: "어떤 일이었는지",
    contentPlaceholder: "자유롭게 적어주세요…",
    optional: true,
  },
];

export const LIFE_CATEGORY_ORDER: LifeCategory[] = LIFE_QUESTIONS.map(
  (q) => q.category,
);

// 카테고리 → 질문 정의 빠른 조회.
export function getLifeQuestion(category: LifeCategory): LifeQuestion | null {
  return LIFE_QUESTIONS.find((q) => q.category === category) ?? null;
}

// 다음 미답 카테고리(LIFE_CATEGORY_ORDER 순). 모두 답했으면 null.
export function nextUnansweredCategory(
  answered: Set<LifeCategory>,
): LifeCategory | null {
  return LIFE_CATEGORY_ORDER.find((c) => !answered.has(c)) ?? null;
}
