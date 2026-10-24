// /interview 는 첫 진입 때 오늘 계획을 계산한다(detectGaps 포함, 몇 초). 이 파일이 없으면
// /story-review 카드 링크를 눌러도 그 렌더가 끝날 때까지 이전 화면에 머물렀다(운영 E2E
// 2026-10-25, 3~8초). 스켈레톤을 바로 보여 준다(app/story-review/loading.tsx·
// app/poster/select/loading.tsx 와 같은 방식). page.tsx 의 문항 화면 구조(진행 표시 / 질문 /
// 입력칸 / 버튼)만 흉내 — 문구 없음.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-banner ${className}`} />;
}

export default function InterviewLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <Bar className="h-6 w-16" />
      <div className="flex flex-col gap-2">
        <Bar className="h-9 w-full" />
        <Bar className="h-9 w-2/3" />
      </div>
      <Bar className="h-32 border-2 border-line" />
      <div className="flex flex-col gap-3">
        <Bar className="h-14" />
        <Bar className="h-14" />
      </div>
    </main>
  );
}
