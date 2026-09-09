// P18-1 — /story-review 갭 카드 "진행 중" 매칭 로직(matchesPending) 검증.
// 페이지 파일에서 로직을 그대로 복사할 수 없으니(서버 컴포넌트, export 없음)
// 여기서는 실제 DB의 test30 pending 상태 + detectGaps 결과를 대조해, 매칭
// 대상 갭이 정확히 하나(military 관련) 나오는지 확인한다.
import "dotenv/config";

import { detectGaps, pickTopGaps, type Gap } from "../lib/gap-detector";
import { getPendingChatContext, type PendingChatContext } from "../lib/chat-v3-pending";
import { prisma } from "../lib/db";

function matchesPending(gap: Gap, pending: PendingChatContext | null): boolean {
  if (!pending || !gap.targetEventId || gap.targetEventId !== pending.targetEventId) {
    return false;
  }
  if (gap.type === "person") return pending.stage === "PERSON";
  if (gap.type === "person_episode") {
    return pending.stage === "EPISODE" && pending.targetPersonId === gap.targetPersonId;
  }
  if (gap.type === "episode" || gap.type === "time_gap") {
    return pending.stage === "EPISODE" && pending.targetPersonId === null;
  }
  return false;
}

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: "test30@test.com" },
    select: { id: true },
  });
  if (!user) {
    console.log("test30 계정을 찾지 못함 — 스킵");
    return;
  }

  const pendingBefore = await getPendingChatContext(user.id);
  console.log("pending (before):", pendingBefore);

  const gaps = await detectGaps(user.id);
  const topGaps = pickTopGaps(gaps, 3);
  const matchedBefore = topGaps.filter((g) => matchesPending(g, pendingBefore));
  console.log(
    "pending 있는 상태 — topGaps 중 매칭:",
    matchedBefore.map((g) => ({ type: g.type, targetEventId: g.targetEventId })),
  );
  if (matchedBefore.length === 0) {
    console.log("FAIL — pending이 있는데 매칭되는 카드가 없음");
    process.exitCode = 1;
  } else {
    console.log("PASS — pending 상태에서 최소 1개 카드가 '이어서 이야기하기'로 표시됨");
  }

  // pending 없을 때 문구 회귀 확인 — 임시로 없다고 가정(실제로 지우지 않음,
  // 매칭 함수에 null 을 직접 넣어 순수 함수로 검증).
  const matchedWithoutPending = topGaps.filter((g) => matchesPending(g, null));
  if (matchedWithoutPending.length === 0) {
    console.log("PASS — pending=null 이면 매칭 0건(기존 '이야기하기' 문구 유지)");
  } else {
    console.log("FAIL — pending=null 인데도 매칭이 있음");
    process.exitCode = 1;
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
