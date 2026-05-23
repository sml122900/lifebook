// Onboarding question script. Edit this file to add/remove/reorder
// questions; the UI in app/onboarding/OnboardingForm.tsx is driven entirely
// from this array.
//
// Design rules (Phase 4):
// - No health / political / religious questions, even about third parties.
// - For questions about other people, set `nicknameHint: true` so the UI
//   reminds users they may use a nickname or initial instead of a real name.

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
