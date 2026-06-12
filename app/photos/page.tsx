import Link from "next/link";
import { Camera } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { EmptyState } from "@/components/ui/EmptyState";
import { listUserPhotos } from "@/lib/photos";

import { PhotosGrid } from "./PhotosGrid";
import { PhotosUploadForm } from "./PhotosUploadForm";

// Phase Photo (2단계) — 정식 사진 페이지.
// 사용자가 사진을 올리고 보고 삭제. 인물·장소·연혁 표시는 3~5단계.
// DB(Photo + UserMemory createdVia="photo") 기반 — 1단계의 Storage list
// 방식과 다름.

export const metadata = { title: "내 사진" };

export default async function PhotosPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  let photos: Awaited<ReturnType<typeof listUserPhotos>> = [];
  let listError: string | null = null;
  try {
    photos = await listUserPhotos(session.user.id);
  } catch (e) {
    console.error("[photos-list]", e);
    listError = "사진 목록을 불러오지 못했어요.";
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">
          내 사진
        </h1>
        <p className="mt-3 text-base text-ink-soft">
          잘 기억하고 싶은 사진을 한 장씩 올려주세요. 연혁·인물·장소는
          이어지는 단계에서 붙여집니다.
        </p>
        <Link
          href="/photos/bulk"
          className="mt-4 inline-flex min-h-[52px] items-center justify-center rounded-md border-2 border-amber-500 bg-amber-50 px-5 py-3 text-lg font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        >
          <Camera strokeWidth={1.75} aria-hidden className="mr-1.5 h-5 w-5" />
          여러 장 한꺼번에 올리기
        </Link>
      </header>

      <PhotosUploadForm />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-ink">
          올린 사진 ({photos.length})
        </h2>
        {listError && (
          <p
            role="alert"
            className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900"
          >
            {listError}
          </p>
        )}
        {!listError && photos.length === 0 && (
          <EmptyState
            icon={Camera}
            message="아직 사진이 없어요"
            buttonLabel="사진 추가하기"
            href="/photos/bulk"
          />
        )}
        {photos.length > 0 && <PhotosGrid photos={photos} />}
      </section>
    </main>
  );
}
