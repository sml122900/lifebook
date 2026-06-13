import Image from "next/image";
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
  // 카카오톡·문자 공유 미리보기 — 랜딩 전용 카피(S1.sub 재사용). og:image 는
  // app/opengraph-image.tsx 가 자동 생성. ⚠️ Next 는 openGraph 를 깊은 병합
  // 하지 않아 페이지 것이 layout 것을 통째로 대체 → siteName/locale/type 을
  // 여기서 다시 명시해야 보존된다.
  openGraph: {
    title: "라이프북 — 부모님의 인생을 한 권으로",
    description: S1.sub,
    siteName: "라이프북",
    locale: "ko_KR",
    type: "website",
  },
};

// 이미지 슬롯 — data-slot 으로 식별. src 가 있으면 실제 이미지(next/image
// fill + object-cover)를 그리고, 없으면 caption placeholder 를 보여준다
// (실화면 캡처 미확정인 S1·S2 슬롯은 src 없이 그대로 placeholder).
// bg-ph 는 이미지 로딩 중 폴백 배경으로 남는다.
function Slot({
  id,
  caption,
  className,
  src,
  alt,
  imgClassName,
}: {
  id: string;
  caption: string;
  className?: string;
  src?: string;
  alt?: string;
  imgClassName?: string;
}) {
  return (
    <div
      data-slot={id}
      className={
        "relative flex items-center justify-center overflow-hidden rounded-lg border border-line bg-ph text-center " +
        (className ?? "")
      }
    >
      {src ? (
        <Image
          src={src}
          alt={alt ?? caption}
          fill
          className={"object-cover " + (imgClassName ?? "")}
          sizes="(max-width: 640px) 100vw, 320px"
        />
      ) : (
        <span className="px-4 text-base text-ink-faint">{caption}</span>
      )}
    </div>
  );
}

// 제품 슬롯 alt — title 과 다른 경우만(keepsake 는 title "인생 씨앗(가)" ≠ alt).
const PRODUCT_ALT: Record<string, string> = {
  "product-poster": "인생 연혁 포스터",
  "product-book": "자서전 책",
  "product-keepsake": "인생 씨앗",
};

// S2 단계 슬롯 alt — 실화면 캡처 설명.
const STEP_ALT: Record<string, string> = {
  "step-1-era": "그 시절 둘러보기",
  "step-2-record": "회상 기록 화면",
  "step-3-room": "가족 룸",
};

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
            src="/landing/hero-timeline.png"
            alt="인생 연혁 화면"
            imgClassName="object-top"
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
                src={`/landing/${step.slot}.png`}
                alt={STEP_ALT[step.slot] ?? step.title}
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
            <li key={p.slot}>
              <Link
                href={p.href}
                className="flex h-full flex-col gap-4 rounded-lg border border-line bg-surface p-5 hover:border-brand hover:bg-canvas focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <Slot
                  id={p.slot}
                  caption={p.title}
                  src={`/landing/${p.slot}.png`}
                  alt={PRODUCT_ALT[p.slot] ?? p.title}
                  className="aspect-[4/3] w-full"
                />
                <div>
                  <p className="text-xl font-bold text-ink">{p.title}</p>
                  <p className="mt-1 text-lg text-ink-soft">{p.body}</p>
                  <p className="mt-3 text-lg font-semibold text-action">
                    보러 가기 →
                  </p>
                </div>
              </Link>
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
        {/* 이미지 칼럼은 220px 고정 — next/image fill 은 intrinsic 너비가 0
            이라 auto 트랙이면 칼럼이 수축해 이미지가 짜부라진다(2px). 모바일은
            grid-cols 미지정 → 1열 스택(슬롯 w-full max-w-220 centered). */}
        <div className="grid items-center gap-8 rounded-xl border-2 border-brand bg-banner p-8 sm:p-10 lg:grid-cols-[1fr_220px]">
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <h2 id="anniversary-title" className="text-ink">
              {S4.headline}
            </h2>
            <p className="text-xl text-ink-soft">{S4.sub}</p>
            <div className="flex justify-center lg:justify-start">
              {/* 기념일=자서전 책 선물 맥락 → 책 상세로(비로그인 둘러보기 허용). */}
              <Link href={S4.href} className={buttonClasses("secondary", "lg")}>
                {S4.cta}
              </Link>
            </div>
          </div>
          {/* S3 '자서전 책' 과 시각 연결되는 인접 슬롯 (별도 id) */}
          <Slot
            id={S4.bookSlot}
            caption={S4.bookCaption}
            src="/landing/anniversary-book.png"
            alt="기념일 자서전"
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
