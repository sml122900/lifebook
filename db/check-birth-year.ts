// 출생연도 저장 위치 정합 점검 — 읽기 전용(쓰기 0). docs/phase/my-life-restructure.md §16.1.
//
// 저장 위치: ① V3 출생 시기 LifeEvent(type BIRTH, 확정·고침 — correctedYear ?? year = 원본)
//           ② OnboardingProfile.birthYear(V3 신상) ③ User.birthYear(V2 온보딩·회원정보)
//           ④ V2 출생 기록 UserMemory(createdVia life_event · category BIRTH · eventYear)
// V3 = ① 이 있는 계정, V2 = ① 이 없는 계정. 항목별 개수만 출력(이름·이메일·값 없음).
// 실고객 계정(이메일 앞부분 sml122900)은 집계에서 빼고 계정 수만 따로 센다.
//
// 실행: npx tsx db/check-birth-year.ts

import "dotenv/config";

import { prisma } from "../lib/db";

const BLOCKED_LOCAL_PART = "sml122900";

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, email: true, birthYear: true } });
  if (users.length === 0) throw new Error("User 0명 — DB 연결 확인.");
  const customer = new Set(users.filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART)).map((u) => u.id));
  const [births, profiles, v2Births] = await Promise.all([
    prisma.lifeEvent.findMany({ where: { type: "BIRTH" }, select: { userId: true, status: true, year: true, correctedYear: true }, orderBy: { createdAt: "asc" } }),
    prisma.onboardingProfile.findMany({ select: { userId: true, birthYear: true } }),
    prisma.userMemory.findMany({
      where: { createdVia: "life_event", category: "BIRTH", eventYear: { not: null } },
      select: { userId: true, eventYear: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const birthOf = new Map<string, (typeof births)[number]>();
  for (const b of births) if (!birthOf.has(b.userId)) birthOf.set(b.userId, b);
  const profileOf = new Map(profiles.map((p) => [p.userId, p.birthYear]));
  const v2Of = new Map<string, number>();
  for (const m of v2Births) if (!v2Of.has(m.userId)) v2Of.set(m.userId, m.eventYear!); // 최신 1행(getBirthYear 와 같은 기준)

  const c = {
    v3: 0, v3Undecided: 0, v3ProfileMissing: 0, v3ProfileDiff: 0, v3UserNull: 0, v3UserDiff: 0, v3HasV2Memory: 0, v3V2Diff: 0,
    v2: 0, v2UserOnly: 0, v2MemoryOnly: 0, v2Both: 0, v2BothDiff: 0, v2None: 0, v2Profile: 0,
  };
  const cust = { v3: 0, v2: 0 };
  for (const u of users) {
    const b = birthOf.get(u.id);
    if (customer.has(u.id)) {
      cust[b ? "v3" : "v2"] += 1;
      continue;
    }
    const prof = profileOf.get(u.id);
    const mem = v2Of.get(u.id);
    if (b) {
      c.v3 += 1;
      const decided = b.status === "CONFIRMED" || b.status === "CORRECTED";
      const orig = b.correctedYear ?? b.year;
      if (!decided) c.v3Undecided += 1;
      if (prof === undefined || prof === null) c.v3ProfileMissing += 1;
      else if (prof !== orig) c.v3ProfileDiff += 1;
      if (u.birthYear === null) c.v3UserNull += 1;
      else if (u.birthYear !== orig) c.v3UserDiff += 1;
      if (mem !== undefined) {
        c.v3HasV2Memory += 1;
        if (mem !== orig) c.v3V2Diff += 1;
      }
    } else {
      c.v2 += 1;
      if (prof !== undefined) c.v2Profile += 1;
      if (u.birthYear !== null && mem === undefined) c.v2UserOnly += 1;
      else if (u.birthYear === null && mem !== undefined) c.v2MemoryOnly += 1;
      else if (u.birthYear !== null && mem !== undefined) {
        c.v2Both += 1;
        if (u.birthYear !== mem) c.v2BothDiff += 1;
      } else c.v2None += 1;
    }
  }
  console.log(`출생연도 저장 위치 점검(읽기 전용) · User ${users.length}명 · 실고객 ${customer.size}명 집계 제외(V3 ${cust.v3} · V2 ${cust.v2})`);
  console.log(`\n[V3 — 출생 시기 LifeEvent 있음] ${c.v3}명`);
  console.log(`  출생 시기 미확정(UNCONFIRMED 등)        ${c.v3Undecided}`);
  console.log(`  OnboardingProfile 없음·비어 있음        ${c.v3ProfileMissing}`);
  console.log(`  OnboardingProfile ≠ 출생 시기 연도      ${c.v3ProfileDiff}`);
  console.log(`  User.birthYear 비어 있음                ${c.v3UserNull}   ← 회원정보 화면이 빈칸으로 보임`);
  console.log(`  User.birthYear ≠ 출생 시기 연도         ${c.v3UserDiff}`);
  console.log(`  V2 출생 기록도 있음 / 그중 연도 다름    ${c.v3HasV2Memory} / ${c.v3V2Diff}`);
  console.log(`\n[V2 — 출생 시기 LifeEvent 없음] ${c.v2}명 (OnboardingProfile 있음 ${c.v2Profile})`);
  console.log(`  User.birthYear 만                       ${c.v2UserOnly}`);
  console.log(`  V2 출생 기록만                          ${c.v2MemoryOnly}`);
  console.log(`  둘 다 / 그중 연도 다름                  ${c.v2Both} / ${c.v2BothDiff}`);
  console.log(`  둘 다 없음                              ${c.v2None}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
