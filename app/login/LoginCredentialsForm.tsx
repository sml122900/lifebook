"use client";
import Link from "next/link";
import { useActionState } from "react";

import { credentialsSignInAction } from "./actions";

export function LoginCredentialsForm() {
  const [error, action, isPending] = useActionState(
    credentialsSignInAction,
    null
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="login-email" className="text-sm font-medium text-ink">
          이메일
        </label>
        <input
          id="login-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="example@email.com"
          className="min-h-[48px] rounded-md border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="login-password"
          className="text-sm font-medium text-ink"
        >
          비밀번호
        </label>
        <input
          id="login-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="8자 이상"
          className="min-h-[48px] rounded-md border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-[56px] w-full rounded-md bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action/90 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? "로그인 중…" : "이메일로 로그인"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        계정이 없으신가요?{" "}
        <Link
          href="/signup"
          className="font-medium text-action underline-offset-2 hover:underline"
        >
          회원가입
        </Link>
      </p>
    </form>
  );
}
