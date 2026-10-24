// /poster/select 는 후보 입력이 바뀐 로드에서 P1 AI 분류(몇 초)를 기다린다. 그동안
// 빈 화면 대신 이 스켈레톤을 바로 보여 준다(app/story-review/loading.tsx 와 같은 방식).
// page.tsx 의 구조(제목·안내 / 카운터 바 / 후보 카드)만 흉내 — 카드 개수는 임의(4개).
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-banner ${className}`} />;
}

export default function PosterSelectLoading() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex flex-col gap-2">
        <Bar className="h-8 w-72" />
        <Bar className="h-6 w-full" />
        <Bar className="h-6 w-2/3" />
      </header>

      <div className="flex flex-col gap-4">
        <Bar className="h-12" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Bar key={i} className="h-28 border-2 border-line" />
          ))}
        </div>
      </div>
    </main>
  );
}
