// v3 P22-2 — /story-review 는 getStoryReviewData+detectGaps(여러 쿼리)를
// 도는 완전 동적 렌더라, 이 파일이 없으면 Next 의 기본(auto) Link prefetch
// 가 미리 보여줄 정적 셸이 없어 그 무거운 렌더를 그대로 백그라운드에서
// 태운다(간헐 503 추정 원인). 이 스켈레톤이 prefetch 대상이 되고, 실제
// 진입 시에도 즉시 화면이 채워져 체감이 개선된다. page.tsx 의 섹션 구조
// (타임라인/이야기/갭)만 그대로 흉내 — 실 데이터는 없으니 개수·문구는
// 임의(3개).
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-banner ${className}`} />;
}

export default function StoryReviewLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Bar className="h-9 w-64" />
        <Bar className="h-6 w-80" />
      </header>

      <section className="flex flex-col gap-4">
        <Bar className="h-7 w-32" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Bar key={i} className="h-16 rounded-md border-2 border-line" />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <Bar className="h-7 w-40" />
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => (
            <Bar key={i} className="h-24 rounded-md border-2 border-line" />
          ))}
        </div>
      </section>

      <Bar className="h-14 rounded-md" />
    </main>
  );
}
