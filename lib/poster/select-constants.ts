// P2 — 포스터 선택 공용 상수/타입 (순수 모듈, prisma·"use server" 무관).
//
// "use server"(app/poster/select/actions.ts)는 async 함수만 export 할 수 있어
// 값(MAX_MEMO_ITEMS)을 거기서 export 하면 빌드가 깨진다. 클라이언트가 쓰는
// 값·타입은 여기 순수 모듈에 두고 서버/클라 양쪽이 import 한다.
// (lib/era-constants.ts·lib/place-types.ts 와 같은 패턴.)

// 메모는 포스터 좌우 컬럼 슬롯(좌10+우10=20)이라 상한이 있다. 노드는 강을
// 따라 linspace 배치라 개수 유연(별도 상한 없음).
export const MAX_MEMO_ITEMS = 20;

export type PosterSelectionItem = {
  eventId: string;
  type: "node" | "memo";
  order: number;
};

// v3 브릿지 행 안내 문구 — 서버 가드(lib/poster/selections.ts)와 선택 화면이 같은 문구를 쓴다.
export const BODILESS_MEMO_MESSAGE =
  "들려주신 이야기가 아직 없는 사건은 큰 사건(노드)으로만 담을 수 있어요.";
export const BRIDGE_EDIT_BLOCKED_MESSAGE =
  "대화로 들려주신 이야기라 여기서는 고칠 수 없어요. 원본 채팅에서 고쳐주세요.";
