// v3 P21 검증. 실행: npx tsx db/test-p21.ts
//
// P21-1 — GUIDANCE_PATTERNS 에서 `/습니다/`·`/[?？]\s*$/` 를 뺀 뒤에도
//         알려진 안내문은 여전히 걸러지고("db/test-p14.ts" 가 그 회귀를
//         이미 검증), "-습니다"체·물음표로 끝나는 정상 원문은 더 이상
//         안내문으로 오판되지 않는지. 그리고 그 원문이 실제로 period
//         Episode 로 저장되면 detectGaps 의 time_gap 갭이 해소되는지(DB,
//         실측 test30 재현).
// P21-3 — listEventsByPerson 이 personId 없는(=특정 인물 전용이 아닌)
//         Episode 로도 본문을 채우는지, 그리고 다른 인물 전용 Episode 는
//         끌어오지 않는지(db/test-p11.ts 의 friend 시나리오가 후자를
//         이미 커버 — 여기선 전자만 추가로 확인).
//
// 외부 API 호출 0. 테스트 계정은 끝에 deleteAccountTx 로 삭제.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { detectGaps } from "../lib/gap-detector";
import { createEpisodeBridge } from "../lib/episode";
import { createPerson, listEventsByPerson } from "../lib/people";
import { linkPersonToLifeEvent } from "../lib/person-life-event";
import { isSubstantiveEpisodeContent, isSummaryGuidance } from "../lib/episode-text";

// 실측(test30) 에서 저장된 것과 같은 결의 원문 — 어르신 "-습니다"체 + 물음표.
const RAW_STYLE_1 = "1978년에 군대에 입대했습니다. 훈련소에서 고생을 많이 했습니다.";
const RAW_STYLE_2 = "다들 그때 고생 많았죠?";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

function pureChecks() {
  console.log("=== P21-1 isSummaryGuidance — 오탐 제거 ===");
  check("'-습니다'체 원문 → 안내문 아님", !isSummaryGuidance(RAW_STYLE_1));
  check("물음표로 끝나는 원문 → 안내문 아님", !isSummaryGuidance(RAW_STYLE_2));
  check("'-습니다'체 원문 → 실질 내용", isSubstantiveEpisodeContent(RAW_STYLE_1));
  check("물음표로 끝나는 원문 → 실질 내용", isSubstantiveEpisodeContent(RAW_STYLE_2));
}

async function dbChecks() {
  const user = await prisma.user.create({
    data: { email: "p21-test-alice@test", name: "alice" },
  });

  try {
    console.log("=== P21-1 time_gap 갭 — '-습니다'체 저장 후 해소 ===");
    const birth = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type: "BIRTH",
        label: "출생",
        year: 1950,
        status: "CONFIRMED",
        sequenceOrder: 0,
        personAsked: true,
      },
    });
    const marriage = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type: "MARRIAGE",
        label: "결혼",
        year: 1985,
        status: "CONFIRMED",
        sequenceOrder: 1,
        personAsked: true,
      },
    });
    void marriage;

    let gaps = await detectGaps(user.id);
    check(
      "출생→결혼 35년 공백 → time_gap 갭 있음(초기)",
      gaps.some((g) => g.type === "time_gap" && g.targetEventId === birth.id),
    );

    // finishEpisodeChat 요약 실패 시 폴백과 동일 — 본인 원문 그대로 저장.
    const bridge = await createEpisodeBridge(
      user.id, birth.id, `${"출생"} 이후`, birth.year, RAW_STYLE_1, "[본인] …", undefined, true,
    );
    if (!bridge) throw new Error("bridge 실패");

    gaps = await detectGaps(user.id);
    check(
      "'-습니다'체 period Episode 저장 후 → time_gap 갭 사라짐",
      !gaps.some((g) => g.type === "time_gap" && g.targetEventId === birth.id),
    );

    console.log("=== P21-3 listEventsByPerson — personId 없는 Episode 로 폴백 ===");
    const military = await prisma.lifeEvent.create({
      data: {
        userId: user.id,
        type: "MILITARY",
        label: "군 입대",
        year: 1978,
        status: "CONFIRMED",
        sequenceOrder: 2,
        personAsked: true,
      },
    });
    const senior = await createPerson(user.id, {
      subjectType: "person",
      name: "정영식",
      relation: "선임",
      birthYear: null,
      category: null,
      metYear: 1978,
      memo: null,
    });
    await linkPersonToLifeEvent(user.id, senior.id, military.id);

    let events = await listEventsByPerson(user.id, senior.id);
    check("person_episode 없는 상태 → content null", events[0]?.content === null);

    // person_episode 전용 대화 없이, 일반(period) 에피소드 대화 중 언급된
    // 경우 — Episode.personId 는 null (savePeopleMentionedInEpisode 가
    // PersonLifeEvent 로만 연결하고 Episode 자체엔 태그 안 함).
    await createEpisodeBridge(
      user.id, military.id, "군 입대 이후", military.year,
      "정영식 선임과 함께 야간 보초를 섰습니다.", "[본인] …", undefined, true,
    );
    events = await listEventsByPerson(user.id, senior.id);
    check(
      "personId 없는 일반 Episode → 인물 상세에 본문 노출",
      events[0]?.content === "정영식 선임과 함께 야간 보초를 섰습니다.",
    );
  } finally {
    await deleteAccountTx(user.id);
    const left = await prisma.user.findUnique({ where: { id: user.id } });
    check("테스트 계정 흔적 삭제", left === null);
  }
}

async function main() {
  pureChecks();
  await dbChecks();
  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
