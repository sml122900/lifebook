// P5-1 — AI 맞춤 배경 프롬프트 빌더 (순수, API 무관·키 불필요·테스트 가능).
//
// 사용자 preferences(취향, S6 분리분 — 자유 텍스트 string[])를 받아 OpenAI
// 이미지 생성용 *서사형* 프롬프트를 만든다. 실제 생성·후처리는 P5-2.
//
// ★ 기준 = 이유옥 성공작 프롬프트(거의 한 번에 최고 품질). 그 디테일·감성·구도를
//   빌더가 재현한다:
//     ① 구도 서사 — 강 시작(샘) → 끝(바다), 화면 중앙 관통, 노드 자리는 비우고
//        주변만 채움, 양옆 글씨 여백 충분(복잡한 무늬 없이).
//     ② 색·질감(가장 중요) — 따뜻한 크림색 종이(#FAF7F0) 바탕 + 강물은 [취향색]
//        연한 톤(저채도, 쨍·네온 금지, '잔잔하고 성질 강하지 않은'). 펜&잉크 또는
//        연한 수채 손그림, 따뜻하고 품위 있게.
//     ③ 꽃·식물 — 강가에 [취향꽃]·작은 식물을 드문드문(진하지 않게).
//     ④ 감성 — 봄·가을의 부드러움 + "음악처럼 흐르는 한 사람의 인생" 은유 closing.
//
// 다양성(2026-06): 색상(hue)만 취향대로 — [취향색]이 강물·화면 색기운을 정하고
//   [취향꽃]이 꽃 색을 정한다. 나머지 디테일·화법·감성·구도·#FAF7F0 크림 바탕은
//   성공작 그대로(채도는 낮게 = 은은함 유지). 노드 원/글자는 배경에 안 그림(P4 얹음).

export type BackgroundPrompt = {
  prompt: string;
  negativePrompt: string;
  // 어떤 취향 슬롯이 채워졌는지(검증·로그용). 키=슬롯명, 값=감지된 단어들.
  slots: Record<string, string[]>;
};

// ── 고정 서사 블록 ─────────────────────────────────────────────────────
const HEADER =
  "세로로 긴 A2(3:4.2 비율) 포스터 배경 일러스트. 한 사람의 일생을 '강물의 흐름'으로 은유하는, 따뜻하고 품위 있는 손그림.";

// [구도] — 강 시작=샘, 끝=바다, 중앙 곡류 + ★양옆 노드 자리 비우되 휑하지 않게.
const COMPOSITION =
  "[구도] 위에서 아래로 부드럽게 굽이쳐 흐르는 강물이 화면 세로 중앙을 관통한다. 강의 시작(맨 위)은 작은 샘에서 솟고, 끝(맨 아래)은 잔잔한 바다로 이어진다. 강의 좌우 흔들림은 크지 않게, 화면 가로 중앙에서 멀리 벗어나지 않는다. 강 양옆에는 나중에 작은 글씨가 들어갈 여백을 넉넉히 두되 복잡한 무늬는 피한다. 강을 따라 군데군데 글자가 들어갈 빈 자리를 남긴다. ★다만 배경이 휑하거나 허전해 보이지 않도록, 그 빈 자리 주변을 은은한 풀·잎사귀·옅은 물안개·부드러운 색 번짐으로 자연스럽게 채워 풍부하고 따뜻하게 만든다. 단, 동그란 원(노드)이나 글자·숫자는 절대 그리지 않는다 — 그 자리는 비워 두고 주변만 부드럽게 채운다.";

const CLOSING =
  "전체 분위기 — 음악처럼 흐르는 한 사람의 인생을 담은, 따뜻한 강물.";

// ── 금지(negative) ─────────────────────────────────────────────────────
const NEGATIVE_PROMPT =
  "차가운 돌, 비석, 묘비, 무덤, 3D 렌더링, 금속, 조각상, 입체감, 돌 질감, 오컬트, 신비주의 상징, 카발라, 생명의 나무 도형, 진한 채도, 쨍한 원색, 네온, 형광색, 글자, 문자, 숫자, 동그란 노드 원, 워터마크, 서명, 로고, 사람, 얼굴, 동물, 사진처럼 사실적인 묘사, 네오브루탈리즘, Y2K 같은 트렌디한 스타일.";

// ── 취향 슬롯 키워드 (가벼운 매칭 — 못 잡은 문구는 raw 로 보존) ──────────
const SLOT_KEYWORDS: { slot: string; words: string[] }[] = [
  {
    slot: "색",
    words: [
      "하늘색", "파랑", "파란", "블루", "그린블루", "청록", "민트", "보라",
      "자주", "라벤더", "초록", "그린", "연두", "분홍", "핑크", "노랑",
      "베이지", "크림", "하양", "흰", "흑백", "회색", "파스텔",
    ],
  },
  {
    slot: "꽃",
    words: ["꽃", "장미", "들꽃", "제비꽃", "수국", "라일락", "벚꽃", "해바라기", "코스모스", "안개꽃"],
  },
  {
    slot: "식물",
    words: ["선인장", "다육", "넝쿨", "덩굴", "대나무", "소나무", "갈대", "이끼", "잎", "풀", "식물", "나무"],
  },
  {
    slot: "계절",
    words: ["봄", "여름", "가을", "겨울"],
  },
  {
    slot: "톤",
    words: ["은은", "저채도", "파스텔", "담백", "차분", "잔잔", "연한", "부드러", "맑은"],
  },
  {
    slot: "분위기",
    words: ["담담", "따뜻", "포근", "고요", "평화", "아늑", "정겨", "소박", "단정"],
  },
];

const FLOWER_COLOR_WORDS = ["보라", "분홍", "핑크", "노랑", "하양", "흰", "라벤더", "자주"];

function detectSlots(preferences: string[]): Record<string, string[]> {
  const joined = preferences.join(" ");
  const out: Record<string, string[]> = {};
  for (const { slot, words } of SLOT_KEYWORDS) {
    const hits: string[] = [];
    for (const w of words) {
      if (joined.includes(w) && !hits.includes(w)) hits.push(w);
    }
    if (hits.length > 0) out[slot] = hits;
  }
  return out;
}

// [색·질감 — 가장 중요] — 이유옥 성공작 그대로의 디테일/화법/감성에
// [취향색]·[취향꽃]만 끼워 넣는다. 취향이 비어도 성공작 기본값으로 동작.
function buildColorBlock(
  slots: Record<string, string[]>,
  clean: string[],
): string {
  const colorWords = (slots["색"] ?? []).filter((w) => w !== "파스텔");
  const hue = colorWords.length ? colorWords.slice(0, 3).join("·") : null;
  // 강물 색 — 취향색이 있으면 그 연한 톤, 없으면 성공작 기본(하늘색~청록).
  const riverColor = hue
    ? `은은한 ${hue} 계열의 연한`
    : "은은한 하늘색에서 연한 청록의";

  // 꽃 — [취향꽃]/[취향꽃색]. 없으면 연한 들꽃.
  const flowerColor = (slots["색"] ?? []).find((c) =>
    FLOWER_COLOR_WORDS.includes(c),
  );
  const flowerPhrase = (slots["꽃"] ?? []).length
    ? `${flowerColor ? flowerColor + "빛 " : "연한 "}작은 꽃`
    : "연한 들꽃";
  const plants = (slots["식물"] ?? []).filter(
    (w) => !["식물", "나무", "잎", "풀"].includes(w),
  );
  const plantPhrase = plants.length
    ? `${plants.join("·")} 같은 작은 식물`
    : "작은 풀과 잎사귀";
  const seasons = slots["계절"] ?? [];
  const seasonPhrase = seasons.length ? seasons.join("·") : "봄·가을";

  // 취향색이 있으면 화면 전체에도 그 색기운이 은은히 돌게(인물별 색 정체성) —
  // 단 크림 바탕의 따뜻함은 유지(성공작 톤). 채도는 끝까지 낮게.
  const huedAtmosphere = hue
    ? ` 화면 전체에도 그 ${hue} 색기운이 은은히 돌아 '한 사람의 색'이 느껴지게 하되, 크림 바탕의 따뜻함과 저채도는 끝까지 유지한다.`
    : "";

  const parts = [
    `[색·질감 — 가장 중요] 따뜻한 크림색 종이(#FAF7F0) 바탕. 강물은 ${riverColor} 톤으로, 채도를 낮춰 잔잔하고 성질이 강하지 않게 흐른다(진하거나 쨍한 네온·원색은 절대 금지).`,
    `★펜과 잉크, 또는 물을 넉넉히 탄 연한 수채로 그린 손그림 질감 — 따뜻하고 단정하며 품위 있게.${huedAtmosphere}`,
    `강가에는 포인트로 ${flowerPhrase}과 ${plantPhrase}를 드문드문 곁들인다(진하지 않게, 강물을 가리지 않게). ${seasonPhrase}의 부드럽고 차분한 분위기.`,
  ];
  if (clean.length) parts.push(`(사용자가 좋아하는 것: ${clean.join("; ")})`);
  return parts.join(" ");
}

export function buildBackgroundPrompt(
  preferences: string[] | null | undefined,
): BackgroundPrompt {
  const clean = (preferences ?? [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);

  const slots = detectSlots(clean);
  const colorBlock = buildColorBlock(slots, clean);

  const prompt = [HEADER, COMPOSITION, colorBlock, CLOSING].join("\n\n");

  return { prompt, negativePrompt: NEGATIVE_PROMPT, slots };
}
