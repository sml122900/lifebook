"use server";

// G2 — "그 시절 목록에서 고르기" server actions.
//
// getEraCatalog : 시대 사건(MonthEvent) + 음악(ChartSong) 전체 카탈로그 +
//   사용자 생년 기준 기본 연대. 데이터가 작아(사건 88·음악 73) 한 번에
//   전부 내려주고 클라가 연대 탭으로 메모리 필터한다.
//   ⚠️ 지역(User.region)은 시대 데이터에 차원이 없어 필터 불가 — birthYear
//      로 기본 연대만 정한다.
//
// addEraItemAsLifeEvent : 사용자가 "기억나요"로 고른 항목을 본인 인생
//   사건(life_event)으로 직접 등록. 온보딩 사건화(createLifeEvent,
//   isDraft=false)와 동일 패턴 — 바로 연혁에 amber 사건으로 표시.
//   /era 의 era_event(시대 배경, 편집 불가)와는 별개 경로.
//   id 로 서버에서 제목·연·월을 재조회(클라 입력 불신뢰).

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createLifeEvent } from "@/lib/life-events";
import { listEraEvents, listEraSongs, type EraEvent, type EraSong } from "@/lib/era-events";
import { revalidatePath } from "next/cache";

// 시대 데이터는 본인 인생 카테고리(출생·학교·결혼…)에 안 맞아 중립 기본값
// FAMILY 로 등록. 온보딩 story 추출·EventForm 기본값과 일관. 사용자가
// 편집 화면에서 재분류 가능.
const ERA_LIFE_CATEGORY = "FAMILY" as const;

// 마지막 연대(2010)는 2020~2023 도 흡수 — 탭이 4개라 그 위 데이터가
// 빠지지 않게. 클라의 decadeOf 와 같은 규칙.
function decadeOf(year: number): number {
  return year >= 2010 ? 2010 : Math.floor(year / 10) * 10;
}

function defaultDecadeFor(birthYear: number | null): number {
  if (birthYear == null) return 1990;
  // 청년기(생년+20)가 가장 생생 — 온보딩 첫 사건 선택과 같은 정신.
  return decadeOf(Math.min(2023, Math.max(1980, birthYear + 20)));
}

export async function getEraCatalog(): Promise<{
  events: EraEvent[];
  songs: EraSong[];
  defaultDecade: number;
}> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { birthYear: true },
  });

  const [events, songs] = await Promise.all([listEraEvents(), listEraSongs()]);
  return {
    events,
    songs,
    defaultDecade: defaultDecadeFor(user?.birthYear ?? null),
  };
}

export type AddEraItemResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_found" | "no_year" };

export async function addEraItemAsLifeEvent(
  kind: "event" | "song",
  monthEventOrSongId: string,
): Promise<AddEraItemResult> {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");
  const userId = session.user.id;

  let title: string;
  let year: number | null;
  let month: number | null;

  if (kind === "event") {
    const ev = await prisma.monthEvent.findUnique({
      where: { id: monthEventOrSongId },
      select: { title: true, year: true, month: true },
    });
    if (!ev) return { ok: false, reason: "not_found" };
    title = ev.title;
    year = ev.year;
    month = ev.month;
  } else {
    const sg = await prisma.chartSong.findUnique({
      where: { id: monthEventOrSongId },
      select: { title: true, artist: true, year: true, month: true },
    });
    if (!sg) return { ok: false, reason: "not_found" };
    title = sg.artist ? `${sg.title} — ${sg.artist}` : sg.title;
    year = sg.year;
    month = sg.month;
  }

  // life_event 는 year 필수. 시대 시드는 year 있는 행만 노출되지만 방어.
  if (year == null) return { ok: false, reason: "no_year" };

  const created = await createLifeEvent(userId, ERA_LIFE_CATEGORY, {
    title: title.slice(0, 100),
    year,
    month,
    content: null, // 본인 회상 자리 — 나중에 편집 화면에서 채움
    endYear: null,
    endMonth: null,
  });

  revalidatePath("/life-timeline");
  return { ok: true, id: created.id };
}
