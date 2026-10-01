// 기억 에이전트 — 시드·평가기가 쓰는 페르소나 목록. 키를 string 으로 넓힌 구조 타입으로 묶는다
// (페르소나 데이터·골든셋 파일 자체는 동결, 여기는 목록만). 순수 모듈 — DB 의존 0.

import { GOLDEN_PERSONA_A } from "../golden/persona-a";
import { GOLDEN_PERSONA_B } from "../golden/persona-b";
import { PERSONA_A } from "./persona-a";
import { PERSONA_B } from "./persona-b";
import type {
  EpisodeOf,
  EraMemoryOf,
  GoldenItemOf,
  LifeMemoryOf,
  PersonOf,
  PhotoMemoryOf,
  ProfileData,
  SkeletonEventOf,
} from "./types";

export type LabPersona = {
  userId: string;
  email: string;
  name: string;
  baseDateKst: string;
  onboardingProfile: {
    birthYear: number;
    birthMonth: number | null;
    gender: string | null;
    region: string;
    day: number;
  };
  skeleton: readonly SkeletonEventOf<string>[];
  episodes: readonly EpisodeOf<string, string, string>[];
  lifeMemories: readonly LifeMemoryOf<string, string>[];
  eraMemories: readonly EraMemoryOf<string>[];
  photoMemories?: readonly PhotoMemoryOf<string, string>[];
  people: readonly PersonOf<string, string, string>[];
  profile: ProfileData;
};

export type LabGoldenItem = GoldenItemOf<string>;

export type LabPersonaEntry = {
  key: string;
  persona: LabPersona;
  golden: readonly LabGoldenItem[];
};

export const LAB_PERSONAS: Readonly<Record<string, LabPersonaEntry>> = {
  a: { key: "a", persona: PERSONA_A, golden: GOLDEN_PERSONA_A },
  b: { key: "b", persona: PERSONA_B, golden: GOLDEN_PERSONA_B },
};

export function labPersona(key: string | undefined): LabPersonaEntry {
  const e = key ? LAB_PERSONAS[key] : undefined;
  if (!e)
    throw new Error(
      `--persona ${Object.keys(LAB_PERSONAS).join(" | ")} 중 하나 필요`,
    );
  return e;
}

// 페르소나의 모든 원본 key(평가기 "매핑 안 된 원본" 보고용).
export function personaSourceKeys(p: LabPersona): string[] {
  return [
    ...p.skeleton.map((x) => x.key),
    ...p.episodes.map((x) => x.key),
    ...p.lifeMemories.map((x) => x.key),
    ...p.eraMemories.map((x) => x.key),
    ...(p.photoMemories ?? []).map((x) => x.key),
    ...p.people.map((x) => x.key),
    "PROFILE",
  ];
}
