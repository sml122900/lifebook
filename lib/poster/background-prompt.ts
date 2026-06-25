// P5-1 — AI 맞춤 배경 프롬프트 빌더 (순수, API 무관·키 불필요·테스트 가능).
//
// 사용자 preferences(취향, S6 분리분 — 자유 텍스트 string[])를 받아 OpenAI
// 이미지 생성용 프롬프트 문자열을 만든다. 실제 생성·후처리·검수는 P5-2~3.
//
// 디자이너방 명세:
//   - 고정 스타일 앵커(항상): 수채·크림지·손그림·은은·저채도
//   - 강/여백 제약(항상, P4 합성 호환 핵심): 강이 세로 중앙 곡류(±90px),
//     양옆 텍스트존 비움, 상하 여백, 노드/글자 없는 빈 배경
//   - 금지(negative, 항상): 비석·3D·돌질감·오컬트·진한채도·네오브루탈·Y2K·글자
//   - 취향 슬롯(preferences 에서): 색/꽃/식물/계절/톤/분위기
// preferences 가 비어도 앵커+제약만으로 생성 가능.

export type BackgroundPrompt = {
  prompt: string;
  negativePrompt: string;
  // 어떤 취향 슬롯이 채워졌는지(검증·로그용). 키=슬롯명, 값=감지된 단어들.
  slots: Record<string, string[]>;
};

// ── 고정 스타일 앵커 ───────────────────────────────────────────────────
const STYLE_ANCHOR =
  "은은한 수채화 그림. 크림색 한지(닥종이) 질감 배경. 손으로 부드럽게 그린 듯한 느낌. 낮은 채도의 파스텔 톤. 차분하고 담백한 분위기.";

// ── 강/여백 제약 (P4 합성 호환의 핵심) ─────────────────────────────────
// 노드 offset 200px 가 강의 작은 흔들림을 흡수하므로 정밀 정합은 불필요.
// 단 "중앙 곡류 + 양옆 빈 텍스트존" 은 반드시 지켜야 글자가 강 위에 안 겹친다.
const COMPOSITION_CONSTRAINT =
  "세로로 긴 그림(세로가 가로보다 김). 잔잔한 시냇물(강)이 화면 세로 중앙을 위에서 아래로 부드럽게 굽이쳐 흐른다. 강의 좌우 흔들림은 작게, 화면 가로 중앙에서 크게 벗어나지 않게. 강 양옆의 넓은 공간은 비워 둔다(나중에 글씨가 들어갈 자리). 화면 맨 위와 맨 아래에도 여백을 둔다. 사람·글자·큰 나무·구조물 없이, 강과 은은한 배경만 있는 빈 풍경.";

// ── 금지(negative) ─────────────────────────────────────────────────────
const NEGATIVE_PROMPT =
  "비석, 묘비, 무덤, 3D 렌더링, 입체감, 돌 질감, 바위, 오컬트, 신비주의 상징, 카발라, 생명의 나무 도형, 진한 채도, 쨍한 원색, 네온, 형광색, 네오브루탈리즘, Y2K, 글자, 텍스트, 문자, 숫자, 워터마크, 서명, 로고, 사람, 얼굴, 동물, 사진처럼 사실적인 묘사.";

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

// preferences 문구들에서 슬롯별 단어를 모은다(중복 제거).
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

export function buildBackgroundPrompt(
  preferences: string[] | null | undefined,
): BackgroundPrompt {
  const clean = (preferences ?? [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .slice(0, 10);

  const slots = detectSlots(clean);

  // 취향 섹션 — (1) 감지된 슬롯을 정리된 지시로, (2) 원문 문구도 그대로 보존
  // (슬롯 키워드가 못 잡은 취향까지 살리기 위해).
  const tasteParts: string[] = [];
  const slotEntries = Object.entries(slots);
  if (slotEntries.length > 0) {
    const slotLine = slotEntries
      .map(([slot, words]) => `${slot}: ${words.join(", ")}`)
      .join(" / ");
    tasteParts.push(`다음 취향을 은은하게 반영한다 — ${slotLine}.`);
  }
  if (clean.length > 0) {
    tasteParts.push(`사용자가 좋아하는 것(표현 그대로): ${clean.join("; ")}.`);
  }
  if (tasteParts.length === 0) {
    // 취향 정보가 전혀 없을 때 — 앵커+제약만으로도 생성되게 중립 취향.
    tasteParts.push("특별한 취향 정보는 없다. 은은한 자연의 색감과 잔잔한 분위기로.");
  }
  const tasteSection = tasteParts.join(" ");

  const prompt = [STYLE_ANCHOR, tasteSection, COMPOSITION_CONSTRAINT].join("\n\n");

  return { prompt, negativePrompt: NEGATIVE_PROMPT, slots };
}
