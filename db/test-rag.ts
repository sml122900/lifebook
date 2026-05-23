// Phase 6.6 — eyeball test for getMusicTriggersForUser.
//
// Runs two contrasting personas through the retriever so the generation
// filter (reminiscence bump) is visible: a 1965-born senior listener and
// a 1995-born K-pop listener should land on very different decades
// despite the same catalog.
//
// Run with: npx tsx db/test-rag.ts

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
    const results = await getMusicTriggersForUser(profile, null, 10);
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
