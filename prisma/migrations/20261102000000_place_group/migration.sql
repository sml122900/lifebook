-- My Life 개편 3단계 — 장소 묶음(docs/phase/my-life-restructure.md §2 안 A · Q54).
-- 추가만: enum 값 1 · 테이블 2(PlaceGroup·PlaceGroupMember) · 인덱스 3 · FK 3 · 정리 트리거 1.
-- 아래 enum 줄과 맨 아래 트리거는 손으로 쓴 SQL — 나머지는 prisma migrate diff 출력 그대로.

-- AlterEnum — 손수정. migrate diff 는 `ADD VALUE 'PLACE_GROUP'`(맨 뒤)를 내지만, NodeLink 방향
-- CHECK(NodeLink_direction_check, 마이그 20261030000000_node_graph)가 enum 선언 순서로 순위를
-- 비교하므로 순위 자리(PERSON 아래·PLACE 위 — 묶음이 구성원 위, PERSON_GROUP > PERSON 과 같은 결)에
-- 넣는다. 기존 값끼리의 순서(PERSON < PLACE 등)는 그대로라 기존 행·CHECK 무영향.
-- ADD VALUE 는 같은 트랜잭션에서 새 값을 *사용*하지만 않으면 PG12+ 에서 안전 — 아래 트리거는
-- 인자를 문자열로만 넘기고(함수 안에서 실행 때 캐스트) 생성 시점엔 값을 쓰지 않는다.
ALTER TYPE "NodeType" ADD VALUE 'PLACE_GROUP' BEFORE 'PLACE';

-- CreateTable
CREATE TABLE "PlaceGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlaceGroup_userId_idx" ON "PlaceGroup"("userId");

-- CreateIndex
CREATE INDEX "PlaceGroupMember_placeId_idx" ON "PlaceGroupMember"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaceGroupMember_groupId_placeId_key" ON "PlaceGroupMember"("groupId", "placeId");

-- AddForeignKey
ALTER TABLE "PlaceGroup" ADD CONSTRAINT "PlaceGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceGroupMember" ADD CONSTRAINT "PlaceGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PlaceGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceGroupMember" ADD CONSTRAINT "PlaceGroupMember_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- 연결 정리 트리거 — 장소 묶음 삭제 시 범용 연결(NodeLink)·블로그 본문(NodeBody) 정리
--
-- 목적: 마이그 20261030000000_node_graph 의 노드 테이블 5개와 같다(NodeLink·NodeBody 는 다형
--   연결이라 FK 를 못 건다). 함수 node_graph_cleanup() 은 그 마이그에 이미 있어 재사용한다.
-- 대상: PlaceGroup(PLACE_GROUP). 구성원(PlaceGroupMember)은 FK Cascade 라 트리거 불필요.
-- 탈퇴: PlaceGroup 은 userId FK Cascade 로 지워지고, 이 트리거가 남은 연결을 지운다(0행이어도 무해).
-- ─────────────────────────────────────────────────────────────────────────
CREATE TRIGGER "PlaceGroup_node_graph_cleanup" AFTER DELETE ON "PlaceGroup"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('PLACE_GROUP');
