import type { Metadata } from "next";
import Link from "next/link";

import { BUSINESS_INFO } from "@/lib/commerce/business";
import { HelpFaq } from "./HelpFaq";

// 고객센터 — FAQ(아코디언) + 이메일 문의. 어르신·가족 대상, 쉬운 말.
// 순수 정적 콘텐츠라 auth() 미호출 → proxy PUBLIC_PATHS 로 비로그인도 열람 가능.

export const metadata: Metadata = { title: "고객센터 | 라이프북" };

export default function HelpPage() {
  const cs = BUSINESS_INFO.csEmail;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">고객센터</h1>
        <p className="text-lg text-ink-soft">
          궁금한 점을 모았어요. 아래에서 찾아보시고, 더 궁금하면 이메일로 문의해 주세요.
        </p>
      </header>

      <HelpFaq />

      {/* 이메일 문의 */}
      <section className="flex flex-col gap-3 rounded-md border-2 border-brand bg-banner p-6">
        <h2 className="text-2xl font-bold text-action">이메일로 문의하기</h2>
        <p className="text-lg text-ink">
          위에서 답을 못 찾으셨나요? 편하게 이메일로 보내주세요.
        </p>

        <a
          href={`mailto:${cs}`}
          className="inline-flex min-h-[56px] w-full items-center justify-center rounded-md bg-action px-6 py-4 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 sm:w-auto sm:self-start"
        >
          이메일로 문의하기
        </a>
        <p className="text-base text-ink-soft">
          또는 <span className="font-semibold text-ink">{cs}</span> 로 보내주셔도 돼요.
        </p>
        <p className="text-base text-ink-soft">
          평일 오전 10시~오후 6시, 1~2일 내 답변드려요.
        </p>

        <div className="mt-2 rounded-md border-2 border-line bg-surface p-4">
          <p className="text-base font-semibold text-ink">
            문의 시 알려주시면 더 빨리 도와드려요
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-base text-ink-soft">
            <li>• 가입하신 이메일 주소</li>
            <li>• 문제가 생긴 화면</li>
            <li>• 어떤 상황이었는지</li>
          </ul>
        </div>
      </section>

      <Link
        href="/life-timeline"
        className="self-start text-lg text-ink-soft underline-offset-4 hover:underline"
      >
        ← 인생 연혁으로
      </Link>
    </main>
  );
}
