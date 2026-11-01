// P13-4(b) 원칙 실검증 — 자유 대화에서 꺼낸 실제 이야기는 유실되지 않고 연도 순 자리의 새 시기(CUSTOM)로
// 남는다. 지금 앱 경로(/chat-v3 자유 대화 + 제안 카드, My Life 개편 2단계)로 확인한다. 실행: npx tsx db/test-open-promote.ts
//
// 옛 경로(한 턴 분류 classifyOpenTurn → 즉시 CUSTOM 생성 promoteOpenTurn)는 개편 2단계에서 삭제 — 지금은
// 응답(freeChatReply, 사용자 전역 모델)이 대화를 잇고, 제안(proposeFromSegment, Sonnet)이 새 시기를 정하며,
// [만들기](createFromFreeChatProposal)가 createCustomLifeEvent 로 자리를 잡는다.
// 실제 모델 호출: 응답 1(Haiku) + 제안 2(Sonnet — 인사 1·이야기 1).
//
// 커버:
// 1) 인사("잘 지내요. 고마워요.") → 응답은 있고, 제안 시점 아님 · 카드 없음 · 새 시기 0.
// 2) 실질 이야기 + 나이 표현("스무 살 때…", 1950년생) → 카드 시기 = 새 시기, 연도 ≈ 1970.
// 3) CUSTOM 자리 — 연도 있음은 1963(중학교) 과 1985(결혼) 사이, 연도 없음은 맨 뒤.
// 4) CUSTOM CONFIRMED 시기가 person 갭 대상 + 이야기와 함께 만들어져 episode 갭 없음(hasEpisode).
// 5) /story-review 타임라인에 연도순 자리로 보이는지.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { detectGaps } from "../lib/gap-detector";
import { getStoryReviewData } from "../lib/story-review";
import { createCustomLifeEvent } from "../lib/open-chat-promote";
import { createFromFreeChatProposal, freeChatReply, getFreeChatState, proposeFromSegment } from "../lib/free-chat";
import { requireTestBudget, saveLiveFailure } from "./live-log";

const SESSION = "test-open-promote";

function fail(msg: string): never {
  saveLiveFailure("test-open-promote", msg, null);
  throw new Error(`FAILED — ${msg}`);
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "open-promote-test-" } } });
}

async function say(userId: string, text: string) {
  await prisma.onboardingChatMessage.create({ data: { userId, sessionId: SESSION, role: "user", content: text } });
  await new Promise((r) => setTimeout(r, 5));
}

async function main() {
  await requireTestBudget("test-open-promote");
  await cleanup();
  console.log("=== P13-4(b) 자유 대화 이야기 → 새 시기(CUSTOM) 검증 ===");

  const user = await prisma.user.create({
    data: { email: "open-promote-test-a@test", name: "op", birthYear: 1950 },
  });
  try {
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
          status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder: i, personAsked: true,
        },
      });
    }

    // 자유 대화 진입 — 화면의 initFreeChatAction 과 같은 호출. 구간이 여기서 시작한다(설정 단계 말은 구간 밖).
    await getFreeChatState(user.id);

    // --- 1) 인사 → 응답만, 카드·새 시기 없음
    await say(user.id, "잘 지내요. 고마워요.");
    const reply = await freeChatReply(user.id);
    console.log("greeting reply:", reply);
    if (reply.kind !== "reply" || !reply.reply.trim()) fail("greeting should get a reply");
    if (reply.segmentTurns !== 1) fail("greeting should be in the segment (1 turn)");
    if (reply.propose) fail("greeting should not trigger a proposal");
    await prisma.onboardingChatMessage.create({ data: { userId: user.id, sessionId: SESSION, role: "assistant", content: reply.reply } });
    const greetProposal = await proposeFromSegment(user.id);
    console.log("greeting proposal:", greetProposal.kind);
    if (greetProposal.kind !== "none") fail("greeting should not make a card");
    if ((await prisma.lifeEvent.count({ where: { userId: user.id } })) !== 3) fail("greeting should not create a LifeEvent");

    // --- 2) 실질 이야기 + 나이 표현 → 새 시기, 연도 계산
    await say(user.id, "스무 살 때 서울로 올라와서 봉제 공장에서 일했어요. 고생 많이 했지요.");
    const p = await proposeFromSegment(user.id);
    const card = p.kind === "card" ? p.view.card : null;
    console.log("story card:", card && { title: card.title, center: card.center });
    if (!card) fail("story should make a card");
    if (!("new" in card.center)) fail("story center should be a new period");
    const newYear = card.center.new.year;
    if (newYear === null || newYear < 1969 || newYear > 1971) fail(`expected year ≈1970, got ${newYear}`);
    const made = await createFromFreeChatProposal(user.id);
    if (!made.ok) fail(`create failed: ${JSON.stringify(made)}`);
    const story = await prisma.lifeEvent.findUniqueOrThrow({ where: { id: made.eventId } });
    if (story.type !== "CUSTOM" || story.status !== "CONFIRMED") fail("new period should be CUSTOM CONFIRMED");

    // --- 3) 자리 — 1970 무렵은 1963(중학교) 과 1985(결혼) 사이, 연도 없음은 맨 뒤
    const nullYear = await createCustomLifeEvent(user.id, "시기 모르는 이야기", null);
    const ordered = await prisma.lifeEvent.findMany({
      where: { userId: user.id },
      orderBy: { sequenceOrder: "asc" },
      select: { id: true, label: true, year: true, sequenceOrder: true },
    });
    console.log("ordered:", ordered.map((e) => `${e.sequenceOrder}:${e.label}(${e.year})`).join(" > "));
    const ids = ordered.map((e) => e.id);
    if (ids.indexOf(story.id) !== 2 || ordered[3].label !== "결혼" || ids[4] !== nullYear.id) fail("CUSTOM ordering wrong");
    const orders = ordered.map((e) => e.sequenceOrder);
    if (new Set(orders).size !== orders.length) fail("sequenceOrder collision");

    // --- 4) 갭 — CUSTOM 도 person 갭 대상, 이야기와 함께 만들어져 episode 갭 없음
    const gaps = await detectGaps(user.id);
    const hasPersonGap = gaps.some((g) => g.type === "person" && g.targetEventId === story.id);
    const hasEpisodeGap = gaps.some((g) => g.type === "episode" && g.targetEventId === story.id);
    console.log("CUSTOM person gap (expect true):", hasPersonGap, "/ episode gap (expect false):", hasEpisodeGap);
    if (!hasPersonGap || hasEpisodeGap) fail("gap state wrong for CUSTOM with story");
    if (!story.hasEpisode) fail("hasEpisode should be true");

    // --- 5) story-review 타임라인
    const review = await getStoryReviewData(user.id);
    console.log("timeline:", review.timeline.map((t) => `${t.year ?? "?"} ${t.label}${t.hasEpisode ? "*" : ""}`).join(" | "));
    if (review.timeline[2]?.id !== story.id || review.timeline[4]?.id !== nullYear.id) fail("story-review timeline order wrong");
  } finally {
    await deleteAccountTx(user.id);
  }
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
