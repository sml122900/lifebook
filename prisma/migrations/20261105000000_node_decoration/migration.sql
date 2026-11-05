-- 행성 꾸미기(My Life 우주 개편 U4 — docs/phase/ui-space.md §5.1 안 A · 부록 A). ★ 미적용·미커밋 — 성민 승인 대기.
-- 목적: 이야기·시기 행성(1차 — Q120)에 사용자가 고른 모양 하나(Q119)를 서버에 저장 — 다른 기기·가족 기기에서도 같게(§5.1).
-- 저장 칸: (nodeType, nodeId) 유일 + shape(모양 값 문자열 — 목록은 코드만, DB CHECK 없음) + source(USER — AI 제안 U5 는 범위 제외, Q121).
-- 정리: NodeDecoration(nodeType/nodeId)은 여러 테이블을 가리키는 다형 연결이라 FK 를 걸 수 없다 → 노드 삭제 트리거 함수
--   node_graph_cleanup()(트리거 7개가 공유 — 운영 pg_get_functiondef 2026-11-05 확인: 본문 4줄)에 한 줄 더한다(앞 4줄 그대로).
--   트리거 수·이름 무변(test-node-graph ①). 정합 점검 15(노드 없는 꾸미기)는 코드 쪽.
-- 탈퇴: userId FK Cascade(deleteAccountTx 무수정). 이관 0행.
-- 생성: prisma migrate diff --from-schema prisma/schema.prisma --to-schema <+ NodeDecoration> --script (파일끼리) +
--   함수 한 줄. 운영 DB ↔ 지금 스키마 드리프트 0(2026-11-05 --from-config-datasource 확인).

-- CreateTable
CREATE TABLE "NodeDecoration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "shape" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeDecoration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeDecoration_userId_idx" ON "NodeDecoration"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeDecoration_nodeType_nodeId_key" ON "NodeDecoration"("nodeType", "nodeId");

-- AddForeignKey
ALTER TABLE "NodeDecoration" ADD CONSTRAINT "NodeDecoration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 노드 삭제 트리거 함수 — 꾸미기 정리 한 줄 추가(앞 네 줄은 운영 함수 본문 그대로, 2026-11-05 pg_get_functiondef 확인).
CREATE OR REPLACE FUNCTION node_graph_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "NodeLink" WHERE "fromType" = TG_ARGV[0]::"NodeType" AND "fromId" = OLD."id";
  DELETE FROM "NodeLink" WHERE "toType" = TG_ARGV[0]::"NodeType" AND "toId" = OLD."id";
  DELETE FROM "NodeBody" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  DELETE FROM "NodeBodyRevision" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  DELETE FROM "NodeDecoration" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  RETURN OLD;
END;
$$;
