// v3 P19 — Episode 삭제/정정 + CUSTOM LifeEvent 삭제 검증.
// 실행: npx tsx db/test-p19.ts
import "dotenv/config";

import { prisma } from "../lib/db";
import { createEpisodeBridge, deleteEpisode, updateEpisodeContent } from "../lib/episode";
import { deleteCustomLifeEvent } from "../lib/life-event-delete";
import { getStoryReviewData } from "../lib/story-review";
import { detectGaps } from "../lib/gap-detector";

const EMAIL_PREFIX = "p19-test-";

function assert(cond: boolean, label: string) {
  console.log((cond ? "PASS" : "FAIL") + " — " + label);
  if (!cond) process.exitCode = 1;
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

async function main() {
  await cleanup();

  const user = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}a@test.local`, name: "P19테스트" },
  });

  const birth = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "BIRTH",
      label: "출생",
      year: 1958,
      sequenceOrder: 0,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
  const custom = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "CUSTOM",
      label: "첫 자전거",
      year: 1966,
      isOptional: true,
      sequenceOrder: 1,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  // ── 1) Episode 삭제(P19-1) — 갭 재출현 + hasEpisode 정합 + 고아 0 ──
  const birthBridge = await createEpisodeBridge(
    user.id,
    birth.id,
    "출생",
    1958,
    "부산에서 태어났고 형제가 많았다.",
    "raw transcript for birth",
  );
  assert(birthBridge !== null, "출생 Episode 생성");

  await prisma.lifeEvent.update({ where: { id: birth.id }, data: { hasEpisode: true } });

  const room = await prisma.sharedRoom.create({
    data: { name: "테스트룸", ownerId: user.id },
  });
  await prisma.comment.create({
    data: {
      roomId: room.id,
      targetType: "user_memory",
      targetId: birthBridge!.memoryId,
      authorId: user.id,
      content: "좋은 이야기네요",
    },
  });
  await prisma.memoryReaction.create({
    data: {
      roomId: room.id,
      targetType: "user_memory",
      targetId: birthBridge!.memoryId,
      authorId: user.id,
      stamp: "touched",
    },
  });

  const beforeDelete = await getStoryReviewData(user.id);
  const birthEpisodeSummary = beforeDelete.episodes.find((e) => e.id === birthBridge!.episodeId);
  assert(birthEpisodeSummary?.familyActivityCount === 2, "삭제 전 familyActivityCount = 2 (댓글1+반응1)");

  const gapsBefore = await detectGaps(user.id);
  assert(
    !gapsBefore.some((g) => g.type === "episode" && g.targetEventId === birth.id),
    "삭제 전 — 실질 Episode 있어 episode 갭 없음",
  );

  const deleteResult = await deleteEpisode(user.id, birthBridge!.episodeId);
  assert(deleteResult.ok, "Episode 삭제 성공");

  const orphanMemory = await prisma.userMemory.findUnique({ where: { id: birthBridge!.memoryId } });
  assert(orphanMemory === null, "UserMemory 브릿지 행 고아 0(cascade 삭제 확인)");
  const orphanEpisode = await prisma.episode.findUnique({ where: { id: birthBridge!.episodeId } });
  assert(orphanEpisode === null, "Episode 행도 함께 삭제");
  const orphanComment = await prisma.comment.findFirst({ where: { targetId: birthBridge!.memoryId } });
  assert(orphanComment === null, "댓글도 함께 삭제(고아 0)");
  const orphanReaction = await prisma.memoryReaction.findFirst({ where: { targetId: birthBridge!.memoryId } });
  assert(orphanReaction === null, "반응도 함께 삭제(고아 0)");

  const birthAfter = await prisma.lifeEvent.findUnique({ where: { id: birth.id }, select: { hasEpisode: true } });
  assert(birthAfter?.hasEpisode === false, "hasEpisode 플래그 false 로 정합");

  const gapsAfter = await detectGaps(user.id);
  assert(
    gapsAfter.some((g) => g.type === "episode" && g.targetEventId === birth.id),
    "삭제 후 — episode 갭 카드 재출현",
  );

  // ── 2) Episode 정정(P19-3) — content 갱신, rawTranscript 유지, /people 반영 ──
  const person = await prisma.person.create({
    data: { userId: user.id, name: "정영식", relation: "선임", subjectType: "person", isDraft: false },
  });
  await prisma.personLifeEvent.create({
    data: { personId: person.id, lifeEventId: birth.id, userId: user.id },
  });
  const personEpisodeBridge = await createEpisodeBridge(
    user.id,
    birth.id,
    "정영식과의 이야기",
    1958,
    "원본 내용입니다.",
    "raw transcript for person episode",
    person.id,
  );
  assert(personEpisodeBridge !== null, "인물 연결 Episode 생성");

  const updateResult = await updateEpisodeContent(user.id, personEpisodeBridge!.episodeId, "고친 내용입니다.");
  assert(updateResult.ok, "Episode 정정 성공");

  const updatedEpisode = await prisma.episode.findUnique({
    where: { id: personEpisodeBridge!.episodeId },
    select: { content: true, rawTranscript: true },
  });
  assert(updatedEpisode?.content === "고친 내용입니다.", "Episode.content 갱신됨");
  assert(updatedEpisode?.rawTranscript === "raw transcript for person episode", "rawTranscript 유지");

  const updatedMemory = await prisma.userMemory.findUnique({
    where: { id: personEpisodeBridge!.memoryId },
    select: { content: true },
  });
  assert(updatedMemory?.content === "고친 내용입니다.", "UserMemory.content 도 함께 갱신");

  // /people 인물 상세가 읽는 것과 동일한 경로(lib/people.ts:479, episodes[0].content)
  const personDetail = await prisma.person.findUnique({
    where: { id: person.id },
    select: { lifeEvents: { select: { lifeEvent: { select: { episodes: { where: { personId: person.id }, select: { content: true } } } } } } },
  });
  const reflectedContent = personDetail?.lifeEvents[0]?.lifeEvent.episodes[0]?.content;
  assert(reflectedContent === "고친 내용입니다.", "/people 인물 상세 조회 경로에도 정정 반영");

  // 잘못된 소유자(다른 사용자)가 정정 시도 → 실패
  const stranger = await prisma.user.create({
    data: { email: `${EMAIL_PREFIX}stranger@test.local`, name: "타인" },
  });
  const strangerAttempt = await updateEpisodeContent(stranger.id, personEpisodeBridge!.episodeId, "가로채기");
  assert(!strangerAttempt.ok, "타인이 정정 시도 시 거부");

  // ── 3) CUSTOM LifeEvent 삭제(P19-2) ──
  const customBridge = await createEpisodeBridge(
    user.id,
    custom.id,
    "첫 자전거",
    1966,
    "동네에서 처음 자전거를 배웠다.",
    "raw transcript for custom",
  );
  assert(customBridge !== null, "CUSTOM 이벤트 Episode 생성");
  const customPerson = await prisma.person.create({
    data: { userId: user.id, name: "옆집형", subjectType: "person", isDraft: false },
  });
  await prisma.personLifeEvent.create({
    data: { personId: customPerson.id, lifeEventId: custom.id, userId: user.id },
  });

  // 골격 이벤트(BIRTH)는 삭제 거부
  const rejectBirthDelete = await deleteCustomLifeEvent(user.id, birth.id);
  assert(!rejectBirthDelete.ok, "골격 이벤트(BIRTH)는 삭제 거부");

  const customDeleteResult = await deleteCustomLifeEvent(user.id, custom.id);
  assert(customDeleteResult.ok, "CUSTOM 이벤트 삭제 성공");

  const customGone = await prisma.lifeEvent.findUnique({ where: { id: custom.id } });
  assert(customGone === null, "타임라인에서 사라짐(LifeEvent 행 삭제)");
  const customMemoryGone = await prisma.userMemory.findUnique({ where: { id: customBridge!.memoryId } });
  assert(customMemoryGone === null, "딸린 UserMemory 브릿지 고아 0");
  const customEpisodeGone = await prisma.episode.findUnique({ where: { id: customBridge!.episodeId } });
  assert(customEpisodeGone === null, "딸린 Episode 삭제");
  const personLifeEventGone = await prisma.personLifeEvent.findFirst({ where: { lifeEventId: custom.id } });
  assert(personLifeEventGone === null, "PersonLifeEvent 링크 정리");
  const personStillAlive = await prisma.person.findUnique({ where: { id: customPerson.id } });
  assert(personStillAlive !== null, "Person 자체는 유지");

  await cleanup();
  console.log("\n✓ done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
