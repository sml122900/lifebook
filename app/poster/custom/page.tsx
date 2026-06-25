import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { getBgSetStatus, CUSTOM_BG_TOKEN_COST, IMAGES_PER_SET } from "@/lib/poster/background-set";
import { getPreferences } from "@/lib/poster/preferences";
import { getBalance } from "@/lib/tokens/wallet";

import { CustomBackgroundClient } from "./CustomBackgroundClient";

// P5-5b — 맞춤배경 생성 화면. 취향 확인/입력 → 생성 → 미리보기 → 다시생성.
// Storage 영속·template=custom 저장·P4 분기는 5c.

export const metadata = { title: "맞춤 배경 만들기" };

export default async function PosterCustomPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [prefs, setStatus, balance] = await Promise.all([
    getPreferences(userId),
    getBgSetStatus(userId),
    getBalance(userId),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <Link
          href="/poster"
          className="text-base font-semibold text-ink-soft underline-offset-4 hover:underline"
        >
          ← 디자인 고르기로
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-ink">맞춤 배경 만들기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          좋아하시는 색·꽃·분위기로 배경 그림을 새로 그려드려요.
        </p>
      </header>

      <CustomBackgroundClient
        extracted={prefs.extracted}
        initialUserPrefs={prefs.user}
        initialRegensLeft={setStatus.regensLeft}
        initialSetExhausted={setStatus.setExhausted}
        initialBalance={balance}
        tokenCost={CUSTOM_BG_TOKEN_COST}
        imagesPerSet={IMAGES_PER_SET}
      />
    </main>
  );
}
