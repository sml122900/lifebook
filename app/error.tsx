"use client";

import Link from "next/link";
import { useEffect } from "react";

// 라우트 세그먼트 에러 경계. 라우트 안의 서버 컴포넌트나 서버 액션이
// throw 하면(Prisma 에러, 외부 API 에러 등 미처 못 잡은 모든 것) 발동.
//
// 이 파일의 철칙: 원본 `error.message` 를 UI 에 절대 노출하지 않는다.
// Prisma 메시지엔 SQL 조각·모델명이, 외부 API 에러엔 키·사용자 입력이
// 새어나올 수 있다. 사용자에겐 일반적인 한국어 안내만 보여주고, 실제
// 에러는 console.error 로 서버 로그에 남긴다 (dev 에선 Next 가 이 컴포넌트의
// console.error 를 서버로 전달).

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[error boundary]", error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold text-zinc-900 sm:text-4xl">
        잠깐, 문제가 생겼어요
      </h1>
      <p className="text-lg text-zinc-800">
        일시적인 오류일 수 있어요. 당신 잘못이 아니에요. 다시 시도하시거나
        타임라인으로 돌아가 주세요.
      </p>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          다시 시도
        </button>
        <Link
          href="/timeline"
          className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          타임라인으로 돌아가기
        </Link>
      </div>
      {error.digest && (
        <p className="mt-2 text-sm text-zinc-500">
          문의 시 알려주세요: {error.digest}
        </p>
      )}
    </main>
  );
}
