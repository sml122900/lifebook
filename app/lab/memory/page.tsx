import { requireLabPage } from "@/lib/lab/access";
import { labSubjectsFor } from "@/lib/lab/gate";

// 기억 연구실 첫 화면(R1-2 골격). 색인 상태·동기화·카드·검색 디버그는 R1-8 에서.
export default async function LabMemoryPage() {
  const viewerId = await requireLabPage();
  const subjects = labSubjectsFor(viewerId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink">기억 연구실</h1>
      <p className="mt-2 text-ink-soft">
        R1 진행 중 — 기억 카드 색인·검색은 다음 단계에서 붙습니다.
      </p>

      <section className="mt-6">
        <h2 className="text-lg font-bold text-ink">다룰 수 있는 대상</h2>
        <ul className="mt-2 space-y-1">
          {subjects.map((id) => (
            <li key={id} className="font-mono text-ink">
              {id}
              {id === viewerId ? " (본인)" : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
