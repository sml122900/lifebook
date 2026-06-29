import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Mic, Sparkles, Image as ImageIcon } from "lucide-react";

import { auth } from "@/auth";
import { ButtonLink, buttonClasses } from "@/components/ui/Button";
import {
  FOOTER,
  GALLERY,
  PRIVACY_HREF,
  PRODUCT,
  S1,
  S2,
  S5,
  S6,
} from "@/lib/landing-copy";

// 랜딩(/) — 비로그인 전용. 로그인 사용자는 /life-timeline 로 보낸다.
// 헤더(로고 + 로그인)는 app/layout.tsx 가 비로그인에게 이미 렌더 → 여기선 섹션만.
//
// v2.0 리뉴얼: "말로 이야기하면 AI가 멋진 포스터를 만든다"를 3초 안에.
// ①히어로(결과물 먼저) ②작동 3단계(녹음 강조) ③결과물 갤러리(다양성)
// ④제품(포스터 중심·책 축소) ⑤안심 ⑥마무리 CTA. 디자인 토큰 v1.0(cream·따뜻·존엄).

export const metadata = {
  title: "라이프북 — 말로 남기는 인생, 한 장의 포스터로",
  description:
    "말로 이야기하면 AI가 알아서 정리하고, 멋진 인생 포스터로 만들어드려요. 어르신도 가족도 쉽게.",
  openGraph: {
    title: "라이프북 — 말로 남기는 인생, 한 장의 포스터로",
    description: S1.sub,
    siteName: "라이프북",
    locale: "ko_KR",
    type: "website",
  },
};

const STEP_ICONS = { mic: Mic, sparkles: Sparkles, image: ImageIcon } as const;

// 포스터 액자 프레임 — 샘플 포스터 공용(히어로·갤러리·제품). 포스터 비율(2200/3103).
function PosterFrame({
  src,
  alt,
  className,
  sizes,
  priority,
}: {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  return (
    <div
      className={
        "relative aspect-[2200/3103] overflow-hidden rounded-xl border border-line bg-surface shadow-md " +
        (className ?? "")
      }
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        className="object-cover"
        sizes={sizes}
      />
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

      {/* ── ① 히어로 (결과물 먼저) ───────────────────────────────────── */}
      <section className="mx-auto grid max-w-5xl items-center gap-10 px-6 py-16 lg:grid-cols-2 lg:py-24">
        <div className="flex flex-col gap-6 text-center lg:text-left">
          <h1 className="whitespace-pre-line text-[2rem] leading-tight text-ink sm:text-4xl lg:text-5xl">
            {S1.headline}
          </h1>
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
        {/* 비주얼 = 프리미엄 샘플 포스터(결과물 먼저 보여줌) */}
        <div className="flex justify-center lg:justify-end">
          <PosterFrame
            src={S1.posterSrc}
            alt={S1.posterAlt}
            priority
            className="w-full max-w-[330px]"
            sizes="(max-width: 640px) 80vw, 330px"
          />
        </div>
      </section>

      {/* ── ② 작동 3단계 (#how) — 녹음 → AI → 포스터 ──────────────────── */}
      <section
        id="how"
        className="scroll-mt-24 bg-banner/40 py-16"
        aria-labelledby="how-title"
      >
        <div className="mx-auto max-w-5xl px-6">
          <h2 id="how-title" className="text-center text-ink">
            {S2.headline}
          </h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {S2.steps.map((step, i) => {
              const Icon = STEP_ICONS[step.icon];
              return (
                <li
                  key={step.icon}
                  className="flex flex-col items-center gap-4 rounded-xl border border-line bg-surface p-7 text-center"
                >
                  <span className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-banner text-action">
                    <Icon aria-hidden strokeWidth={1.75} className="h-8 w-8" />
                  </span>
                  <div>
                    <p className="text-xl font-bold text-ink">
                      <span className="text-action">{i + 1}.</span> {step.title}
                    </p>
                    <p className="mt-2 text-lg text-ink-soft">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* ── ③ 결과물 갤러리 — 다양성(맞춤배경) ───────────────────────── */}
      <section
        className="mx-auto max-w-5xl px-6 py-16"
        aria-labelledby="gallery-title"
      >
        <div className="text-center">
          <h2 id="gallery-title" className="text-ink">
            {GALLERY.headline}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-xl text-ink-soft">
            {GALLERY.sub}
          </p>
        </div>
        <ul className="mt-10 grid grid-cols-2 gap-5 lg:grid-cols-4">
          {GALLERY.posters.map((p) => (
            <li key={p.src} className="flex flex-col gap-2">
              <PosterFrame
                src={p.src}
                alt={p.alt}
                sizes="(max-width: 1024px) 45vw, 230px"
              />
              <p className="text-center text-base text-ink-faint">{p.tone}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* ── ④ 제품 (포스터 중심 · 책·씨앗은 준비 중) ─────────────────── */}
      <section
        className="mx-auto max-w-5xl px-6 py-16"
        aria-labelledby="product-title"
      >
        <h2 id="product-title" className="text-center text-ink">
          {PRODUCT.headline}
        </h2>

        {/* 메인 = 포스터(크게) */}
        <div className="mt-10 grid items-center gap-8 rounded-xl border-2 border-brand bg-banner p-8 sm:p-10 lg:grid-cols-[300px_1fr]">
          <PosterFrame
            src={PRODUCT.main.src}
            alt={PRODUCT.main.alt}
            className="w-full max-w-[300px] justify-self-center"
            sizes="(max-width: 1024px) 70vw, 300px"
          />
          <div className="flex flex-col gap-5 text-center lg:text-left">
            <p className="text-2xl font-bold text-ink">{PRODUCT.main.title}</p>
            <p className="text-xl text-ink-soft">{PRODUCT.main.body}</p>
            <div className="flex justify-center lg:justify-start">
              <Link
                href={PRODUCT.main.href}
                className={buttonClasses("secondary", "lg")}
              >
                {PRODUCT.main.cta} →
              </Link>
            </div>
          </div>
        </div>

        {/* 보조 = 준비 중(작게) */}
        <ul className="mt-6 grid gap-5 sm:grid-cols-2">
          {PRODUCT.soon.map((s) => (
            <li
              key={s.title}
              className="flex items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-4"
            >
              <div>
                <p className="text-lg font-bold text-ink">{s.title}</p>
                <p className="mt-0.5 text-base text-ink-soft">{s.body}</p>
              </div>
              <span className="shrink-0 rounded-full bg-canvas px-3 py-1 text-sm font-semibold text-ink-faint">
                준비 중
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── ⑤ 안심 ───────────────────────────────────────────────────── */}
      <section
        className="mx-auto max-w-5xl px-6 py-16"
        aria-labelledby="trust-title"
      >
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

      {/* ── ⑥ 마지막 CTA — banner 박스 + primary 1개 ─────────────────── */}
      <section className="mx-auto max-w-5xl px-6 py-16">
        <div className="flex flex-col items-center gap-6 rounded-xl border-2 border-brand bg-banner p-10 text-center">
          <h2 className="text-ink">{S6.headline}</h2>
          <ButtonLink href="/login" variant="primary" size="lg">
            {S6.cta}
          </ButtonLink>
        </div>
      </section>

      {/* ── 푸터 ───────────────────────────────────────────────────────── */}
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
