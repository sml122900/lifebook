// 큰 사건 연도표 — 오늘의 인터뷰 연도 답 해석에서 모델보다 먼저 쓴다(2026-11-09 성민). 순수 모듈(AI·DB 0).
//
// 출처: 앱의 검증된 시대 사건 시드 db/seed/era-events/lifebook_MonthEvent_1980-2019.csv 의 "검증됨" 행
// (각 행의 출처 칸 — 위키백과·우리역사넷·국가기록원·한국은행·통일부·대한축구협회). 표의 연도는 그 행의 연도와 같다(2026-11-09 대조).
// 시드 범위(1980~2019) 밖 사건(4·19·5·16·10·26 등)은 같은 방식으로 검증한 뒤 더한다.
//
// 원칙
// - 한 시점 사건만. 기간을 가리키는 말("6·25 때"·"코로나 때"·그냥 "IMF 때")은 넣지 않는다 — 몇 년인지 하나로 못 정함.
// - 같은 이름이 여러 해인 사건은 그 해를 가리키는 말이 함께 있을 때만(올림픽 = 88·서울, 정상회담 = 처음·1차·김대중, 월드컵 = 한일·4강,
//   IMF = 터지던·오던 등 시작을 뜻하는 말).
// - 앞뒤 칸수가 정해진 말(이듬해·다음 해·그다음 해 / 전해·그 전해·두 해 전 등 ±1·±2)은 표 연도에 그 칸수를 더한다(2026-11-09 성민 채택).
//   칸수가 안 정해진 말("끝나고"·"몇 년 뒤"·"뒤에"·"전에")이 있으면 표를 쓰지 않고 모델에 맡긴다.
// - 서로 다른 해의 사건이 둘 이상 맞으면 표를 쓰지 않는다.

export type EraYear = { year: number; name: string; match: RegExp };

export const ERA_YEARS: readonly EraYear[] = [
  { year: 1980, name: "5·18 광주민주화운동", match: /5\s*[·.ㆍ,-]\s*18\s*(민주|광주|항쟁|사태|운동|때|나던|난\s*해|터지|일어나)|오일팔|광주\s*(민주화\s*운동|민주\s*항쟁|항쟁|사태)/ }, // "5.18에 이사" 같은 날짜는 안 잡힘
  { year: 1986, name: "서울 아시안게임", match: /(86|팔육|팔십육|서울)\s*아시안\s*게임/ },
  { year: 1987, name: "6·29 선언(6월 민주항쟁)", match: /6\s*[·.ㆍ,-]\s*29\s*(선언|민주)|육이구|6월\s*(민주\s*)?항쟁|유월\s*(민주\s*)?항쟁/ }, // "6.29에 결혼" 같은 날짜는 안 잡힘
  { year: 1988, name: "서울올림픽", match: /(88|팔팔|서울)\s*올림픽/ },
  { year: 1994, name: "성수대교 붕괴", match: /성수\s*대교/ },
  { year: 1995, name: "삼풍백화점 붕괴", match: /삼풍/ },
  { year: 1997, name: "IMF 외환위기", match: /(IMF|아이엠에프|외환\s*위기)[^.?!]{0,8}(터지|터진|터졌|오던|왔던|닥치|닥친|시작|나던|난\s*해|맞던|맞은)/i },
  { year: 2000, name: "제1차 남북정상회담", match: /(처음|첫|1\s*차|김대중)[^.?!]{0,10}정상\s*회담|정상\s*회담[^.?!]{0,8}(처음|첫)/ },
  { year: 2002, name: "한일 월드컵", match: /한\s*일\s*월드컵|월드컵\s*4\s*강|붉은\s*악마|거리\s*응원/ },
  { year: 2003, name: "대구 지하철 참사", match: /대구\s*지하철\s*(참사|화재|방화|사고)/ },
  { year: 2014, name: "세월호 참사", match: /세월호/ },
];

// 앞뒤 칸수가 정해진 말(±1·±2) — 위에서부터 먼저 맞춤("다다음 해"를 "다음 해"보다, "전전해"를 "전해"보다 먼저).
// "그다음 해"·"그 전해" = 그 사건의 다음 해·전해(±1 — 2026-11-09 재생에서 Sonnet 20/20 이 1989 로 읽은 것과 같음).
// "전해"는 뒤에 끝말이 올 때만(이었·예요·에 등) — "소식을 전해 들었어요"(전하다)를 잘못 잡지 않게.
const STEP_END = String.raw`(?=\s*(였|이었|이에요|예요|이요|요|에|쯤|무렵|$|[.,!?~]))`;
const OFFSETS: readonly { delta: number; re: RegExp }[] = [
  { delta: 2, re: /다다음\s*해/ },
  { delta: 1, re: /(그\s*)?(이듬|다음)\s*해/ },
  { delta: -2, re: new RegExp(String.raw`전전\s*해${STEP_END}`) },
  { delta: -1, re: new RegExp(String.raw`(그\s*)?전\s*해${STEP_END}`) },
  { delta: 1, re: /(?<![\d가-힣])(한|1)\s*(해|년)\s*(뒤|후)/ },
  { delta: 2, re: /(?<![\d가-힣])(두|2)\s*(해|년)\s*(뒤|후)/ },
  { delta: -1, re: /(?<![\d가-힣])(한|1)\s*(해|년)\s*전/ },
  { delta: -2, re: /(?<![\d가-힣])(두|2)\s*(해|년)\s*전/ },
];

// 칸수가 안 정해진 앞뒤 말 — 칸수 말을 지운 나머지에 이게 있으면 표를 쓰지 않음(모델이 계산).
const RELATIVE =
  /이듬\s*해|다음\s*해|그\s*(다음|뒤|후|전)|(\d+|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|몇)\s*(해|년)\s*(뒤|후|전|만)|끝나고|끝난\s*(뒤|후)|지나고|지나서|(뒤|후)에|전에|전이|직전|직후/;

// 칸수 말을 찾아 지운다 — 둘 이상이면 null(모델에 맡김), 없으면 0.
function stepOf(text: string): { delta: number; rest: string } | null {
  let rest = text;
  const found: number[] = [];
  for (const o of OFFSETS) {
    const m = o.re.exec(rest);
    if (!m) continue;
    found.push(o.delta);
    rest = rest.slice(0, m.index) + " ".repeat(m[0].length) + rest.slice(m.index + m[0].length);
  }
  if (found.length > 1) return null;
  return { delta: found[0] ?? 0, rest };
}

// 앞뒤를 따지는 말이 있는지(칸수 말 포함) — 재생 세트에서 "앞뒤 말 문항"만 고를 때(db/replay-interview-year --relative).
export function hasRelativeWords(text: string): boolean {
  return RELATIVE.test(text) || OFFSETS.some((o) => o.re.test(text));
}

// 답에 표의 사건 이름이 있으면 그 해(+ 칸수 말이면 ±1·±2). 서로 다른 해가 둘 이상 맞거나, 칸수 말이 둘 이상이거나,
// 칸수가 안 정해진 앞뒤 말이 있으면 null.
export function eraYearFromAnswer(text: string): { year: number; name: string; delta: number } | null {
  const step = stepOf(text);
  if (!step || RELATIVE.test(step.rest)) return null;
  const hits = ERA_YEARS.filter((e) => e.match.test(step.rest));
  const years = new Set(hits.map((h) => h.year));
  return years.size === 1 ? { year: hits[0].year + step.delta, name: hits[0].name, delta: step.delta } : null;
}
