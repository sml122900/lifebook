"use client";

import { useState, useTransition } from "react";

import { deleteAccountAction } from "./actions";

// "탈퇴" 입력 + 제출. 시니어 친화: 88px 터치 타깃 / 4px 포커스 링 / 큰 글씨.
// 정확히 두 글자 "탈퇴"를 입력해야만 제출 활성화 — 실수 차단.
export function WithdrawForm() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ready = value.trim() === "탈퇴";

  return (
    <form
      className="flex flex-col gap-4 rounded-md border-2 border-zinc-300 bg-white p-5"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          try {
            await deleteAccountAction(formData);
          } catch (err) {
            // redirect()는 throw로 동작 — Next 내부 redirect 신호는 그대로
            // 흐르도록 두고, 실제 에러만 화면에 표시.
            const message =
              err instanceof Error ? err.message : "잠시 후 다시 시도해 주세요.";
            if (message === "NEXT_REDIRECT") throw err;
            setError("탈퇴를 완료하지 못했어요. 잠시 후 다시 시도해 주세요.");
            console.error("[withdraw]", err);
          }
        });
      }}
    >
      <label className="flex flex-col gap-2 text-lg text-zinc-900">
        <span>
          정말 탈퇴하시려면 아래에 <b>탈퇴</b> 두 글자를 입력해 주세요.
        </span>
        <input
          type="text"
          name="confirmation"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          required
          autoComplete="off"
          className="rounded-md border-2 border-zinc-300 bg-white px-4 py-4 text-xl text-zinc-900 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
        />
      </label>

      {error && (
        <p className="text-base text-rose-700" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={!ready || isPending}
        className="min-h-[88px] rounded-md bg-rose-700 px-6 py-4 text-xl font-bold text-white hover:bg-rose-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
      >
        {isPending ? "탈퇴 처리 중…" : "회원 탈퇴"}
      </button>
    </form>
  );
}
