"use client";

import { useState } from "react";

import { joinRoomAction } from "./actions";

// 클라 컴포넌트 — 동의 체크 전까지 합류 버튼을 비활성화하기 위함. 서버
// 액션이 같은 조건을 재검증하므로 변조된 폼으로는 우회할 수 없다.

export function ConsentForm({ token }: { token: string }) {
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      action={async (formData) => {
        setSubmitting(true);
        try {
          await joinRoomAction(formData);
        } finally {
          setSubmitting(false);
        }
      }}
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="token" value={token} />

      <label className="flex cursor-pointer items-start gap-4 rounded-md border-2 border-zinc-200 bg-white p-5">
        <input
          type="checkbox"
          name="agree"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 h-6 w-6 accent-zinc-900"
        />
        <span className="text-lg text-zinc-900">
          이 룸에 참여하면 <strong>내가 작성한 추억이 룸 멤버에게
          보입니다</strong>. 위 내용에 동의합니다.
        </span>
      </label>

      <div className="flex justify-between gap-4">
        <a
          href="/rooms"
          className="rounded-md border-2 border-zinc-300 px-6 py-4 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          나중에 하기
        </a>
        <button
          type="submit"
          disabled={!agreed || submitting}
          className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          {submitting ? "참여하는 중..." : "동의하고 참여"}
        </button>
      </div>
    </form>
  );
}
