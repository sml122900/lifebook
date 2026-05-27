// Phase A — 매일 출석체크 + 연속 보너스.
//
// 정책:
//   - 매일 5토큰 (DAILY_CREDIT)  → ledger reason="daily_attendance"
//   - 7의 배수 streak (7, 14, 21...) 마다 +30토큰 (BONUS_CREDIT)
//     → ledger reason="attendance_streak_bonus"
//   - 어제 출석 없으면 streak=1 로 리셋 (비난·압박 표현 X)
//
// 날짜 기준: **KST**. UTC+9 시간을 더한 뒤 "YYYY-MM-DD" 문자열로 비교.
// 서버 시간이 어디든 일관 동작. timezone 라이브러리 의존 X — 작은 함수
// 두 개로 충분.
//
// race-safe: @@unique([userId, date]) 가 단일 결정자.
//   - 트랜잭션 안에서: (1) UserAttendance.create (2) wallet += credit
//     (3) TokenTransaction 기록.
//   - 동시 두 요청이 들어와도 하나만 create 성공, 나머지는 P2002 →
//     "이미 출석" 분기로 친화적 반환.
//
// 시간 인자 (now) 를 받는 이유: 검증 스크립트에서 어제·내일 등 다른
// 날짜로 호출해 streak·보너스 로직을 결정적으로 테스트하기 위함.
// 운영 코드는 default(new Date()) 사용.

import { prisma } from "./db";
import {
  BONUS_CREDIT,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
  type AttendanceStatus,
  type CheckInResult,
} from "./attendance-policy";

export {
  BONUS_CREDIT,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
};
export type { AttendanceStatus, CheckInResult };

const REASON_DAILY = "daily_attendance";
const REASON_BONUS = "attendance_streak_bonus";

function addUTCDays(d: Date, days: number): Date {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/** UTC 시각을 KST 로 변환해 "YYYY-MM-DD" 문자열로. */
export function kstDateString(d: Date = new Date()): string {
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function kstYesterdayString(d: Date = new Date()): string {
  return kstDateString(addUTCDays(d, -1));
}

function daysUntilNextBonusFromStreak(streak: number): number {
  if (streak <= 0) return BONUS_EVERY_DAYS;
  const mod = streak % BONUS_EVERY_DAYS;
  // 7 배수면 방금 보너스 받음 → 다음까지 7일.
  return mod === 0 ? BONUS_EVERY_DAYS : BONUS_EVERY_DAYS - mod;
}

export async function processAttendance(
  userId: string,
  now: Date = new Date(),
): Promise<CheckInResult> {
  const today = kstDateString(now);
  const yesterday = kstYesterdayString(now);

  // 어제 행 조회 — 단순 read. race 발생해도 아래 P2002 가 최종 결정.
  const yest = await prisma.userAttendance.findUnique({
    where: { userId_date: { userId, date: yesterday } },
    select: { streak: true },
  });
  const newStreak = yest ? yest.streak + 1 : 1;
  const bonusEarned =
    newStreak % BONUS_EVERY_DAYS === 0 ? BONUS_CREDIT : 0;
  const totalCredit = DAILY_CREDIT + bonusEarned;

  try {
    const balanceAfter = await prisma.$transaction(async (tx) => {
      // (1) 출석 행 생성 — unique 위반 시 P2002.
      await tx.userAttendance.create({
        data: {
          userId,
          date: today,
          streak: newStreak,
          bonusToken: bonusEarned,
        },
      });
      // (2) wallet 적립 (조건부 X — credit 은 음수가 될 수 없음).
      const walletUpd = await tx.$queryRaw<{ balance: number }[]>`
        UPDATE "TokenWallet"
        SET balance = balance + ${totalCredit}, "updatedAt" = NOW()
        WHERE "userId" = ${userId}
        RETURNING balance
      `;
      if (walletUpd.length === 0) {
        // wallet 없음 — 사용자 탈퇴 race 같은 예외 케이스. throw 로
        // 트랜잭션 롤백 (attendance 행도 같이 사라짐).
        throw new Error("wallet not found");
      }
      // (3) ledger — 기본 + 보너스 각각 한 줄.
      await tx.tokenTransaction.create({
        data: { userId, delta: DAILY_CREDIT, reason: REASON_DAILY },
      });
      if (bonusEarned > 0) {
        await tx.tokenTransaction.create({
          data: { userId, delta: BONUS_CREDIT, reason: REASON_BONUS },
        });
      }
      return walletUpd[0].balance;
    });
    return {
      alreadyChecked: false,
      date: today,
      streak: newStreak,
      baseCredit: DAILY_CREDIT,
      bonusCredit: bonusEarned,
      balanceAfter,
      daysUntilNextBonus: daysUntilNextBonusFromStreak(newStreak),
    };
  } catch (e: unknown) {
    const code = (e as { code?: string }).code;
    if (code === "P2002") {
      // 이미 오늘 출석 (정상 분기). 현재 상태 조회해 친화적 반환.
      const [existing, wallet] = await Promise.all([
        prisma.userAttendance.findUnique({
          where: { userId_date: { userId, date: today } },
          select: { streak: true },
        }),
        prisma.tokenWallet.findUnique({
          where: { userId },
          select: { balance: true },
        }),
      ]);
      const s = existing?.streak ?? 0;
      return {
        alreadyChecked: true,
        date: today,
        streak: s,
        baseCredit: 0,
        bonusCredit: 0,
        balanceAfter: wallet?.balance ?? 0,
        daysUntilNextBonus: daysUntilNextBonusFromStreak(s),
      };
    }
    throw e;
  }
}

/** UI 렌더용 — 현재 출석 상태. mutating 없음. */
export async function getAttendanceStatus(
  userId: string,
  now: Date = new Date(),
): Promise<AttendanceStatus> {
  const today = kstDateString(now);
  const yesterday = kstYesterdayString(now);
  const [todayRow, yestRow] = await Promise.all([
    prisma.userAttendance.findUnique({
      where: { userId_date: { userId, date: today } },
      select: { streak: true },
    }),
    prisma.userAttendance.findUnique({
      where: { userId_date: { userId, date: yesterday } },
      select: { streak: true },
    }),
  ]);
  if (todayRow) {
    return {
      todayDate: today,
      todayChecked: true,
      streak: todayRow.streak,
      daysUntilNextBonus: daysUntilNextBonusFromStreak(todayRow.streak),
    };
  }
  // 미체크 — streak 는 어제까지의 연속 (끊겼으면 0).
  // daysUntilNextBonus 는 "오늘 출석하면 될 streak (= baseStreak+1)" 기준.
  const baseStreak = yestRow?.streak ?? 0;
  return {
    todayDate: today,
    todayChecked: false,
    streak: baseStreak,
    daysUntilNextBonus: daysUntilNextBonusFromStreak(baseStreak + 1),
  };
}
