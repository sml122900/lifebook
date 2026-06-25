import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { buildPosterSnapshot } from "@/lib/poster/snapshot";

import { PosterCompose } from "../PosterCompose";
import { savePosterOverrides } from "./actions";

// P4/P6 — 완성 포스터 미리보기 + 액티브 편집(override).
//
// 스냅샷(ownerName/nodes/memos)은 buildPosterSnapshot 가 만든다(주문 생성과
// 공유). 편집(드래그·크기·내용·빼기)은 PosterCompose self-manage +
// savePosterOverrides 영속. "주문하기" → /poster/order(재질·배송·결제).

export const metadata = { title: "인생 나무 포스터" };

export default async function PosterViewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const snapshot = await buildPosterSnapshot(userId, session.user.name ?? "");

  if (!snapshot) {
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

      {/* 상단 주문 CTA — 큰 포스터를 스크롤하기 전에 바로 보이게(시니어 친화). */}
      <Link
        href="/poster/order"
        className="mb-5 flex min-h-[60px] w-full items-center justify-center gap-2 rounded-md bg-amber-500 px-6 py-3 text-xl font-bold text-white hover:bg-amber-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <span aria-hidden>🖼️</span> 이 포스터 주문하기
      </Link>

      <PosterCompose
        ownerName={snapshot.ownerName}
        nodes={snapshot.nodes}
        memos={snapshot.memos}
        editable
        onSave={savePosterOverrides}
      />

      <div className="mt-6 flex flex-col items-center gap-3">
        <Link
          href="/poster/order"
          className="inline-flex min-h-[56px] w-full max-w-sm items-center justify-center rounded-md bg-amber-500 px-6 py-3 text-lg font-bold text-white hover:bg-amber-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          이 포스터로 주문하기
        </Link>
        <p className="text-center text-sm text-ink-faint">
          편집한 위치·크기·내용은 저장해 두면 다음에 와도 그대로예요.
        </p>
      </div>
    </main>
  );
}
