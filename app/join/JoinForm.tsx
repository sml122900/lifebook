"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { allConsentChecked, ConsentChecklist, type ConsentChecked } from "@/app/consent/ConsentChecklist";
import { InAppGoogleNote } from "@/app/login/InAppBrowserGuard";
import { JOIN_COPY as C } from "@/lib/join-copy";

import { joinAction } from "./actions";

type Method = "kakao" | "naver" | "google" | "email";

// 가입 방법 버튼 — 브랜드 색은 로그인 화면과 같은 디자인 토큰 예외(카카오·네이버 가이드), 시니어 규격(56px·18px) 유지.
const BUTTON: Record<Method, string> = {
  kakao: "bg-[#FEE500] text-[#191600] hover:bg-[#FDD835] focus-visible:ring-brand",
  // 네이버 — 흰 바탕 + 어두운 글자(2026-11-05 밤 우주 전원 — 초록 바탕 흰 글자 2.25:1 미달, 로그인 화면과 같은 꼴)
  naver: "bg-[#FFFFFF] text-[#1F1F1F] hover:bg-[#F2F2F2] focus-visible:ring-brand",
  google: "border border-brand bg-surface text-action hover:bg-banner focus-visible:ring-brand",
  email: "border border-line bg-surface text-ink hover:bg-banner focus-visible:ring-brand",
};

function MethodButton({ method, enabled }: { method: Method; enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="method"
      value={method}
      disabled={!enabled || pending}
      className={`flex min-h-[56px] w-full items-center justify-center rounded-md px-6 py-4 text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[method]}`}
    >
      {pending ? C.pending : C[method]}
    </button>
  );
}

export function JoinForm({ first, consentError }: { first: Method | null; consentError: boolean }) {
  const [checked, setChecked] = useState<ConsentChecked>({});
  const ok = allConsentChecked(checked);
  const order: Method[] = ["kakao", "naver", "google", "email"];
  const methods = first ? [first, ...order.filter((m) => m !== first)] : order;
  return (
    <form action={joinAction} className="flex flex-col gap-8">
      <ConsentChecklist checked={checked} onChange={setChecked} />
      <section className="flex flex-col gap-4" aria-labelledby="join-methods">
        <h2 id="join-methods" className="m-0 text-2xl font-bold text-ink">
          {C.methodsTitle}
        </h2>
        {/* 동의 전 안내 한 줄 — 동의 없이 제출돼 돌아왔으면(consentError) 같은 자리에 오류 문구만(둘이 같이 뜨지 않게), 모두 동의하면 사라짐 */}
        {!ok &&
          (consentError ? (
            <p role="alert" className="m-0 text-lg text-danger">
              {C.consentError}
            </p>
          ) : (
            <p className="m-0 text-lg text-ink-soft">{C.needAll}</p>
          ))}
        {methods.map((m) => (
          <div key={m} className="flex flex-col gap-2">
            <MethodButton method={m} enabled={ok} />
            {m === "google" && <InAppGoogleNote />}
          </div>
        ))}
      </section>
    </form>
  );
}
