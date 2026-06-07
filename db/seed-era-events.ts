// 시대 사건/음악 시드 적재 — 1980~2019 (사건 88건 + 음악 73곡).
//
// 실행: npx tsx db/seed-era-events.ts
//
// 정책:
//   - 기존 seed-timemachine.ts 의 2025~2026 데이터는 절대 건드리지 않음.
//   - MonthEvent / ChartSong 모두 deterministic id (SHA-256 자연키 24자) +
//     per-row upsert. 재실행해도 중복 0 / 사용자 추억(monthEventId FK) 보존.
//   - 시드 데이터 자체는 db/seed/era-events/era-{events,music}.ts 에 격리 —
//     CSV 갱신 시 _generate.ts 재실행으로 자동 동기화.
//
// seed-timemachine.ts 와의 차이:
//   - seed-timemachine 의 ChartSong 은 deleteMany + createMany (전체 갈아엎기).
//     → 우리는 그러면 2025~2026 음악이 날아가므로 ChartSong 도 upsert.
//   - 기존 ChartSong 행은 cuid 라 id 형식이 섞이지만 String FK 라 무영향.
//     곡명/연도 차이로 충돌 0.

import "dotenv/config";
import { createHash } from "node:crypto";

import { prisma } from "../lib/db";
import type {
  ChartSongCreateManyInput,
  MonthEventCreateManyInput,
} from "../lib/generated/prisma/models";

import { eraMonthEvents } from "./seed/era-events/era-events";
import { eraChartSongs } from "./seed/era-events/era-music";

// seed-timemachine.ts 의 같은 함수와 동일한 키 규칙 — 두 시드가 다른 자연키
// 를 쓰면 같은 사건이 두 번 들어갈 위험. 함수 동일성을 코드 리뷰에서 보장.
function monthEventId(row: MonthEventCreateManyInput): string {
  const key = `${row.section}|${row.year ?? ""}|${row.month ?? ""}|${row.title}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

function chartSongId(row: ChartSongCreateManyInput): string {
  // 자연키: origin + year + month + title + artist. 같은 곡이 다른 해 차트
  // 에도 오르면 별도 행으로 인정(드물지만 OK). artist 가 갈리면 별 곡.
  const key = `${row.origin}|${row.year ?? ""}|${row.month ?? ""}|${row.title}|${row.artist ?? ""}`;
  return createHash("sha256").update(key).digest("hex").slice(0, 24);
}

async function main() {
  console.log("=== 시대 사건/음악 시드 (1980~2019) ===\n");

  // ── 적재 전 카운트 ────────────────────────────────────────────────
  const beforeMonth = await prisma.monthEvent.count();
  const beforeMonth1980 = await prisma.monthEvent.count({
    where: { year: { gte: 1980, lte: 2019 } },
  });
  const beforeMonth2025 = await prisma.monthEvent.count({
    where: { year: { gte: 2025 } },
  });
  const beforeSong = await prisma.chartSong.count();
  const beforeSong1980 = await prisma.chartSong.count({
    where: { year: { gte: 1980, lte: 2019 } },
  });
  const beforeSong2025 = await prisma.chartSong.count({
    where: { year: { gte: 2025 } },
  });

  console.log("[적재 전]");
  console.log(`  MonthEvent: 총 ${beforeMonth}건  (1980~2019: ${beforeMonth1980}, 2025+: ${beforeMonth2025})`);
  console.log(`  ChartSong:  총 ${beforeSong}건  (1980~2019: ${beforeSong1980}, 2025+: ${beforeSong2025})\n`);

  // ── MonthEvent upsert ─────────────────────────────────────────────
  let evCreated = 0;
  let evUpdated = 0;
  for (const row of eraMonthEvents) {
    const id = monthEventId(row);
    const exists = await prisma.monthEvent.findUnique({
      where: { id },
      select: { id: true },
    });
    await prisma.monthEvent.upsert({
      where: { id },
      create: { id, ...row },
      update: { ...row },
    });
    if (exists) evUpdated += 1;
    else evCreated += 1;
  }
  console.log(`MonthEvent upsert: 새로 생성 ${evCreated}건, 갱신 ${evUpdated}건 (시드 ${eraMonthEvents.length}건)`);

  // ── ChartSong upsert ──────────────────────────────────────────────
  let muCreated = 0;
  let muUpdated = 0;
  for (const row of eraChartSongs) {
    const id = chartSongId(row);
    const exists = await prisma.chartSong.findUnique({
      where: { id },
      select: { id: true },
    });
    await prisma.chartSong.upsert({
      where: { id },
      create: { id, ...row },
      update: { ...row },
    });
    if (exists) muUpdated += 1;
    else muCreated += 1;
  }
  console.log(`ChartSong  upsert: 새로 생성 ${muCreated}건, 갱신 ${muUpdated}건 (시드 ${eraChartSongs.length}건)\n`);

  // ── 적재 후 카운트 ────────────────────────────────────────────────
  const afterMonth = await prisma.monthEvent.count();
  const afterMonth1980 = await prisma.monthEvent.count({
    where: { year: { gte: 1980, lte: 2019 } },
  });
  const afterMonth2025 = await prisma.monthEvent.count({
    where: { year: { gte: 2025 } },
  });
  const afterSong = await prisma.chartSong.count();
  const afterSong1980 = await prisma.chartSong.count({
    where: { year: { gte: 1980, lte: 2019 } },
  });
  const afterSong2025 = await prisma.chartSong.count({
    where: { year: { gte: 2025 } },
  });

  console.log("[적재 후]");
  console.log(`  MonthEvent: 총 ${afterMonth}건  (1980~2019: ${afterMonth1980}, 2025+: ${afterMonth2025})`);
  console.log(`  ChartSong:  총 ${afterSong}건  (1980~2019: ${afterSong1980}, 2025+: ${afterSong2025})\n`);

  // ── 보존 검증 ─────────────────────────────────────────────────────
  const monthPreserved = afterMonth2025 === beforeMonth2025;
  const songPreserved = afterSong2025 === beforeSong2025;
  console.log("[기존 2025~2026 데이터 보존 검증]");
  console.log(`  MonthEvent 2025+: ${beforeMonth2025} → ${afterMonth2025}  ${monthPreserved ? "✓ 보존" : "✗ 변동!"}`);
  console.log(`  ChartSong  2025+: ${beforeSong2025} → ${afterSong2025}  ${songPreserved ? "✓ 보존" : "✗ 변동!"}`);

  if (!monthPreserved || !songPreserved) {
    console.error("\n  ⚠ 기존 2025+ 데이터에 변동 감지. 자연키 충돌 의심 — 즉시 확인 필요.");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
