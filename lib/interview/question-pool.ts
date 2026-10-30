// 오늘의 인터뷰 — 취향·일상 질문 풀(docs/phase/today-interview.md §5).
// 코드와 분리된 데이터 파일 — 문항은 성민이 작성한다. 아래 5개는 구조 예시(임시).
// 순수 모듈(prisma import 금지 — 클라·서버 공용).
//
// 필드:
//   id       영구 식별자. 한 번 쓰면 바꾸지 않는다(바꾸면 새 질문으로 보고 다시 묻는다).
//            문구만 고칠 땐 id 유지.
//   text     화면에 보이는 질문
//   topic    저장될 이야기 제목(/story-review "들려주신 이야기" 카드 제목)
//            text·topic 자리표시: {elemSchool} = 출생연도 기준 국민학교/초등학교,
//            {elemSchool:은/는} = 명칭 + 조사(lib/interview/pool-text.ts)
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
    text: "{elemSchool} 다닐 때 친구들이랑 즐겨 하던 놀이가 있으세요?", // [임시 — 성민 확정 필요]
    topic: "{elemSchool} 시절 놀이", // [임시 — 성민 확정 필요]
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

// ── "관계별 나"(SELF) 문항 — 노드 그래프 2a(docs/phase/node-graph-self.md §3.2) ──
// 그 시기에 누구와 있을 때의 나를 묻는다. 답은 Episode(kind=SELF, "그때의 나")로 대상 시기
// 사건에 저장하고, 일반 이야기 갭은 채우지 않는다(갭 판정은 STORY 만 센다). 오늘 6문항 중
// 최대 1개(Q10). 아래 3개는 구조 예시(임시).
//
// 필드(id·text·topic·followUp·order·enabled 는 위 풀 질문과 같은 뜻):
//   anchor   대상 시기(중심노드 유형, 필수). 이 유형의 확정 사건 중 순서상 첫 사건이 대상
//            (풀 질문과 같은 기준 — sequenceOrder·id 순)
//   relation 관계 대상
//            { kind: "category", label } — 일반 범주("선생님"·"친구들"·"가족"). 연결 없음
//            { kind: "linked" } — 그 사건에 연결된 실제 인물(PersonLifeEvent, 확정 인물만)·
//              인물 그룹(NodeLink, 확정 연결만)마다 1문항. 답을 저장하면 이야기 ↔ 인물·그룹
//              연결(saveNodeLink)
//   text·topic 자리표시: {elemSchool}·{elemSchool:은/는}(위와 같음) + {who} = 관계 대상
//            이름(범주면 label), {who:과/와} = 이름 + 조사(lib/interview/pool-text.ts)

export type InterviewSelfQuestion = {
  id: string;
  text: string;
  topic: string;
  anchor: LifeEventType;
  relation: { kind: "category"; label: string } | { kind: "linked" };
  followUp: boolean;
  order: number;
  enabled: boolean;
};

export const SELF_QUESTION_POOL: InterviewSelfQuestion[] = [
  {
    id: "self-high-linked",
    text: "고등학교 다니실 때, {who:과/와} 같이 있을 때는 어떤 사람이셨어요?", // [임시 — 성민 확정 필요]
    topic: "고등학교 때 {who:과/와} 있을 때의 나", // [임시 — 성민 확정 필요]
    anchor: "HIGH_SCHOOL",
    relation: { kind: "linked" },
    followUp: true,
    order: 10,
    enabled: true,
  },
  {
    id: "self-elem-teacher",
    text: "{elemSchool} 다니실 때, {who} 앞에서는 어떤 아이셨어요?", // [임시 — 성민 확정 필요]
    topic: "{elemSchool} 시절 {who} 앞의 나", // [임시 — 성민 확정 필요]
    anchor: "ELEM_SCHOOL",
    relation: { kind: "category", label: "선생님" }, // [임시 — 성민 확정 필요]
    followUp: true,
    order: 20,
    enabled: true,
  },
  {
    id: "self-firstjob-family",
    text: "첫 직장 다니실 때, 집에서 {who}한테는 어떤 사람이셨어요?", // [임시 — 성민 확정 필요]
    topic: "첫 직장 시절 {who} 곁의 나", // [임시 — 성민 확정 필요]
    anchor: "FIRST_JOB",
    relation: { kind: "category", label: "가족" }, // [임시 — 성민 확정 필요]
    followUp: true,
    order: 30,
    enabled: true,
  },
];
