// Phase L5 — 사이드 패널 데이터 prepare 헬퍼.
//
// /timemachine 과 /life-timeline 두 곳의 layout 이 같은 사이드 패널을
// 렌더하므로, 데이터 수집을 헬퍼 하나로 모은다. layout 자체는 짧아짐 +
// 데이터 로딩 한 곳에서만 관리.
//
// 새 API/모델 없음 — 기존 헬퍼 재사용.
//
// 2026-06-06: 월별 타임머신 진입로 제거(v3). currentMonthHref 필드 삭제 —
// "이번 달 타임머신" 메뉴가 사라지면서 사용처 0.

import { getAttendanceStatus } from "./attendance";
import { getFamilyNewsCount } from "./family-news";
import { getBalance } from "./tokens/wallet";

export type SidePanelDataInput = {
  userId: string;
  userName: string | null | undefined;
  userEmail: string | null | undefined;
  userImage: string | null | undefined;
};

// SidePanel 컴포넌트 SidePanelData 타입과 동일 모양으로 만들어 그대로 전달
// (의존 방향: lib → app 으로 가지 않게 두 곳에서 같은 모양의 객체를 합의).
export type SidePanelDataPrepared = {
  userName: string;
  userImage: string | null;
  balance: number;
  attendance: { todayChecked: boolean; streak: number };
  familyNewsCount: number;
};

export async function loadSidePanelData(
  input: SidePanelDataInput,
): Promise<SidePanelDataPrepared> {
  const [balance, attendance, familyNews] = await Promise.all([
    getBalance(input.userId),
    getAttendanceStatus(input.userId),
    getFamilyNewsCount(input.userId),
  ]);

  return {
    userName: input.userName ?? input.userEmail ?? "회원",
    userImage: input.userImage ?? null,
    balance,
    attendance: {
      todayChecked: attendance.todayChecked,
      streak: attendance.streak,
    },
    familyNewsCount: familyNews.total,
  };
}
