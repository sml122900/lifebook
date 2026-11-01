// /story-review 와 같은 이유(v3 P22-2) — 완전 동적 화면이라 Link prefetch 가 무거운 렌더를
// 배경에서 태우지 않게 정적 셸을 둔다. 실제 진입 때도 즉시 틀이 보인다.
function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-banner ${className}`} />;
}

export default function MyLifeLoading() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-6 py-6">
      <Bar className="h-10 w-40 self-start" />
      <Bar className="h-[120px] w-[248px] rounded-[50%]" />
      <div className="flex w-full max-w-[342px] justify-between">
        <Bar className="h-24 w-[163px]" />
        <Bar className="h-16 w-[163px]" />
      </div>
      <Bar className="h-[120px] w-[248px] rounded-[50%]" />
    </main>
  );
}
