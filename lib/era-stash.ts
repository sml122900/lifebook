// Phase E2 — 시대 사건 "내 연혁에 담기" 헬퍼.
//
// 동작: 사용자가 /era 둘러보기에서 시대 사건 카드를 누르면 그 MonthEvent
// 내용을 사용자의 UserMemory 행 하나로 복사 (createdVia="era_event").
//
// 정책 (이미 정한 것):
//   - 같은 (사용자, MonthEvent, era_event) 중복 금지 — DB partial unique
//     index 가 단일 결정자. 코드는 P2002 catch 패턴으로 idempotent.
//   - content=null — 사용자 본인 회상 자리는 비워둠. 시대 자료(description)
//     는 monthEventId FK join 으로 표시. 본인 회상 작성 UI 는 E3 후속.
//   - precision=EXACT — 시대 사건은 그 해 일어난 게 확정 (month null 이어도
//     "그 해" 자체는 EXACT).
//   - category=null — 시대 사건은 개인 카테고리 매핑 없음. life_event 행만
//     LifeCategory 채워짐.
//   - year/month/title 은 NOT NULL 컬럼(year)·룸 호환을 위해 MonthEvent
//     값으로 미러링. eventYear/eventMonth/eventTitle 에도 동일 값.
//   - 인물 연결 거부 — lib/people.ts 의 not_life_event 가드가 자동 처리.
//   - 가족 룸 노출 — listRoomMemories 가 createdVia 무관하게 보여줌 (자동).
//   - 비서 컨텍스트 제외 — getLifeEvents 결과를 호출자가 kind 로 filter.

import { Prisma } from "./generated/prisma/client";
import { prisma } from "./db";

export const CREATED_VIA_ERA_EVENT = "era_event";

export type StashResult = "stashed" | "already" | "not_found" | "year_missing";

// MonthEvent 한 행을 복사해 UserMemory(era_event) 행 생성.
// 같은 사용자가 같은 MonthEvent 를 두 번 누르면 P2002 → "already" 반환.
export async function stashEraEvent(
  userId: string,
  monthEventId: string,
): Promise<StashResult> {
  const me = await prisma.monthEvent.findUnique({
    where: { id: monthEventId },
    select: { id: true, year: true, month: true, title: true },
  });
  if (!me) return "not_found";
  // UserMemory.year 는 NOT NULL. MonthEvent.year 가 null 이면 담기 거부 —
  // 시대 사건 시드는 모두 year 채워져 있어 실질 도달 0, 방어 가드.
  if (me.year === null) return "year_missing";

  try {
    await prisma.userMemory.create({
      data: {
        userId,
        createdVia: CREATED_VIA_ERA_EVENT,
        monthEventId: me.id,
        year: me.year,
        month: me.month,
        title: me.title,
        content: null,
        eventTitle: me.title,
        eventYear: me.year,
        eventMonth: me.month,
        precision: "EXACT",
        category: null,
      },
    });
    return "stashed";
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      // partial unique (userId, monthEventId, createdVia) 충돌 — 이미 담음.
      return "already";
    }
    throw e;
  }
}

// 같은 사용자의 era_event 행 한 줄 삭제. 없으면 count 0 (idempotent).
export async function unstashEraEvent(
  userId: string,
  monthEventId: string,
): Promise<{ removed: number }> {
  const r = await prisma.userMemory.deleteMany({
    where: { userId, monthEventId, createdVia: CREATED_VIA_ERA_EVENT },
  });
  return { removed: r.count };
}

// /era 카드에 "✓ 내 연혁에 있어요" 표시용 — 사용자가 담은 MonthEvent id 셋.
export async function getStashedEraEventIds(
  userId: string,
): Promise<Set<string>> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: CREATED_VIA_ERA_EVENT,
      monthEventId: { not: null },
    },
    select: { monthEventId: true },
  });
  return new Set(
    rows.map((r) => r.monthEventId).filter((id): id is string => id !== null),
  );
}

// Phase E3 — 담은 사건의 본인 회상(content) 동시 prefetch.
// "✓ 표시" + "내가 적은 회상" 둘 다 클라이언트에서 즉시 그릴 수 있게.
// Map 은 RSC→client 직렬화가 안 되므로 호출자가 Object 로 변환해 전달.
//
// 반환: monthEventId → content (담은 사건만, 미입력은 null).
export async function getStashedEraMemories(
  userId: string,
): Promise<Map<string, string | null>> {
  const rows = await prisma.userMemory.findMany({
    where: {
      userId,
      createdVia: CREATED_VIA_ERA_EVENT,
      monthEventId: { not: null },
    },
    select: { monthEventId: true, content: true },
  });
  const map = new Map<string, string | null>();
  for (const r of rows) {
    if (r.monthEventId) map.set(r.monthEventId, r.content);
  }
  return map;
}

// 본인 회상(content) 길이 상한. 시니어 회상은 한 사건당 한 단락 분량이
// 자연스럽고, UI textarea 도 작게 잡혀 있어 500 자면 넉넉. trim 후 검사.
export const ERA_MEMORY_MAX_LENGTH = 500;

export type SaveEraMemoryResult =
  | "saved"           // content 채워서 저장
  | "cleared"         // 빈 입력으로 → null 로 비움 (회상 삭제)
  | "not_stashed"     // 사용자가 그 사건을 담은 적 없음 (먼저 담아야)
  | "too_long";       // 길이 초과 — UI 가 미리 차단하지만 서버도 방어

// 본인이 담은 era_event 의 content 한 행 update.
// content 가 빈 문자열이거나 null 이면 DB 도 null 로 정규화 ("cleared").
// 권한: createdVia="era_event" + 본인(userId) 행만 — updateMany count=0 이면
// not_stashed(다른 사용자 행이거나 안 담은 사건). lib/people.ts 의 deleteMany
// 가드 패턴과 동일.
export async function saveEraMemory(
  userId: string,
  monthEventId: string,
  content: string | null,
): Promise<SaveEraMemoryResult> {
  const trimmed = content?.trim() ?? "";
  if (trimmed.length > ERA_MEMORY_MAX_LENGTH) return "too_long";
  const normalized = trimmed === "" ? null : trimmed;

  const result = await prisma.userMemory.updateMany({
    where: { userId, monthEventId, createdVia: CREATED_VIA_ERA_EVENT },
    data: { content: normalized },
  });
  if (result.count === 0) return "not_stashed";
  return normalized === null ? "cleared" : "saved";
}
