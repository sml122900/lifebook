-- 노드 본문 이전 판(Q23 재결정 2026-11-03 — docs/phase/my-life-restructure.md §16.4). 추가만(기존 테이블·데이터 무변).
--
-- 목적: 이야기 본문(Episode.content — [이야기 고치기]·블로그 저장)과 블로그 본문(NodeBody — 이야기·인물)을 저장할 때마다
--   바뀌기 직전 판(평문 + 그때의 블록 문서)을 남겨, 잘못 지운 글을 이전 판 목록에서 되돌릴 수 있게 한다.
-- 보관: 노드마다 최근 20판 — 저장 함수가 같은 트랜잭션에서 가장 오래된 것부터 지운다(앱 코드).
-- 정리: NodeBodyRevision(nodeType/nodeId)도 여러 테이블을 가리키는 다형 연결이라 FK 를 걸 수 없다 → 노드 삭제 트리거
--   함수 node_graph_cleanup()(20261030000000_node_graph, 트리거 6개가 공유)에 한 줄 더한다(나머지 본문 그대로).
-- 탈퇴: userId FK Cascade.

-- CreateTable
CREATE TABLE "NodeBodyRevision" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "doc" JSONB,
    "plainText" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NodeBodyRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NodeBodyRevision_nodeType_nodeId_createdAt_idx" ON "NodeBodyRevision"("nodeType", "nodeId", "createdAt");

-- CreateIndex
CREATE INDEX "NodeBodyRevision_userId_idx" ON "NodeBodyRevision"("userId");

-- AddForeignKey
ALTER TABLE "NodeBodyRevision" ADD CONSTRAINT "NodeBodyRevision_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 노드 삭제 트리거 함수 — 이전 판 정리 한 줄 추가(앞 세 줄은 운영 함수 본문 그대로, 2026-11-03 pg_get_functiondef 확인).
CREATE OR REPLACE FUNCTION node_graph_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "NodeLink" WHERE "fromType" = TG_ARGV[0]::"NodeType" AND "fromId" = OLD."id";
  DELETE FROM "NodeLink" WHERE "toType" = TG_ARGV[0]::"NodeType" AND "toId" = OLD."id";
  DELETE FROM "NodeBody" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  DELETE FROM "NodeBodyRevision" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  RETURN OLD;
END;
$$;
