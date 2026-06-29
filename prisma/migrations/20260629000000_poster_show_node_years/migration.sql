-- 포스터 노드 연도 표시 토글. 기본 false=숨김(어르신 연도 부정확 대비, 제목만).
ALTER TABLE "Poster" ADD COLUMN "showNodeYears" BOOLEAN NOT NULL DEFAULT false;
