"use client";

// /poster 템플릿 카드의 "이 디자인으로 만들기" — 누른 뒤 다음 화면(/poster/select)이
// 뜰 때까지 다시 못 누르게 막고 진행 중임을 보여 준다(선택 화면 저장 버튼과 같은
// disabled + "저장 중…" 패턴). 부모 <form action={chooseTemplate}> 의 상태를 읽는다.

import { useFormStatus } from "react-dom";

export function TemplateSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-[52px] w-full items-center justify-center rounded-md bg-action px-5 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-line"
    >
      {pending ? "저장 중…" : "이 디자인으로 만들기 →"}
    </button>
  );
}
