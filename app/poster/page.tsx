import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Sprout } from "lucide-react";

import { auth } from "@/auth";
import { buttonClasses } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getProduct, SHIPPING_KRW } from "@/lib/commerce/products";
import { getBirthYear, getLifeEvents } from "@/lib/life-events";

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

// T1 STEP3 — 인생 나무 포스터 화면 (읽기 전용 데모).
//
// 사용자의 life_event 를 매핑(STEP1) → 자동 선택된 마스터에 렌더(STEP2) →
// 인라인 SVG 로 미리보기. 인터랙션 0. 마이그 0.
//
// 디자인 동결: v0.1 느티나무 마스터를 비주얼 수정 없이 그대로 스킨으로 쓴다.
// 화면에서 글씨가 작은 건(인쇄용 mm 밀도) 7월 다듬기 과제 — 여기선 폰트 크기
// 등 비주얼을 건드리지 않는다(디자인 동결 우선).

export const metadata = { title: "인생 나무 미리보기" };

export default async function PosterPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const [allEvents, birthYear] = await Promise.all([
    getLifeEvents(userId),
    getBirthYear(userId),
  ]);

  // 나무 = 사용자가 직접 쓴 인생 골격(life_event)만. era_event·photo 는 제외.
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

  // 뿌리 줄 = 출생지 · 출생연도 (있으면). 없으면 렌더러가 root-text 를 숨김.
  // 장소 1:N — 출생지는 보통 1곳이라 places[] 의 첫 장소를 쓴다.
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

  // 자유도 #1 — 템플릿 2종(느티나무·강물)을 각각 렌더(render.ts 그대로, 매니페스트
  // 인자만 다름) → 렌더 SVG + 슬롯맵을 클라(피커)로 전달. accent 는 피커 색점용.
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
      // 사건→슬롯(c,e) 매핑(렌더러 주입 좌표와 동일 규칙).
      //   sizeable = bird(standout) 아님 → S/M/L 스왑 대상
      //   initialSize = T1 변형(잎 S / 꽃 M / 열매 L). bird 는 null.
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

      {/* 템플릿 피커 + 포스터 + 토글/크기/텍스트 편집 (클라). */}
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

// T2 — "이렇게 배송됩니다" 정적 상품 섹션.
//
// 화면 속 나무가 사서 액자로 받는 실물 상품임을 보여주는 프레젠테이션만.
// 인터랙션·주문·결제 연결 0. 가격·사양은 lib/commerce/products.ts 단일 출처
// (경영재무 최종가 확정 시 products.ts 만 교체하면 자동 반영). T1 엔진 무수정.
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
        {/* 액자 목업 (디자인방 자산). 비율 유지 — fill + aspect 컨테이너. */}
        <div className="relative mx-auto aspect-[4/3] w-full max-w-[420px] overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm">
          <Image
            src="/landing/product-poster.png"
            alt="액자에 든 인생 연혁 포스터 실물"
            fill
            className="object-cover"
            sizes="(max-width: 1024px) 100vw, 420px"
          />
        </div>

        {/* 사양·가격 — 모두 products.ts 에서 읽음(하드코딩 0). */}
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

      {/* 주문하기 — 기존 /shop 체크아웃(요약 + Toss 테스트 결제 + 서버 confirm·
          금액 검증 + ProductOrder 영속화)으로 연결. 결제 보안 재구현 0. */}
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
