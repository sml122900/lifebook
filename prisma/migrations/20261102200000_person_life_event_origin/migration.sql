-- 시기↔사람 연결(PersonLifeEvent)의 출처 — 2026-11-02 3단계 E2E(이야기를 지우거나 옮겨도 시기↔사람 연결이 남던 것).
--   DIRECT = 시기 패널에서 직접 넣은 연결(+ 이 칸이 생기기 전의 기존 행 전부 — 보수적으로 지우지 않는다)
--   STORY  = 이야기를 따라 생긴 연결(이야기에 사람 넣기·제안 카드 [만들기]·인물 확인 [맞아요]·다른 시절로 옮기기)
--            → 그 시기 이야기에 그 사람이 하나도 안 나오게 되면(빼기·옮기기·지우기) 코드가 자동으로 지운다.
-- 추가만(기존 행 값 = 'DIRECT'). 설계 docs/phase/my-life-restructure.md §14.7.
-- AlterTable
ALTER TABLE "PersonLifeEvent" ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'DIRECT';
