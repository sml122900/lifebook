-- 사용자 카테고리 1단계 — 데이터 층(docs/phase/custom-graph.md §2.3 · 부록 A). 추가만(기존 테이블·데이터 무변).
-- 추가: enum 값 1(NodeType.CUSTOM) · 테이블 1(CustomNode) · 인덱스 2 · FK 2 · CHECK 1 · 정리 트리거 1.
-- 맨 아래 CHECK·트리거만 손으로 쓴 SQL — 나머지는 prisma migrate diff --from-schema(HEAD) --to-schema(새 스키마) 출력 그대로.
-- 깊이·종류 값(kind)·자리 규칙은 DB 제약으로 두지 않는다(Q75 — 코드 lib/custom-node.ts 만, 나중에 늘릴 수 있게).
-- AlterEnum — CUSTOM 은 맨 뒤(가장 낮은 순위)가 맞는 자리라 migrate diff 출력(맨 뒤 ADD VALUE) 그대로 둔다. 기존 값끼리의
--   순서는 그대로라 기존 행·방향 CHECK(NodeLink_direction_check) 무영향. NodeBody·NodeBodyRevision 의 nodeType 도 같은 enum 이라
--   CUSTOM 노드 본문·이전 판이 그대로 붙는다(Q78). ADD VALUE 는 같은 트랜잭션에서 새 값을 *사용*하지만 않으면 PG12+ 에서 안전 —
--   아래 트리거는 인자를 문자열로만 넘기고(함수 안에서 실행 때 캐스트) 생성 시점엔 값을 쓰지 않는다(장소 묶음 마이그와 같은 이유).

-- AlterEnum
ALTER TYPE "NodeType" ADD VALUE 'CUSTOM';

-- CreateTable
CREATE TABLE "CustomNode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "builtin" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomNode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomNode_parentId_idx" ON "CustomNode"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomNode_userId_builtin_key" ON "CustomNode"("userId", "builtin");

-- AddForeignKey
ALTER TABLE "CustomNode" ADD CONSTRAINT "CustomNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomNode" ADD CONSTRAINT "CustomNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "CustomNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 자기 자신 부모 금지 — 무결성(깊이 제한 아님, Q75 와 별개 — 2026-11-04 성민 승인 때 추가). Prisma 가 CHECK 를 표현하지 못해
-- SQL 에만 둔다(NodeLink_direction_check 와 같은 처리). 남의 행을 부모로·고리·깊이는 코드(lib/custom-node.ts)와 정합 점검 14 몫.
ALTER TABLE "CustomNode" ADD CONSTRAINT "CustomNode_parent_not_self_check" CHECK ("parentId" IS NULL OR "parentId" <> "id");

-- ─────────────────────────────────────────────────────────────────────────
-- 연결 정리 트리거 — 사용자 노드 삭제 시 범용 연결(NodeLink)·본문(NodeBody)·이전 판(NodeBodyRevision) 정리
--
-- 목적: 마이그 20261030000000_node_graph 의 노드 테이블들과 같다(다형 연결이라 FK 를 못 건다). 함수 node_graph_cleanup()
--   은 이미 있어 재사용한다(본문 4줄 — 20261103100000_node_body_revision, 운영 pg_get_functiondef 2026-11-04 확인).
-- 대상: CustomNode(CUSTOM). 카테고리를 지우면 자기 묶음·항목이 parentId FK Cascade 로 지워지고, 그 행마다 이 트리거가 돌아
--   넣기 연결(role "MEMBER")·관련 연결·본문을 지운다. 넣어 둔 기존 노드(사람·이야기 등) 자체는 지워지지 않는다(Q80).
--   본문 사진 메모리(createdVia "node_body")는 기존 트리거 NodeBody_cleanup_memory 가 지운다.
-- 탈퇴: CustomNode 는 userId FK Cascade 로 지워지고, 이 트리거가 남은 연결을 지운다(0행이어도 무해).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TRIGGER "CustomNode_node_graph_cleanup" AFTER DELETE ON "CustomNode"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('CUSTOM');
