// 기억 에이전트 연구 트랙 — 페르소나 원본 데이터의 공용 구조 타입(키 문자열을 매개변수로).
//
// 페르소나 A(persona-a.ts, 동결)는 자기 파일에 같은 모양의 타입을 따로 두고 있다(동결이라 그대로).
// 페르소나 B 부터는 이 타입을 쓴다. 시드(db/lab-seed-persona.ts)·평가기(db/lab-eval.ts)는 키를
// string 으로 넓힌 LabPersona 로 둘 다 다룬다(registry.ts). 순수 타입 파일 — DB·prisma 의존 0.

import type { GoldenCategory } from "../golden/persona-a";

// 대화 한 턴. rawTranscript 는 실제 finishEpisodeChat 과 같은 형식으로 시드가 조립한다.
export type Turn = readonly ["동반자" | "본인", string];

export type LifeEventTypeName =
  | "BIRTH"
  | "ELEM_SCHOOL"
  | "MIDDLE_SCHOOL"
  | "HIGH_SCHOOL"
  | "UNIVERSITY"
  | "MILITARY"
  | "FIRST_JOB"
  | "MARRIAGE"
  | "CUSTOM";

export type LifeCategoryName =
  | "BIRTH"
  | "KINDERGARTEN"
  | "ELEMENTARY"
  | "MIDDLE"
  | "HIGH"
  | "UNIVERSITY"
  | "MILITARY"
  | "WORK"
  | "RELATIONSHIP"
  | "FAMILY";

// v3 LifeEvent(골격). 정정은 correctedYear/correctedLabel(실제 submitConfirmAnswer 와 같은 필드).
export type SkeletonEventOf<SK extends string> = {
  key: SK;
  type: LifeEventTypeName;
  label: string;
  year: number | null;
  isOptional: boolean;
  status: "CONFIRMED" | "CORRECTED" | "SKIPPED";
  correctedYear?: number;
  correctedLabel?: string;
  sequenceOrder: number;
  day: number;
};

// v3 Episode(+ 브릿지 UserMemory). content 는 요약 모델 출력 형식(1인칭 "-다"체).
export type EpisodeOf<
  EK extends string,
  SK extends string,
  PK extends string,
> = {
  key: EK;
  lifeEventKey: SK;
  isPeriod: boolean;
  personKey?: PK;
  day: number;
  content: string;
  transcript: readonly Turn[];
  places?: readonly string[];
};

// v2 UserMemory(createdVia="life_event"). category null = 동반자 추출로 생긴 카테고리 없는 사건.
export type LifeMemoryOf<LK extends string, PK extends string> = {
  key: LK;
  category: LifeCategoryName | null;
  eventTitle: string;
  eventYear: number;
  eventMonth: number | null;
  content: string;
  isDraft: boolean;
  personKeys: readonly PK[];
  places: readonly string[];
  day: number;
};

// v2 UserMemory(createdVia="era_event"). MonthEvent 는 제목+연도로 찾고 없으면 시드 실패.
export type EraMemoryOf<ERK extends string> = {
  key: ERK;
  monthEventTitle: string;
  monthEventYear: number;
  content: string;
  day: number;
};

// v2 UserMemory(createdVia="photo") — 캡션만(이미지 파일 없음, Storage 업로드 0).
// 필드는 lib/photos.ts buildPhotoMemoryData 와 같게 시드가 만든다.
export type PhotoMemoryOf<PHK extends string, PK extends string> = {
  key: PHK;
  year: number;
  month: number | null;
  caption: string;
  personKeys: readonly PK[];
  place: string | null;
  day: number;
};

export type PersonOf<
  PK extends string,
  SK extends string,
  LK extends string,
> = {
  key: PK;
  name: string;
  relation: string;
  category: string;
  birthYear: number | null;
  metYear: number | null;
  memo: string | null;
  day: number;
  // PersonLifeEvent(v3 골격 연결) / PersonEvent(v2 life_event 연결)
  skeletonLinks: readonly SK[];
  memoryLinks: readonly LK[];
};

export type ProfileData = {
  interests: readonly string[];
  schools: readonly string[];
  residences: readonly string[];
  parentsInfo: string | null;
  siblings: string | null;
  closeFriends: string | null;
  hobbies: string | null;
  favMovies: readonly string[];
  favGames: readonly string[];
  favMusic: readonly string[];
  userPreferences: readonly string[];
  day: number;
};

// 골든셋 문항. 필드 의미는 db/lab/golden/persona-a.ts 머리 주석과 같다.
export type GoldenItemOf<K extends string> = {
  id: string;
  category: GoldenCategory;
  question: string;
  expected: readonly (readonly K[])[];
  alsoAcceptable?: readonly K[];
  mustInclude?: readonly RegExp[];
  mustNotInclude?: readonly RegExp[];
  mustNotCite?: readonly K[];
  expectNoRecord?: boolean;
  expectConflict?: boolean;
};
