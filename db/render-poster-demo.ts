// T1 STEP3 — 인생 나무 포스터 데모 하드닝 (오프라인 검증).
//   실행: npx tsx db/render-poster-demo.ts
//
// 합성 케이스(사건 적은/많은/출생연도 없음) + 선택적 실사용자 1명으로
// 매핑→렌더를 돌려: 깨짐/오버플로/빈슬롯/컷/폴백 동작을 점검하고 결과 SVG 를
// design/templates/zelkova/_demo/ (gitignore) 에 떨군다. 개인정보는 콘솔에
// 찍지 않는다(집계만). 서버를 켜지 않는 순수 노드 검증.
import "dotenv/config";

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { mapToPlacement } from "../lib/poster/mapping";
import { loadMasterSvg, renderPoster } from "../lib/poster/render";
import { zelkovaManifest } from "../lib/poster/templates/zelkova";
import type { MappingEvent, Placement } from "../lib/poster/types";

const OUT_DIR = path.join(
  process.cwd(),
  "design",
  "templates",
  "zelkova",
  "_demo",
);

function tagBalance(svg: string, tag: string) {
  const open = (svg.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length;
  const close = (svg.match(new RegExp(`</${tag}>`, "g")) ?? []).length;
  return { open, close, ok: open === close };
}

function validate(
  svg: string,
  placement: Placement,
  caseName: string,
): string[] {
  const problems: string[] = [];
  if (!svg.trimEnd().endsWith("</svg>")) problems.push("svg 종료 태그 없음");
  for (const tag of ["g", "text"]) {
    const b = tagBalance(svg, tag);
    if (!b.ok) problems.push(`<${tag}> 불균형 (open ${b.open} ≠ close ${b.close})`);
  }
  if (placement.ownerName && svg.includes("박명자")) {
    problems.push("제목 이름 미치환(템플릿 예시 '박명자' 잔존)");
  }
  // 배치된 모든 사건 제목이 주입됐는지(축약 18자 고려해 앞부분으로 확인).
  const display = new Set<string>();
  for (const ch of placement.chapters) {
    for (const ev of ch.events) {
      const head = Array.from(ev.title).slice(0, 6).join("");
      if (head && !svg.includes(head)) display.add(ev.title);
    }
  }
  if (display.size > 0) {
    problems.push(`사건 제목 주입 누락 ${display.size}건`);
  }
  // 숨겨진 슬롯 수(display="none" 그룹) = 빈 슬롯 수와 일치해야.
  const hiddenSlots = (svg.match(/<g id="slot-[^"]+" display="none"/g) ?? [])
    .length;
  if (hiddenSlots !== placement.stats.emptySlots) {
    problems.push(
      `숨긴 슬롯 ${hiddenSlots} ≠ 빈 슬롯 통계 ${placement.stats.emptySlots}`,
    );
  }
  return problems.map((p) => `[${caseName}] ${p}`);
}

function report(caseName: string, placement: Placement, svg: string) {
  const s = placement.stats;
  const birdDowngraded =
    placement.branchCount !== 3 && s.variantCounts.bird > 0;
  console.log(`\n■ ${caseName}`);
  console.log(
    `  마스터 = ${placement.branchCount}branch · 챕터 = ${placement.chapters
      .map((c) => `${c.label || "(빈)"}:${c.events.length}`)
      .join(" / ")}`,
  );
  console.log(
    `  사건 ${s.totalEvents} → 배치 ${s.placed} / 컷 ${s.cut} / 빈슬롯 ${s.emptySlots}`,
  );
  console.log(
    `  변형(매핑 의도) 잎 ${s.variantCounts.leaf} 꽃 ${s.variantCounts.flower} 열매 ${s.variantCounts.fruit} 새 ${s.variantCounts.bird}` +
      (birdDowngraded ? "  ⚠️ 4·5branch → 새는 렌더 시 열매로 폴백" : ""),
  );
  const problems = validate(svg, placement, caseName);
  if (problems.length === 0) console.log("  ✅ 검증 통과 (깨짐/누락/불균형 0)");
  else problems.forEach((p) => console.log("  ❌ " + p));
  return problems.length;
}

function ev(
  title: string,
  year: number,
  opts: { month?: number | null; endYear?: number | null; text?: number } = {},
): MappingEvent {
  return {
    title,
    year,
    month: opts.month ?? null,
    endYear: opts.endYear ?? null,
    textLength: opts.text ?? 0,
  };
}

function runCase(
  name: string,
  events: MappingEvent[],
  birthYear: number | null,
): number {
  const placement = mapToPlacement(events, zelkovaManifest, {
    birthYear,
    ownerName: "데모 님의 인생 나무",
    rootLine: birthYear ? `데모시 · ${birthYear}` : null,
    footerLine: "데모 · 2026년 제작",
  });
  const raw = loadMasterSvg(zelkovaManifest, placement.branchCount);
  const svg = renderPoster(raw, zelkovaManifest, placement);
  writeFileSync(path.join(OUT_DIR, `${name}.svg`), svg, "utf8");
  return report(name, placement, svg);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  let fails = 0;

  // 1) 사건 적음 — 3 시기, 슬롯 대거 비움(빈 슬롯 숨김 검증)
  fails += runCase(
    "sparse",
    [
      ev("청주 출생", 1945, { text: 10 }),
      ev("결혼", 1970, { text: 40 }),
      ev("정년 퇴직", 2010, { endYear: 2010, text: 80 }),
    ],
    1945,
  );

  // 2) 보통 — 여러 시기 골고루(N 자동 4~5)
  fails += runCase(
    "medium",
    [
      ev("청주 출생", 1945, { text: 10 }),
      ev("초등학교 입학", 1952, { endYear: 1958, text: 20 }),
      ev("고등학교", 1961, { endYear: 1964, text: 30 }),
      ev("군 입대", 1965, { endYear: 1968, text: 25 }),
      ev("첫 직장", 1969, { endYear: 1995, text: 60 }),
      ev("결혼", 1972, { month: 5, text: 90 }),
      ev("첫째 출생", 1974, { text: 50 }),
      ev("둘째 출생", 1977, { text: 45 }),
      ev("내 집 마련", 1988, { text: 30 }),
      ev("정년 퇴직", 2005, { text: 70 }),
      ev("손주 탄생", 2012, { text: 55 }),
      ev("칠순 잔치", 2015, { text: 40 }),
    ],
    1945,
  );

  // 3) 사건 많음 — 14 초과(전역/챕터 컷 검증)
  const dense: MappingEvent[] = [];
  for (let i = 0; i < 25; i++) {
    dense.push(
      ev(`기억 ${i + 1} 번째 이야기 — 긴 제목 테스트`, 1945 + i, {
        text: (i % 5) * 30,
      }),
    );
  }
  fails += runCase("dense", dense, 1945);

  // 4) 출생연도 없음 — 균등 시간 분할 폴백
  fails += runCase(
    "no-birthyear",
    Array.from({ length: 11 }, (_, i) =>
      ev(`사건 ${i + 1}`, 1960 + i * 3, { text: i * 10 }),
    ),
    null,
  );

  // 5) (선택) 실사용자 1명 — life_event 가 가장 많은 사용자. 개인정보는 파일로만,
  //    콘솔엔 집계만. DB 미연결이면 조용히 건너뜀.
  try {
    const { prisma } = await import("../lib/db");
    const { getBirthYear, getLifeEvents } = await import("../lib/life-events");
    const grouped = await prisma.userMemory.groupBy({
      by: ["userId"],
      where: { createdVia: "life_event", eventYear: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { userId: "desc" } },
      take: 1,
    });
    if (grouped.length > 0) {
      const userId = grouped[0].userId;
      const [all, birthYear, user] = await Promise.all([
        getLifeEvents(userId),
        getBirthYear(userId),
        prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
      ]);
      const life = all.filter((e) => e.kind === "life_event");
      const mapped: MappingEvent[] = life.map((e) => ({
        title: e.title,
        year: e.eventYear,
        month: e.eventMonth,
        endYear: e.endYear,
        textLength: e.content?.length ?? 0,
      }));
      const birth = life.find((e) => e.category === "BIRTH");
      const placement = mapToPlacement(mapped, zelkovaManifest, {
        birthYear,
        ownerName: user?.name ? `${user.name} 님의 인생 나무` : "나의 인생 나무",
        rootLine:
          birth?.place.placeName && birthYear
            ? `${birth.place.placeName} · ${birthYear}`
            : birthYear
              ? `${birthYear}`
              : null,
        footerLine: user?.name ? `${user.name} · 2026년 제작` : null,
      });
      const raw = loadMasterSvg(zelkovaManifest, placement.branchCount);
      const svg = renderPoster(raw, zelkovaManifest, placement);
      writeFileSync(path.join(OUT_DIR, "real.svg"), svg, "utf8");
      console.log("\n■ real (실사용자 — 개인정보는 _demo/real.svg 파일에만)");
      fails += report("real", placement, svg);
    } else {
      console.log("\n■ real — life_event 보유 사용자 없음(건너뜀)");
    }
    await prisma.$disconnect();
  } catch (e) {
    console.log(
      "\n■ real — DB 미연결로 건너뜀: " + (e as Error).message.split("\n")[0],
    );
  }

  console.log(
    "\n" + "─".repeat(60) + `\n결과: 문제 ${fails}건. 출력 → ${OUT_DIR}`,
  );
  process.exit(fails > 0 ? 1 : 0);
}

void main();
