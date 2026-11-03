"use client";

// 처리방침·약관 개정 안내 띠 — 로그인한 화면 헤더 아래(root layout). 공지일부터 시행일 뒤 7일까지(lib/policy-notice).
// [닫기] = 그 기기에서 그 판은 숨김(localStorage, 서버·DB 0). 서버 그림·하이드레이션 땐 숨김으로 두고 그 뒤 저장값으로 —
// 닫은 사람에게 잠깐 보였다 사라지는 깜빡임이 없게(사이드 패널과 같은 useSyncExternalStore 방식).

import { useSyncExternalStore } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { noticeClosedKey, type ActiveNotice } from "@/lib/policy-notice";
import { POLICY_NOTICE_COPY as C } from "@/lib/policy-notice-copy";

const CLOSE_EVENT = "policy-notice-closed";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(CLOSE_EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(CLOSE_EVENT, cb);
  };
}

export function PolicyNoticeBar({ notice }: { notice: ActiveNotice }) {
  const key = noticeClosedKey(notice);
  const closed = useSyncExternalStore(
    subscribe,
    () => window.localStorage.getItem(key) === "1",
    () => true,
  );
  if (closed) return null;
  return (
    <aside className="border-b border-line bg-banner px-6 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="m-0 min-w-0 flex-1 basis-60 text-lg text-ink">{C.bar(notice)}</p>
        <div className="flex gap-2">
          <ButtonLink href={notice.doc === "privacy" ? "/privacy" : "/terms"} variant="secondary">
            {C.more}
          </ButtonLink>
          <Button
            variant="tertiary"
            onClick={() => {
              window.localStorage.setItem(key, "1");
              window.dispatchEvent(new Event(CLOSE_EVENT));
            }}
          >
            {C.close}
          </Button>
        </div>
      </div>
    </aside>
  );
}
