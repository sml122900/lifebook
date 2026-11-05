"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { saveConsent } from "./actions";
import { allConsentChecked, ConsentChecklist, type ConsentChecked } from "./ConsentChecklist";

// 동의 폼(클라) — 이미 있는 계정의 동의(이전 버전 동의자 재동의·동의 전 옛 계정). 새 가입은 계정을 만들기 전에
// /join 에서 동의한다(2026-11-03). 필수 3종 체크리스트(ConsentChecklist — /join 과 공용) + 시작 버튼.
// 저장 후 JWT 를 갱신해야 미들웨어가 consentComplete=true 를 본다.
export function ConsentForm() {
  const [checked, setChecked] = useState<ConsentChecked>({});
  const [submitting, setSubmitting] = useState(false);
  const { update } = useSession();
  const router = useRouter();

  const canSubmit = allConsentChecked(checked);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const formData = new FormData(e.currentTarget);
    await saveConsent(formData);
    // JWT 강제 갱신 — 다음 요청에서 미들웨어가 consentComplete=true 를 보게.
    await update();
    // L7 — /enter 가 신규/기존 분기.
    router.push("/enter");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <ConsentChecklist checked={checked} onChange={setChecked} />

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded-md bg-action px-6 py-4 text-lg font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:text-ink-faint"
      >
        {submitting ? "저장 중..." : "시작하기"}
      </button>
    </form>
  );
}
