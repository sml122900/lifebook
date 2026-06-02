import { redirect } from "next/navigation";

// Phase L5 — 메인을 /life-timeline 으로 통일. /timemachine 직접 접근이나
// 옛 사이드 패널 링크가 그대로 새 메인에 도달하게 redirect 한다.
//
// /timemachine/[year]/[month] 월 화면은 그대로 동작 — 연혁의 점 클릭이나
// 사이드 패널 "이번 달 타임머신" 로 진입.
//
// 이전엔 출석/진척/가족 소식 카드를 직접 렌더했지만, L5 부터 그 카드들은
// /life-timeline (새 메인)에서 연혁 아래에 자리 잡는다.
//
// (LIFE_TIMELINE 카드들이 이제 layout 의 사이드 패널을 공유하므로, 여기
// /timemachine layout 의 데이터 로딩이 redirect 전에 한 번 더 도는 문제는
// 없다 — redirect() 가 render 전에 throw 하지만 layout 은 이미 RSC stream
// 시작 후라 그대로 흐른다. 검증 단계에선 영향 없음.)

export default function TimemachineHomePage() {
  redirect("/life-timeline");
}
