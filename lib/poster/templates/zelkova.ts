import path from "node:path";

import type { TemplateManifest } from "../types";

// T1 — 느티나무(Zelkova) 템플릿 매니페스트.
//
// STEP0 정찰로 검증한 계약을 데이터로 인코딩. 렌더러·매핑은 이 객체만 보고
// 동작하므로 "느티나무 지식" 은 전부 여기에 갇혀 있다. 7월에 종을 더하려면
// 새 svg + 이런 매니페스트 1개를 추가하면 끝(엔진 무수정).
//
// 검증된 사실 (grep 확인):
//   - viewBox 0 0 420 594 (A2 세로). A1 은 동일 svg ×1.41, 별도 마스터 없음.
//   - 총 슬롯 14(3종 동일), 챕터별 불균등:
//       3br 4/6/4 · 4br 2/3/5/4 · 5br 2/2/4/3/3
//   - id: slot-cN-eM / label-cN-eM(날짜) / label-cN-eM-t(제목) / chapter-N
//   - defs 심볼: #leaf-s #flower-s #fruit-s #bird-s
//   - 슬롯 = <g id color> 안 <use href x y …>. color=그룹속성, 앵커=첫 use x/y.
//
// ⚠️ 갭 2개 (T1 폴백 처리):
//   - #bird-s 는 3branch defs 에만 있음 → 4·5branch standout 은 birdFallback.
//   - root-text 는 3branch 에만 있음 → 없으면 렌더러가 자동 skip.
//   - title-name(제목 사람 이름) id 는 STEP2 에서 3 마스터에 태깅 추가
//     (비주얼 불변, 속성만). 없는 템플릿이면 렌더러가 자동 skip.

const TEMPLATES_DIR = path.join(
  process.cwd(),
  "design",
  "templates",
  "zelkova",
);

export const zelkovaManifest: TemplateManifest = {
  id: "zelkova",
  name: "느티나무",
  branchOptions: [3, 4, 5],
  viewBox: "0 0 420 594",
  slotsPerBranch: {
    3: [4, 6, 4],
    4: [2, 3, 5, 4],
    5: [2, 2, 4, 3, 3],
  },
  fileFor: (branchCount) =>
    path.join(TEMPLATES_DIR, `zelkova-${branchCount}branch.svg`),
  idMap: {
    slot: (c, e) => `slot-c${c}-e${e}`,
    dateLabel: (c, e) => `label-c${c}-e${e}`,
    titleLabel: (c, e) => `label-c${c}-e${e}-t`,
    chapter: (c) => `chapter-${c}`,
    rootText: "root-text",
    ownerName: "title-name",
    footerCredit: "footer-credit",
  },
  // 계약 밖 샘플/개발 요소(트리 비주얼과 무관) — 데모에서 숨김.
  //   index-header + idx-line(class) = "전체 사건 색인"(트리와 중복 + 가짜)
  //   dev-note = "[템플릿 v0.1 … 인쇄 출력 전 본 라인 제거]"
  //   safe-margin-guide = 인쇄 안전 여백 점선(3branch 에만 존재)
  demoHiddenIds: ["index-header", "dev-note", "safe-margin-guide"],
  demoHiddenClasses: ["idx-line"],
  // 색·심볼·개수는 마스터의 원래 잎 군집/꽃/열매/새와 동일하게 인코딩.
  // 앵커(첫 use x/y) 기준 오프셋으로 찍어 좌표 무관하게 동작.
  significanceVariants: {
    leaf: {
      color: "#6B8C5A",
      symbols: [
        { href: "#leaf-s", w: 8, h: 6, dx: 0, dy: 0 },
        { href: "#leaf-s", w: 7, h: 5, dx: 6, dy: -3, rotate: 20 },
        { href: "#leaf-s", w: 6, h: 4, dx: 4, dy: 4, rotate: -15 },
      ],
    },
    flower: {
      color: "#C8923D",
      symbols: [{ href: "#flower-s", w: 14, h: 14, dx: -4, dy: -5 }],
    },
    fruit: {
      color: "#C8603D",
      symbols: [{ href: "#fruit-s", w: 12, h: 14, dx: -3, dy: -6 }],
    },
    bird: {
      color: "#7A9CB0",
      symbols: [{ href: "#bird-s", w: 14, h: 9, dx: -3, dy: -2 }],
    },
  },
  birdFallback: "fruit",
};
