// P5-1 — AI 맞춤 배경 프롬프트 빌더 (순수, API 무관·키 불필요·테스트 가능).
//
// 사용자 preferences(취향, S6 분리분 — 자유 텍스트 string[])를 받아 OpenAI
// 이미지 생성용 *서사형* 프롬프트를 만든다. 실제 생성·후처리는 P5-2.
//
// 강화(성공 레퍼런스 기준): 키워드 나열 → 서사 문장. "한 사람의 일생을 강물로
// 은유하는 따뜻한 손그림" 맥락 + 강 시작(샘)→끝(바다) 구도 + ★양옆 노드 자리는
// 비우되 배경은 은은히 채워 휑하지 않게. 노드 원/글자는 배경에 그리지 않음(P4 얹음).
//
// 강/여백 제약은 P4 합성 호환의 핵심: 강 중앙 곡류 + 양옆 텍스트존.
// preferences 가 비어도 앵커+제약만으로 따뜻한 배경이 나오게 한다.

export type BackgroundPrompt = {
  prompt: string;
  negativePrompt: string;
  // 어떤 취향 슬롯이 채워졌는지(검증·로그용). 키=슬롯명, 값=감지된 단어들.
  slots: Record<string, string[]>;
};

// ── 고정 서사 블록 ─────────────────────────────────────────────────────
// HEADER/CLOSING 은 색 중립으로(은은·품위 = 브랜드 톤). 색조는 취향이 정한다.
const HEADER =
  "세로로 긴 포스터 배경 일러스트. 한 사람의 일생을 '강물의 흐름'으로 은유하는, 은은하고 품위 있는 손그림.";

// [구도] — 강 시작=샘, 끝=바다, 중앙 곡류 + ★양옆 노드 자리 비우되 휑하지 않게.
const COMPOSITION =
  "[구도] 위에서 아래로 부드럽게 굽이쳐 흐르는 강물이 화면 세로 중앙을 관통한다. 강의 시작(맨 위)은 작은 샘에서 솟고, 끝(맨 아래)은 잔잔한 바다로 이어진다. 강의 좌우 흔들림은 크지 않게, 화면 가로 중앙에서 멀리 벗어나지 않는다. 강 양옆에는 나중에 작은 글씨가 들어갈 여백을 넉넉히 두되 복잡한 무늬는 피한다. 강을 따라 군데군데 글자가 들어갈 빈 자리를 남긴다. ★다만 배경이 휑하거나 허전해 보이지 않도록, 그 빈 자리 주변을 은은한 풀·잎사귀·옅은 물안개·부드러운 색 번짐으로 자연스럽게 채워 풍부하고 따뜻하게 만든다. 단, 동그란 원(노드)이나 글자·숫자는 절대 그리지 않는다 — 그 자리는 비워 두고 주변만 부드럽게 채운다.";

// [색·질감] — 크림 #FAF7F0, 강물 하늘색~연한청록 저채도, 펜&잉크/연한 수채.
const COLOR_TEXTURE =
  "[색·질감] 따뜻한 크림색 종이(#FAF7F0) 바탕. 강물은 은은한 하늘색에서 연한 청록으로, 채도를 낮춰 잔잔하고 성질이 강하지 않게(진하거나 쨍한 네온·시안 절대 금지). 펜과 잉크 또는 옅은 수채로 손그림 느낌을 내고, 따뜻하고 단정하며 품위 있게.";

const CLOSING =
  "전체적으로, 음악처럼 흐르는 한 사람의 인생을 담은, 은은하고 품위 있는 강물.";

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

// 감지된 슬롯을 서사 문장(강가 디테일·색·계절)으로 짜 넣는다. 없으면 따뜻한 기본값.
function tasteNarrative(
  slots: Record<string, string[]>,
  clean: string[],
): string {
  const parts: string[] = [];

  // 강가 디테일 — 꽃·식물을 "드문드문 포인트"로.
  const plants = (slots["식물"] ?? []).filter((w) => !["식물", "나무", "잎", "풀"].includes(w));
  const plantPhrase = plants.length ? plants.join("·") : "작은 풀과 다육이";
  const hasFlower = (slots["꽃"] ?? []).length > 0;
  const flowerColor = (slots["색"] ?? []).find((c) => FLOWER_COLOR_WORDS.includes(c));
  const flowerPhrase = hasFlower
    ? `${flowerColor ? flowerColor + "빛 " : "연한 "}작은 꽃`
    : "연한 들꽃";
  parts.push(
    `강가에는 ${flowerPhrase}과 ${plantPhrase}를 드문드문 두어 포인트로만 곁들인다(진하지 않게, 강물을 가리지 않게).`,
  );

  // 전체 색감 — 취향 색을 은은하게 더함.
  const palette = slots["색"] ?? [];
  if (palette.length) {
    parts.push(`전체 색감에는 ${palette.slice(0, 4).join("·")} 기운을 은은하게 더한다.`);
  }

  // 계절·분위기.
  const seasons = slots["계절"] ?? [];
  const seasonPhrase = seasons.length
    ? `${seasons.join("·")}의 부드럽고 차분한 분위기`
    : "봄·가을의 부드럽고 차분한 분위기";
  parts.push(`${seasonPhrase}로 마무리한다.`);

  // 원문 취향도 한 줄 보존(슬롯이 못 잡은 취향까지 살리기).
  if (clean.length) {
    parts.push(`(사용자가 좋아하는 것: ${clean.join("; ")})`);
  }

  return parts.join(" ");
}

// 취향 색을 "은은한 파스텔 안에서의 색조 지배"로 서사화한다.
// ★ 핵심 균형: 색상(hue)은 취향대로 확실히 / 채도(saturation)는 낮게.
//   → 인물마다 확연히 다른 톤이되, 다 은은하고 쨍하지 않게(브랜드 유지).
function colorNarrative(
  slots: Record<string, string[]>,
  clean: string[],
): string {
  const colorWords = (slots["색"] ?? []).filter((w) => w !== "파스텔");
  const hue = colorWords.slice(0, 3).join("·");

  const flowerColor = (slots["색"] ?? []).find((c) =>
    FLOWER_COLOR_WORDS.includes(c),
  );
  const flowerPhrase = (slots["꽃"] ?? []).length
    ? `${flowerColor ? flowerColor + "빛 " : "같은 색조의 "}작은 꽃`
    : "같은 색조의 들꽃";

  const parts = [
    `[색·질감] ★이 그림의 색조는 '${hue}' 계열이 화면 전체를 부드럽게 감싼다. 종이 바탕·강물·강가 풍경까지 그 색으로 은은하게 물들이되, 채도는 낮게(연한 파스텔·옅은 수채) 유지해 차분하고 품위 있게 한다. 같은 색조 안에서 명암으로만 깊이를 주고, 쨍하거나 진한 원색·네온·형광색은 절대 쓰지 않는다.`,
    `펜과 옅은 수채의 손그림 느낌. 강물과 글씨가 들어갈 양옆·위아래 여백은 같은 색조이되 더 환하고 옅게 비워, 나중에 얹을 글씨가 잘 보이게 한다.`,
    `강가에는 ${flowerPhrase}과 작은 풀잎을 드문드문 두어 정겨움을 더하되 진하지 않게(강물을 가리지 않게).`,
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

  // 색 취향이 감지되면 그 색조가 배경 전체를 지배(저채도). 없으면 기존 따뜻한 기본.
  const hasColor = (slots["색"] ?? []).filter((w) => w !== "파스텔").length > 0;
  const colorBlock = hasColor
    ? colorNarrative(slots, clean)
    : `${COLOR_TEXTURE} ${tasteNarrative(slots, clean)}`;

  const prompt = [HEADER, COMPOSITION, colorBlock, CLOSING].join("\n\n");

  return { prompt, negativePrompt: NEGATIVE_PROMPT, slots };
}
