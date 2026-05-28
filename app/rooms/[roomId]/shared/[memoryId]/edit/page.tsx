import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { getSharedMemoryForEdit } from "@/lib/shared-memories";

import { updateSharedMemoryAction } from "../../../shared-actions";

// 공동 추억 편집 페이지. getSharedMemoryForEdit 가 멤버십 + roomId 일치를
// 검증(아니면 notFound). 폼 제출은 updateSharedMemoryAction 으로.
type PageProps = {
  params: Promise<{ roomId: string; memoryId: string }>;
};

const CURRENT_YEAR = new Date().getFullYear();

export default async function EditSharedMemoryPage({ params }: PageProps) {
  const { roomId, memoryId } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const memory = await getSharedMemoryForEdit(session.user.id, memoryId);
  if (!memory || memory.roomId !== roomId) {
    notFound();
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href={`/rooms/${roomId}`}
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 룸으로
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-zinc-900">공동 추억 편집</h1>
        <p className="mt-3 text-base text-zinc-700">
          룸 멤버 누구나 함께 다듬을 수 있어요. 저장하시면 마지막 편집자로
          기록됩니다.
        </p>
      </header>

      <form
        action={updateSharedMemoryAction}
        className="flex flex-col gap-4 rounded-md border-2 border-zinc-200 bg-white p-6"
      >
        <input type="hidden" name="memoryId" value={memory.id} />
        <input type="hidden" name="roomId" value={roomId} />

        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold text-zinc-900">연도</span>
            <input
              type="number"
              name="year"
              required
              min={1900}
              max={CURRENT_YEAR}
              defaultValue={memory.year}
              className="w-32 rounded-md border-2 border-zinc-300 px-3 py-2 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-base font-semibold text-zinc-900">월 (선택)</span>
            <input
              type="number"
              name="month"
              min={1}
              max={12}
              defaultValue={memory.month ?? ""}
              className="w-28 rounded-md border-2 border-zinc-300 px-3 py-2 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-zinc-900">제목</span>
          <input
            type="text"
            name="title"
            required
            maxLength={100}
            defaultValue={memory.title}
            className="w-full rounded-md border-2 border-zinc-300 px-3 py-2 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-zinc-900">내용 (선택)</span>
          <textarea
            name="content"
            rows={5}
            maxLength={5000}
            defaultValue={memory.content ?? ""}
            className="w-full rounded-md border-2 border-zinc-300 px-3 py-2 text-lg focus:border-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          />
        </label>

        <div className="flex justify-end gap-3">
          <Link
            href={`/rooms/${roomId}`}
            className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            취소
          </Link>
          <button
            type="submit"
            className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
          >
            저장
          </button>
        </div>
      </form>
    </main>
  );
}
