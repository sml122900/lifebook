-- pgvector extension must exist before any vector(N) column is created.
CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "embedding" vector(1024);

-- HNSW / IVFFlat index intentionally deferred — with ~100 trigger rows
-- planned for Phase 6.3, exact cosine kNN is well under 10ms. Revisit
-- once the catalog grows past a few thousand events.
