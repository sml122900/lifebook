import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Sprout, Check, Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { prisma } from "@/lib/db";
import { getProduct, SHIPPING_KRW } from "@/lib/commerce/products";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";

import { ScreenTour } from "@/app/components/ScreenTour";
import { markTourCompletedAction } from "@/app/life-timeline/tour-actions";
import {
  POSTER_TEMPLATES_TOUR_ID,
  POSTER_TEMPLATES_TOUR_STEPS,
} from "@/lib/tours";

import { chooseTemplate } from "./actions";
import {
  PosterInteractive,
  type PosterSlot,
  type PosterTemplate,
} from "./PosterInteractive";
import type { MappingEvent } from "@/lib/poster/types";
import { mapToPlacement } from "@/lib/poster/mapping";
import { loadMasterSvg, renderPoster } from "@/lib/poster/render";
import { riverManifest } from "@/lib/poster/templates/river";
import { sephirotManifest } from "@/lib/poster/templates/sephirot";
import { zelkovaManifest } from "@/lib/poster/templates/zelkova";

// /poster — 포스터 디자인(종) 고르기 화면.
//
// 흐름: /poster(템플릿 고르기) → /poster/select(노드·메모) → /poster/view(시안).
// river(강물)만 실제 합성(P4 엔진). 느티나무·인생의나무·맞춤형은 "준비 중".
// 고른 종은 Poster.template 에 저장(chooseTemplate) 후 /poster/select 로.
//
// 옛 직접편집기(3종 인라인 SVG 편집)는 아래 _PosterEditorArchived 로 보존(비활성).

export const metadata = { title: "포스터 디자인 고르기" };

type TemplateChoice = {
  id: string;
  name: string;
  desc: string;
  preview: string | null; // 미리보기 이미지(없으면 placeholder)
  status: "ready" | "soon" | "custom"; // custom = 맞춤배경 생성 플로우(/poster/custom)
};

const TEMPLATE_CHOICES: TemplateChoice[] = [
  {
    id: "river",
    name: "강물",
    desc: "한 생애가 강물처럼 흘러갑니다. 큰 사건은 물길 옆에, 작은 이야기는 가장자리에 담겨요.",
    preview: "/poster/river-bg.png",
    status: "ready",
  },
  {
    id: "zelkova",
    name: "느티나무",
    desc: "큰 나무 한 그루에 사건이 잎·꽃·열매로 맺힙니다.",
    preview: "/poster/zelkova-preview.svg",
    status: "soon",
  },
  {
    id: "sephirot",
    name: "인생의 나무",
    desc: "생명의 나무 모양으로 한 생애를 펼쳐 보여드려요.",
    preview: "/poster/sephirot-preview.svg",
    status: "soon",
  },
  {
    id: "custom",
    name: "맞춤형 디자인",
    desc: "좋아하시는 색·꽃·분위기로 배경 그림을 새로 그려드려요.",
    preview: null,
    status: "custom",
  },
];

export default async function PosterTemplatePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [events, poster, userRow] = await Promise.all([
    getLifeEvents(userId),
    prisma.poster.findUnique({
      where: { userId },
      select: { template: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { completedTours: true },
    }),
  ]);

  // 포스터 = 본인 인생 골격(life_event). 사건이 없으면 연혁부터.
  const hasLifeEvents = events.some((e) => e.kind === "life_event");
  if (!hasLifeEvents) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={Sprout}
          message="연혁에 사건을 몇 개 적으면, 그것들로 한 장의 포스터를 만들 수 있어요."
          buttonLabel="인생 연혁으로 가기"
          href="/life-timeline"
        />
      </main>
    );
  }

  const current = poster?.template ?? null;
  const tourSeen =
    userRow?.completedTours?.includes(POSTER_TEMPLATES_TOUR_ID) ?? false;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-ink">포스터 디자인 고르기</h1>
        <p className="mt-2 text-lg text-ink-soft">
          마음에 드는 모양을 하나 골라주세요.
        </p>
      </header>

      <ul className="grid gap-5 sm:grid-cols-2">
        {TEMPLATE_CHOICES.map((t) => (
          <TemplateCard key={t.id} t={t} current={current} />
        ))}
      </ul>

      <div className="mt-10 text-center">
        <Link href="/life-timeline" className={buttonClasses("secondary", "lg")}>
          ← 인생 연혁으로
        </Link>
      </div>

      <ScreenTour
        tourId={POSTER_TEMPLATES_TOUR_ID}
        steps={POSTER_TEMPLATES_TOUR_STEPS}
        autoStart={!tourSeen}
        onComplete={markTourCompletedAction}
      />
    </main>
  );
}

function TemplateCard({
  t,
  current,
}: {
  t: TemplateChoice;
  current: string | null;
}) {
  const ready = t.status === "ready";
  const isCustom = t.status === "custom";
  const active = ready || isCustom;
  const selected = current === t.id;
  // 코치마크 타겟 — 첫 실제 디자인(river)과 맞춤형 카드만.
  const dataTour = ready ? "poster-template" : isCustom ? "poster-custom" : undefined;

  return (
    <li
      data-tour={dataTour}
      className={
        "flex flex-col overflow-hidden rounded-xl border-2 " +
        (active ? "border-action bg-surface" : "border-line bg-canvas")
      }
    >
      {/* 미리보기 — A2 세로 비율(2:3). 준비 중은 흐리게. */}
      <div className="relative aspect-[2/3] w-full bg-banner">
        {t.preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={t.preview}
            alt={`${t.name} 포스터 미리보기`}
            className={
              "h-full w-full object-cover " + (ready ? "" : "opacity-60 grayscale")
            }
          />
        ) : (
          <div
            className={
              "flex h-full w-full flex-col items-center justify-center gap-2 " +
              (isCustom
                ? "bg-gradient-to-b from-banner to-brand/20 text-action"
                : "bg-gradient-to-b from-banner to-line text-ink-faint")
            }
          >
            <Sparkles aria-hidden strokeWidth={1.5} className="h-10 w-10" />
            <span className="text-sm">{isCustom ? "내 취향으로" : "곧 만나요"}</span>
          </div>
        )}
        {!active && (
          <span className="absolute right-2 top-2 rounded-full bg-ink/70 px-3 py-1 text-xs font-semibold text-white">
            준비 중
          </span>
        )}
        {selected && ready && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white">
            <Check strokeWidth={2.5} aria-hidden className="h-3.5 w-3.5" />
            지난번 선택
          </span>
        )}
      </div>

      {/* 이름·설명 */}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="text-xl font-bold text-ink">{t.name}</h2>
        <p className="flex-1 text-base text-ink-soft">{t.desc}</p>

        {isCustom ? (
          <Link
            href="/poster/custom"
            className="mt-2 inline-flex min-h-[52px] w-full items-center justify-center rounded-md bg-action px-5 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            내 취향으로 만들기 →
          </Link>
        ) : ready ? (
          <form action={chooseTemplate.bind(null, t.id)} className="mt-2">
            <button
              type="submit"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-md bg-action px-5 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              이 디자인으로 만들기 →
            </button>
          </form>
        ) : (
          <div
            aria-disabled
            className="mt-2 inline-flex min-h-[52px] w-full cursor-not-allowed items-center justify-center rounded-md border-2 border-line bg-canvas px-5 py-3 text-lg font-semibold text-ink-faint"
          >
            준비 중이에요
          </div>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// 보존(비활성) — 옛 /poster 직접편집기. 3종(느티/강물/인생나무) 인라인 SVG 편집.
// 부활 시 default export 를 이 함수로 교체하면 됨. 시드·엔진·PosterInteractive
// 모두 무수정 보존. (월 화면 _TimemachineMonthPageArchived 패턴과 동일.)
// ─────────────────────────────────────────────────────────────────────────

async function _PosterEditorArchived() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [allEvents, birthYear] = await Promise.all([
    getLifeEvents(userId),
    getBirthYear(userId),
  ]);

  const lifeEvents = allEvents.filter((e) => e.kind === "life_event");

  if (lifeEvents.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <EmptyState
          icon={Sprout}
          message="연혁에 사건을 몇 개 적으면, 그것들이 한 그루 나무로 자라납니다."
          buttonLabel="인생 연혁으로 가기"
          href="/life-timeline"
        />
      </main>
    );
  }

  const mapped: MappingEvent[] = lifeEvents.map((e) => ({
    title: e.title,
    year: e.eventYear,
    month: e.eventMonth,
    endYear: e.endYear,
    textLength: e.content?.length ?? 0,
  }));

  const birth = lifeEvents.find((e) => e.category === "BIRTH");
  const birthPlaceName = birth?.places.find((p) => p.placeName)?.placeName ?? null;
  const rootLine =
    birthPlaceName && birthYear
      ? `${birthPlaceName} · ${birthYear}`
      : birthPlaceName
        ? birthPlaceName
        : birthYear
          ? `${birthYear}`
          : null;

  const ownerName = session.user.name
    ? `${session.user.name} 님의 인생 나무`
    : "나의 인생 나무";

  const footerLine = session.user.name
    ? `${session.user.name} · 2026년 제작`
    : null;

  const TEMPLATE_DEFS = [
    { manifest: zelkovaManifest, accent: "#6B4226" },
    { manifest: riverManifest, accent: "#3A6A78" },
    { manifest: sephirotManifest, accent: "#5C4A6B" },
  ];

  const templates: PosterTemplate[] = TEMPLATE_DEFS.map(
    ({ manifest, accent }) => {
      const placement = mapToPlacement(mapped, manifest, {
        birthYear,
        ownerName,
        rootLine,
        footerLine,
      });
      const rawSvg = loadMasterSvg(manifest, placement.branchCount);
      const svg = renderPoster(rawSvg, manifest, placement);
      const slots: PosterSlot[] = placement.chapters.flatMap((ch, ci) =>
        ch.events.map((ev, ei) => ({
          c: ci + 1,
          e: ei + 1,
          title: ev.title,
          yearLabel: ev.yearLabel,
          sizeable: ev.variant !== "bird",
          initialSize:
            ev.variant === "leaf"
              ? "S"
              : ev.variant === "flower"
                ? "M"
                : ev.variant === "fruit"
                  ? "L"
                  : null,
        })),
      );
      return { id: manifest.id, name: manifest.name, accent, svg, slots };
    },
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">인생 나무 미리보기</h1>
        <p className="mt-2 text-base text-ink-soft">
          지금까지 적으신 이야기로 자란 한 그루 나무예요.
        </p>
      </header>

      <PosterInteractive
        templates={templates}
        defaultTitle={ownerName}
        defaultFooter={footerLine ?? ""}
        defaultRoot={rootLine ?? ""}
      />

      <p className="mx-auto mt-4 max-w-[560px] text-center text-sm text-ink-soft">
        포스터로 만들면 더 크고 또렷하게 보여요.
      </p>

      <ProductSection />

      <div className="mt-8 text-center">
        <Link href="/life-timeline" className={buttonClasses("secondary", "lg")}>
          ← 인생 연혁으로
        </Link>
      </div>
    </main>
  );
}

// T2 — "이렇게 배송됩니다" 정적 상품 섹션(옛 편집기용, 보존).
function ProductSection() {
  const poster = getProduct("poster");
  if (!poster) return null;

  const won = (n: number) => n.toLocaleString("ko-KR");

  return (
    <section className="mx-auto mt-12 max-w-[680px] border-t-2 border-line pt-10">
      <header className="text-center">
        <h2 className="text-2xl font-bold text-ink">이렇게 배송됩니다</h2>
        <p className="mt-2 text-lg text-ink-soft">
          화면 속 나무를, 액자에 든 실물 포스터로 받아 보세요.
        </p>
      </header>

      <div className="mt-8 grid items-center gap-8 lg:grid-cols-2">
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm">
          <Image
            src="/landing/product-poster.png"
            alt="액자에 든 인생 연혁 포스터 실물"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 420px"
          />
        </div>

        <div className="text-center lg:text-left">
          <h3 className="text-xl font-bold text-ink">{poster.name}</h3>
          <p className="mt-2 text-lg text-ink-soft">{poster.blurb}</p>

          <ul className="mt-5 space-y-2 text-lg text-ink">
            <li>· {poster.spec}</li>
            <li>· 액자에 넣어 보내드려요</li>
          </ul>

          <p className="mt-6">
            <span className="text-3xl font-bold text-ink">{won(poster.unitKrw)}원</span>
            <span className="ml-2 text-lg text-ink-soft">
              + 배송 {won(SHIPPING_KRW)}원
            </span>
          </p>
        </div>
      </div>

      <div className="mt-8 text-center">
        <Link
          href={`/shop/${poster.id}/order`}
          className={buttonClasses("primary", "lg")}
        >
          주문하기
        </Link>
        <p className="mt-3 text-base text-ink-soft">
          테스트 결제예요 — 실제로 청구·배송되지 않아요.
        </p>
      </div>
    </section>
  );
}

// no-unused-vars 회피 — 보존 함수 한 번 참조(부활 시 default 로 교체).
export const __preserve_archived_poster_editor = { _PosterEditorArchived };
