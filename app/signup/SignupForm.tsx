"use client";
import Link from "next/link";
import { useActionState } from "react";

import { signupAction } from "./actions";

export function SignupForm() {
  const [error, action, isPending] = useActionState(signupAction, null);

  return (
    <form action={action} className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-name" className="text-sm font-medium text-ink">
          이름 <span className="text-ink-soft">(선택)</span>
        </label>
        <input
          id="signup-name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="홍길동"
          className="min-h-[48px] rounded-md border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="signup-email" className="text-sm font-medium text-ink">
          이메일
        </label>
        <input
          id="signup-email"
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
          htmlFor="signup-password"
          className="text-sm font-medium text-ink"
        >
          비밀번호
        </label>
        <input
          id="signup-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="8자 이상"
          className="min-h-[48px] rounded-md border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1"
        />
        <p className="text-xs text-ink-soft">영문·숫자 조합 8자 이상 권장</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="min-h-[56px] w-full rounded-md bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action/90 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {isPending ? "가입 중…" : "회원가입"}
      </button>

      <p className="text-center text-sm text-ink-soft">
        이미 계정이 있으신가요?{" "}
        <Link
          href="/login"
          className="font-medium text-action underline-offset-2 hover:underline"
        >
          로그인
        </Link>
      </p>
    </form>
  );
}
