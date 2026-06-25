"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/Button";

// 충전 완료 화면 — 정상 적립과 "이미 충전됨"(재방문/idempotent) 양쪽 공용.
// tokensCredited === 0 이면 이미 처리된 결제라 추가 청구가 없었음을 안내한다.
//
// 결제 직후엔 사이드 패널(루트 레이아웃)이 충전 전 잔액을 들고 있어 패널이 stale.
// 마운트 시 한 번만 router.refresh() 로 레이아웃 서버 컴포넌트를 다시 읽어 패널을
// 최신 잔액으로 맞춘다. 단 새로고침하면 서버 페이지가 idempotent 분기로 다시
// 그려져 적립 안내가 "이미 충전됐어요"로 바뀌므로, 표시값은 첫 렌더 값으로
// 고정(useState 초기값)해 메시지가 뒤집히지 않게 한다.
export function SuccessScreen({
  tokensCredited,
  balanceAfter,
}: {
  tokensCredited: number;
  balanceAfter: number;
}) {
  const [credited] = useState(tokensCredited);
  const [balance] = useState(balanceAfter);
  const router = useRouter();
  const refreshed = useRef(false);

  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    router.refresh();
  }, [router]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-10">
      <h1 className="text-3xl font-bold text-ink">충전 완료!</h1>
      <p className="text-2xl text-ink">
        {credited > 0 ? (
          <>
            <span className="font-bold">{credited}개 토큰</span>이 적립됐어요.
          </>
        ) : (
          <>이미 충전됐어요. 추가로 결제되지 않았어요.</>
        )}
      </p>
      <p className="text-lg text-ink">
        남은 토큰{" "}
        <span className="font-bold">{balance.toLocaleString()}개</span>
      </p>
      <div className="flex gap-3">
        <Link href="/life-timeline" className={buttonClasses("tertiary", "lg")}>
          인생 연혁으로
        </Link>
        <Link
          href="/billing"
          className="rounded-md border-2 border-line px-6 py-4 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          충전 화면으로
        </Link>
      </div>
    </main>
  );
}
