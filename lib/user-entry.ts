// Phase L7 — 첫 진입 라우팅 게이트용 헬퍼.
//
// "완전 신규 사용자" 판정: 인생 이벤트(life_event) 0건 AND 다른 어떤
// UserMemory 도 0건. v2 시절부터 쓰던 사용자(T6/assistant/manual/ai_chat
// 행이 하나라도 있는) 는 인생 이벤트 0건이어도 *기존* 으로 본다 — 갑자기
// /life-record 로 끌고 가지 않고 /life-timeline 의 빈 상태 + 부드러운
// 권유로 둔다 (기획서 9번 L7 / 사용자 지시 "갑작스럽지 않게").
//
// /enter 진입 분기에서만 사용. /life-timeline 자체엔 게이트를 안 둔다
// (기존 사용자가 사이드 패널로 돌아왔을 때 /life-record 로 튕기지 않게).

import { prisma } from "./db";

// 어떤 createdVia 든 UserMemory 가 1행이라도 있으면 true.
// 호출자가 이미 life_event 0건임을 확인한 다음에만 부르도록 의도.
// findFirst 1회 — 첫 행 발견 시 즉시 종료.
export async function hasAnyUserMemory(userId: string): Promise<boolean> {
  const any = await prisma.userMemory.findFirst({
    where: { userId },
    select: { id: true },
  });
  return any !== null;
}
