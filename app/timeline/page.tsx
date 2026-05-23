import { prisma } from "@/lib/db";

// Personalization (filter by birth year) lands in Phase 5.
const DEMO_BIRTH_YEAR = 1990;

export default async function TimelinePage() {
  const events = await prisma.event.findMany({
    where: { category: "anchor" },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-bold">타임라인</h1>
      <p className="mt-2 text-zinc-700">
        데모: {DEMO_BIRTH_YEAR}년생 기준 · 앵커 이벤트 {events.length}개
      </p>
      <ul className="mt-8 space-y-2">
        {events.map((e) => (
          <li key={e.id}>
            <span className="font-semibold">
              {e.year}
              {e.month ? `.${String(e.month).padStart(2, "0")}` : ""}
            </span>{" "}
            — {e.title}
          </li>
        ))}
      </ul>
    </main>
  );
}
