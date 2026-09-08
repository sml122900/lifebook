// v3 P16 검증. 실행: npx tsx db/test-p16.ts
//
// P16-1 — detectGaps 가 hasEpisode 플래그 대신 실질 내용 있는 Episode
//         존재로 episode/time_gap/person_episode 갭을 판단하는지(DB).
// P16-2 — buildResumeAnnouncement/lastNonResumeAssistantText 순수 동작 +
//         person 라벨 리팩터(buildPersonLabel/buildPersonAddress) 회귀.
//
// 외부 API 호출 0. 테스트 계정은 끝에 deleteAccountTx 로 삭제.

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { detectGaps } from "../lib/gap-detector";
import { createEpisodeBridge } from "../lib/episode";
import { createPerson } from "../lib/people";
import { linkPersonToLifeEvent } from "../lib/person-life-event";
import {
  buildResumeAnnouncement,
  isSubstantiveEpisodeContent,
  lastNonResumeAssistantText,
} from "../lib/episode-text";
import { buildPersonAddress, buildPersonLabel } from "../lib/person-honorific";

const GUIDANCE = "더 많은 이야기를 들려주세요. 어떤 일이 있으셨나요?";
const SUBSTANTIVE = "그날 학교 강당에서 있었던 일이 지금도 생생하다.";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

function pureChecks() {
  console.log("=== P16-1 isSubstantiveEpisodeContent ===");
  check("빈 문자열 → false", !isSubstantiveEpisodeContent("  "));
  check("안내문 → false", !isSubstantiveEpisodeContent(GUIDANCE));
  check("실질 내용 → true", isSubstantiveEpisodeContent(SUBSTANTIVE));

  console.log("=== P16-2 buildResumeAnnouncement / lastNonResumeAssistantText ===");
  check(
    "안내 문구 형식",
    buildResumeAnnouncement("국민학교 입학") === "아까 국민학교 입학 이야기 이어서 들을게요.",
  );

  const real = { role: "assistant", content: "김영수랑 기억나는 일 있으세요?" };
  const resume = { role: "assistant", content: buildResumeAnnouncement("국민학교 입학") };
  const user = { role: "user", content: "네" };

  check("안내문 없음 — 마지막 그대로", lastNonResumeAssistantText([real]) === real.content);
  check(
    "안내문 1개 건너뛰고 진짜 질문",
    lastNonResumeAssistantText([real, resume]) === real.content,
  );
  check(
    "안내문 연속 2개(반복 재진입 시뮬레이션) 건너뛰기",
    lastNonResumeAssistantText([real, resume, resume]) === real.content,
  );
  check("로그 없음 → null", lastNonResumeAssistantText([]) === null);
  check("마지막이 user → null", lastNonResumeAssistantText([real, user]) === null);
  check(
    "안내문만 있고 그 위가 없음 → null",
    lastNonResumeAssistantText([resume]) === null,
  );

  console.log("=== P16-2 buildPersonLabel/buildPersonAddress 리팩터 회귀 ===");
  check("선임 라벨", buildPersonLabel("정영식", "선임") === "정영식 선임");
  check("선임 주소(회귀)", buildPersonAddress("정영식", "선임") === "정영식 선임과");
  check("담임 선생님 라벨", buildPersonLabel("박정호", "담임 선생님") === "박정호 선생님");
  check("친구 라벨(호칭 없음=이름 그대로)", buildPersonLabel("최영수", "친구") === "최영수");
  check("친구 주소(회귀)", buildPersonAddress("최영수", "친구") === "최영수랑");
  check("정미숙 씨 라벨", buildPersonLabel("정미숙", "아내") === "정미숙 씨");
  check("정미숙 씨 주소(회귀)", buildPersonAddress("정미숙", "아내") === "정미숙 씨와");
  check("집사람 라벨", buildPersonLabel("집사람", "아내") === "아내분");
  check("집사람 주소(회귀)", buildPersonAddress("집사람", "아내") === "아내분과");
  check("resume 안내에 라벨 그대로 삽입", buildResumeAnnouncement(buildPersonLabel("박정호", "국사 선생님")) === "아까 박정호 선생님 이야기 이어서 들을게요.");
}

async function dbChecks() {
  console.log("=== P16-1 detectGaps DB 시나리오 ===");
  await prisma.user.deleteMany({ where: { email: { startsWith: "p16-test-" } } });
  const user = await prisma.user.create({
    data: { email: "p16-test-hana@test", name: "hana", birthYear: 1950 },
  });
  try {
    const mkEvent = (data: {
      type: "BIRTH" | "MILITARY" | "HIGH_SCHOOL" | "MARRIAGE";
      label: string;
      year: number | null;
      order: number;
    }) =>
      prisma.lifeEvent.create({
        data: {
          userId: user.id,
          type: data.type,
          label: data.label,
          year: data.year,
          isOptional: false,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          sequenceOrder: data.order,
          personAsked: true, // person 갭은 이번 시나리오 대상 아님(노이즈 제거)
        },
      });

    // --- episode 갭 시나리오 ---
    const ev1 = await mkEvent({ type: "HIGH_SCHOOL", label: "고등학교 입학", year: 1966, order: 0 });
    const bridge1 = await createEpisodeBridge(user.id, ev1.id, ev1.label, ev1.year, GUIDANCE, "raw");
    if (!bridge1) throw new Error("bridge1 실패");

    let gaps = await detectGaps(user.id);
    check(
      "안내문뿐인 이벤트 → episode 갭 있음(hasEpisode=true 여도)",
      gaps.some((g) => g.type === "episode" && g.targetEventId === ev1.id),
    );
    const flagged = await prisma.lifeEvent.findUnique({ where: { id: ev1.id }, select: { hasEpisode: true } });
    check("hasEpisode 플래그는 그대로 true(배지용, 갭 판단과 분리)", flagged?.hasEpisode === true);

    await createEpisodeBridge(user.id, ev1.id, ev1.label, ev1.year, SUBSTANTIVE, "raw");
    gaps = await detectGaps(user.id);
    check(
      "실질 Episode 추가 후 → episode 갭 사라짐",
      !gaps.some((g) => g.type === "episode" && g.targetEventId === ev1.id),
    );

    // --- time_gap(period) 갭 시나리오 ---
    const ev2 = await mkEvent({ type: "BIRTH", label: "출생", year: 1950, order: -1 });
    const ev3 = await mkEvent({ type: "MARRIAGE", label: "결혼", year: 1985, order: 1 });
    void ev3;
    let gaps2 = await detectGaps(user.id);
    check(
      "출생→결혼 15년 공백 → time_gap 갭 있음(초기)",
      gaps2.some((g) => g.type === "time_gap" && g.targetEventId === ev2.id),
    );

    const bridgeP1 = await createEpisodeBridge(
      user.id, ev2.id, `${ev2.label} 이후`, ev2.year, GUIDANCE, "raw", undefined, true,
    );
    if (!bridgeP1) throw new Error("bridgeP1 실패");
    gaps2 = await detectGaps(user.id);
    check(
      "period Episode 가 안내문뿐 → time_gap 갭 여전히 있음",
      gaps2.some((g) => g.type === "time_gap" && g.targetEventId === ev2.id),
    );

    await createEpisodeBridge(
      user.id, ev2.id, `${ev2.label} 이후`, ev2.year, SUBSTANTIVE, "raw", undefined, true,
    );
    gaps2 = await detectGaps(user.id);
    check(
      "실질 period Episode 추가 후 → time_gap 갭 사라짐",
      !gaps2.some((g) => g.type === "time_gap" && g.targetEventId === ev2.id),
    );

    // --- person_episode 갭 시나리오 ---
    const ev4 = await mkEvent({ type: "MILITARY", label: "군 입대", year: 1970, order: 2 });
    const person = await createPerson(user.id, {
      subjectType: "person",
      name: "김상병",
      relation: "전우",
      birthYear: null,
      category: null,
      metYear: 1970,
      memo: null,
    });
    await linkPersonToLifeEvent(user.id, person.id, ev4.id);

    let gaps3 = await detectGaps(user.id);
    check(
      "Person 링크만 있고 Episode 없음 → person_episode 갭 있음",
      gaps3.some((g) => g.type === "person_episode" && g.targetPersonId === person.id),
    );

    const bridgeG = await createEpisodeBridge(
      user.id, ev4.id, ev4.label, ev4.year, GUIDANCE, "raw", person.id,
    );
    if (!bridgeG) throw new Error("bridgeG 실패");
    gaps3 = await detectGaps(user.id);
    check(
      "그 인물과의 Episode 가 안내문뿐 → person_episode 갭 여전히 있음",
      gaps3.some((g) => g.type === "person_episode" && g.targetPersonId === person.id),
    );

    await createEpisodeBridge(
      user.id, ev4.id, ev4.label, ev4.year, SUBSTANTIVE, "raw", person.id,
    );
    gaps3 = await detectGaps(user.id);
    check(
      "실질 Episode 추가 후 → person_episode 갭 사라짐",
      !gaps3.some((g) => g.type === "person_episode" && g.targetPersonId === person.id),
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
