import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLifeEvents } from "@/lib/life-events";
import { refineForPosterBatch } from "@/lib/poster/poster-sentences";

import { PosterCompose, type PosterNode } from "../PosterCompose";

// P4 — selections → P3 문장 → SVG 합성 포스터(정적 미리보기).
//
// Poster.selections(P2 저장)를 읽어 각 사건을 P3 refineForPoster 로 노드/메모
// 문장으로 바꾼 뒤 PosterCompose(클라)에 넘긴다. 합성·배치는 클라에서.
//
// refineForPosterBatch 가 매 진입 시 1콜(선택분 일괄) — 후속: 문장 캐싱.

export const metadata = { title: "인생 나무 포스터" };

type Sel = { eventId: string; type: "node" | "memo"; order: number };

export default async function PosterViewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [poster, events] = await Promise.all([
    prisma.poster.findUnique({ where: { userId }, select: { selections: true } }),
    getLifeEvents(userId),
  ]);

  const byId = new Map(
    events.filter((e) => e.kind === "life_event").map((e) => [e.id, e]),
  );
  const raw = Array.isArray(poster?.selections) ? (poster.selections as Sel[]) : [];
  const ordered = raw
    .filter((s) => s && typeof s.eventId === "string" && byId.has(s.eventId))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (ordered.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 text-center">
        <p className="text-lg text-ink-soft">
          아직 포스터에 담은 이야기가 없어요.
        </p>
        <Link
          href="/poster/select"
          className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover"
        >
          담을 이야기 고르기
        </Link>
      </main>
    );
  }

  // P3 문장 일괄 변환(선택 순서 보존).
  const inputs = ordered.map((s) => {
    const e = byId.get(s.eventId)!;
    return { title: e.title, content: e.content, year: e.eventYear };
  });
  const sentences = await refineForPosterBatch(inputs);

  const nodes: PosterNode[] = [];
  const memos: string[] = [];
  ordered.forEach((s, i) => {
    const sent = sentences[i];
    if (!sent) return;
    if (s.type === "node") {
      nodes.push({ year: byId.get(s.eventId)!.eventYear, label: sent.nodeLabel });
    } else {
      memos.push(sent.memoText);
    }
  });

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">인생 나무 포스터</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/poster/select"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-banner"
          >
            ← 다시 고르기
          </Link>
          <Link
            href="/poster"
            className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:bg-banner"
          >
            ← 템플릿 바꾸기
          </Link>
        </div>
      </header>

      <PosterCompose
        ownerName={session.user.name ?? ""}
        nodes={nodes}
        memos={memos}
      />

      <p className="mt-4 text-center text-sm text-ink-faint">
        미리보기예요. 위치·크기 직접 편집과 인쇄본 만들기는 다음 단계예요.
      </p>
    </main>
  );
}
