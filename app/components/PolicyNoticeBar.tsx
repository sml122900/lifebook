"use client";

// 처리방침·약관 개정 안내 띠 — 로그인한 화면 헤더 아래(root layout). 공지일부터 시행일 뒤 7일까지(lib/policy-notice).
// [닫기] = 그 기기에서 그 판은 숨김(localStorage, 서버·DB 0). 서버 그림·하이드레이션 땐 숨김으로 두고 그 뒤 저장값으로 —
// 닫은 사람에게 잠깐 보였다 사라지는 깜빡임이 없게(사이드 패널과 같은 useSyncExternalStore 방식).

import { useSyncExternalStore } from "react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { noticeClosedKey, noticeHref, type ActiveNotice } from "@/lib/policy-notice";
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
  // 390 에서 한 줄(최대 두 줄 — 넘치면 말줄임): "짧은 요약 · 11월 11일부터 [처리방침 보기] [닫기]", 높이 목표 56~72px(2026-11-04 — 실측 67px).
  // 상세는 버튼(처리방침 = [처리방침 보기], 약관 = [약관 보기]) → 그 문서 맨 위 "개정 안내" 줄(noticeHref).
  return (
    <aside className="border-b border-line bg-banner px-4 py-2 sm:px-6">
      <div className="flex items-center gap-2">
        <p className="m-0 line-clamp-2 min-w-0 flex-1 text-lg leading-snug text-ink">{C.bar(notice)}</p>
        <ButtonLink href={noticeHref(notice)} variant="secondary" className="shrink-0 px-3!">
          {C.more[notice.doc]}
        </ButtonLink>
        <Button
          variant="tertiary"
          className="shrink-0 px-3!"
          onClick={() => {
            window.localStorage.setItem(key, "1");
            window.dispatchEvent(new Event(CLOSE_EVENT));
          }}
        >
          {C.close}
        </Button>
      </div>
    </aside>
  );
}
