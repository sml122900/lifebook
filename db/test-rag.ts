// Phase 6.6 — getMusicTriggersForUser 육안 확인 테스트.
//
// 대조되는 두 페르소나를 검색기에 돌려 세대 필터(회상 가중치)가 보이게:
// 1965년생 시니어 청취자와 1995년생 K-pop 청취자는 같은 카탈로그라도
// 아주 다른 연대에 안착해야 한다.
//
// 실행: npx tsx db/test-rag.ts

import "dotenv/config";

import { getMusicTriggersForUser, type UserMusicProfile } from "../lib/triggers";
import { prisma } from "../lib/db";

const personas: Array<{ label: string; profile: UserMusicProfile }> = [
  {
    label: "1965년생 시니어 (음악·드라마, 이문세/김광석/조용필)",
    profile: {
      birthYear: 1965,
      interests: ["음악", "드라마/예능"],
      favMusic: ["이문세", "김광석", "조용필"],
    },
  },
  {
    label: "1995년생 K-pop 리스너 (음악·게임, BTS/아이유/뉴진스)",
    profile: {
      birthYear: 1995,
      interests: ["음악", "게임"],
      favMusic: ["BTS", "아이유", "뉴진스"],
    },
  },
];

function fmt(n: number, digits = 3): string {
  return n.toFixed(digits).padStart(6, " ");
}

async function main() {
  for (const { label, profile } of personas) {
    console.log("");
    console.log("─".repeat(78));
    console.log(label);
    console.log("─".repeat(78));
    const { triggers: results } = await getMusicTriggersForUser(
      profile,
      null,
      10,
    );
    console.log(
      "  rank  year  age   dist   bump   score  title — description",
    );
    results.forEach((r, i) => {
      const rank = String(i + 1).padStart(4, " ");
      const year = String(r.year).padStart(4, " ");
      const age = String(r.ageAtYear).padStart(3, " ");
      console.log(
        `  ${rank}  ${year}  ${age}  ${fmt(r.distance)} ${fmt(r.bumpWeight, 2)}  ${fmt(r.score)}  ${r.title} — ${r.description ?? ""}`,
      );
    });
  }
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
