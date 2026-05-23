"use client";

import { useState } from "react";

import { saveConsent } from "./actions";

// TODO: 법무 검토 필요 — 아래 동의 문구는 모두 임시 플레이스홀더이며,
// 정식 출시 전에 변호사 검토를 거쳐 정식 약관/개인정보처리방침으로 교체해야 한다.
const REQUIRED_ITEMS = [
  {
    key: "privacy" as const,
    title: "(필수) 개인정보 수집·이용 동의",
    body:
      "이름, 이메일, 출생연도 등 서비스 운영에 필요한 최소한의 개인정보를 수집·이용합니다. " +
      "자세한 항목과 보유 기간은 추후 개인정보처리방침에서 안내합니다.",
  },
  {
    key: "overseas" as const,
    title: "(필수) AI 처리를 위한 국외이전 동의",
    body:
      "AI 기능을 사용할 때 입력하신 내용이 해외에 있는 AI 서비스(예: Anthropic 등)로 " +
      "전송될 수 있습니다. 처리 목적과 보관 기간, 이전 국가는 별도 안내합니다.",
  },
  {
    key: "terms" as const,
    title: "(필수) 서비스 이용약관 동의",
    body: "Lifebook 서비스 이용약관에 동의합니다.",
  },
];

export function ConsentForm() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const canSubmit = REQUIRED_ITEMS.every((i) => checked[i.key]);

  return (
    <form action={saveConsent} className="flex flex-col gap-8">
      <ul className="flex flex-col gap-6">
        {REQUIRED_ITEMS.map((item) => (
          <li
            key={item.key}
            className="rounded-md border-2 border-zinc-200 bg-white p-5"
          >
            <label className="flex cursor-pointer items-start gap-4">
              <input
                type="checkbox"
                name={item.key}
                checked={checked[item.key] ?? false}
                onChange={(e) =>
                  setChecked((s) => ({ ...s, [item.key]: e.target.checked }))
                }
                className="mt-1 h-6 w-6 accent-zinc-900"
              />
              <div>
                <div className="text-lg font-semibold text-zinc-900">
                  {item.title}
                </div>
                <p className="mt-2 text-zinc-800">{item.body}</p>
              </div>
            </label>
          </li>
        ))}

        {/* 선택 항목 — 분리, 사전 체크 없음 */}
        <li className="rounded-md border-2 border-dashed border-zinc-200 bg-zinc-50 p-5">
          <label className="flex cursor-pointer items-start gap-4">
            <input
              type="checkbox"
              name="marketing"
              className="mt-1 h-6 w-6 accent-zinc-900"
            />
            <div>
              <div className="text-lg font-semibold text-zinc-900">
                (선택) 마케팅 정보 수신 동의
              </div>
              <p className="mt-2 text-zinc-800">
                새로운 기능·이벤트 안내를 이메일로 받아볼 수 있습니다. 동의하지
                않아도 서비스 이용에 제한이 없습니다.
              </p>
            </div>
          </label>
        </li>
      </ul>

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-300 disabled:text-zinc-500"
      >
        시작하기
      </button>
    </form>
  );
}
