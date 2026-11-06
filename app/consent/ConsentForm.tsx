"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { saveConsent } from "./actions";
import { JOIN_COPY } from "@/lib/join-copy";

import { allConsentChecked, ConsentChecklist, type ConsentChecked } from "./ConsentChecklist";

const BUTTON = "w-full rounded-md bg-action px-6 py-4 text-lg font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:text-ink-faint";

// 동의 폼(클라) — 이미 있는 계정의 동의(이전 버전 동의자 재동의·동의 전 옛 계정). 새 가입은 계정을 만들기 전에
// /join 에서 동의한다(2026-11-03). 필수 3종 체크리스트(ConsentChecklist — /join 과 공용) + 시작 버튼.
// 저장 후 JWT 를 갱신해야 미들웨어가 consentComplete=true 를 본다.
export function ConsentForm() {
  const [checked, setChecked] = useState<ConsentChecked>({});
  // saving = 저장·세션 갱신 중 · saveFailed = 저장 못 함(다시 제출) · syncFailed = 저장은 됐고 세션 갱신만 못 함(다시 시도 = 갱신만)
  const [phase, setPhase] = useState<"idle" | "saving" | "saveFailed" | "syncFailed">("idle");
  const { status, update } = useSession();
  const router = useRouter();

  // 준비 = 하이드레이션 + 첫 세션 응답(서버 그림·하이드레이션 때 status 는 "loading"). update() 는 첫 세션을 받는 중이면 아무것도 안 하고
  // 돌아온다 — 그때 제출하면 저장은 되는데 쿠키가 옛 값이라 /enter → /consent 로 돌아와 "저장 중..." 에 멈췄다(2026-11-06 실측 3/3).
  const ready = status !== "loading";
  const canSubmit = ready && allConsentChecked(checked);

  // JWT 강제 갱신 — 다음 요청에서 미들웨어가 consentComplete=true 를 보게. 네트워크 오류면 update() 가 던지지 않고 빈 값을 돌려준다 —
  // 그대로 /enter 로 가면 쿠키가 옛 값이라 /consent 로 돌아와 "저장 중..." 에 멈췄다. DB 는 이미 저장됐으니 다시 시도는 이 함수만.
  async function syncSession() {
    setPhase("saving");
    const session = await update();
    if (!session) {
      setPhase("syncFailed");
      return;
    }
    // L7 — /enter 가 신규/기존 분기.
    router.push("/enter");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPhase("saving");
    const formData = new FormData(e.currentTarget);
    try {
      await saveConsent(formData);
    } catch {
      setPhase("saveFailed");
      return;
    }
    await syncSession();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8">
      <ConsentChecklist checked={checked} onChange={setChecked} ready={ready && phase !== "syncFailed"} />

      {phase === "syncFailed" ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="m-0 text-lg text-danger">
            {JOIN_COPY.syncFailed}
          </p>
          <button type="button" onClick={syncSession} className={BUTTON}>
            {JOIN_COPY.retry}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {phase === "saveFailed" && (
            <p role="alert" className="m-0 text-lg text-danger">
              {JOIN_COPY.saveFailed}
            </p>
          )}
          <button type="submit" disabled={!canSubmit || phase === "saving"} className={BUTTON}>
            {phase === "saving" ? "저장 중..." : ready ? "시작하기" : JOIN_COPY.preparing}
          </button>
        </div>
      )}
    </form>
  );
}
