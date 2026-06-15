import { readFileSync } from "node:fs";

import type { Placement, TemplateManifest, Variant } from "./types";

// T1 STEP2 — 렌더러 (범용).
//
// 입력 = (매니페스트, placement, raw SVG 문자열). 매니페스트의 idMap 규칙으로
// 삽입점을 찾아 주입한다. 느티나무 지식 0 — 어떤 종이 와도 같은 코드.
//
// ※ 원칙: SVG 가 원본·진실. 트리를 코드로 재구성하지 않는다(손 JSX 변환 금지).
//   raw SVG 문자열을 id 기준으로 "수정" 만 한다. 슬롯 그룹엔 중첩 <g> 가 없음을
//   STEP0 에서 검증 → 비탐욕 매칭이 안전.
//
// 주입 메커니즘 (검증 기반):
//   - 텍스트(날짜/제목/챕터/뿌리/이름) = <text> 내용 치환.
//   - 비주얼 = <g id color> 의 children 통째 교체 + color 교체. 좌표는 원래
//     첫 <use> 의 x/y(앵커) 기준으로 변형 심볼을 다시 찍는다.
//   - 빈 슬롯 = 그룹 + 두 라벨에 display="none".
//
// 갭 폴백: 마스터 defs 에 #bird-s 가 없으면(4·5branch) standout 의 bird 를
// manifest.birdFallback(fruit) 으로 자동 강등 — 깨짐 0. root-text/title-name 도
// 마스터에 있을 때만 주입.

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// 제목이 슬롯 폭(작은 글씨)을 넘으면 다른 가지로 흘러 충돌 → 자동 축약.
function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  return chars.slice(0, max - 1).join("") + "…";
}

function replaceTextById(svg: string, id: string, text: string): string {
  const re = new RegExp(`(<text id="${id}"[^>]*>)([\\s\\S]*?)(</text>)`);
  return svg.replace(re, (_m, open, _mid, close) => open + escapeXml(text) + close);
}

function hideById(svg: string, id: string): string {
  const re = new RegExp(`(<(?:g|text) id="${id}")`);
  return svg.replace(re, (m) => `${m} display="none"`);
}

// 특정 class 를 가진 <text> 를 전부 숨김(사건 색인 줄 = class "idx-line").
function hideByClass(svg: string, cls: string): string {
  const re = new RegExp(`<text\\b[^>]*\\bclass="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, "g");
  return svg.replace(re, (m) => m.slice(0, -1) + ' display="none">');
}

// 변형 1개의 <use> 묶음을 앵커 기준으로 찍는다.
function buildUses(
  spec: TemplateManifest["significanceVariants"][Variant],
  ax: number,
  ay: number,
): string {
  return spec.symbols
    .map((s) => {
      const x = ax + s.dx;
      const y = ay + s.dy;
      const t =
        s.rotate != null
          ? ` transform="rotate(${s.rotate} ${(x + s.w / 2).toFixed(1)} ${(
              y +
              s.h / 2
            ).toFixed(1)})"`
          : "";
      return `<use href="${s.href}" x="${x.toFixed(1)}" y="${y.toFixed(
        1,
      )}" width="${s.w}" height="${s.h}"${t}/>`;
    })
    .join("");
}

// T3-b — S/M/L 스왑 대상 변형(잎/꽃/열매). bird(standout)는 제외.
const SIZE_VARIANTS: Variant[] = ["leaf", "flower", "fruit"];

function setSlotVariant(
  svg: string,
  slotId: string,
  variant: Variant,
  manifest: TemplateManifest,
  hasBird: boolean,
): string {
  const re = new RegExp(`<g id="${slotId}"[^>]*>([\\s\\S]*?)</g>`);
  return svg.replace(re, (full, inner: string) => {
    // 앵커 = 원래 첫 <use> 의 x/y.
    const anchor = inner.match(/x="([\d.]+)"\s+y="([\d.]+)"/);
    if (!anchor) return full; // 방어 — 앵커 못 찾으면 원본 보존
    const ax = parseFloat(anchor[1]);
    const ay = parseFloat(anchor[2]);

    // standout(bird) — 단일 비스왑 변형. #bird-s 없으면 폴백. S/M/L 대상 아님.
    if (variant === "bird") {
      const v = hasBird ? "bird" : manifest.birdFallback;
      const spec = manifest.significanceVariants[v];
      return `<g id="${slotId}" color="${spec.color}">${buildUses(spec, ax, ay)}</g>`;
    }

    // T3-b — 잎/꽃/열매 3변형을 같은 anchor 에 미리 emit. active(T1 휴리스틱
    // 결과)만 보이고 나머지는 style display:none. 클라가 S/M/L 로 스왑할 때
    // display 만 토글(재렌더·지오메트리 계산 0). 슬롯 ID = `${slotId}-${변형}`.
    const subs = SIZE_VARIANTS.map((v) => {
      const spec = manifest.significanceVariants[v];
      const hidden = v !== variant ? ' style="display:none"' : "";
      return `<g id="${slotId}-${v}" color="${spec.color}"${hidden}>${buildUses(
        spec,
        ax,
        ay,
      )}</g>`;
    }).join("");
    return `<g id="${slotId}">${subs}</g>`;
  });
}

// 화면 유동화 — 렌더 출력의 루트 <svg> 만 손본다(마스터 파일은 mm 치수 그대로,
// A2 인쇄용). 고정 물리치수(width="420mm" 등)를 제거하고 viewBox +
// preserveAspectRatio + width="100%" 로 컨테이너 폭에 맞춰 비율 자동 스케일.
// 페이지 CSS(셀렉터)와 무관하게 동작.
function makeResponsiveRoot(svg: string): string {
  return svg.replace(/<svg\b[^>]*>/, (tag) => {
    let t = tag
      .replace(/\s+width="[^"]*"/g, "")
      .replace(/\s+height="[^"]*"/g, "");
    if (!/\bpreserveAspectRatio=/.test(t)) {
      t = t.replace(/>$/, ' preserveAspectRatio="xMidYMid meet">');
    }
    return t.replace(/>$/, ' width="100%">');
  });
}

// 뿌리 텍스트(컨테이너 <g>) 의 첫 줄을 실제 출생 정보로, 이후 줄은 비운다
// (가짜 부모 이름이 남지 않게). 라벨 id 가 없는 두 <text> 를 순서로 처리.
function setRootText(svg: string, rootId: string, line: string): string {
  const re = new RegExp(`(<g id="${rootId}"[^>]*>)([\\s\\S]*?)(</g>)`);
  return svg.replace(re, (_full, open, inner: string, close) => {
    let count = 0;
    const newInner = inner.replace(
      /(<text[^>]*>)([\s\S]*?)(<\/text>)/g,
      (_f, o, _mid, c) => {
        count++;
        return count === 1 ? o + escapeXml(line) + c : o + c;
      },
    );
    return open + newInner + close;
  });
}

export function renderPoster(
  rawSvg: string,
  manifest: TemplateManifest,
  placement: Placement,
): string {
  let svg = rawSvg;
  // standout(bird) 심볼이 이 마스터 defs 에 있는지 — 심볼 id 는 매니페스트의
  // bird 변형 href 에서 끌어온다(렌더러에 종-특정 리터럴 0). 없으면 폴백.
  const birdHref = manifest.significanceVariants.bird?.symbols[0]?.href;
  const hasBird = birdHref
    ? svg.includes(`id="${birdHref.replace(/^#/, "")}"`)
    : true;
  const caps = manifest.slotsPerBranch[placement.branchCount] ?? [];
  const { idMap } = manifest;

  for (let c = 1; c <= placement.branchCount; c++) {
    const chapter = placement.chapters[c - 1];
    if (chapter?.label) {
      svg = replaceTextById(svg, idMap.chapter(c), chapter.label);
    } else {
      svg = hideById(svg, idMap.chapter(c));
    }

    const cap = caps[c - 1] ?? 0;
    for (let e = 1; e <= cap; e++) {
      const ev = chapter?.events[e - 1];
      const slotId = idMap.slot(c, e);
      const dateId = idMap.dateLabel(c, e);
      const titleId = idMap.titleLabel(c, e);
      if (ev) {
        svg = setSlotVariant(svg, slotId, ev.variant, manifest, hasBird);
        svg = replaceTextById(svg, dateId, ev.yearLabel);
        svg = replaceTextById(svg, titleId, truncate(ev.title, 18));
      } else {
        svg = hideById(svg, slotId);
        svg = hideById(svg, dateId);
        svg = hideById(svg, titleId);
      }
    }
  }

  // root-text 가 마스터에 있으면(3branch): 실제 출생 정보가 있으면 주입,
  // 없으면 숨긴다 — 템플릿의 예시 텍스트("충북 청주 · 1942" + 가짜 부모)가
  // 데모에 새지 않게.
  if (svg.includes(`id="${idMap.rootText}"`)) {
    if (placement.rootLine) {
      svg = setRootText(svg, idMap.rootText, placement.rootLine);
    } else {
      svg = hideById(svg, idMap.rootText);
    }
  }
  if (placement.ownerName && svg.includes(`id="${idMap.ownerName}"`)) {
    svg = replaceTextById(svg, idMap.ownerName, placement.ownerName);
  }
  // 문서 <title>(호버 툴팁/접근성)도 동기화 — 템플릿 예시 이름이 안 남게.
  if (placement.ownerName) {
    svg = svg.replace(
      /(<title>)([\s\S]*?)(<\/title>)/,
      (_m, open, _mid, close) => open + escapeXml(placement.ownerName!) + close,
    );
  }

  // 푸터 제작 크레딧 — 있으면 실제 이름으로, 없으면 숨김(예시 이름 방지).
  if (svg.includes(`id="${idMap.footerCredit}"`)) {
    if (placement.footerLine) {
      svg = replaceTextById(svg, idMap.footerCredit, placement.footerLine);
    } else {
      svg = hideById(svg, idMap.footerCredit);
    }
  }

  // 계약 밖 샘플/개발 요소 숨김 (트리 동결 디자인은 무관).
  for (const id of manifest.demoHiddenIds) svg = hideById(svg, id);
  for (const cls of manifest.demoHiddenClasses) svg = hideByClass(svg, cls);

  // XML 주석 제거 — 샘플 데이터가 든 파일 머리말 주석 + 개발 주석 정리.
  svg = svg.replace(/<!--[\s\S]*?-->/g, "");

  // 화면 유동화 — 루트 svg 고정 mm 치수 → width 100% (비율 viewBox 자동).
  svg = makeResponsiveRoot(svg);

  return svg;
}

// fs 로더 — 서버 컴포넌트/노드 스크립트 전용 (클라이언트 import 금지).
export function loadMasterSvg(
  manifest: TemplateManifest,
  branchCount: number,
): string {
  return readFileSync(manifest.fileFor(branchCount), "utf8");
}
