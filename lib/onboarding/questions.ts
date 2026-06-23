// 온보딩 질문 스크립트. 질문 추가/삭제/순서변경은 이 파일만 고치면 된다 —
// app/onboarding/OnboardingForm.tsx 의 UI 가 전적으로 이 배열로 구동된다.
//
// 설계 규칙 (Phase 4):
// - 건강/정치/종교 질문은 본인은 물론 제3자에 대해서도 금지.
// - 다른 사람에 대한 질문엔 `nicknameHint: true` 를 줘, 실명 대신 별명/
//   이니셜을 써도 된다고 UI 가 안내하게 한다 (최소 수집 원칙).

export type Question =
  | { id: string; kind: "year"; key: "birthYear"; prompt: string }
  | {
      id: string;
      kind: "textlist";
      key: "residences" | "schools";
      prompt: string;
      hint?: string;
    }
  // F3 이야기형 — 이야기 받고 Sonnet으로 life_event 추출·저장
  | {
      id: string;
      kind: "story";
      key: string;
      prompt: string;
      optional: true;
    }
  // (F3 보류 → 이야기형 전환 완료. 아래 타입은 questions.ts에서 더 이상 사용 안 됨)
  | {
      id: string;
      kind: "tags";
      key: "favMovies" | "favGames" | "favMusic";
      prompt: string;
      optional: true;
    }
  | {
      id: string;
      kind: "text";
      key: "siblings" | "parentsInfo" | "closeFriends" | "hobbies";
      prompt: string;
      optional?: boolean;
      nicknameHint?: boolean;
    };

export const QUESTIONS: Question[] = [
  // ── 구조화 질문 (F1 활성) ────────────────────────────────────────────────────
  {
    id: "birth-year",
    kind: "year",
    key: "birthYear",
    prompt: "태어난 연도를 알려주세요.",
  },
  {
    id: "residences",
    kind: "textlist",
    key: "residences",
    prompt: "살았던 지역을 알려주세요.",
    hint: "예: 서울 마포구, 부산 해운대 — 여러 곳 적어도 좋아요.",
  },
  {
    id: "schools",
    kind: "textlist",
    key: "schools",
    prompt: "다닌 학교를 알려주세요.",
    hint: "기억나는 만큼만 적어도 좋아요.",
  },
  // ── F3 이야기형 질문 (사건 추출 → life_event 즉시 등록) ─────────────────────
  {
    id: "school-life",
    kind: "story",
    key: "schoolLife",
    prompt: "학창 시절 기억나는 일이 있으신가요? 편하게 이야기해 주세요.",
    optional: true,
  },
  {
    id: "work-life",
    kind: "story",
    key: "workLife",
    prompt: "젊을 때나 직장 생활에서 기억나는 일이 있으세요?",
    optional: true,
  },
  {
    id: "family-life",
    kind: "story",
    key: "familyLife",
    prompt: "가족이나 가까운 분들과 있었던 기억나는 이야기가 있으신가요?",
    optional: true,
  },
];
