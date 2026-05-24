// Phase T2 검증 — getMonthScreen 으로 2026-05 와 2025-08 두 달 출력.
// 확인 포인트:
//   - 4섹션(POLITICS_SOCIETY / CULTURE / SPORTS / TREND) 에 사건이 보임
//   - 해외음악(INTERNATIONAL) 매월 3곡 이상
//   - 2026-05 국내음악은 비어있음 (멜론 월간 차트 미집계, 화면 로직에서 4월 폴백)
//
// 실행: npx tsx db/test-timemachine-screen.ts

import "dotenv/config";
import { getMonthScreen } from "../lib/timemachine";
import { prisma } from "../lib/db";

type EventRow = {
  section: string;
  tag: string | null;
  isPeriod: boolean;
  title: string;
};

type SongRow = {
  rank: number | null;
  title: string;
  artist: string;
  isPeriod: boolean;
};

function bySection(events: EventRow[]) {
  const map = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = map.get(e.section) ?? [];
    list.push(e);
    map.set(e.section, list);
  }
  return map;
}

function renderMonth(year: number, month: number, data: {
  events: EventRow[];
  domesticSongs: SongRow[];
  internationalSongs: SongRow[];
}) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  ${year}년 ${month}월`);
  console.log("=".repeat(60));

  console.log(`\n사건 ${data.events.length}건`);
  const sectioned = bySection(data.events);
  const SECTIONS = ["POLITICS_SOCIETY", "CULTURE", "SPORTS", "TREND"];
  for (const section of SECTIONS) {
    const rows = sectioned.get(section) ?? [];
    console.log(`  [${section}] ${rows.length}건`);
    for (const r of rows) {
      const period = r.isPeriod ? " (기간)" : "";
      const tag = r.tag ? ` #${r.tag}` : "";
      console.log(`    - ${r.title}${tag}${period}`);
    }
  }

  console.log(`\n국내음악 ${data.domesticSongs.length}곡`);
  for (const s of data.domesticSongs) {
    const rank = s.rank !== null ? `${s.rank}위` : "-";
    console.log(`  ${rank} ${s.title} — ${s.artist}`);
  }

  console.log(`\n해외음악 ${data.internationalSongs.length}곡`);
  for (const s of data.internationalSongs) {
    const period = s.isPeriod ? " (기간)" : "";
    console.log(`  - ${s.title} — ${s.artist}${period}`);
  }
}

async function main() {
  const may2026 = await getMonthScreen(2026, 5);
  renderMonth(2026, 5, may2026);

  const aug2025 = await getMonthScreen(2025, 8);
  renderMonth(2025, 8, aug2025);

  console.log("\n" + "=".repeat(60));
  console.log("  체크리스트");
  console.log("=".repeat(60));
  const check = (label: string, ok: boolean) =>
    console.log(`  [${ok ? "✓" : "✗"}] ${label}`);

  check(
    "2026-05 국내음악 비어있음 (5월 차트 미집계)",
    may2026.domesticSongs.length === 0,
  );
  check(
    "2026-05 해외음악 3곡 이상",
    may2026.internationalSongs.length >= 3,
  );
  check("2026-05 4섹션에 사건 존재(합계 ≥ 4)", may2026.events.length >= 4);
  check(
    "2025-08 해외음악 3곡 이상",
    aug2025.internationalSongs.length >= 3,
  );
  check(
    "2025-08 국내음악 10곡(차트 풀)",
    aug2025.domesticSongs.length === 10,
  );
  check("2025-08 4섹션에 사건 존재(합계 ≥ 4)", aug2025.events.length >= 4);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
