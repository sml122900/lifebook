-- 노드 그래프 1단계 — 데이터 층 (docs/phase/node-graph-self.md §1·§6). 자아 메뉴 테이블은 3단계.
-- 테이블·컬럼은 prisma migrate diff --from-schema(HEAD) --to-schema 로 생성(추가만, 드리프트 미포함).
-- 맨 아래 방향 CHECK 1개·트리거 2종은 손으로 쓴 SQL(Prisma 가 CHECK·트리거를 표현하지 못함).

-- CreateEnum
CREATE TYPE "EpisodeKind" AS ENUM ('STORY', 'SELF');

-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('LIFE_EVENT', 'EPISODE', 'PERSON_GROUP', 'PERSON', 'PLACE');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PROPOSED', 'CONFIRMED');

-- AlterTable
ALTER TABLE "MemoryPlace" ADD COLUMN     "placeId" TEXT;

-- AlterTable
ALTER TABLE "LifeEvent" ADD COLUMN     "endYear" INTEGER;

-- AlterTable
ALTER TABLE "Episode" ADD COLUMN     "endYear" INTEGER,
ADD COLUMN     "kind" "EpisodeKind" NOT NULL DEFAULT 'STORY',
ADD COLUMN     "year" INTEGER;

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "source" TEXT,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "memo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonGroupMember" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fromType" "NodeType" NOT NULL,
    "fromId" TEXT NOT NULL,
    "toType" "NodeType" NOT NULL,
    "toId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT '',
    "status" "LinkStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source" TEXT NOT NULL DEFAULT 'USER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "NodeLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeBody" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nodeType" "NodeType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "doc" JSONB NOT NULL,
    "plainText" TEXT NOT NULL,
    "memoryId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeBody_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Place_userId_idx" ON "Place"("userId");

-- CreateIndex
CREATE INDEX "PersonGroup_userId_idx" ON "PersonGroup"("userId");

-- CreateIndex
CREATE INDEX "PersonGroupMember_personId_idx" ON "PersonGroupMember"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonGroupMember_groupId_personId_key" ON "PersonGroupMember"("groupId", "personId");

-- CreateIndex
CREATE INDEX "NodeLink_toType_toId_idx" ON "NodeLink"("toType", "toId");

-- CreateIndex
CREATE INDEX "NodeLink_userId_idx" ON "NodeLink"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeLink_fromType_fromId_toType_toId_role_key" ON "NodeLink"("fromType", "fromId", "toType", "toId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "NodeBody_memoryId_key" ON "NodeBody"("memoryId");

-- CreateIndex
CREATE UNIQUE INDEX "NodeBody_nodeType_nodeId_key" ON "NodeBody"("nodeType", "nodeId");

-- CreateIndex
CREATE INDEX "MemoryPlace_placeId_idx" ON "MemoryPlace"("placeId");

-- AddForeignKey
ALTER TABLE "MemoryPlace" ADD CONSTRAINT "MemoryPlace_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonGroup" ADD CONSTRAINT "PersonGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonGroupMember" ADD CONSTRAINT "PersonGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PersonGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonGroupMember" ADD CONSTRAINT "PersonGroupMember_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeLink" ADD CONSTRAINT "NodeLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeBody" ADD CONSTRAINT "NodeBody_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NodeBody" ADD CONSTRAINT "NodeBody_memoryId_fkey" FOREIGN KEY ("memoryId") REFERENCES "UserMemory"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────────────────
-- 방향 규칙 CHECK — NodeLink 역방향 행 거부
--
-- 목적: 같은 두 노드를 A→B 와 B→A 두 행으로 저장하지 않게 한다(유니크는 방향이 다른 두 행을
--   서로 다른 값으로 본다). 생성은 lib 저장 함수 하나가 방향을 정규화하고, DB 는 규칙에
--   어긋나는 행을 거부하는 마지막 방어선이다.
-- 규칙: 노드 종류 순위 LIFE_EVENT > EPISODE > PERSON_GROUP > PERSON > PLACE 에서 상위가 from.
--   Postgres enum 비교는 선언 순서를 따르므로 "fromType" < "toType" = from 이 상위.
--   같은 종류끼리는 id 사전순으로 앞선 쪽이 from — DB 정렬 규칙(en_US.UTF-8)이 아니라
--   바이트 순(COLLATE "C")으로 비교해 JS 문자열 비교와 같게 한다. 같은 노드끼리(자기 자신)는 거부.
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE "NodeLink" ADD CONSTRAINT "NodeLink_direction_check" CHECK (
  "fromType" < "toType"
  OR ("fromType" = "toType" AND "fromId" COLLATE "C" < "toId" COLLATE "C")
);

-- ─────────────────────────────────────────────────────────────────────────
-- 연결 정리 트리거 ① — 노드 삭제 시 범용 연결(NodeLink)·블로그 본문(NodeBody) 정리
--
-- 목적: NodeLink(fromType/fromId, toType/toId)·NodeBody(nodeType/nodeId)는 여러 테이블을
--   가리키는 다형 연결이라 FK 를 걸 수 없다. 앱 코드에서 지우는 방식은 cascade 로 지워지는
--   행을 놓친다 — 이야기(Episode)는 브릿지 UserMemory 삭제(deleteEpisode)나 소속 사건
--   (LifeEvent) 삭제의 cascade 로 지워지고, 앱은 그 행을 보지 못한다. 그래서 DB 가 행 단위로
--   지운다.
-- 대상: 노드 테이블 5개 — LifeEvent(LIFE_EVENT)·Episode(EPISODE)·PersonGroup(PERSON_GROUP)·
--   Person(PERSON)·Place(PLACE). 트리거 인자 = NodeType 값.
-- 탈퇴: 새 테이블은 userId FK Cascade 로도 지워지므로, 이 트리거가 먼저/나중에 돌아
--   0행을 지워도 무해하다.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION node_graph_cleanup() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "NodeLink" WHERE "fromType" = TG_ARGV[0]::"NodeType" AND "fromId" = OLD."id";
  DELETE FROM "NodeLink" WHERE "toType" = TG_ARGV[0]::"NodeType" AND "toId" = OLD."id";
  DELETE FROM "NodeBody" WHERE "nodeType" = TG_ARGV[0]::"NodeType" AND "nodeId" = OLD."id";
  RETURN OLD;
END;
$$;

CREATE TRIGGER "LifeEvent_node_graph_cleanup" AFTER DELETE ON "LifeEvent"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('LIFE_EVENT');
CREATE TRIGGER "Episode_node_graph_cleanup" AFTER DELETE ON "Episode"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('EPISODE');
CREATE TRIGGER "PersonGroup_node_graph_cleanup" AFTER DELETE ON "PersonGroup"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('PERSON_GROUP');
CREATE TRIGGER "Person_node_graph_cleanup" AFTER DELETE ON "Person"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('PERSON');
CREATE TRIGGER "Place_node_graph_cleanup" AFTER DELETE ON "Place"
  FOR EACH ROW EXECUTE FUNCTION node_graph_cleanup('PLACE');

-- ─────────────────────────────────────────────────────────────────────────
-- 연결 정리 트리거 ② — 블로그 본문(NodeBody) 삭제 시 그 본문 전용 사진 메모리 정리
--
-- 목적: 이야기 외 노드(중심·인물·장소·그룹)의 본문 사진은 createdVia="node_body" 브릿지
--   UserMemory 에 붙는다. 본문이 지워지면(트리거 ① 포함) 그 메모리도 지워 사진 DB 행을
--   cascade 로 정리한다. Storage 파일은 DB 가 못 지우므로 db/reconcile-storage.ts 확장 몫.
-- 대상: NodeBody. createdVia="node_body" 인 메모리만 — 이야기 노드는 이야기 브릿지
--   메모리(createdVia="episode")를 쓰므로 이 조건에 걸리지 않아 보존된다.
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION node_body_cleanup_memory() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."memoryId" IS NOT NULL THEN
    DELETE FROM "UserMemory" WHERE "id" = OLD."memoryId" AND "createdVia" = 'node_body';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER "NodeBody_cleanup_memory" AFTER DELETE ON "NodeBody"
  FOR EACH ROW EXECUTE FUNCTION node_body_cleanup_memory();
