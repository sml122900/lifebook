import path from "node:path";

import type { TemplateManifest } from "../types";

import { zelkovaManifest } from "./zelkova";

// 템플릿 #2 — 인생 강물(river). 5굽이(상류~하구) 5branch 전용.
//
// 슬롯·심볼 구조는 느티나무와 동일(같은 #leaf-s/#flower-s/#fruit-s/#bird-s,
// 같은 `<g id="slot-cN-eM" color> + <use>` 패턴) → significanceVariants·
// birdFallback 을 그대로 재사용(드리프트 0). 엔진(render.ts/mapping.ts) 무수정,
// 매니페스트 1개로 종 추가.
//
// ★ river 챕터는 고정 메타포명(상류/중류/굽이/하구)이라 클러스터 라벨로
//   덮으면 안 된다. render.ts 는 idMap.chapter(c) 를 무조건 호출하므로(무수정
//   유지), 존재하지 않는 id 로 매핑해 replaceTextById/hideById 를 no-op 으로
//   만든다 → SVG 의 메타포 라벨(chapter-1..5) 보존. 클러스터는 시간순으로
//   c1(상류)→c5(하구) 에 그대로 매핑된다.

const DIR = path.join(process.cwd(), "design", "templates", "river");

export const riverManifest: TemplateManifest = {
  id: "river",
  name: "인생 강물",
  branchOptions: [5], // 5굽이 전용
  viewBox: "0 0 420 594",
  slotsPerBranch: {
    5: [2, 3, 4, 3, 2],
  },
  fileFor: () => path.join(DIR, "river-5branch.svg"),
  idMap: {
    slot: (c, e) => `slot-c${c}-e${e}`,
    dateLabel: (c, e) => `label-c${c}-e${e}`,
    titleLabel: (c, e) => `label-c${c}-e${e}-t`,
    // 존재하지 않는 id → 챕터 주입 no-op (메타포명 보존). 위 주석 참고.
    chapter: (c) => `__river_no_chapter_inject_${c}`,
    rootText: "root-text",
    ownerName: "title-name",
    footerCredit: "footer-credit",
  },
  // 느티나무와 같은 심볼 라이브러리(river SVG 에도 동일 id 로 임베드됨).
  significanceVariants: zelkovaManifest.significanceVariants,
  birdFallback: zelkovaManifest.birdFallback,
  // river 는 샘플 색인·개발 주석 없음(idx-line 은 미사용 style 규칙뿐).
  demoHiddenIds: [],
  demoHiddenClasses: [],
};
