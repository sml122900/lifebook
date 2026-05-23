"use client";

import Link from "next/link";
import { useEffect } from "react";

// Route-segment error boundary. Fires when any server component or
// server action in a route throws — Prisma errors, third-party API
// errors, anything that wasn't already caught.
//
// Rule for this file: raw `error.message` MUST NOT appear in the UI.
// Prisma messages can leak SQL fragments and model names; external API
// errors can echo back keys / user input. The user sees a generic
// Korean message; the actual error goes to server logs via
// console.error (Next.js forwards client console.error from this
// component to the server in dev).

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
