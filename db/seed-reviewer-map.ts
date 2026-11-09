// 토스 심사관용 테스트 계정에 견본 My Life 지도 채우기(2026-11-09 성민 — docs/phase/print-mylife.md §14.3).
// 성민이 /join → 이메일 가입으로 계정을 만든 직후(설정 대화 전) 실행한다. 인물·장소·이야기는 전부 지어낸 것(실명 0 — 랜딩 견본 김순자 수준).
//
//   npx tsx db/seed-reviewer-map.ts --email <심사관 계정 이메일>            계획만(DB 쓰기 0)
//   npx tsx db/seed-reviewer-map.ts --email <심사관 계정 이메일> --apply    적용
//
// 적용 = 테스트 계정 표시(isTestAccount) · V3 트랙 · 출생연도 1950 · 설정 완료 표시(OnboardingProfile — 로그인하면 바로 My Life) ·
//   시기 7 · 이야기 11(그때의 나 1 포함) · 사람 7 · 장소 6 · 모임 1 · 꾸미기 3. 쓰기는 앱과 같은 입구(lib/my-life-edit)만.
// 이미 My Life 기록(확정 시기·이야기·사람·장소·모임·카테고리)이 있는 계정은 거절 — 빈 계정에만. 유료 API 호출 0.
// 계정 이름(인쇄본 표지 "○○ 님의 이야기")은 바꾸지 않는다.

import "dotenv/config";

import { isTestAccountEmail } from "../lib/chat-v3-usage";
import { printPrice } from "../lib/commerce/print-price";
import { prisma } from "../lib/db";
import { setBirthYear } from "../lib/life-events";
import { getMyLifeData } from "../lib/my-life";
import { addLink, createGroupNode, createPeriodNode, createPersonNode, createPlaceNode, createStoryNode, setNodeDecoration } from "../lib/my-life-edit";
import { DEFAULT_PRINT_OPTIONS, layoutPrint } from "../lib/print-layout";

const BIRTH_YEAR = 1950;

const PEOPLE = [
  ["mom", "이말순", "어머니"],
  ["dad", "김덕배", "아버지"],
  ["mate", "박영희", "국민학교 짝꿍"],
  ["boss", "최영수", "직장 상사"],
  ["husband", "이정호", "남편"],
  ["son", "이준호", "첫째 아들"],
  ["grand", "이하늘", "손녀"],
] as const;
const PLACES = [
  ["school", "중앙국민학교"],
  ["market", "남부시장"],
  ["station", "서울역"],
  ["office", "을지로 사무실"],
  ["home", "신혼 단칸방"],
  ["sea", "대천 바닷가"],
] as const;
const PERIODS = [
  ["e1", "국민학교", 1957, 1962],
  ["e2", "중학교", 1963, 1965],
  ["e3", "서울 상경", 1968, null],
  ["e4", "첫 직장", 1969, 1975],
  ["e5", "결혼", 1976, null],
  ["e6", "아이들 키우던 때", 1977, 1995],
  ["e7", "손주 본 해", 2008, null],
] as const;
type PeriodKey = (typeof PERIODS)[number][0];
type PersonKey = (typeof PEOPLE)[number][0];
type PlaceKey = (typeof PLACES)[number][0];
const STORIES: { ev: PeriodKey; title: string; content: string; people: PersonKey[]; places: PlaceKey[]; kind?: "SELF"; decor?: string }[] = [
  { ev: "e1", title: "운동회 날 달리기 1등", content: "운동회 날 청군 마지막 주자로 뛰어 1등을 했다. 어머니가 싸 오신 김밥을 짝꿍과 나눠 먹었다.", people: ["mate", "mom"], places: ["school"], decor: "ring" },
  { ev: "e1", title: "시장 국밥집 심부름", content: "장날마다 어머니 심부름으로 시장 국밥집에 냄비를 들고 갔다. 아주머니가 늘 고기를 한 점 더 얹어 주셨다.", people: ["mom"], places: ["market"] },
  { ev: "e2", title: "교복 처음 입던 날", content: "아버지가 맞춰 주신 교복이 커서 소매를 두 번 접어 입었다. 거울 앞에서 한참을 서 있었다.", people: ["dad"], places: [] },
  { ev: "e3", title: "완행열차 타고 서울역", content: "보따리 하나 들고 완행열차를 탔다. 서울역에 내리니 사람이 너무 많아 아버지 손을 꼭 잡았다.", people: ["dad"], places: ["station"] },
  { ev: "e4", title: "첫 월급으로 산 내복", content: "첫 월급 봉투를 받자마자 부모님 내복부터 샀다. 상사가 일찍 보내 주어 기차 시간에 맞췄다.", people: ["boss", "mom", "dad"], places: ["office"], decor: "stardust" },
  { ev: "e4", title: "야근 끝 포장마차", content: "장부 마감하던 날 밤늦게 상사와 포장마차에서 우동을 먹었다. 그날 처음으로 일이 재미있다고 느꼈다.", people: ["boss"], places: ["office"] },
  { ev: "e4", title: "그때의 나는 겁이 많았다", content: "모르는 것을 물어보지 못해 혼자 밤새 장부를 다시 맞춰 보곤 했다.", people: [], places: [], kind: "SELF" },
  { ev: "e5", title: "단칸방 신혼살림", content: "연탄 아궁이 하나 있는 단칸방에서 신혼을 시작했다. 남편이 장롱을 직접 짜 주었다.", people: ["husband"], places: ["home"] },
  { ev: "e6", title: "첫째 돌잔치", content: "단칸방이 좁아 마당에 상을 폈다. 첫째가 돌잡이로 연필을 잡아 온 식구가 웃었다.", people: ["husband", "mom", "son"], places: ["home"] },
  { ev: "e6", title: "온 가족 첫 바닷가", content: "여름휴가로 처음 바다에 갔다. 아이가 파도에 놀라 아버지 등에 업혀 다녔다.", people: ["husband", "son", "dad"], places: ["sea"] },
  { ev: "e7", title: "손녀 첫 걸음마", content: "손녀가 거실에서 첫 걸음을 떼던 날, 온 가족이 박수를 쳤다. 아들이 그 모습을 비디오로 찍었다.", people: ["son", "grand"], places: [] },
];

function arg(name: string): string | null {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1].trim().toLowerCase() : null;
}

async function main() {
  const email = arg("email");
  const apply = process.argv.includes("--apply");
  if (!email) {
    console.log("사용법: npx tsx db/seed-reviewer-map.ts --email <심사관 계정 이메일> [--apply]");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, onboardingTrack: true, isTestAccount: true, birthYear: true, createdAt: true, onboardingProfile: { select: { id: true, skeletonGeneratedAt: true } } },
  });
  if (!user) {
    console.log(`계정이 없어요: ${email} — 먼저 /join 으로 가입하세요.`);
    process.exit(1);
  }
  const userId = user.id;
  const [events, unconfirmed, episodes, people, places, groups, placeGroups, custom] = await Promise.all([
    prisma.lifeEvent.count({ where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } } }),
    prisma.lifeEvent.count({ where: { userId, status: "UNCONFIRMED" } }),
    prisma.episode.count({ where: { lifeEvent: { userId } } }),
    prisma.person.count({ where: { userId } }),
    prisma.place.count({ where: { userId } }),
    prisma.personGroup.count({ where: { userId } }),
    prisma.placeGroup.count({ where: { userId } }),
    prisma.customNode.count({ where: { userId } }),
  ]);
  const existing = { 확정시기: events, 확인대기시기: unconfirmed, 이야기: episodes, 사람: people, 장소: places, 모임: groups, 장소묶음: placeGroups, 카테고리: custom };
  console.log(`계정 ${user.email} · 이름 "${user.name ?? ""}"(표지 "${user.name ?? ""} 님의 이야기") · 가입 ${user.createdAt.toISOString()} · 트랙 ${user.onboardingTrack} · 테스트 표시 ${user.isTestAccount} · 출생연도 ${user.birthYear ?? "없음"}`);
  console.log("지금 기록:", JSON.stringify(existing));
  const busy = events + unconfirmed + episodes + people + places + groups + placeGroups + custom;
  if (busy > 0) {
    console.log("거절 — 이미 My Life 기록이 있는 계정이에요. 가입 직후(설정 대화 전) 빈 계정에만 채웁니다.");
    process.exit(1);
  }
  if (!isTestAccountEmail(user.email)) console.log("참고 — 이메일 최상위 도메인이 .test·.invalid 가 아니에요. 테스트 계정 표시(isTestAccount)로 운영 예산에서 빠집니다.");
  console.log(
    `할 일: 테스트 표시 켜기 · V3 트랙 · 출생연도 ${BIRTH_YEAR} · 설정 완료 표시 · 시기 ${PERIODS.length} · 이야기 ${STORIES.length}(그때의 나 ${STORIES.filter((s) => s.kind === "SELF").length}) · 사람 ${PEOPLE.length} · 장소 ${PLACES.length} · 모임 1 · 꾸미기 ${STORIES.filter((s) => s.decor).length + 1}`,
  );
  if (!apply) {
    console.log("계획만 — 적용하려면 --apply");
    return;
  }

  const now = new Date();
  await prisma.user.update({ where: { id: userId }, data: { isTestAccount: true, onboardingTrack: "V3" } });
  if (user.onboardingProfile) {
    await prisma.onboardingProfile.update({ where: { userId }, data: { skeletonGeneratedAt: user.onboardingProfile.skeletonGeneratedAt ?? now } });
  } else {
    await prisma.onboardingProfile.create({ data: { userId, birthYear: BIRTH_YEAR, region: "전주", skeletonGeneratedAt: now } });
  }
  await setBirthYear(userId, BIRTH_YEAR);

  const fail = (what: string, r: unknown): never => {
    throw new Error(`${what} 실패: ${JSON.stringify(r)}`);
  };
  const person = {} as Record<PersonKey, string>;
  for (const [k, name, relation] of PEOPLE) {
    const r = await createPersonNode(userId, { name, relation });
    person[k] = r.ok && "personId" in r ? r.personId : fail(`사람 ${name}`, r);
  }
  const place = {} as Record<PlaceKey, string>;
  for (const [k, name] of PLACES) {
    const r = await createPlaceNode(userId, { name });
    place[k] = r.ok ? r.placeId : fail(`장소 ${name}`, r);
  }
  const period = {} as Record<PeriodKey, string>;
  for (const [k, label, year, endYear] of PERIODS) {
    const r = await createPeriodNode(userId, { label, year, endYear });
    period[k] = r.ok ? r.eventId : fail(`시기 ${label}`, r);
  }
  for (const s of STORIES) {
    const r = await createStoryNode(userId, {
      lifeEventId: period[s.ev],
      kind: s.kind ?? "STORY",
      title: s.title,
      content: s.content,
      personIds: s.people.map((p) => person[p]),
      placeIds: s.places.map((p) => place[p]),
    });
    if (!r.ok) fail(`이야기 ${s.title}`, r);
    if (r.ok && s.decor) await setNodeDecoration(userId, { type: "EPISODE", id: r.episodeId }, s.decor);
  }
  const g = await createGroupNode(userId, { name: "국민학교 동무들", memberIds: [person.mate] });
  if (!g.ok) fail("모임", g);
  if (g.ok) await addLink(userId, { type: "LIFE_EVENT", id: period.e1 }, { type: "PERSON_GROUP", id: g.groupId });
  await setNodeDecoration(userId, { type: "LIFE_EVENT", id: period.e5 }, "flare");

  const data = await getMyLifeData(userId);
  const layout = layoutPrint(data, user.name ?? "", DEFAULT_PRINT_OPTIONS);
  console.log(
    `적용 — 시기 ${data.events.length} · 이야기 ${data.events.reduce((n, e) => n + e.stories.length, 0)} · 사람 ${data.people.length} · 장소 ${data.places.length} · 모임 ${data.groups.length} · 인쇄본 ${layout.pageCount}장(${printPrice(layout.pageCount)?.totalKrw.toLocaleString() ?? "주문 불가"}원)`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
