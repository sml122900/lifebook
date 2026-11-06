"use client";

import { useState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";

import { allConsentChecked, ConsentChecklist, type ConsentChecked } from "@/app/consent/ConsentChecklist";
import { InAppGoogleNote } from "@/app/login/InAppBrowserGuard";
import { JOIN_COPY as C } from "@/lib/join-copy";

import { joinAction } from "./actions";

type Method = "kakao" | "naver" | "google" | "email";

// 가입 방법 버튼 — 브랜드 색은 로그인 화면과 같은 디자인 토큰 예외(카카오·네이버 가이드), 시니어 규격(56px·18px) 유지.
const BUTTON: Record<Method, string> = {
  kakao: "text-lg font-semibold bg-[#FEE500] text-[#191600] hover:bg-[#FDD835] focus-visible:ring-brand",
  // 네이버 — 공식 권장 녹색형(가이드 2026-11-05 확인 — #03A94D · 로고·레이블 #FFFFFF, 간격 8px — 로그인 화면과 같은 꼴).
  // 흰 글자 3.09:1 → 레이블 큰 글자(굵게 19px, 3:1 기준), 지정 색이라 마우스 올림 색 변화 없음(Q154)
  naver: "gap-2 text-[19px] font-bold bg-[#03A94D] text-[#FFFFFF] focus-visible:ring-brand",
  google: "text-lg font-semibold border border-brand bg-surface text-action hover:bg-banner focus-visible:ring-brand",
  email: "text-lg font-semibold border border-line bg-surface text-ink hover:bg-banner focus-visible:ring-brand",
};

// 하이드레이션 여부만 보는 useSyncExternalStore 용 — 바뀌는 외부 값이 없어 구독할 것도 없다.
const noopSubscribe = () => () => {};

function MethodButton({ method, enabled }: { method: Method; enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="method"
      value={method}
      disabled={!enabled || pending}
      className={`flex min-h-[56px] w-full items-center justify-center rounded-md px-6 py-4 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[method]}`}
    >
      {/* 네이버 버튼은 가이드대로 N 로고 + 레이블(아이콘·레이블 구성) */}
      {method === "naver" && !pending && (
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="#FFFFFF">
          <path d="M16.273 12.845 7.376 0H0v24h7.726V11.156L16.624 24H24V0h-7.727v12.845z" />
        </svg>
      )}
      {pending ? C.pending : C[method]}
    </button>
  );
}

export function JoinForm({ first, consentError }: { first: Method | null; consentError: boolean }) {
  const [checked, setChecked] = useState<ConsentChecked>({});
  const ok = allConsentChecked(checked);
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false); // 하이드레이션 전 false — 체크칸 잠금(ConsentChecklist)
  const order: Method[] = ["kakao", "naver", "google", "email"];
  const methods = first ? [first, ...order.filter((m) => m !== first)] : order;
  return (
    <form action={joinAction} className="flex flex-col gap-8">
      <ConsentChecklist checked={checked} onChange={setChecked} ready={ready} />
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
            <p className="m-0 text-lg text-ink-soft">{ready ? C.needAll : C.preparing}</p>
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
