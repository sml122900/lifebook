import { ButtonLink } from "@/components/ui/Button";
import { requireLabPage } from "@/lib/lab/access";
import { labSubjectsFor } from "@/lib/lab/gate";

import { SourceDiffPanel } from "./SourceDiffPanel";

// 기억 연구실 첫 화면 — 대상별 원본 변경 확인·동기화 실행(R1-6·R1-7) + 검색 디버그(R1-8)·
// 질의응답(R2-3) 진입.
export default async function LabMemoryPage() {
  const viewerId = await requireLabPage();
  const subjects = labSubjectsFor(viewerId);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">기억 연구실</h1>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/lab/memory/ask" variant="secondary">
            기억에게 물어보기 →
          </ButtonLink>
          <ButtonLink href="/lab/memory/search" variant="tertiary">
            검색 디버그 →
          </ButtonLink>
        </div>
      </div>
      <p className="mt-2 text-ink-soft">
        R1 — 기억 카드 색인·검색 · R2 — 근거 인용 질의응답. 자기 모델(가설,
        R3)은 다음 단계에서 붙습니다.
      </p>

      <section className="mt-6 flex flex-col gap-4">
        <h2 className="text-lg font-bold text-ink">다룰 수 있는 대상</h2>
        {subjects.map((id) => (
          <SourceDiffPanel
            key={id}
            subjectId={id}
            label={id === viewerId ? `${id} (본인)` : id}
          />
        ))}
      </section>
    </div>
  );
}
