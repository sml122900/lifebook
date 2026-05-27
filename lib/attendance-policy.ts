// Phase A — 출석체크 정책 상수/타입. 클라이언트 컴포넌트에서도
// import 가능하도록 prisma 의존 없는 별도 파일.
//
// lib/attendance.ts 는 이 모듈을 re-export 하므로 서버 코드는 기존처럼
// `import { DAILY_CREDIT } from "./attendance"` 가능.

export const DAILY_CREDIT = 5;
export const BONUS_CREDIT = 30;
export const BONUS_EVERY_DAYS = 7;

export type CheckInResult = {
  alreadyChecked: boolean;
  date: string;
  streak: number;
  baseCredit: number;
  bonusCredit: number;
  balanceAfter: number;
  daysUntilNextBonus: number;
};

export type AttendanceStatus = {
  todayDate: string;
  todayChecked: boolean;
  streak: number;
  daysUntilNextBonus: number;
};

// UI 표시용 — streak 으로 사이클 내 위치(1~7) 계산.
//   streak=0 → 0 (아직 시작 안 함)
//   streak=1 → 1, streak=6 → 6, streak=7 → 7 (7개 다 채움 + 보너스 받은 날)
//   streak=8 → 1 (새 사이클 시작), streak=14 → 7, ...
export function attendanceCyclePosition(streak: number): number {
  if (streak <= 0) return 0;
  const mod = streak % BONUS_EVERY_DAYS;
  return mod === 0 ? BONUS_EVERY_DAYS : mod;
}

// UI 표시용 — 이번 사이클에서 누적된 토큰 (매일 + 보너스).
//   사이클 1일째 = 5, 6일째 = 30, 7일째 = 35 + 30 = 65, 새 사이클 1일째 = 5.
export function attendanceCycleEarnedTokens(streak: number): number {
  const pos = attendanceCyclePosition(streak);
  if (pos === 0) return 0;
  const bonus = pos === BONUS_EVERY_DAYS ? BONUS_CREDIT : 0;
  return pos * DAILY_CREDIT + bonus;
}
