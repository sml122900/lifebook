// P5-3 — AI 배경 자동 검수 (sharp 픽셀 분석). 통과분만 사용자에게.
//
// gpt-image 결과는 품질이 들쭉날쭉(상단 인물 아티팩트·강 치우침·진한색 등).
// 사람/글자 감지는 어려워 생략하고, P4 합성에 직접 영향 주는 항목만 픽셀로 판정:
//   1) 채도   — 전체 평균 채도 낮나(저채도 수채). 진하면 실패.
//   2) 강 중앙 — 차가운(청록) 픽셀 무게중심이 세로중앙 근처인가. 치우치면 실패.
//   3) 양옆 여백 — 노드 텍스트존(좌우)이 비었나(밝은 배경 비율). 빽빽하면 실패.
//   4) 상·하 여백 — 타이틀/푸터 영역이 비었나. 아티팩트(어두운 덩어리)면 실패.
// 임계값은 전부 INSPECT 상수로 분리(튜닝).

import sharp from "sharp";

export type InspectionMetrics = {
  meanSaturation: number; // 0~255
  coolFraction: number; // 청록(강) 픽셀 비율
  riverOffset: number; // |강 무게중심x - 중앙|/W (0=정중앙)
  topEmpty: number; // 상단 밝은 비율
  bottomEmpty: number; // 하단 밝은 비율
  sideEmpty: number; // 양옆 노드존 밝은 비율
};

export type InspectionResult = {
  pass: boolean;
  reasons: string[];
  metrics: InspectionMetrics;
};

// 튜닝 대상 임계값. 캘리브레이션(river-bg·medium 성공작 통과 / 나쁜 거 탈락)으로 조정.
export const INSPECT = {
  SAMPLE_STRIDE: 4, // 픽셀 샘플 간격(성능)
  SAT_MAX: 78, // 평균 채도 상한(넘으면 진한/쨍한 색)
  // 강물 = 따뜻한 크림(b<r)이 아닌 차가운(b≥r) 픽셀. 부드러운 청록도 잡게 낮게.
  // 크림 bg 는 b-r 이 음수라 오검출 안 됨.
  COOL_DELTA: 3, // b - r > 이 값 = 청록(강) 픽셀
  RIVER_MIN_FRACTION: 0.006, // 강 픽셀 최소 비율(이하면 강 안 보임)
  // 노드 offset ±200px 가 강 흔들림 흡수 → 편차 관대(명백히 한쪽 쏠림만 탈락).
  RIVER_OFFSET_MAX: 0.24, // 강 무게중심 허용 편차(±W*0.24 ≈ ±249px)
  LIGHT_L: 188, // 이 이상 = 밝은 배경(빈 공간)
  MARGIN_EMPTY_MIN: 0.5, // 상·하 여백 밝은 비율 하한
  SIDE_EMPTY_MIN: 0.45, // 양옆 노드존 밝은 비율 하한(꽃·풀 드문드문 허용)
  // 영역 경계(이미지 비율 기준 — 1037×1517 에 맞춰 P4 존과 정합)
  TOP_BAND: 0.11, // 상단 11%(타이틀 밴드 170/1517)
  BOTTOM_BAND: 0.09, // 하단 9%(푸터)
  RIVER_HALF: 0.105, // 중앙 강 띠 반폭(±W*0.105 ≈ ±109)
  SIDE_INNER: 0.125, // 중앙에서 노드존 시작
  SIDE_MARGIN: 0.145, // 바깥 여백(CLAMP 150/1037)
  NODE_Y_TOP: 0.13,
  NODE_Y_BOT: 0.86,
};

export async function inspectBackground(buf: Buffer): Promise<InspectionResult> {
  const { data, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;
  const cx = W / 2;
  const s = INSPECT.SAMPLE_STRIDE;

  const topY = H * INSPECT.TOP_BAND;
  const botY = H * (1 - INSPECT.BOTTOM_BAND);
  const sideInner = W * INSPECT.SIDE_INNER;
  const sideMargin = W * INSPECT.SIDE_MARGIN;
  const nodeYTop = H * INSPECT.NODE_Y_TOP;
  const nodeYBot = H * INSPECT.NODE_Y_BOT;

  let nAll = 0, sumS = 0, nCool = 0, sumCoolX = 0;
  let nTop = 0, lightTop = 0, nBot = 0, lightBot = 0, nSide = 0, lightSide = 0;

  for (let y = 0; y < H; y += s) {
    for (let x = 0; x < W; x += s) {
      const i = (y * W + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const S = mx - mn;
      const L = 0.299 * r + 0.587 * g + 0.114 * b;
      const light = L > INSPECT.LIGHT_L;

      nAll++;
      sumS += S;
      if (b - r > INSPECT.COOL_DELTA) {
        nCool++;
        sumCoolX += x;
      }
      if (y < topY) {
        nTop++;
        if (light) lightTop++;
      } else if (y >= botY) {
        nBot++;
        if (light) lightBot++;
      }
      if (y >= nodeYTop && y <= nodeYBot) {
        const inLeft = x >= sideMargin && x <= cx - sideInner;
        const inRight = x >= cx + sideInner && x <= W - sideMargin;
        if (inLeft || inRight) {
          nSide++;
          if (light) lightSide++;
        }
      }
    }
  }

  const metrics: InspectionMetrics = {
    meanSaturation: sumS / Math.max(1, nAll),
    coolFraction: nCool / Math.max(1, nAll),
    riverOffset: nCool > 0 ? Math.abs(sumCoolX / nCool - cx) / W : 1,
    topEmpty: lightTop / Math.max(1, nTop),
    bottomEmpty: lightBot / Math.max(1, nBot),
    sideEmpty: lightSide / Math.max(1, nSide),
  };

  const reasons: string[] = [];
  if (metrics.meanSaturation > INSPECT.SAT_MAX) reasons.push("채도 높음(진한 색)");
  if (metrics.coolFraction < INSPECT.RIVER_MIN_FRACTION) reasons.push("강이 안 보임");
  else if (metrics.riverOffset > INSPECT.RIVER_OFFSET_MAX) reasons.push("강이 한쪽으로 치우침");
  if (metrics.topEmpty < INSPECT.MARGIN_EMPTY_MIN) reasons.push("상단 여백 부족(아티팩트 의심)");
  if (metrics.bottomEmpty < INSPECT.MARGIN_EMPTY_MIN) reasons.push("하단 여백 부족");
  if (metrics.sideEmpty < INSPECT.SIDE_EMPTY_MIN) reasons.push("양옆 텍스트존이 빽빽함");

  return { pass: reasons.length === 0, reasons, metrics };
}
