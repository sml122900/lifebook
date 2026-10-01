import { ButtonLink } from "@/components/ui/Button";
import { requireLabPage } from "@/lib/lab/access";
import { labSubjectsFor } from "@/lib/lab/gate";

import { AskPanel } from "./AskPanel";

// 에이전트 1회가 도구 여러 라운드를 돌아 수십 초 걸릴 수 있다(이 화면의 서버 액션에 적용).
export const maxDuration = 60;

// 기억 질의응답(R2-3) — 질문 → 인용이 달린 답 + 근거 카드·검증 통계·원가. 답은 LabAgentRun 에 남는다.
export default async function LabMemoryAskPage() {
  const viewerId = await requireLabPage();
  const subjects = labSubjectsFor(viewerId).map((id) => ({
    id,
    label: id === viewerId ? `${id} (본인)` : id,
  }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">기억에게 물어보기</h1>
        <ButtonLink href="/lab/memory" variant="tertiary">
          ← 연구실
        </ButtonLink>
      </div>
      <p className="mt-2 text-ink-soft">
        답은 기억 카드에서만 찾고, 문장마다 근거 번호가 붙어요. 근거가 없으면
        &quot;아직 들려주신 적 없는 이야기&quot;로 답해요.
      </p>
      <AskPanel subjects={subjects} />
    </div>
  );
}
