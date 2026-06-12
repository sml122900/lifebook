import { redirect } from "next/navigation";

import { auth } from "@/auth";
// 2단계 rename — Storage list 헬퍼는 listStoragePhotos 로(lib/photos.ts 의
// listUserPhotos 와 충돌 회피). 이 archived 페이지는 _ 접두사라 라우트 X.
import { listStoragePhotos as listUserPhotos } from "@/lib/storage";

import { TestUploadForm } from "./TestUploadForm";

// Phase Photo 1단계 — Supabase Storage 검증 페이지.
// DB 변경 0 (Photo 모델 X). 사용자 폴더의 파일을 list 로 가져와 signed URL
// 로 표시. 1단계 검증 완료 후 archived 또는 제거 후보.

export const metadata = { title: "사진 업로드 테스트" };

export default async function PhotosTestPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  let photos: { path: string; signedUrl: string; bytes: number }[] = [];
  let listError: string | null = null;
  try {
    photos = await listUserPhotos(session.user.id);
  } catch (e) {
    console.error("[photos-test-list]", e);
    listError = "사진 목록을 불러오지 못했어요.";
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-3xl font-bold text-ink">
          사진 업로드 테스트
        </h1>
        <p className="mt-3 text-base text-ink-soft">
          Supabase Storage 1단계 검증용. jpeg / png / webp, 1장씩, 최대 10MB.
        </p>
      </header>

      <TestUploadForm />

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-ink">
          내 사진 ({photos.length})
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
          <p className="text-sm text-ink-soft">
            아직 사진이 없어요. 위에서 한 장 올려보세요.
          </p>
        )}
        {photos.length > 0 && (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((p) => (
              <li
                key={p.path}
                className="overflow-hidden rounded-md border-2 border-zinc-200 bg-surface"
              >
                {/* 1단계는 단순 img — next/image 의 도메인 화이트리스트 부담 회피. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.signedUrl}
                  alt="업로드한 사진"
                  className="aspect-square w-full object-cover"
                  loading="lazy"
                />
                <p className="px-2 py-1 text-xs text-ink-faint">
                  {(p.bytes / 1024).toFixed(0)} KB
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-ink-faint">
        1단계 검증 페이지. DB 에는 저장 안 됨 — Storage 파일만 표시.
      </p>
    </main>
  );
}
