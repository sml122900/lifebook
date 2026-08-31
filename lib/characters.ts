// v3 P5 — /chat-v3 대화 캐릭터 정의. 순수 모듈(상수만, "use server" 아님) —
// lib/place-types.ts·lib/era-constants.ts 와 같은 클라/서버 공용 패턴.
//
// 지금은 임시 플레이스홀더(단순 도형 Lottie)만 있다. 디자이너 원화가 나오면
// public/characters/<id>/{idle,listening,thinking,happy}.json 파일만
// 교체하면 되고, 이 파일의 id/구조는 그대로다.

export type CharacterState = "idle" | "listening" | "thinking" | "happy";

export const CHARACTER_STATES: CharacterState[] = [
  "idle",
  "listening",
  "thinking",
  "happy",
];

export type CharacterDef = {
  id: string;
  name: string;
  thumbnailUrl: string;
  animations: Record<CharacterState, string>;
};

function animationsFor(id: string): Record<CharacterState, string> {
  return {
    idle: `/characters/${id}/idle.json`,
    listening: `/characters/${id}/listening.json`,
    thinking: `/characters/${id}/thinking.json`,
    happy: `/characters/${id}/happy.json`,
  };
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: "duri",
    name: "두리",
    thumbnailUrl: "/characters/duri/thumbnail.svg",
    animations: animationsFor("duri"),
  },
  {
    id: "moong",
    name: "몽이",
    thumbnailUrl: "/characters/moong/thumbnail.svg",
    animations: animationsFor("moong"),
  },
  {
    id: "haepi",
    name: "해피",
    thumbnailUrl: "/characters/haepi/thumbnail.svg",
    animations: animationsFor("haepi"),
  },
];

export const DEFAULT_CHARACTER_ID = "duri";

export function isCharacterId(v: unknown): v is string {
  return typeof v === "string" && CHARACTERS.some((c) => c.id === v);
}

export function getCharacter(id: string): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
