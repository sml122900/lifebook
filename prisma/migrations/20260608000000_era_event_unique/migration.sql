-- Phase E2 — 시대 사건 클릭 담기 중복 차단.
--
-- 같은 사용자가 같은 MonthEvent 를 같은 createdVia 흐름으로 두 번 담지
-- 못하게 한다. monthEventId 가 NULL 인 행 (life_event / manual / ai_chat
-- 등 — 즉 v3 시점 거의 모든 행) 은 WHERE 절에서 제외되어 영향 0.
--
-- 사전 검증 (db/check-era-unique-conflict.ts) 결과:
--   monthEventId 있는 행 = 0건, 충돌 그룹 = 0. 적용 안전.
--
-- Prisma 노트: schema.prisma 의 @@unique 는 partial WHERE 를 표현하지 못해
-- DB-only constraint 로 둔다. 코드는 P2002 catch 패턴 (compound where
-- 헬퍼 없이 try create + catch 로 idempotent).

CREATE UNIQUE INDEX "UserMemory_userId_monthEventId_createdVia_key"
  ON "UserMemory" ("userId", "monthEventId", "createdVia")
  WHERE "monthEventId" IS NOT NULL;
