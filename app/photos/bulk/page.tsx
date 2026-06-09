import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

import { BulkUploadForm } from "./BulkUploadForm";

// Phase Photo 6 (2단계) — 대량 업로드 페이지.
// 여러 장을 한 번에 골라 날짜순으로 연혁에 담는다. 단일 업로드(/photos)와 별도.

export const metadata = { title: "사진 여러 장 올리기 — 내 사진" };

export default async function BulkPhotosPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <p className="text-base text-zinc-600">
          <Link href="/photos" className="underline hover:text-zinc-900">
            ← 내 사진으로
          </Link>
        </p>
        <h1 className="mt-2 text-3xl font-bold text-zinc-900 sm:text-4xl">
          사진 여러 장 올리기
        </h1>
        <p className="mt-3 text-lg text-zinc-700">
          여러 장을 한 번에 고르면 찍은 날짜순으로 정리해서 연혁에 담아드려요.
          날짜가 틀리면 바로 고치실 수 있어요.
        </p>
      </header>

      <BulkUploadForm />
    </main>
  );
}
