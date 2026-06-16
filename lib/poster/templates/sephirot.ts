import path from "node:path";

import type { TemplateManifest } from "../types";
import { zelkovaManifest } from "./zelkova";

// sephirot(인생의 나무) 템플릿 매니페스트.
//
// 검증된 사실 (STEP0 grep):
//   - viewBox 0 0 420 594, 5branch 전용
//   - 슬롯 14 (c1-c5: 3/3/3/3/2) flat 단층 구조, 양수좌표, transform 0
//   - 챕터 메타포명 고정(왼 기둥/오른 기둥/가운데 기둥/아랫 기둥/뿌리로)
//     → sentinel id 로 no-op (river 패턴)
//   - 심볼 4종(leaf/flower/fruit/bird), significanceVariants 재사용 가능
//   - decor-nodes 레이어는 슬롯 밖 — render.ts 영향 없음

const TEMPLATES_DIR = path.join(
  process.cwd(),
  "design",
  "templates",
  "sephirot",
);

export const sephirotManifest: TemplateManifest = {
  id: "sephirot",
  name: "인생의 나무",
  branchOptions: [5],
  viewBox: "0 0 420 594",
  slotsPerBranch: {
    5: [3, 3, 3, 3, 2],
  },
  fileFor: (branchCount) =>
    path.join(TEMPLATES_DIR, `sephirot-${branchCount}branch.svg`),
  idMap: {
    slot: (c, e) => `slot-c${c}-e${e}`,
    dateLabel: (c, e) => `label-c${c}-e${e}`,
    titleLabel: (c, e) => `label-c${c}-e${e}-t`,
    // 챕터 메타포명(왼/오른/가운데/아랫 기둥 · 뿌리로) 보존 → sentinel no-op
    chapter: (c) => `__sephirot_no_chapter_inject_${c}`,
    rootText: "root-text",
    ownerName: "title-name",
    footerCredit: "footer-credit",
  },
  demoHiddenIds: [],
  demoHiddenClasses: [],
  // 슬롯·심볼 구조가 zelkova와 동일 → 변형 사전 재사용
  significanceVariants: zelkovaManifest.significanceVariants,
  birdFallback: zelkovaManifest.birdFallback,
};
