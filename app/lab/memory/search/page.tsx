import { ButtonLink } from "@/components/ui/Button";
import { requireLabPage } from "@/lib/lab/access";
import { labSubjectsFor } from "@/lib/lab/gate";

import { SearchPanel } from "./SearchPanel";

// 기억 카드 검색 디버그(R1-8) — 점수 분해(벡터·키워드·RRF·최종)와 생존 확인 결과를 본다.
export default async function LabMemorySearchPage() {
  const viewerId = await requireLabPage();
  const subjects = labSubjectsFor(viewerId).map((id) => ({
    id,
    label: id === viewerId ? `${id} (본인)` : id,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">기억 카드 검색 디버그</h1>
        <ButtonLink href="/lab/memory" variant="tertiary">
          ← 연구실
        </ButtonLink>
      </div>
      <SearchPanel subjects={subjects} />
    </div>
  );
}
