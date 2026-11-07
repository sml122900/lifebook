// My Life 튜토리얼(docs/phase/tutorial.md — T1~T8 2026-11-08 확정). 순수 — 흐름·저장 id·다시 보기 신호. 화면 = app/my-life/Tutorial.tsx.
// 저장은 User.completedTours(마이그 0) — 끝까지 봄 · 건너뜀 · 나중에 · AI 시트 첫 안내를 다른 id 로(T8 — 효과를 셀 때 가름).

export const TUTORIAL_DONE = "my-life"; // 끝까지 봄
export const TUTORIAL_SKIP = "my-life-skip"; // [건너뛰기]·Esc
export const TUTORIAL_LATER = "my-life-later"; // 첫 카드 [나중에]
export const ASK_HINT = "my-life-ask-hint"; // AI 시트를 처음 열 때 한 줄 안내(T2)
export const TUTORIAL_EVENT = "lifebook:mylife-tutorial"; // 같은 화면에서 다시 보기([찾기] 시트·사이드 패널)
export const TUTORIAL_QUERY = "tutorial"; // 다른 화면에서 다시 보기 = /my-life?tutorial=1
export const TUTORIAL_HREF = "/my-life?tutorial=1";
export const DRAG_FAILS_FOR_BUTTON = 2; // 끌기를 두 번 못 하면 [버튼으로 넣기](T5)

// 첫 진입 카드(T1) — 마침·건너뜀·나중에 기록이 하나도 없을 때만.
export function shouldOffer(completed: readonly string[]): boolean {
  return ![TUTORIAL_DONE, TUTORIAL_SKIP, TUTORIAL_LATER].some((id) => completed.includes(id));
}

export type TutorialStep = "read" | "drag" | "ai" | "end";
export const TUTORIAL_STEPS: readonly TutorialStep[] = ["read", "drag", "ai", "end"];
export const TUTORIAL_STEP_COUNT = 3; // 진행 표시(끝 카드는 세지 않음)

export type TutorialState = {
  step: TutorialStep;
  opened: boolean; // ① 이야기를 눌러 펼쳐 봤음
  dragFails: number; // ② 끌기 실패 수(튕김·짧게 누름)
  dropped: boolean; // ② 넣음(끌기 또는 버튼)
  askShown: boolean; // ③ 물어보기 예시를 봤음
  edit: "idle" | "plan" | "done" | "undone"; // ③ 지도 고치기 예시 — 확인 카드 → 결과 카드 → 되돌림
};

export type TutorialEvent =
  | { t: "next" }
  | { t: "openPlanet" }
  | { t: "dropFail" }
  | { t: "dropped" }
  | { t: "ask" }
  | { t: "editPlan" }
  | { t: "editCancel" }
  | { t: "editApply" }
  | { t: "editUndo" };

export const initialTutorial = (): TutorialState => ({ step: "read", opened: false, dragFails: 0, dropped: false, askShown: false, edit: "idle" });

// 단계 체험은 해 보지 않아도 [다음]으로 넘어갈 수 있다(강제 아님).
export function tutorialReducer(s: TutorialState, e: TutorialEvent): TutorialState {
  switch (e.t) {
    case "next": {
      const i = TUTORIAL_STEPS.indexOf(s.step);
      return i < TUTORIAL_STEPS.length - 1 ? { ...s, step: TUTORIAL_STEPS[i + 1] } : s;
    }
    case "openPlanet":
      return { ...s, opened: true };
    case "dropFail":
      return s.dropped ? s : { ...s, dragFails: s.dragFails + 1 };
    case "dropped":
      return { ...s, dropped: true };
    case "ask":
      return { ...s, askShown: true };
    case "editPlan":
      return { ...s, edit: "plan" };
    case "editCancel":
      return { ...s, edit: "idle" };
    case "editApply":
      return s.edit === "plan" ? { ...s, edit: "done" } : s;
    case "editUndo":
      return s.edit === "done" ? { ...s, edit: "undone" } : s;
  }
}

// [버튼으로 넣기] — 끌기를 DRAG_FAILS_FOR_BUTTON 번 못 했고 아직 안 넣었을 때.
export const showButtonAdd = (s: TutorialState) => s.step === "drag" && !s.dropped && s.dragFails >= DRAG_FAILS_FOR_BUTTON;

// 연습을 닫을 때 남길 id — 끝 카드 [끝내기] = 마침, 그 밖(건너뛰기·Esc·도중에 닫음) = 건너뜀.
export const closeTourId = (how: "finish" | "skip") => (how === "finish" ? TUTORIAL_DONE : TUTORIAL_SKIP);
