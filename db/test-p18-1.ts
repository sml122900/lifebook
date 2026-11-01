// P18-1 — /story-review 갭 카드 "진행 중" 표시 검증.
// My Life 개편 2단계부터 진행 중 = 자유 대화에서 주제로 시작해 아직 결정(만들기·안 만들기)하지 않은 대화
// (ChatV3Segment 주제). 페이지가 쓰는 함수 그대로(lib/free-chat getFreeChatTopic·gapMatchesTopic)를,
// 주제는 앱 경로 그대로(startFreeTopic — 갭 칩·딥링크) 만들어 확인한다. 이전엔 옛 대기 대화
// (ChatV3PendingContext)를 직접 써 넣고 페이지 로직을 복사해 대조했다 — 대기 대화는 이제 안 만들어진다.
//
// 자체 픽스처 계정(fixture-p18-1@lifebook.invalid)을 시작 시 만들고 끝에(성공·실패 모두) 하위 데이터째
// 삭제한다. test30·실고객 읽기·쓰기 0. LLM 0.
// 실행: npx tsx db/test-p18-1.ts
import "dotenv/config";

import { detectGaps, pickTopGaps } from "../lib/gap-detector";
import {
  adoptLegacyPending,
  declineFreeChatProposal,
  gapMatchesTopic,
  getFreeChatTopic,
  startFreeTopic,
} from "../lib/free-chat";
import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";

const FIXTURE_EMAIL = "fixture-p18-1@lifebook.invalid";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

// 픽스처 이메일과 정확히 일치하는 계정만 지운다(지난 실행이 중간에 죽어 남은 잔재 포함).
async function removeFixture(): Promise<void> {
  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
}

// v3 트랙·동의 완료 사용자 + 출생(1950)·군 입대(1970) 확인 이벤트. 인물 갭은 노이즈라 personAsked=true.
// → topGaps(3) = 출생 time_gap · 군 입대 time_gap · 출생 episode.
async function seedFixture(): Promise<{ userId: string; military: string; birth: string }> {
  const now = new Date();
  const user = await prisma.user.create({
    data: {
      email: FIXTURE_EMAIL,
      name: "[fixture] p18-1",
      birthYear: 1950,
      onboardingTrack: "V3",
      termsConsentAt: now,
      privacyConsentAt: now,
      overseasTransferConsentAt: now,
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
    },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({
    data: { userId: user.id, birthYear: 1950, region: "대구", skeletonGeneratedAt: now },
  });
  const mkEvent = (type: "BIRTH" | "MILITARY", label: string, year: number, order: number) =>
    prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type,
        label,
        year,
        isOptional: type === "MILITARY",
        status: "CONFIRMED",
        confirmedAt: now,
        sequenceOrder: order,
        personAsked: true,
      },
      select: { id: true },
    });
  const birth = await mkEvent("BIRTH", "출생", 1950, 0);
  const military = await mkEvent("MILITARY", "군 입대", 1970, 1);
  return { userId: user.id, military: military.id, birth: birth.id };
}

async function main() {
  await removeFixture();
  let userId: string | null = null;
  try {
    const fx = await seedFixture();
    userId = fx.userId;

    check("구간 없음 → 주제 null(읽기만 — 행을 만들지 않음)",
      (await getFreeChatTopic(userId)) === null && (await prisma.chatV3Segment.count({ where: { userId } })) === 0);

    const topGaps = pickTopGaps(await detectGaps(userId), 3);
    check("topGaps = 출생 time_gap · 군 입대 time_gap · 출생 episode",
      topGaps.some((g) => g.type === "time_gap" && g.targetEventId === fx.military) &&
        topGaps.some((g) => g.type === "time_gap" && g.targetEventId === fx.birth) &&
        topGaps.some((g) => g.type === "episode" && g.targetEventId === fx.birth),
      topGaps.map((g) => `${g.type}:${g.targetEventId}`));
    check("주제 없음 → 진행 중 0", topGaps.filter((g) => gapMatchesTopic(g, null)).length === 0);

    // 앱 경로 — /story-review "군 입대 이후" 카드(딥링크 gapType=period) → /chat-v3 가 주제를 연다.
    const st = await startFreeTopic(userId, { eventId: fx.military, kind: "period" }, "test-p18-1");
    check("군 입대 이후 주제 시작(오프닝)", st.kind === "opening", st);
    const topic = await getFreeChatTopic(userId);
    const matched = topGaps.filter((g) => gapMatchesTopic(g, topic));
    check("진행 중 = 군 입대 time_gap 하나",
      matched.length === 1 && matched[0].type === "time_gap" && matched[0].targetEventId === fx.military,
      matched.map((g) => `${g.type}:${g.targetEventId}`));

    // 순수 규칙 — 주제 종류별 대응(person ↔ person, person_episode ↔ 같은 인물, episode ↔ episode, period ↔ time_gap).
    const t = (kind: "episode" | "period" | "person" | "person_episode", personId: string | null = null) => ({ eventId: "e1", kind, personId });
    check("규칙 — episode 주제는 episode 갭만 / period 주제는 time_gap 만",
      gapMatchesTopic({ type: "episode", targetEventId: "e1" }, t("episode")) &&
        !gapMatchesTopic({ type: "time_gap", targetEventId: "e1" }, t("episode")) &&
        gapMatchesTopic({ type: "time_gap", targetEventId: "e1" }, t("period")) &&
        !gapMatchesTopic({ type: "episode", targetEventId: "e1" }, t("period")));
    check("규칙 — person / person_episode(같은 인물만) / 다른 사건 X",
      gapMatchesTopic({ type: "person", targetEventId: "e1" }, t("person")) &&
        gapMatchesTopic({ type: "person_episode", targetEventId: "e1", targetPersonId: "p1" }, t("person_episode", "p1")) &&
        !gapMatchesTopic({ type: "person_episode", targetEventId: "e1", targetPersonId: "p2" }, t("person_episode", "p1")) &&
        !gapMatchesTopic({ type: "episode", targetEventId: "e2" }, t("episode")));

    // 결정하면 진행 중이 끝난다([안 만들기] — 카드 없어도 주제를 닫는다).
    await declineFreeChatProposal(userId);
    const afterDecline = await getFreeChatTopic(userId);
    check("[안 만들기] 뒤 → 주제 없음·진행 중 0",
      afterDecline === null && topGaps.filter((g) => gapMatchesTopic(g, afterDecline)).length === 0);

    // 개편 전 대기 대화(옛 행)는 자유 대화에 들어올 때 주제로 이어받는다 → 그 뒤엔 진행 중으로 보인다.
    await prisma.chatV3PendingContext.create({ data: { userId, stage: "EPISODE", targetEventId: fx.birth } });
    const adopted = await adoptLegacyPending(userId);
    const adoptedTopic = await getFreeChatTopic(userId);
    check("옛 대기 대화(출생 이야기) 이어받음 → 진행 중 = 출생 episode 하나 · 대기 행 삭제",
      adopted &&
        JSON.stringify(topGaps.filter((g) => gapMatchesTopic(g, adoptedTopic)).map((g) => `${g.type}:${g.targetEventId}`)) ===
          JSON.stringify([`episode:${fx.birth}`]) &&
        (await prisma.chatV3PendingContext.count({ where: { userId } })) === 0,
      adoptedTopic);
  } finally {
    // 시드 도중 실패해도 이메일로 찾아 지운다.
    await removeFixture();
    const id = userId ?? "";
    const [user, events, profile, pending, segment] = await Promise.all([
      prisma.user.count({ where: { email: FIXTURE_EMAIL } }),
      prisma.lifeEvent.count({ where: { userId: id } }),
      prisma.onboardingProfile.count({ where: { userId: id } }),
      prisma.chatV3PendingContext.count({ where: { userId: id } }),
      prisma.chatV3Segment.count({ where: { userId: id } }),
    ]);
    check("정리 — 픽스처 계정·하위 데이터 삭제", user + events + profile + pending + segment === 0, { user, events, profile, pending, segment });
  }
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
