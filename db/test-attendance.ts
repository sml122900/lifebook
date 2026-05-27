// Phase A 검증 — 출석체크.
//
// 시나리오:
//   (a) 같은 날 두 번 클릭 → 두 번째는 alreadyChecked, wallet 무변동
//   (b) 7일 연속 → streak 1→2→...→7, wallet 5*7+30=65 (last day 보너스)
//   (c) 7일째 +30 보너스 정확히 지급, ledger 에 2건
//   (d) 동시 요청 (Promise.all 2번) → 한 번만 credit
//   (e) 거른 다음 날 → streak=1 리셋
//   (f) 14일째 또 보너스 (계속 누적 정책)
//   (g) 기존 토큰 기능 (chargeOneShot 정상 동작) — daily_attendance/streak_bonus
//       reason 이 기존 reason 과 충돌 없는지
//
// 시간은 processAttendance(userId, now) 의 now 인자로 결정적 주입.

import "dotenv/config";
import { prisma } from "../lib/db";
import {
  BONUS_CREDIT,
  BONUS_EVERY_DAYS,
  DAILY_CREDIT,
  getAttendanceStatus,
  processAttendance,
  kstDateString,
} from "../lib/attendance";
import { chargeOneShot } from "../lib/tokens/charge";

const DIVIDER = "─".repeat(64);

function check(label: string, ok: boolean) {
  console.log(`  [${ok ? "✓" : "✗"}] ${label}`);
}

async function balance(userId: string): Promise<number> {
  const w = await prisma.tokenWallet.findUnique({
    where: { userId },
    select: { balance: true },
  });
  return w?.balance ?? 0;
}

// 12:00 KST = 03:00 UTC. 자정 경계 헷갈림 방지 위해 정오 사용.
function kstNoonOfDay(yyyymmdd: string): Date {
  // yyyymmdd 는 KST. 그 날 KST 정오 = UTC 03:00 of same day.
  return new Date(`${yyyymmdd}T03:00:00.000Z`);
}

async function main() {
  const user = await prisma.user.create({
    data: { email: `attend-${Date.now()}@test`, name: "attend-test" },
  });
  await prisma.tokenWallet.create({
    data: { userId: user.id, balance: 100 },
  });

  try {
    // ────────────────────────────────────────────────────────────
    // (a) 같은 날 두 번 클릭
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[a] 같은 날 두 번 클릭\n${DIVIDER}`);
    const day1 = kstNoonOfDay("2026-06-01");
    const bal0 = await balance(user.id);
    const r1 = await processAttendance(user.id, day1);
    const bal1 = await balance(user.id);
    const r2 = await processAttendance(user.id, day1);
    const bal2 = await balance(user.id);

    console.log(`r1: ${JSON.stringify(r1)}`);
    console.log(`r2: ${JSON.stringify(r2)}`);
    check("r1 첫 체크 (alreadyChecked=false)", r1.alreadyChecked === false);
    check("r1 streak=1", r1.streak === 1);
    check("r1 baseCredit=5", r1.baseCredit === DAILY_CREDIT);
    check("r1 bonusCredit=0", r1.bonusCredit === 0);
    check("r1 후 wallet +5", bal1 === bal0 + DAILY_CREDIT);
    check("r2 두 번째 alreadyChecked=true", r2.alreadyChecked === true);
    check("r2 baseCredit=0 bonusCredit=0", r2.baseCredit === 0 && r2.bonusCredit === 0);
    check("r2 후 wallet 변동 없음", bal2 === bal1);

    // ────────────────────────────────────────────────────────────
    // (b) (c) 7일 연속 + 7일째 보너스
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[b][c] 7일 연속 + 7일째 +30 보너스\n${DIVIDER}`);
    // day1 이미 처리. 2~7일 추가.
    const balBefore7 = await balance(user.id);
    for (let i = 2; i <= 7; i++) {
      const day = new Date(day1.getTime() + (i - 1) * 24 * 60 * 60 * 1000);
      const r = await processAttendance(user.id, day);
      const expectBonus = i === BONUS_EVERY_DAYS ? BONUS_CREDIT : 0;
      check(
        `day ${i}: streak=${i}`,
        r.streak === i,
      );
      check(
        `day ${i}: bonusCredit=${expectBonus}`,
        r.bonusCredit === expectBonus,
      );
    }
    const balAfter7 = await balance(user.id);
    const expectedGain = DAILY_CREDIT * 6 + BONUS_CREDIT; // day2~7
    check(
      `wallet +${expectedGain} (5*6+30=60)`,
      balAfter7 - balBefore7 === expectedGain,
    );
    check(
      `총 7일 동안 wallet +${DAILY_CREDIT * 7 + BONUS_CREDIT} (5*7+30=65)`,
      balAfter7 - bal0 === DAILY_CREDIT * 7 + BONUS_CREDIT,
    );

    // ledger 확인 — daily_attendance 7건 + streak_bonus 1건
    const ledger = await prisma.tokenTransaction.findMany({
      where: { userId: user.id, reason: { in: ["daily_attendance", "attendance_streak_bonus"] } },
      select: { reason: true, delta: true },
    });
    const dailyCount = ledger.filter((l) => l.reason === "daily_attendance").length;
    const bonusCount = ledger.filter((l) => l.reason === "attendance_streak_bonus").length;
    check(`ledger daily_attendance ${dailyCount}건 (=7)`, dailyCount === 7);
    check(`ledger attendance_streak_bonus ${bonusCount}건 (=1)`, bonusCount === 1);

    // ────────────────────────────────────────────────────────────
    // (e) 거른 다음 날 → streak=1 리셋
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[e] 8일 건너뛰고 9일 출석 → streak=1\n${DIVIDER}`);
    // day7 까지 출석. day8 거름. day9 = day1 + 8.
    const day9 = new Date(day1.getTime() + 8 * 24 * 60 * 60 * 1000);
    const r9 = await processAttendance(user.id, day9);
    console.log(`r9: ${JSON.stringify(r9)}`);
    check("거른 후 streak=1 리셋", r9.streak === 1);
    check("거른 후 보너스 없음", r9.bonusCredit === 0);
    check("거른 후 baseCredit=5", r9.baseCredit === DAILY_CREDIT);

    // ────────────────────────────────────────────────────────────
    // (f) 계속 누적 — day9 부터 다시 7일 후 (day15) 또 보너스
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[f] day9~15 연속 → day15(streak=7) 보너스\n${DIVIDER}`);
    for (let i = 1; i <= 6; i++) {
      const day = new Date(day9.getTime() + i * 24 * 60 * 60 * 1000);
      const r = await processAttendance(user.id, day);
      const newStreak = 1 + i;
      check(
        `day9+${i}: streak=${newStreak}`,
        r.streak === newStreak,
      );
      if (i === 6) {
        check(
          `day9+6 (= 누적 7일): 보너스 ${BONUS_CREDIT}`,
          r.bonusCredit === BONUS_CREDIT,
        );
      }
    }

    // ────────────────────────────────────────────────────────────
    // (d) 동시 요청 → 한 번만 credit
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[d] 동시 요청 race-safe\n${DIVIDER}`);
    const dayRace = new Date(day9.getTime() + 7 * 24 * 60 * 60 * 1000); // day16
    const balRace0 = await balance(user.id);
    const [ra, rb] = await Promise.all([
      processAttendance(user.id, dayRace),
      processAttendance(user.id, dayRace),
    ]);
    const balRace1 = await balance(user.id);
    console.log(`ra: ${JSON.stringify(ra)}`);
    console.log(`rb: ${JSON.stringify(rb)}`);
    const newOnes = [ra, rb].filter((r) => !r.alreadyChecked).length;
    const alreadies = [ra, rb].filter((r) => r.alreadyChecked).length;
    check("정확히 한 번만 alreadyChecked=false", newOnes === 1);
    check("정확히 한 번만 alreadyChecked=true", alreadies === 1);
    check(`wallet 정확히 +${DAILY_CREDIT} (race 후)`, balRace1 - balRace0 === DAILY_CREDIT);
    // DB 에 dayRace 행이 정확히 1개
    const raceRows = await prisma.userAttendance.count({
      where: { userId: user.id, date: kstDateString(dayRace) },
    });
    check("DB 행 정확히 1개", raceRows === 1);

    // ────────────────────────────────────────────────────────────
    // (g) 기존 chargeOneShot 무영향
    // ────────────────────────────────────────────────────────────
    console.log(`\n${DIVIDER}\n[g] 기존 chargeOneShot 무영향\n${DIVIDER}`);
    const balG0 = await balance(user.id);
    const charge = await chargeOneShot(
      user.id,
      1000,
      500,
      "voice_cleanup",
    );
    const balG1 = await balance(user.id);
    check(
      `chargeOneShot 차감 정상 (-${charge.tokensSpent})`,
      balG1 === balG0 - charge.tokensSpent && charge.tokensSpent > 0,
    );

    // getAttendanceStatus 동작 확인
    console.log(`\n${DIVIDER}\n[status] getAttendanceStatus 동작\n${DIVIDER}`);
    const statusToday = await getAttendanceStatus(user.id, dayRace);
    check("dayRace 체크됨 → todayChecked=true", statusToday.todayChecked === true);
    const statusMiss = await getAttendanceStatus(
      user.id,
      new Date(dayRace.getTime() + 5 * 24 * 60 * 60 * 1000),
    );
    check("미체크 날 → todayChecked=false", statusMiss.todayChecked === false);
    check("미체크 + 어제 행 없음 → streak=0", statusMiss.streak === 0);

    // 최종 ledger 요약
    const finalLedger = await prisma.tokenTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { reason: true, delta: true },
    });
    console.log(`\n${DIVIDER}\n[ledger ${finalLedger.length}건]`);
    const summary: Record<string, { count: number; total: number }> = {};
    for (const t of finalLedger) {
      if (!summary[t.reason]) summary[t.reason] = { count: 0, total: 0 };
      summary[t.reason].count += 1;
      summary[t.reason].total += t.delta;
    }
    for (const [reason, s] of Object.entries(summary)) {
      console.log(`  ${reason}: ${s.count}건, 합계 ${s.total >= 0 ? "+" : ""}${s.total}`);
    }
  } finally {
    await prisma.userAttendance.deleteMany({ where: { userId: user.id } });
    await prisma.tokenTransaction.deleteMany({ where: { userId: user.id } });
    await prisma.tokenWallet.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
