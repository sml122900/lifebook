"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { saveConsent } from "./actions";
import { JOIN_COPY } from "@/lib/join-copy";

import { allConsentChecked, ConsentChecklist, type ConsentChecked } from "./ConsentChecklist";

// 동의 폼(클라) — 이미 있는 계정의 동의(이전 버전 동의자 재동의·동의 전 옛 계정). 새 가입은 계정을 만들기 전에
// /join 에서 동의한다(2026-11-03). 필수 3종 체크리스트(ConsentChecklist — /join 과 공용) + 시작 버튼.
// 저장 후 JWT 를 갱신해야 미들웨어가 consentComplete=true 를 본다.
export function ConsentForm() {
  const [checked, setChecked] = useState<ConsentChecked>({});
  const [submitting, setSubmitting] = useState(false);
  const { status, update } = useSession();
  const router = useRouter();

  // 준비 = 하이드레이션 + 첫 세션 응답(서버 그림·하이드레이션 때 status 는 "loading"). update() 는 첫 세션을 받는 중이면 아무것도 안 하고
  // 돌아온다 — 그때 제출하면 저장은 되는데 쿠키가 옛 값이라 /enter → /consent 로 돌아와 "저장 중..." 에 멈췄다(2026-11-06 실측 3/3).
  const ready = status !== "loading";
  const canSubmit = ready && allConsentChecked(checked);

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
      <ConsentChecklist checked={checked} onChange={setChecked} ready={ready} />

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded-md bg-action px-6 py-4 text-lg font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:text-ink-faint"
      >
        {submitting ? "저장 중..." : ready ? "시작하기" : JOIN_COPY.preparing}
      </button>
    </form>
  );
}
