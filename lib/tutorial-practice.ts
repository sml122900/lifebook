// My Life 튜토리얼 연습 판의 가짜 지도·가짜 AI(docs/phase/tutorial.md T4~T6). 순수 — DB·모델 0.
// 지도는 실제 그리기 코드(layoutMyLife · 행성·위성 컴포넌트)에 이 데이터를 넣어 그린다. 이름은 테스트 픽스처·재생 세트·실제 대화와
// 무관한 소재(작업 규칙 8 취지 — 회귀 test-my-life ⑯ 이 픽스처 낱말과 겹치지 않는지 본다). 문구는 lib/my-life-copy tutorial [임시].

import type { MapEditApplyResult } from "./map-edit";
import { planLine, type MapPlanItem } from "./map-edit-plan";
import type { MyLifeData } from "./my-life";
import { MY_LIFE_COPY } from "./my-life-copy";

const T = MY_LIFE_COPY.tutorial;

export const PRACTICE = { eventId: "tut-ev", storyId: "tut-st", person: "tut-pe-1", place: "tut-pl-1", candidate: "tut-pe-2" } as const;
export const PRACTICE_STORY_KEY = `st:${PRACTICE.eventId}:${PRACTICE.storyId}`;

// added = ② 에서 넣은 사람이 위성으로 들어갔는지 · title = ③ 고치기 예시로 바뀐 제목
export function practiceData(opts: { added: boolean; title: string }): MyLifeData {
  const chips = [
    { kind: "person" as const, id: PRACTICE.person, name: T.fakePerson },
    { kind: "place" as const, id: PRACTICE.place, name: T.fakePlace },
    ...(opts.added ? [{ kind: "person" as const, id: PRACTICE.candidate, name: T.fakeCandidate }] : []),
  ];
  return {
    events: [
      {
        id: PRACTICE.eventId,
        type: "CUSTOM",
        label: T.fakeEvent,
        year: null,
        endYear: null,
        decor: null,
        personIds: [],
        placeIds: [],
        groupIds: [],
        stories: [
          {
            id: PRACTICE.storyId,
            kind: "STORY",
            title: opts.title,
            content: "",
            primaryEventId: PRACTICE.eventId,
            otherEventIds: [],
            subjectPersonId: null,
            chips,
            richBody: false,
            bodyVersion: 0,
            decor: null,
          },
        ],
      },
    ],
    people: [
      { id: PRACTICE.person, name: T.fakePerson, relation: T.fakePersonRel, metYear: null, groupIds: [], body: "", birthYear: null, memo: null },
      { id: PRACTICE.candidate, name: T.fakeCandidate, relation: T.fakeCandidateRel, metYear: null, groupIds: [], body: "", birthYear: null, memo: null },
    ],
    groups: [],
    places: [{ id: PRACTICE.place, name: T.fakePlace, address: null, source: null, lat: null, lng: null, groupIds: [] }],
    placeGroups: [],
  };
}

// ③ 물어보기 예시의 답(실제 AI 시트 답 카드와 같은 모양)
export const practiceClaims = () => [
  { text: T.askA, nodes: [{ key: `pe:${PRACTICE.person}`, eventId: null, kind: "person" as const, title: T.fakePerson }] },
];

// ③ 지도 고치기 예시 — 이야기 이름 바꾸기 계획(실제 확인 카드·결과 카드와 같은 모양·같은 문장 함수)
export const practiceRename = (): MapPlanItem => ({
  tool: "rename_node",
  node: { ref: { type: "EPISODE", id: PRACTICE.storyId }, name: T.fakeStory, kind: "이야기", key: PRACTICE_STORY_KEY, eventId: PRACTICE.eventId },
  newName: T.fakeStoryRenamed,
});

export const practiceResult = (): Extract<MapEditApplyResult, { ok: true }> => {
  const item = practiceRename();
  return {
    ok: true,
    commandId: "practice",
    done: [{ line: planLine(item, "did"), key: null, eventId: null }],
    failed: null,
    undo: [{ t: "rename", node: { type: "EPISODE", id: PRACTICE.storyId }, prev: T.fakeStory }],
  };
};
