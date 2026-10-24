// 오늘의 인터뷰 — 취향·일상 질문 풀(docs/phase/today-interview.md §5).
// 코드와 분리된 데이터 파일 — 문항은 성민이 작성한다. 아래 5개는 구조 예시(임시).
// 순수 모듈(prisma import 금지 — 클라·서버 공용).
//
// 필드:
//   id       영구 식별자. 한 번 쓰면 바꾸지 않는다(바꾸면 새 질문으로 보고 다시 묻는다).
//            문구만 고칠 땐 id 유지.
//   text     화면에 보이는 질문
//   topic    저장될 이야기 제목(/story-review "들려주신 이야기" 카드 제목)
//   category "taste"(취향) | "daily"(일상) — 같은 분류 연속 출제를 피하는 데 쓴다
//   anchor   대상 시기. 이 유형의 사건이 확정(CONFIRMED/CORRECTED)일 때만 묻고, 답은 그
//            사건의 Episode 로 저장한다. 1차는 필수 — null 이면 출제 안 함(Q6)
//   followUp 후속 질문 허용 여부(최대 2개). false 면 첫 답으로 바로 저장
//   order    기본 출제 순서
//   enabled  false 면 출제 안 함

import type { LifeEventType } from "../generated/prisma/enums";

export type InterviewPoolQuestion = {
  id: string;
  text: string;
  topic: string;
  category: "taste" | "daily";
  anchor: LifeEventType | null;
  followUp: boolean;
  order: number;
  enabled: boolean;
  note?: string;
};

export const QUESTION_POOL: InterviewPoolQuestion[] = [
  {
    id: "elem-play",
    text: "국민학교 다닐 때 친구들이랑 즐겨 하던 놀이가 있으세요?", // [임시 — 성민 확정 필요]
    topic: "국민학교 시절 놀이", // [임시 — 성민 확정 필요]
    category: "daily",
    anchor: "ELEM_SCHOOL",
    followUp: true,
    order: 10,
    enabled: true,
  },
  {
    id: "middle-lunchbox",
    text: "중학교 때 도시락 반찬은 주로 뭐였어요?", // [임시 — 성민 확정 필요]
    topic: "중학교 도시락", // [임시 — 성민 확정 필요]
    category: "daily",
    anchor: "MIDDLE_SCHOOL",
    followUp: false,
    order: 20,
    enabled: true,
  },
  {
    id: "high-song",
    text: "고등학교 때 즐겨 듣던 노래가 있으세요?", // [임시 — 성민 확정 필요]
    topic: "고등학교 시절 노래", // [임시 — 성민 확정 필요]
    category: "taste",
    anchor: "HIGH_SCHOOL",
    followUp: true,
    order: 30,
    enabled: true,
  },
  {
    id: "firstjob-payday",
    text: "첫 월급 받으셨을 때 뭘 하셨는지 기억나세요?", // [임시 — 성민 확정 필요]
    topic: "첫 월급", // [임시 — 성민 확정 필요]
    category: "daily",
    anchor: "FIRST_JOB",
    followUp: true,
    order: 40,
    enabled: true,
  },
  {
    id: "favorite-food",
    text: "요즘 제일 좋아하시는 음식은 뭐예요?", // [임시 — 성민 확정 필요]
    topic: "좋아하는 음식", // [임시 — 성민 확정 필요]
    category: "taste",
    anchor: null, // 대상 시기 없음 — 1차에서는 출제 안 됨(Q6)
    followUp: false,
    order: 50,
    enabled: false,
    note: "대상 시기 없는 취향 질문 예시 — 저장 위치 결정(Q6) 전까지 꺼 둠",
  },
];
