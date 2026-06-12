import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import { FOOTER, PRIVACY_HREF, S1, S2, S3, S4, S5, S6 } from "@/lib/landing-copy";

// 랜딩(/) — 비로그인 전용. 로그인 사용자는 /life-timeline 로 보낸다.
// 회원 탈퇴 후 `/?withdrawn=1` 로 돌아오면 작별 안내를 한 번 보여준다.
//
// 헤더(로고 + 로그인)는 app/layout.tsx 가 비로그인에게 이미 렌더 → 여기선
// 섹션만. 디자인 토큰 가이드 v1.0: primary 버튼은 S1·S6 두 곳만, 본문 18px
// 하한(text-lg), cream(canvas) 배경.

export const metadata = {
  title: "라이프북 — 부모님의 인생을 한 권으로",
  description:
    "기억은 흐려져도 기록은 흐려지지 않습니다. 부모님의 이야기를 AI와 함께 한 권으로 남기는 회고 서비스.",
};

// 이미지 placeholder 슬롯 — 실화면 캡처를 끼우기 전 자리. data-slot 으로 식별.
function Slot({
  id,
  caption,
  className,
}: {
  id: string;
  caption: string;
  className?: string;
}) {
  return (
    <div
      data-slot={id}
      className={
        "flex items-center justify-center rounded-lg border border-line bg-ph text-center " +
        (className ?? "")
      }
    >
      <span className="px-4 text-base text-ink-faint">{caption}</span>
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ withdrawn?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) {
    redirect("/life-timeline");
  }

  const params = await searchParams;
  const withdrawn = params.withdrawn === "1"; // 탈퇴 직후 안내 표시 플래그

  return (
    <main className="flex-1">
      {withdrawn && (
        <div className="mx-auto mt-6 max-w-md rounded-md border-2 border-success bg-success/10 px-5 py-4 text-center text-lg text-success-deep">
          탈퇴가 완료되었어요. 그동안 이용해 주셔서 감사합니다.
        </div>
      )}

      {/* ── S1 히어로 ───────────────────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-6 text-center lg:text-left">
          <h1 className="leading-snug text-ink">{S1.headline}</h1>
          <p className="text-xl text-ink-soft">{S1.sub}</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <ButtonLink href="/login" variant="primary" size="lg">
              {S1.ctaPrimary}
            </ButtonLink>
            {/* 같은 페이지 앵커 — 네이티브 스크롤 보장 위해 a + buttonClasses */}
            <a href="#how" className={buttonClasses("secondary", "lg")}>
              {S1.ctaSecondary}
            </a>
          </div>
        </div>
        {/* 히어로 캡처 = 세로 모바일 화면 → 9/16, max-w 로 폰 형태 유지 */}
        <div className="flex justify-center lg:justify-end">
          <Slot
            id="hero-timeline"
            caption={S1.captionSlot}
            className="aspect-[9/16] w-full max-w-[280px]"
          />
        </div>
      </section>

      {/* ── S2 작동 3단계 (#how) ───────────────────────────────────── */}
      <section
        id="how"
        className="mx-auto max-w-5xl scroll-mt-24 px-6 py-16"
        aria-labelledby="how-title"
      >
        <h2 id="how-title" className="text-center text-ink">
          {S2.headline}
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {S2.steps.map((step, i) => (
            <li
              key={step.slot}
              className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
            >
              <Slot
                id={step.slot}
                caption={`${i + 1}단계 화면`}
                className="aspect-[4/3] w-full"
              />
              <div>
                <p className="text-xl font-bold text-ink">
                  <span className="text-action">{i + 1}.</span> {step.title}
                </p>
                <p className="mt-1 text-lg text-ink-soft">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── S3 결과물 (전부 준비 중) ───────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16" aria-labelledby="product-title">
        <h2 id="product-title" className="text-center text-ink">
          {S3.headline}
        </h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-3">
          {S3.products.map((p) => (
            <li
              key={p.slot}
              className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5"
            >
              <div className="relative">
                <Slot
                  id={p.slot}
                  caption={p.title}
                  className="aspect-[4/3] w-full"
                />
                <span className="absolute right-2 top-2 rounded-full border border-brand bg-banner px-3 py-1 text-sm font-semibold text-action">
                  {S3.badge}
                </span>
              </div>
              <div>
                <p className="text-xl font-bold text-ink">{p.title}</p>
                <p className="mt-1 text-lg text-ink-soft">{p.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* ── S4 기념일·선물 (#anniversary) — banner 박스 + 책 인접 ───── */}
      <section
        id="anniversary"
        className="mx-auto max-w-5xl scroll-mt-24 px-6 py-16"
        aria-labelledby="anniversary-title"
      >
        <div className="grid items-center gap-8 rounded-xl border-2 border-brand bg-banner p-8 sm:p-10 lg:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <h2 id="anniversary-title" className="text-ink">
              {S4.headline}
            </h2>
            <p className="text-xl text-ink-soft">{S4.sub}</p>
            <div className="flex justify-center lg:justify-start">
              {/* 후속: 선물 안내 페이지/섹션 생기면 href 교체 (지금은 /login). */}
              <a href="/login" className={buttonClasses("secondary", "lg")}>
                {S4.cta}
              </a>
            </div>
          </div>
          {/* S3 '자서전 책' 과 시각 연결되는 인접 슬롯 (별도 id) */}
          <Slot
            id={S4.bookSlot}
            caption={S4.bookCaption}
            className="aspect-[3/4] w-full max-w-[220px] justify-self-center border-brand/40"
          />
        </div>
      </section>

      {/* ── S5 신뢰 ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16" aria-labelledby="trust-title">
        <h2 id="trust-title" className="text-center text-ink">
          {S5.headline}
        </h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {S5.cards.map((c) => (
            <div
              key={c.title}
              className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-6"
            >
              <p className="text-xl font-bold text-ink">{c.title}</p>
              <p className="text-lg text-ink-soft">{c.body}</p>
              {c.linkHref && c.linkLabel && (
                <Link
                  href={c.linkHref}
                  className="text-lg font-semibold text-action underline underline-offset-4 hover:text-action-hover"
                >
                  {c.linkLabel} →
                </Link>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── S6 마지막 CTA — banner 박스 + primary 1개 ──────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col items-center gap-6 rounded-xl border-2 border-brand bg-banner p-10 text-center">
          <h2 className="text-ink">{S6.headline}</h2>
          <ButtonLink href="/login" variant="primary" size="lg">
            {S6.cta}
          </ButtonLink>
        </div>
      </section>

      {/* ── 푸터 ───────────────────────────────────────────────────── */}
      <footer className="border-t border-line px-6 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-base text-ink-soft sm:flex-row">
          <span>{FOOTER.copyright}</span>
          <Link
            href={PRIVACY_HREF}
            className="font-semibold text-action underline underline-offset-4 hover:text-action-hover"
          >
            {FOOTER.privacyLabel}
          </Link>
        </div>
      </footer>
    </main>
  );
}
