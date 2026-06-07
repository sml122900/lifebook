import Link from "next/link";

// 첫 진입(랜딩) 페이지. 서비스 소개 + 타임라인 입구.
// 회원 탈퇴 후 `/?withdrawn=1` 로 돌아오면 작별 안내를 한 번 보여준다.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ withdrawn?: string }>;
}) {
  const params = await searchParams;
  const withdrawn = params.withdrawn === "1"; // 탈퇴 직후 안내 표시 플래그

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
        href="/life-timeline"
        className="text-xl text-blue-700 underline underline-offset-4 hover:text-blue-900"
      >
        내 인생 연혁 보러 가기 →
      </Link>
    </main>
  );
}
