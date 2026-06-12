"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/Button";

// 이름을 누르면 회원정보/설정/로그아웃이 펼쳐지는 드롭다운.
// 외부 클릭·Esc·항목 선택 시 닫힌다. logoutAction은 server action을
// 부모(layout)에서 prop으로 전달받아 사용 — 클라 컴포넌트가 직접
// signOut을 호출하지 않게 분리.
export function UserMenu({
  label,
  logoutAction,
}: {
  label: string;
  logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={buttonClasses("secondary")}
      >
        {label}
        <span aria-hidden className="ml-1 text-ink-soft">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 flex w-56 flex-col overflow-hidden rounded-md border-2 border-line bg-surface shadow-lg"
        >
          <Link
            href="/account/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="px-5 py-4 text-left text-lg font-medium text-ink hover:bg-banner focus:bg-banner focus:outline-none"
          >
            회원정보
          </Link>
          <Link
            href="/account/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="border-t-2 border-line px-5 py-4 text-left text-lg font-medium text-ink hover:bg-banner focus:bg-banner focus:outline-none"
          >
            설정
          </Link>
          <form action={logoutAction} className="border-t-2 border-line">
            <button
              type="submit"
              role="menuitem"
              className="w-full px-5 py-4 text-left text-lg font-medium text-ink hover:bg-banner focus:bg-banner focus:outline-none"
            >
              로그아웃
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
