// 코치마크 온보딩 둘러보기 — 단계 정의 (순수 데이터, 클라/서버 공용).
//
// CoachMarks 엔진이 이 배열을 받아 한 단계씩 spotlight + 말풍선으로 안내한다.
// 새 화면(포스터 등)에 투어를 붙일 땐 여기에 STEPS 배열만 하나 더 정의하고
// 그 화면에서 data-tour 속성을 달면 끝 — 엔진은 무수정 재사용.
//
// prisma 의존 없음 → 클라이언트 컴포넌트(CoachMarks)에서 바로 import 가능.

export type CoachStep = {
  // 가리킬 요소의 data-tour 속성 값. 화면에서 [data-tour="..."] 로 찾는다.
  // 없으면 엔진이 그 단계를 건너뛴다(상태별로 안 보이는 버튼 대비).
  target: string;
  title: string;
  desc: string;
  // 이 단계를 보이기 전 사이드 패널 상태. 콘텐츠 버튼은 "closed"(패널이
  // 가리지 않게), 패널 안 메뉴는 "open". 생략 시 현재 상태 유지.
  panel?: "open" | "closed";
};

// 투어 식별자 — User.completedTours 에 저장되는 값. 재실행 쿼리(?tour=)와도 일치.
export const MAIN_TOUR_ID = "main";

// 메인(/life-timeline) 둘러보기 — 어르신이 헷갈리는 핵심 5가지.
// 큰 글씨·쉬운 말·한 번에 하나만(정보 과부하 X).
//
// 순서: 본문 버튼(패널 닫힘) 2개로 가볍게 시작 → 핵심인 "이야기 나누기"를
// ③에 앞당김 → 패널 단계(③④)를 묶어 패널 여닫이를 최소화 → 마지막에
// 포스터로 마무리("시작하기"). companion 이 핵심이라 가급적 앞쪽.
export const MAIN_TOUR_STEPS: CoachStep[] = [
  {
    target: "assistant",
    panel: "closed",
    title: "AI 비서에게 물어보기",
    desc: "그 시절 큰 사건이나 사용법이 궁금할 때, 여기서 가볍게 물어보세요.",
  },
  {
    target: "add-event",
    panel: "closed",
    title: "한 장면 추가하기",
    desc: "기억하고 싶은 순간을 직접 적어 인생 연혁에 더할 수 있어요.",
  },
  {
    target: "companion",
    panel: "open",
    title: "이야기 나누기",
    desc: "AI와 도란도란 대화하며 인생 이야기를 들려주세요. 가장 쉽고 편한 방법이에요.",
  },
  {
    target: "tokens",
    panel: "open",
    title: "내 토큰",
    desc: "AI 기능을 쓸 때 토큰이 조금씩 들어요. 매일 출석하면 무료로 드리고, 이 패널에서 충전도 할 수 있어요.",
  },
  {
    target: "poster",
    panel: "closed",
    title: "인생 포스터 만들기",
    desc: "이야기가 쌓이면 멋진 포스터로 만들어 간직하거나 선물할 수 있어요.",
  },
];

// CoachMarks 가 사이드 패널을 열고 닫을 때 쓰는 커스텀 이벤트 이름.
// SidePanelLayout 이 이 이벤트를 듣고 open 상태를 맞춘다(투어 전용, 사용자
// localStorage 선호는 건드리지 않음).
export const SIDE_PANEL_EVENT = "lifebook:sidepanel";
