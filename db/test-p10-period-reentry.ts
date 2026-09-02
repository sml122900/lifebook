// P10-1 검증 — period 갭이 해소된(그 앵커에 이미 period Episode 가 있는)
// 뒤에도 getPeriodPromptForEvent 가 그 구간 대화를 다시 시작할 수 있는지.
// 실행: npx tsx db/test-p10-period-reentry.ts
//
// 회귀 대상: detectGaps 는 기존 P9-1 대로 해소된 time_gap 을 계속 감춰야
// 한다(카드 목록 재노출 금지). getPeriodPromptForEvent 만 해소 여부와
// 무관하게 동작해야 한다.

import "dotenv/config";

import { prisma } from "../lib/db";
import { detectGaps, getPeriodPromptForEvent } from "../lib/gap-detector";
import { createEpisodeBridge } from "../lib/episode";

let failed = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "OK" : "FAIL"} ${label}`);
  if (!cond) failed++;
}

async function cleanup() {
  await prisma.user.deleteMany({ where: { email: { startsWith: "p10-period-test-" } } });
}

async function main() {
  await cleanup();

  const user = await prisma.user.create({
    data: { email: "p10-period-test-alice@test", name: "alice" },
  });

  const birth = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "BIRTH",
      label: "1958년 출생",
      year: 1958,
      status: "CONFIRMED",
      sequenceOrder: 0,
    },
  });
  const marriage = await prisma.lifeEvent.create({
    data: {
      userId: user.id,
      type: "MARRIAGE",
      label: "결혼",
      year: 1982,
      status: "CONFIRMED",
      sequenceOrder: 1,
    },
  });
  check("marriage 이벤트 생성됨(연도 사이 갭 조건 구성용)", !!marriage.id);

  // 해소 전 — time_gap 갭이 있어야 하고(span=24>=10), 직접 조회도 된다.
  const gapsBefore = await detectGaps(user.id);
  const timeGapBefore = gapsBefore.find((g) => g.type === "time_gap" && g.targetEventId === birth.id);
  check("해소 전: detectGaps 에 time_gap(birth) 존재", !!timeGapBefore);

  const promptBefore = await getPeriodPromptForEvent(user.id, birth.id);
  check("해소 전: getPeriodPromptForEvent(birth) 는 non-null", promptBefore !== null);
  check(
    "해소 전: userPrompt 는 BIRTH 전용 문구",
    promptBefore?.userPrompt === "국민학교 들어가기 전, 어릴 적엔 어떻게 지내셨어요?",
  );

  // 그 구간 대화를 완료 — period Episode 생성(P9-1 이 이걸로 해소를 판단).
  const bridge = await createEpisodeBridge(
    user.id,
    birth.id,
    "1958년 출생 이후",
    1958,
    "그 시절엔 시골에서 농사를 지으며 지냈다.",
    "[동반자] 국민학교 들어가기 전엔 어떻게 지내셨어요?\n[본인] 시골에서 농사를 지으며 지냈어요.",
    undefined,
    true,
  );
  check("period Episode 생성 성공", bridge !== null);

  // 해소 후 — P9-1: detectGaps 목록에서는 사라져야 한다(회귀 확인).
  const gapsAfter = await detectGaps(user.id);
  const timeGapAfter = gapsAfter.find((g) => g.type === "time_gap" && g.targetEventId === birth.id);
  check("해소 후: detectGaps 에서 time_gap(birth) 사라짐 (P9-1 회귀 없음)", !timeGapAfter);

  // 해소 후 — P10-1: 그래도 딥링크 재진입은 동작해야 한다.
  const promptAfter = await getPeriodPromptForEvent(user.id, birth.id);
  check("해소 후: getPeriodPromptForEvent(birth) 는 여전히 non-null (P10-1 핵심)", promptAfter !== null);
  check(
    "해소 후: announceText/userPrompt 동일하게 생성됨",
    promptAfter?.announceText === "1958년 출생 이후 이야기도 해볼게요" &&
      promptAfter?.userPrompt === "국민학교 들어가기 전, 어릴 적엔 어떻게 지내셨어요?",
  );

  // 남의 이벤트 id 는 여전히 null (권한 경계 유지).
  const otherUser = await prisma.user.create({
    data: { email: "p10-period-test-bob@test", name: "bob" },
  });
  const wrongOwner = await getPeriodPromptForEvent(otherUser.id, birth.id);
  check("다른 사용자 userId 로는 null", wrongOwner === null);

  // 존재하지 않는 이벤트 id 도 null.
  const notFound = await getPeriodPromptForEvent(user.id, "nonexistent-id");
  check("존재하지 않는 eventId 는 null", notFound === null);

  await cleanup();

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
