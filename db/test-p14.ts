// v3 P14 검증. 실행: npx tsx db/test-p14.ts
//
// 외부 API 호출 0 — 순수 함수 + DB(dedup 시나리오만, 계정은 끝에 삭제).
//
// P14-1 — stripEpisodeDoneSignal(내용+종료 혼합 메시지에서 내용만 살림),
//         isSummaryGuidance(요약 결과가 2인칭 안내문이면 거부).
// P14-2 — isRelationCompatible + saveOrLinkPerson 이 같은 이름·다른 관계
//         (선생님 vs 선배)를 별도 Person 으로, 호환 관계(친구 vs 친한 친구)는
//         병합하는지 실제 DB 로.
// P14-3 — buildPersonAddress 배우자 동의어(안사람·영감).

import "dotenv/config";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import {
  buildPersonEpisodeTranscript,
  EPISODE_CLOSING_SENTENCES,
  EPISODE_DONE_PHRASES,
  EXIT_PHRASES,
  isSummaryGuidance,
  stripEpisodeDoneSignal,
  isEpisodeDoneIntent,
  isExitIntent,
} from "../lib/episode-text";
import { isRelationCompatible } from "../lib/person-relation";
import { buildPersonAddress } from "../lib/person-honorific";
import { saveOrLinkPerson } from "../lib/person-chat";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${ok ? "" : ` (${JSON.stringify(detail)})`}`);
  if (!ok) failed += 1;
}

function pureChecks() {
  console.log("=== P14-1 종료 신호 분리 ===");
  const s1 = stripEpisodeDoneSignal("역사 수업 시간에 재밌는 이야기를 많이 해주셨어요. 그걸로 된 것 같아요");
  check("내용+종료 → 내용만", s1 === "역사 수업 시간에 재밌는 이야기를 많이 해주셨어요.", s1);
  const s2 = stripEpisodeDoneSignal("그냥 같이 술 자주 마셨어요. 그걸로 된 것 같아요");
  check("내용+종료 2", s2 === "그냥 같이 술 자주 마셨어요.", s2);
  const s3 = stripEpisodeDoneSignal("직장 동료 소개로 만났어요. 그걸로 된 것 같아요");
  check("내용+종료 3", s3 === "직장 동료 소개로 만났어요.", s3);
  check("종료만 → 빈 문자열", stripEpisodeDoneSignal("그걸로 된 것 같아요") === "");
  check("명시 종료 포함 문장 제거", stripEpisodeDoneSignal("재밌었어요. 그만할래요") === "재밌었어요.");
  check("줄바꿈 분리", stripEpisodeDoneSignal("친구랑 놀았어요\n됐어요") === "친구랑 놀았어요");
  check("종료 신호 판정 유지", isEpisodeDoneIntent("그 정도면 됐어요") && !isEpisodeDoneIntent("친구랑 놀았어요"));

  console.log("=== E2E 후속(2026-11-01) — 문장 끝 마무리 말 · 내용 문장 보존 ===");
  check("'네 그 정도예요' = 종료 신호 · 떼면 빈 문자열",
    isEpisodeDoneIntent("네 그 정도예요") && isEpisodeDoneIntent("네, 그 정도예요.") && stripEpisodeDoneSignal("네 그 정도예요") === "");
  check("마무리 말 변형(그게 다예요·특별한 건 없어요·기억나는 건 그 정도예요) 떼기",
    ["그게 다예요", "특별한 건 없어요", "기억나는 건 그 정도예요", "더는 없어요"].every((t) => isEpisodeDoneIntent(t) && stripEpisodeDoneSignal(t) === ""));
  check("'한 시간 그 정도 걸었어요' = 종료 아님 · 보존",
    !isEpisodeDoneIntent("한 시간 그 정도 걸었어요") && stripEpisodeDoneSignal("한 시간 그 정도 걸었어요") === "한 시간 그 정도 걸었어요");
  check("'키가 그 정도예요' = 종료 아님(문장 전체가 마무리 말일 때만)", !isEpisodeDoneIntent("키가 그 정도예요"));
  const s4 = stripEpisodeDoneSignal("매일 같이 등교했어요. 그게 다예요");
  check("내용 + 마무리 말 → 내용만", s4 === "매일 같이 등교했어요.", s4);
  check("종료 신호 낱말이 든 내용 문장은 떼지 않음(됐어요·그만·그 정도면)",
    ["대학에 합격이 됐어요", "회사를 그만두고 장사를 시작했어요", "그 정도면 꽤 큰 돈이었죠"].every((t) => stripEpisodeDoneSignal(t) === t));
  console.log("=== 2026-11-01 — 종료 문구 문장 전체 일치(오탐 수정) ===");
  check("'회사를 그만두고 장사를 시작했어요' → 종료 아님(명시·완곡 둘 다)",
    !isExitIntent("회사를 그만두고 장사를 시작했어요") && !isEpisodeDoneIntent("회사를 그만두고 장사를 시작했어요"));
  check("'그만할래요'·'오늘은 여기까지' → 명시적 종료", isExitIntent("그만할래요") && isExitIntent("오늘은 여기까지"));
  check("'선생님이 됐어요' → 종료 아님", !isEpisodeDoneIntent("선생님이 됐어요") && !isExitIntent("선생님이 됐어요"));
  check("'됐어요' 단독 → 완곡 종료(명시 종료 아님)", isEpisodeDoneIntent("됐어요") && !isExitIntent("됐어요"));
  const exitMiss = EXIT_PHRASES.flatMap((p) => [p, `${p}.`, `네 ${p}`]).filter((t) => !isExitIntent(t));
  check(`명시적 종료 문구 ${EXIT_PHRASES.length}개 — 단독 문장(·마침표·"네" 앞)이면 전부 종료`, exitMiss.length === 0, exitMiss);
  const doneList = [...EPISODE_DONE_PHRASES, ...EPISODE_CLOSING_SENTENCES];
  const doneMiss = doneList.flatMap((p) => [p, `${p}.`, `네 ${p}`]).filter((t) => !isEpisodeDoneIntent(t));
  check(`완곡 종료·마무리 말 ${doneList.length}개 — 단독 문장이면 전부 종료`, doneMiss.length === 0, doneMiss);
  check("띄어 쓴 자연 표기도 종료(그만하고 싶어요·다음에 할게요·그걸로 된 것 같아요·이 정도면 됐어요)",
    isExitIntent("그만하고 싶어요") && isExitIntent("다음에 할게요") && isEpisodeDoneIntent("그걸로 된 것 같아요") && isEpisodeDoneIntent("이 정도면 됐어요"));
  check("문장부호 없는 '친구랑 놀았어요 그만할래요' → 종료 + 내용 보존",
    isExitIntent("친구랑 놀았어요 그만할래요") && stripEpisodeDoneSignal("친구랑 놀았어요 그만할래요") === "친구랑 놀았어요");
  check("종료 낱말이 든 내용 문장은 종료 아님(여기까지 걸어왔어요·밥은 충분해요·대학에 합격이 됐어요)",
    ["여기까지 걸어왔어요", "밥은 충분해요", "대학에 합격이 됐어요"].every((t) => !isExitIntent(t) && !isEpisodeDoneIntent(t)));

  const seed = buildPersonEpisodeTranscript("고등학교 다닐 때 친하게 지낸 사람 있으세요?", "김민수라는 친구랑 매일 같이 등교했어요", "김민수랑 기억나는 일 있으세요?");
  check("인물 질문 답 → 이야기 기록 첫 본인 턴([질문, 답, 오프닝])",
    seed.map((t) => t.role).join() === "assistant,user,assistant" && seed[1].text === "김민수라는 친구랑 매일 같이 등교했어요", seed);
  const seed2 = buildPersonEpisodeTranscript("친한 사람 있으세요?", "김민수요. 그 정도예요", "김민수랑 기억나는 일 있으세요?");
  check("인물 질문 답의 마무리 말은 떼고 넘김", seed2[1]?.text === "김민수요.", seed2);

  console.log("=== P14-1 요약 안내문 가드 ===");
  check("안내문 1", isSummaryGuidance("더 많은 이야기를 들려주세요. 박정호 선생님과 어떤 일이 있으셨나요?"));
  check("안내문 2", isSummaryGuidance("더 이야기해 주실 내용이 있으신가요? 박정호 선생님과 나누신 기억을 들려주시면 정성껏 정리해 드리겠습니다."));
  check("안내문 3", isSummaryGuidance("더 많은 이야기를 들려주시면 정리해 드릴 수 있습니다. 지금은 아내 정미숙 씨의 이름만 나왔는데…"));
  check("판정문", isSummaryGuidance("이 대화에는 실제 이야기 내용이 없어 정리할 내용이 없다."));
  check("정상 요약 통과 1", !isSummaryGuidance("박정호 선생님은 역사 수업 시간에 재밌는 이야기를 많이 해주셨다."));
  check("정상 요약 통과 2", !isSummaryGuidance("아내 정미숙과는 직장 동료 소개로 만났다. 그냥 같이 술을 자주 마셨다."));
  check("정상 요약 통과 3(존칭 -시-)", !isSummaryGuidance("김부장님은 늘 점심을 사주셨다. 어머니께서 도시락을 싸주셨다."));

  console.log("=== P14-2 관계 호환 ===");
  check("선생님 vs 선배 → 별도", !isRelationCompatible("국사 선생님", "동아리 선배"));
  check("담임 선생님 vs 선생님 → 병합", isRelationCompatible("담임 선생님", "선생님"));
  check("친구 vs 친한 친구 → 병합", isRelationCompatible("친구", "친한 친구"));
  check("관계 없음(지인) → 병합", isRelationCompatible("지인", "선배") && isRelationCompatible(null, "친구"));
  check("아내 vs 집사람 → 병합", isRelationCompatible("아내", "집사람"));
  check("부장 vs 친구 → 별도", !isRelationCompatible("부장", "친구"));
  check("미분류·불일치 → 별도(안전)", !isRelationCompatible("옆집 아저씨", "장사 파트너"));
  check("동일 문구 → 병합", isRelationCompatible("동기", "동기"));

  console.log("=== P14-3 배우자 호칭 ===");
  check("안사람", buildPersonAddress("안사람", "안사람") === "아내분과");
  check("집사람(회귀)", buildPersonAddress("집사람", "아내") === "아내분과");
  check("영감", buildPersonAddress("영감", "영감") === "남편분과");
  check("이름 있는 배우자(회귀)", buildPersonAddress("정미숙", "아내") === "정미숙 씨와");
}

async function dbChecks() {
  console.log("=== P14-2 DB dedup 시나리오 ===");
  await prisma.user.deleteMany({ where: { email: { startsWith: "p14-test-" } } });
  const user = await prisma.user.create({
    data: { email: "p14-test-hana@test", name: "hana", birthYear: 1962 },
  });
  try {
    const mk = (type: "HIGH_SCHOOL" | "UNIVERSITY", label: string, year: number, order: number) =>
      prisma.lifeEvent.create({
        data: {
          userId: user.id,
          type,
          label,
          year,
          isOptional: false,
          status: "CONFIRMED",
          confirmedAt: new Date(),
          sequenceOrder: order,
        },
      });
    const hs = await mk("HIGH_SCHOOL", "고등학교 입학", 1978, 0);
    const uni = await mk("UNIVERSITY", "대학교 입학", 1981, 1);

    const a = await saveOrLinkPerson(user.id, hs.id, { name: "박정호", relation: "국사 선생님" }, 1978);
    const b = await saveOrLinkPerson(user.id, uni.id, { name: "박정호", relation: "동아리 선배" }, 1981);
    check("선생님·선배 동명이인 → 별도 Person", a.id !== b.id && b.created, { a, b });
    check("두 번째 인물 호칭 = 선배님", buildPersonAddress(b.name, b.relation) === "박정호 선배님과");

    const c = await saveOrLinkPerson(user.id, uni.id, { name: "박정호", relation: "선생님" }, 1981);
    check("선생님(호환) → 첫 인물에 병합", c.id === a.id && !c.created, c);

    const d = await saveOrLinkPerson(user.id, hs.id, { name: "최영수", relation: "친구" }, 1978);
    const e = await saveOrLinkPerson(user.id, uni.id, { name: "최 영수", relation: "친한 친구" }, 1981);
    check("친구 vs 친한 친구(공백 무시) → 병합", d.id === e.id && !e.created);

    const f = await saveOrLinkPerson(user.id, uni.id, { name: "최영수", relation: "지인" }, 1981);
    check("지인(관계 정보 없음) → 병합", f.id === d.id);

    const people = await prisma.person.count({ where: { userId: user.id } });
    check("Person 총 3명(박정호×2·최영수×1)", people === 3, people);
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
