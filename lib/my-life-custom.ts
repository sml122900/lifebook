// My Life 사용자 카테고리 화면 데이터 모양(custom-graph 2단계) — 순수(클라이언트도 씀 — lib/my-life 는 prisma 라 클라이언트가 못 부름).

// ── 사용자 카테고리(custom-graph 2단계 — docs/phase/custom-graph.md §2.3·§3) ─────────────────────────
// 모든 노드 = 자리 하나 + 넣기 연결(NodeLink role MEMBER — 바로가기) 여러 곳. 6종의 자리는 지금 영역, 사용자 묶음·항목의 자리는
// 자기 카테고리(parentId). 관련 연결(role "") = 사용자 항목 ↔ 시기·이야기·사람·장소·다른 항목.
export type MyLifeRefType = "LIFE_EVENT" | "EPISODE" | "PERSON" | "PERSON_GROUP" | "PLACE" | "PLACE_GROUP" | "CUSTOM";
export type MyLifeRef = { type: MyLifeRefType; id: string };
export type MyLifeCustomItem = { id: string; name: string; categoryId: string; body: string; related: MyLifeRef[] };
export type MyLifeCustomGroup = { id: string; name: string; categoryId: string; memberRefs: MyLifeRef[] };
// refs = 카테고리에 바로 넣은 것(6종·다른 카테고리의 항목·묶음). 묶음에 넣은 것은 그 묶음의 memberRefs.
export type MyLifeCategory = { id: string; name: string; refs: MyLifeRef[] };
export type MyLifeCustom = {
  categories: MyLifeCategory[];
  groups: MyLifeCustomGroup[];
  items: MyLifeCustomItem[];
  builtinNames: { PEOPLE: string | null; PLACES: string | null }; // 인물록·장소록 표시 이름(행 없음 = null → 기본 이름)
};
export const EMPTY_CUSTOM: MyLifeCustom = { categories: [], groups: [], items: [], builtinNames: { PEOPLE: null, PLACES: null } };
export const customOf = (d: { custom?: MyLifeCustom }): MyLifeCustom => d.custom ?? EMPTY_CUSTOM;
