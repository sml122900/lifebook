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
      kind: "chips";
      key: "interests";
      prompt: string;
      options: string[];
      multi: true;
    }
  | {
      id: string;
      kind: "textlist";
      key: "residences" | "schools";
      prompt: string;
      hint?: string;
    }
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
  {
    id: "birth-year",
    kind: "year",
    key: "birthYear",
    prompt: "태어난 연도를 알려주세요.",
  },
  {
    id: "interests",
    kind: "chips",
    key: "interests",
    prompt: "관심 있는 분야를 모두 골라주세요.",
    options: [
      "영화",
      "드라마/예능",
      "음악",
      "게임",
      "스포츠",
      "시사/뉴스",
      "기술/IT",
    ],
    multi: true,
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
  {
    id: "fav-movies",
    kind: "tags",
    key: "favMovies",
    prompt: "기억에 남는 영화가 있다면 알려주세요.",
    optional: true,
  },
  {
    id: "fav-games",
    kind: "tags",
    key: "favGames",
    prompt: "즐겨 했던 게임이 있다면 알려주세요.",
    optional: true,
  },
  {
    id: "fav-music",
    kind: "tags",
    key: "favMusic",
    prompt: "좋아했던 노래나 가수가 있다면 알려주세요.",
    optional: true,
  },
  {
    id: "siblings",
    kind: "text",
    key: "siblings",
    prompt: "형제자매에 대해 한 줄로 적어주세요.",
    optional: true,
    nicknameHint: true,
  },
  {
    id: "parents",
    kind: "text",
    key: "parentsInfo",
    prompt: "부모님에 대해 한 줄로 적어주세요.",
    optional: true,
    nicknameHint: true,
  },
  {
    id: "close-friends",
    kind: "text",
    key: "closeFriends",
    prompt: "가까운 친구에 대해 한 줄로 적어주세요.",
    optional: true,
    nicknameHint: true,
  },
  {
    id: "hobbies",
    kind: "text",
    key: "hobbies",
    prompt: "꾸준히 해온 취미가 있다면 알려주세요.",
    optional: true,
  },
];
