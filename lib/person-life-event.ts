// v3 P6 — 인물 모드. Person ↔ LifeEvent 링크(PersonLifeEvent). lib/people.ts
// 의 PersonEvent(Person↔UserMemory) 링크와 별개 대상이라 파일을 분리했다 —
// 두 조인 테이블을 한 파일에 섞으면 "어느 링크가 어느 테이블을 향하는지"가
// 헷갈리기 쉽다.

import { prisma } from "./db";

function isP2002(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code?: string }).code === "P2002"
  );
}

// idempotent — 이미 연결돼 있으면 조용히 통과.
export async function linkPersonToLifeEvent(
  userId: string,
  personId: string,
  lifeEventId: string,
): Promise<void> {
  try {
    await prisma.personLifeEvent.create({ data: { personId, lifeEventId, userId } });
  } catch (e) {
    if (!isP2002(e)) throw e;
  }
}
