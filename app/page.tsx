import Link from "next/link";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16">
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
