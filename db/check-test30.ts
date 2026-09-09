// 읽기 전용 — test30 계정 "군 입대(1978)" period 갭 조사 (P17 후속).
import "dotenv/config";

import { prisma } from "../lib/db";

async function main() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { contains: "test30", mode: "insensitive" } },
        { name: { contains: "test30", mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true, name: true, onboardingTrack: true },
  });
  console.log("matched users:", users);

  for (const u of users) {
    console.log("\n=== user", u.id, u.email, u.name, "===");
    const events = await prisma.lifeEvent.findMany({
      where: { userId: u.id },
      orderBy: { sequenceOrder: "asc" },
      select: {
        id: true,
        type: true,
        label: true,
        year: true,
        correctedYear: true,
        correctedLabel: true,
        status: true,
        sequenceOrder: true,
        confirmedAt: true,
        episodes: {
          select: { id: true, isPeriod: true, content: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    for (const e of events) {
      console.log(
        `- [${e.sequenceOrder}] ${e.type} "${e.label}" year=${e.year} correctedYear=${e.correctedYear} status=${e.status}`,
      );
      for (const ep of e.episodes) {
        console.log(
          `    episode ${ep.id} isPeriod=${ep.isPeriod} createdAt=${ep.createdAt.toISOString()} content="${(ep.content ?? "").slice(0, 80)}"`,
        );
      }
    }

    const pending = await prisma.chatV3PendingContext.findUnique({
      where: { userId: u.id },
    });
    console.log("pending context row:", pending);

    const msgCount = await prisma.onboardingChatMessage.count({ where: { userId: u.id } });
    const lastMsgs = await prisma.onboardingChatMessage.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { role: true, content: true, createdAt: true },
    });
    console.log("chat message count:", msgCount);
    console.log("last 10 messages (most recent first):");
    for (const m of lastMsgs) {
      console.log(`  [${m.createdAt.toISOString()}] ${m.role}: ${m.content.slice(0, 100)}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
