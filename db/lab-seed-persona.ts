// 기억 에이전트 R1-5 — 가상 페르소나 시드 (운영 DB, 멱등). R2-5 에서 페르소나 B 추가.
//
// db/lab/personas/persona-*.ts(동결)를 --persona 로 골라 적재한다(목록 = registry.ts). 앱에 lib 함수가 있는 원본은 그
// 함수로(createEpisodeBridge·saveEpisodePlaces·createLifeEvent·createPerson·
// linkPersonToEvent·linkPersonToLifeEvent·stashEraEvent·saveEraMemory), 앱이
// 직접 prisma 로 만드는 행(골격 LifeEvent·OnboardingProfile·LifeProfile·카테고리
// 없는 사건·동반자 초안)은 그 경로와 같은 필드로 만든다. 그 뒤 createdAt 을
// (baseDateKst + day-1) 10:00 KST 로 덮어쓴다 — L2 "서로 다른 날 근거" 규칙 시험용.
//
// 안전장치 (R1-5 사전 확인, 2026-09-30):
//   - LLM·임베딩 0회: 쓰는 함수의 import 체인에 Anthropic·Voyage 없음. 그래도 시작
//     시 관련 키를 이 프로세스 env 에서 지워, 실수로 불리면 즉시 실패하게 한다.
//   - 대상 id 는 "lab_persona_" 접두사, email 은 .invalid 예약 도메인만.
//   - 기존 행 정리는 같은 id + 같은 .invalid 메일일 때만 deleteAccountTx
//     (DB 트랜잭션 하나 — Storage·알림·외부 호출 0).
//   - 로그인 수단 없음: passwordHash null, Account 0행(끝에서 재확인).
//
// 사진 캡션(photoMemories, B 부터): 이미지 파일·Storage 업로드 없이 UserMemory(createdVia="photo")
// 만 lib/photos.ts buildPhotoMemoryData 와 같은 필드로 만든다(연구 원본은 캡션뿐).
//
// 실행: npx tsx db/lab-seed-persona.ts --persona a|b            (정리 후 재생성)
//       npx tsx db/lab-seed-persona.ts --persona a|b --cleanup  (정리만)
// --persona 는 필수 — 이미 색인된 페르소나를 실수로 다시 만들면 원본 id 가 바뀌어 카드·답 기록이 비워진다.

import "dotenv/config";

import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import { createEpisodeBridge, saveEpisodePlaces } from "../lib/episode";
import { saveEraMemory, stashEraEvent } from "../lib/era-stash";
import { LAB_PERSONA_PREFIX } from "../lib/lab/gate";
import { createLifeEvent } from "../lib/life-events";
import { createPerson, linkPersonToEvent } from "../lib/people";
import { linkPersonToLifeEvent } from "../lib/person-life-event";
import type { PlaceInfo } from "../lib/place-types";
import { labPersona } from "./lab/personas/registry";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const P = labPersona(arg("--persona")).persona;
const DAY_MS = 86_400_000;
const SKELETON = P.skeleton;
const EPISODES = P.episodes;
const MEMORIES = P.lifeMemories;
const PEOPLE = P.people;

function dayAt(day: number): Date {
  return new Date(
    new Date(`${P.baseDateKst}T10:00:00+09:00`).getTime() + (day - 1) * DAY_MS,
  );
}

// 온보딩 장소 위젯의 "검색 없이 추가"와 같은 형태(좌표 없음, source=naver).
function textPlace(name: string): PlaceInfo {
  return {
    placeName: name,
    placeAddress: null,
    lat: null,
    lng: null,
    placeSource: "naver",
  };
}

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`시드 중단: ${what}`);
  return v;
}

async function cleanup(): Promise<void> {
  if (!P.userId.startsWith(LAB_PERSONA_PREFIX))
    throw new Error(`페르소나 id 가 ${LAB_PERSONA_PREFIX} 로 시작하지 않음`);
  if (!P.email.endsWith(".invalid"))
    throw new Error("페르소나 메일이 .invalid 예약 도메인이 아님");

  const existing = await prisma.user.findUnique({
    where: { id: P.userId },
    select: { email: true },
  });
  if (existing) {
    // 같은 id 인데 메일이 다르면 페르소나가 아닐 수 있다 — 절대 지우지 않는다.
    if (existing.email !== P.email)
      throw new Error(`id ${P.userId} 의 메일이 페르소나와 달라 정리 중단`);
    await deleteAccountTx(P.userId);
    console.log(`정리: 기존 ${P.userId} 삭제(deleteAccountTx)`);
  }
  const emailOwner = await prisma.user.findUnique({
    where: { email: P.email },
    select: { id: true },
  });
  if (emailOwner)
    throw new Error(
      `페르소나 메일을 다른 계정(${emailOwner.id})이 쓰고 있어 중단`,
    );
}

async function seed(): Promise<void> {
  const userId = P.userId;
  const lifeEventIds = new Map<string, string>();
  const personIds = new Map<string, string>();
  const memoryIds = new Map<string, string>();

  // ── User (v3 트랙, 동의 완료, 로그인 수단 없음) ─────────────────
  await prisma.user.create({
    data: {
      id: userId,
      email: P.email,
      name: P.name,
      onboardingTrack: "V3",
      termsConsentAt: dayAt(1),
      privacyConsentAt: dayAt(1),
      overseasTransferConsentAt: dayAt(1),
      privacyConsentVersion: CURRENT_CONSENT_VERSION,
      userPreferences: [...P.profile.userPreferences],
      createdAt: dayAt(1),
    },
  });

  // ── OnboardingProfile (v3 completeOnboarding 과 같은 필드) ──────
  const op = P.onboardingProfile;
  await prisma.onboardingProfile.create({
    data: {
      userId,
      birthYear: op.birthYear,
      birthMonth: op.birthMonth,
      gender: op.gender,
      region: op.region,
      skeletonGeneratedAt: dayAt(op.day),
      createdAt: dayAt(op.day),
    },
  });

  // ── LifeEvent 골격 (completeOnboarding·submitConfirmAnswer 결과와 같은 필드) ──
  for (const ev of SKELETON) {
    const row = await prisma.lifeEvent.create({
      data: {
        userId,
        type: ev.type,
        label: ev.label,
        year: ev.year,
        isOptional: ev.isOptional,
        status: ev.status,
        sequenceOrder: ev.sequenceOrder,
        confirmedAt: ev.status === "SKIPPED" ? null : dayAt(ev.day),
        correctedYear: ev.correctedYear ?? null,
        correctedLabel: ev.correctedLabel ?? null,
        createdAt: dayAt(ev.day),
      },
      select: { id: true },
    });
    lifeEventIds.set(ev.key, row.id);
  }

  // ── Person ───────────────────────────────────────────────────
  for (const p of PEOPLE) {
    const row = await createPerson(userId, {
      subjectType: "person",
      name: p.name,
      relation: p.relation,
      birthYear: p.birthYear,
      category: p.category,
      metYear: p.metYear,
      memo: p.memo,
    });
    await prisma.person.update({
      where: { id: row.id },
      data: { createdAt: dayAt(p.day) },
    });
    personIds.set(p.key, row.id);
  }

  // ── UserMemory life_event (v2) ────────────────────────────────
  for (const m of MEMORIES) {
    let id: string;
    if (m.category !== null && !m.isDraft) {
      // 자유 추가(EventForm) 경로.
      id = (
        await createLifeEvent(userId, m.category, {
          title: m.eventTitle,
          year: m.eventYear,
          month: m.eventMonth,
          endYear: null,
          content: m.content,
          places: m.places.map(textPlace),
        })
      ).id;
    } else {
      // 카테고리 없는 사건·미승인 초안 — 앱에선 동반자 추출(saveCompanionSessionAction)이
      // 직접 만드는 행. 같은 필드(승인된 초안은 isDraft=false 인 같은 행).
      id = (
        await prisma.userMemory.create({
          data: {
            userId,
            createdVia: "life_event",
            year: m.eventYear,
            month: m.eventMonth,
            title: m.eventTitle,
            content: m.content,
            eventTitle: m.eventTitle,
            eventYear: m.eventYear,
            eventMonth: m.eventMonth,
            precision: m.eventMonth !== null ? "EXACT" : "APPROXIMATE",
            category: m.category,
            isDraft: m.isDraft,
            places: {
              create: m.places.map((name, i) => ({
                placeName: name,
                placeSource: "naver",
                sortOrder: i,
              })),
            },
          },
          select: { id: true },
        })
      ).id;
    }
    await prisma.userMemory.update({
      where: { id },
      data: { createdAt: dayAt(m.day) },
    });
    memoryIds.set(m.key, id);
  }

  // ── 인물 연결 (PersonEvent · PersonLifeEvent) ──────────────────
  for (const p of PEOPLE) {
    const personId = must(personIds.get(p.key), p.key);
    for (const mk of p.memoryLinks) {
      const r = await linkPersonToEvent(
        userId,
        personId,
        must(memoryIds.get(mk), mk),
      );
      if (r !== "linked")
        throw new Error(`시드 중단: ${p.key}→${mk} 연결 ${r}`);
    }
    for (const sk of p.skeletonLinks) {
      await linkPersonToLifeEvent(
        userId,
        personId,
        must(lifeEventIds.get(sk), sk),
      );
    }
  }

  // ── Episode (+ 브릿지 UserMemory, 장소) — finishEpisodeChat 과 같은 입력 ──
  for (const ep of EPISODES) {
    const ev = must(
      SKELETON.find((s) => s.key === ep.lifeEventKey),
      ep.lifeEventKey,
    );
    const person = ep.personKey
      ? must(
          PEOPLE.find((p) => p.key === ep.personKey),
          ep.personKey,
        )
      : null;
    const personLine = person
      ? `[이 이야기의 인물] ${person.name}${person.relation ? ` (관계: ${person.relation})` : ""}\n`
      : "";
    const rawTranscript =
      personLine +
      ep.transcript.map(([who, text]) => `[${who}] ${text}`).join("\n");

    const r = must(
      await createEpisodeBridge(
        userId,
        must(lifeEventIds.get(ep.lifeEventKey), ep.lifeEventKey),
        ev.correctedLabel ?? ev.label,
        ev.correctedYear ?? ev.year,
        ep.content,
        rawTranscript,
        person ? must(personIds.get(person.key), person.key) : undefined,
        ep.isPeriod,
      ),
      `${ep.key} createEpisodeBridge null(골격 상태 확인)`,
    );
    if (
      ep.places?.length &&
      !(await saveEpisodePlaces(userId, r.memoryId, ep.places.map(textPlace)))
    ) {
      throw new Error(`시드 중단: ${ep.key} 장소 저장 실패`);
    }
    await prisma.episode.update({
      where: { id: r.episodeId },
      data: { createdAt: dayAt(ep.day) },
    });
    await prisma.userMemory.update({
      where: { id: r.memoryId },
      data: { createdAt: dayAt(ep.day) },
    });
  }

  // ── era_event (담기 + 회상) ───────────────────────────────────
  for (const e of P.eraMemories) {
    const me = must(
      await prisma.monthEvent.findFirst({
        where: { title: e.monthEventTitle, year: e.monthEventYear },
        select: { id: true },
      }),
      `MonthEvent "${e.monthEventTitle}"(${e.monthEventYear}) 없음`,
    );
    const stashed = await stashEraEvent(userId, me.id);
    if (stashed !== "stashed")
      throw new Error(`시드 중단: ${e.key} 담기 ${stashed}`);
    const saved = await saveEraMemory(userId, me.id, e.content);
    if (saved !== "saved")
      throw new Error(`시드 중단: ${e.key} 회상 저장 ${saved}`);
    await prisma.userMemory.updateMany({
      where: { userId, monthEventId: me.id, createdVia: "era_event" },
      data: { createdAt: dayAt(e.day) },
    });
  }

  // ── 사진 캡션 (photo, buildPhotoMemoryData 와 같은 필드 · 이미지 파일 없음) ──
  for (const ph of P.photoMemories ?? []) {
    const caption = ph.caption.trim();
    const row = await prisma.userMemory.create({
      data: {
        userId,
        createdVia: "photo",
        year: ph.year,
        month: ph.month,
        title: caption,
        content: caption,
        eventYear: ph.year,
        eventMonth: ph.month,
        ...(ph.place
          ? {
              places: {
                create: [
                  { placeName: ph.place, placeSource: "naver", sortOrder: 0 },
                ],
              },
            }
          : {}),
        createdAt: dayAt(ph.day),
      },
      select: { id: true },
    });
    for (const pk of ph.personKeys) {
      const r = await linkPersonToEvent(
        userId,
        must(personIds.get(pk), pk),
        row.id,
      );
      if (r !== "linked")
        throw new Error(`시드 중단: ${ph.key}→${pk} 연결 ${r}`);
    }
  }

  // ── LifeProfile (updatedAt 이 유일한 시각 필드 — 1일차로) ─────────
  const pf = P.profile;
  await prisma.lifeProfile.create({
    data: {
      userId,
      interests: [...pf.interests],
      schools: [...pf.schools],
      residences: [...pf.residences],
      parentsInfo: pf.parentsInfo,
      siblings: pf.siblings,
      closeFriends: pf.closeFriends,
      hobbies: pf.hobbies,
      favMovies: [...pf.favMovies],
      favGames: [...pf.favGames],
      favMusic: [...pf.favMusic],
      updatedAt: dayAt(pf.day),
    },
  });
}

async function report(): Promise<void> {
  const userId = P.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      email: true,
      passwordHash: true,
      onboardingTrack: true,
      _count: { select: { accounts: true } },
    },
  });
  if (!user) {
    console.log("페르소나 계정 없음");
    return;
  }
  const byVia = await prisma.userMemory.groupBy({
    by: ["createdVia", "isDraft"],
    where: { userId },
    _count: { _all: true },
    orderBy: { createdVia: "asc" },
  });
  const rows = {
    User: 1,
    OnboardingProfile: await prisma.onboardingProfile.count({
      where: { userId },
    }),
    LifeProfile: await prisma.lifeProfile.count({ where: { userId } }),
    LifeEvent: await prisma.lifeEvent.count({ where: { userId } }),
    Episode: await prisma.episode.count({ where: { lifeEvent: { userId } } }),
    UserMemory: await prisma.userMemory.count({ where: { userId } }),
    Person: await prisma.person.count({ where: { userId } }),
    PersonEvent: await prisma.personEvent.count({ where: { userId } }),
    PersonLifeEvent: await prisma.personLifeEvent.count({ where: { userId } }),
    MemoryPlace: await prisma.memoryPlace.count({
      where: { memory: { userId } },
    }),
    Account: user._count.accounts,
    TokenWallet: await prisma.tokenWallet.count({ where: { userId } }),
    MemorySourceUnit: await prisma.memorySourceUnit.count({
      where: { userId },
    }),
    MemoryCard: await prisma.memoryCard.count({ where: { userId } }),
  };
  console.log("행 수:", JSON.stringify(rows, null, 2));
  console.log(
    "UserMemory 내역:",
    byVia
      .map(
        (g) => `${g.createdVia}${g.isDraft ? "(초안)" : ""}=${g._count._all}`,
      )
      .join(", "),
  );

  const [ep, mem, ppl, le] = await Promise.all([
    prisma.episode.findMany({
      where: { lifeEvent: { userId } },
      select: { createdAt: true },
    }),
    prisma.userMemory.findMany({
      where: { userId },
      select: { createdAt: true },
    }),
    prisma.person.findMany({ where: { userId }, select: { createdAt: true } }),
    prisma.lifeEvent.findMany({
      where: { userId },
      select: { createdAt: true },
    }),
  ]);
  const kstDays = new Set(
    [...ep, ...mem, ...ppl, ...le].map((r) =>
      new Date(r.createdAt.getTime() + 9 * 3_600_000)
        .toISOString()
        .slice(0, 10),
    ),
  );
  console.log("원본 createdAt KST 날짜:", [...kstDays].sort().join(", "));
  console.log(
    `로그인 수단: passwordHash=${user.passwordHash === null ? "없음" : "있음(!)"}, Account=${user._count.accounts}, email=${user.email}, track=${user.onboardingTrack}`,
  );
}

async function main() {
  // LLM·임베딩 키를 이 프로세스에서 제거 — 시드는 외부 AI 호출 0회여야 한다.
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.LAB_ANTHROPIC_API_KEY;
  delete process.env.VOYAGE_API_KEY;

  await cleanup();
  if (process.argv.includes("--cleanup")) {
    console.log("정리만 수행(--cleanup)");
    return;
  }
  await seed();
  await report();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
