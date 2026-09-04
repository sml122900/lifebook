// P13-4(b) — open 모드 승격 실검증. 실행: npx tsx db/test-open-promote.ts
//
// 실제 함수를 그대로 호출한다 — classifyOpenTurn/createCustomLifeEvent/
// promoteOpenTurn(lib/open-chat-promote.ts), detectGaps(lib/gap-detector.ts),
// createEpisodeBridge(lib/episode.ts), getStoryReviewData(lib/story-review.ts),
// deleteAccountTx. Sonnet 분류 API 를 3회 호출.
//
// 커버:
// 1) 인사/짧은 반응("잘 지내요") → story=false + reply 비어있지 않음.
// 2) 실질 이야기 + 나이 표현("스무 살 때…", 1950년생) → story=true, year=1970.
// 3) CUSTOM 자리 — 연도 있음(1970)은 1963 과 1985 사이, 연도 없음은 맨 뒤.
// 4) CUSTOM CONFIRMED 이벤트가 person 갭 대상이 되는지 + 에피소드 저장 후
//    episode 갭 사라지는지(hasEpisode).
// 5) /story-review 타임라인에 연도순 자리로 보이는지.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { createEpisodeBridge } from "../lib/episode";
import { detectGaps } from "../lib/gap-detector";
import { getStoryReviewData } from "../lib/story-review";
import {
  classifyOpenTurn,
  createCustomLifeEvent,
  promoteOpenTurn,
} from "../lib/open-chat-promote";

function fail(msg: string): never {
  throw new Error(`FAILED — ${msg}`);
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "open-promote-test-" } } });
}

async function main() {
  await cleanup();
  console.log("=== P13-4(b) open 모드 승격 검증 ===");

  const user = await prisma.user.create({
    data: { email: "open-promote-test-a@test", name: "op", birthYear: 1950 },
  });
  await prisma.onboardingProfile.create({
    data: { userId: user.id, birthYear: 1950, region: "대구", skeletonGeneratedAt: new Date() },
  });
  const skeleton = [
    ["BIRTH", "출생", 1950],
    ["MIDDLE_SCHOOL", "중학교 입학", 1963],
    ["MARRIAGE", "결혼", 1985],
  ] as const;
  for (let i = 0; i < skeleton.length; i++) {
    await prisma.lifeEvent.create({
      data: {
        userId: user.id, type: skeleton[i][0], label: skeleton[i][1], year: skeleton[i][2],
        status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder: i,
      },
    });
  }

  // --- 1) 인사 → 승격 안 함
  const greet = await classifyOpenTurn("잘 지내요. 고마워요.", 1950);
  console.log("greeting:", greet);
  if (greet.story !== false || !greet.reply.trim()) fail("greeting should not promote");

  // --- 2) 실질 이야기 + 나이 표현 → 승격, 연도 계산
  const story = await promoteOpenTurn(user.id, "스무 살 때 서울로 올라와서 봉제 공장에서 일했어요. 고생 많이 했지요.");
  console.log("story:", story);
  if (story.kind !== "promoted") fail("story should promote");
  if (story.year !== 1970) fail(`expected year 1970, got ${story.year}`);

  // --- 3) 자리 — 1970 은 1963(중학교) 과 1985(결혼) 사이
  const nullYear = await createCustomLifeEvent(user.id, "시기 모르는 이야기", null);
  const ordered = await prisma.lifeEvent.findMany({
    where: { userId: user.id },
    orderBy: { sequenceOrder: "asc" },
    select: { label: true, year: true, sequenceOrder: true, type: true },
  });
  console.log("ordered:", ordered.map((e) => `${e.sequenceOrder}:${e.label}(${e.year})`).join(" > "));
  const labels = ordered.map((e) => e.label);
  if (labels.indexOf(story.label) !== 2 || labels[3] !== "결혼" || labels[4] !== "시기 모르는 이야기") {
    fail("CUSTOM ordering wrong");
  }
  const orders = ordered.map((e) => e.sequenceOrder);
  if (new Set(orders).size !== orders.length) fail("sequenceOrder collision");

  // --- 4) 갭 — CUSTOM 도 person/episode 갭 대상
  const gapsBefore = await detectGaps(user.id);
  const hasPersonGap = gapsBefore.some((g) => g.type === "person" && g.targetEventId === story.eventId);
  const hasEpisodeGap = gapsBefore.some((g) => g.type === "episode" && g.targetEventId === story.eventId);
  console.log("CUSTOM person gap (expect true):", hasPersonGap, "/ episode gap (expect true):", hasEpisodeGap);
  if (!hasPersonGap || !hasEpisodeGap) fail("CUSTOM should be gap target");

  const bridge = await createEpisodeBridge(
    user.id, story.eventId, story.label, story.year,
    "스무 살에 서울로 올라와 봉제 공장에서 일했다.",
    "[동반자] 하고 싶은 이야기 있으세요?\n[본인] 스무 살 때 서울로 올라와서 봉제 공장에서 일했어요.",
  );
  if (!bridge) fail("createEpisodeBridge on CUSTOM failed");
  const gapsAfter = await detectGaps(user.id);
  const episodeGapAfter = gapsAfter.some((g) => g.type === "episode" && g.targetEventId === story.eventId);
  console.log("episode gap cleared after save (expect false):", episodeGapAfter);
  if (episodeGapAfter) fail("episode gap should clear");

  // --- 5) story-review 타임라인
  const review = await getStoryReviewData(user.id);
  console.log("timeline:", review.timeline.map((t) => `${t.year ?? "?"} ${t.label}${t.hasEpisode ? "*" : ""}`).join(" | "));
  if (review.timeline[2]?.id !== story.eventId || review.timeline[4]?.id !== nullYear.id) {
    fail("story-review timeline order wrong");
  }

  await deleteAccountTx(user.id);
  const after = await prisma.user.findUnique({ where: { id: user.id } });
  if (after !== null) fail("user not deleted");
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
