import Link from "next/link";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ withdrawn?: string }>;
}) {
  const params = await searchParams;
  const withdrawn = params.withdrawn === "1";
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
      {withdrawn && (
        <div className="max-w-md rounded-md border-2 border-emerald-200 bg-emerald-50 px-5 py-4 text-center text-lg text-zinc-900">
          탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.
        </div>
      )}
      <h1 className="text-5xl font-bold tracking-tight">Lifebook</h1>
      <p className="max-w-md text-center text-xl text-zinc-700">
        나의 인생 연혁표를 AI와 함께 채워나가는 회고 서비스
      </p>
      <Link
        href="/timeline"
        className="text-xl text-blue-700 underline underline-offset-4 hover:text-blue-900"
      >
        타임라인 보러 가기 →
      </Link>
    </main>
  );
}
