import { requireLabPage } from "@/lib/lab/access";
import { labSubjectsFor } from "@/lib/lab/gate";

import { SourceDiffPanel } from "./SourceDiffPanel";

// 기억 연구실 첫 화면. R1-6: 대상별 "원본 변경 확인"(원본 ↔ 색인 원장 비교).
// 동기화 실행·카드·검색 디버그는 R1-7·R1-8 에서.
export default async function LabMemoryPage() {
  const viewerId = await requireLabPage();
  const subjects = labSubjectsFor(viewerId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">기억 연구실</h1>
      <p className="mt-2 text-ink-soft">
        R1 진행 중 — 원본 변경 확인까지. 기억 카드 추출·검색은 다음 단계에서
        붙습니다.
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
