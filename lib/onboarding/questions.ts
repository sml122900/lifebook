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
  // F3 보류: 이야기형 전환 예정
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
  // ── F3 보류: 이야기형 대화로 전환 예정 ─────────────────────────────────────
  // { id: "fav-movies", kind: "tags", key: "favMovies", ... }
  // { id: "fav-games",  kind: "tags", key: "favGames",  ... }
  // { id: "fav-music",  kind: "tags", key: "favMusic",  ... }
  // { id: "siblings",   kind: "text", key: "siblings",  ... }
  // { id: "parents",    kind: "text", key: "parentsInfo", ... }
  // { id: "close-friends", kind: "text", key: "closeFriends", ... }
  // { id: "hobbies",    kind: "text", key: "hobbies",   ... }
];
