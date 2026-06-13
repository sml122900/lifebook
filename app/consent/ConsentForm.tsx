"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

import { saveConsent } from "./actions";

// 동의 폼(클라). 필수 3종 체크박스 + 시작 버튼. 저장 후 JWT 를 갱신해야
// 미들웨어가 consentComplete=true 를 본다.
//
// 문구는 개인정보 처리방침 v1.0(/privacy)과 정합 — 수집·이용은 처리방침
// 1·2항, 국외이전은 3항(Anthropic, PBC / 미국) 기준. "자세히 보기" 가
// /privacy 로 연결된다. 이용약관(terms) 본문 페이지는 아직 없어 그 항목엔
// 링크를 달지 않는다. 정식 출시 전 변호사 검토 필요(특히 이용약관).
const REQUIRED_ITEMS = [
  {
    key: "privacy" as const,
    title: "(필수) 개인정보 수집·이용 동의",
    body:
      "라이프북은 회원 식별과 서비스 제공을 위해 구글 계정 정보(이름·이메일·프로필 이미지)와 " +
      "출생연도, 회원님이 직접 입력하신 인생 기록·사진·가족 공유 내용을 수집·이용합니다. " +
      "음성으로 입력하신 경우 글자로 바뀐 텍스트만 저장하며, 음성 원본은 저장하지 않습니다. " +
      "자세한 수집 항목과 보유 기간은 개인정보 처리방침에서 확인하실 수 있습니다.",
    detailHref: "/privacy" as const,
  },
  {
    key: "overseas" as const,
    title: "(필수) AI 처리를 위한 개인정보 국외 이전 동의",
    body:
      "AI 회상 보조와 문장 다듬기 기능을 제공하기 위해, 회원님이 입력하신 텍스트를 미국에 있는 " +
      "Anthropic, PBC 로 이전합니다. 이 동의는 거부하실 수 있으며, 거부하시는 경우 일부 AI 기능 " +
      "이용이 제한될 수 있습니다.",
    detailHref: "/privacy" as const,
  },
  {
    key: "terms" as const,
    title: "(필수) 서비스 이용약관 동의",
    body: "라이프북 서비스 이용약관에 동의합니다.",
    detailHref: null,
  },
];

export function ConsentForm() {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const { update } = useSession();
  const router = useRouter();

  const canSubmit = REQUIRED_ITEMS.every((i) => checked[i.key]);

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
      {/*
        마케팅 동의 UI 는 일부러 렌더하지 않는다. 예전엔 "(선택) 마케팅
        정보 수신 동의" 체크박스가 있었지만, saveConsent 가 그 값을 저장한
        적이 없고 User 에 marketingConsentAt 컬럼도 없다 — 체크박스를
        보여주면서 조용히 무시하면 정보통신망법 위반 소지. 실제 마케팅
        발송을 붙일 때 marketingConsentAt 컬럼을 추가하고 saveConsent 가
        값을 저장하게 한 "다음에야" UI 를 되살린다.
      */}
      <ul className="flex flex-col gap-6">
        {REQUIRED_ITEMS.map((item) => (
          <li
            key={item.key}
            className="rounded-md border-2 border-line bg-surface p-5"
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
                <div className="text-lg font-semibold text-ink">
                  {item.title}
                </div>
                <p className="mt-2 text-ink">{item.body}</p>
              </div>
            </label>
            {/* 처리방침 자세히 보기 — 라벨 밖 형제(라벨 안이면 클릭이 체크박스를
                토글). 새 창으로 열어 동의 진행 상태를 잃지 않게. */}
            {item.detailHref && (
              <Link
                href={item.detailHref}
                target="_blank"
                rel="noreferrer noopener"
                className="ml-10 mt-3 inline-flex min-h-[48px] items-center text-base font-semibold text-action underline hover:text-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              >
                개인정보 처리방침 자세히 보기 (새 창)
              </Link>
            )}
          </li>
        ))}
      </ul>

      <button
        type="submit"
        disabled={!canSubmit || submitting}
        className="rounded-md bg-action px-6 py-4 text-lg font-semibold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:text-ink-faint"
      >
        {submitting ? "저장 중..." : "시작하기"}
      </button>
    </form>
  );
}
