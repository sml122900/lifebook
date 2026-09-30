// 기억 에이전트 연구 트랙 — 시기 표현 → 연도 범위 해석기(순수 함수, LLM·DB 0).
//
// phase/기억에이전트_R1-R4_기획.md §3. 모델은 연도를 계산하지 않는다 — 추출기는
// 원문 시기 표현("군대 있을 때")만 뽑고, 에이전트는 resolve_period 도구로 이 함수를
// 부른다. 같은 함수를 양쪽에서 쓴다.
//
// 우선순위: ① 명시 연도·연대·범위 ② 나이 표현 ③ 인생 단계(본인 기록 1순위 →
// 없으면 출생연도 기본값, "추정" 표기) ④ 어릴 때 ⑤ 시대 사건(MonthEvent 제목).
// 어느 것도 안 맞거나 모호하면 { ok: false } — 에이전트는 시기 필터 없이 검색한다.
// 컨텍스트(출생연도·본인 기록 앵커·시대 사건)는 호출자가 채운다(R1-6 원본 어댑터).

export type LifeStage =
  | "KINDERGARTEN"
  | "ELEMENTARY"
  | "MIDDLE"
  | "HIGH"
  | "UNIVERSITY"
  | "MILITARY"
  | "FIRST_JOB"
  | "MARRIAGE";

// v3 골격 LifeEvent.type → 인생 단계(컨텍스트 조립용). CUSTOM·BIRTH 는 단계 아님.
export const LIFE_EVENT_TYPE_STAGE: Record<string, LifeStage> = {
  ELEM_SCHOOL: "ELEMENTARY",
  MIDDLE_SCHOOL: "MIDDLE",
  HIGH_SCHOOL: "HIGH",
  UNIVERSITY: "UNIVERSITY",
  MILITARY: "MILITARY",
  FIRST_JOB: "FIRST_JOB",
  MARRIAGE: "MARRIAGE",
};

export type PeriodContext = {
  birthYear: number | null;
  // 본인 기록 앵커(골격 CONFIRMED·CORRECTED 의 correctedYear ?? year, v2 기간
  // 카테고리의 eventYear/endYear). end 가 없으면 단계별 기본 기간을 붙인다.
  anchors: Partial<Record<LifeStage, { start: number; end?: number }>>;
  // 골격에서 SKIPPED 된 단계 — 기본값으로 추정하지 않는다.
  skipped?: readonly LifeStage[];
  // 시대 사건(MonthEvent VERIFIED 의 제목·연도).
  eras?: readonly { title: string; year: number }[];
  // 두 자리 연도 해석 기준(기본: 올해).
  currentYear?: number;
};

export type PeriodBasis =
  | "NUMERIC"
  | "AGE_EXPR"
  | "SKELETON"
  | "DEFAULT_AGE"
  | "ERA";

export type PeriodResult =
  | {
      ok: true;
      yearFrom: number;
      yearTo: number;
      precision: "YEAR" | "RANGE";
      basis: PeriodBasis;
      lifeStage?: LifeStage;
      note?: string;
    }
  | { ok: false; reason: string };

// 단계별 기본 기간(시작 연도 포함 N+1 해)과 기본 시작 나이(lib/age.ts 학령 범위와 같은 값).
const DURATION: Record<LifeStage, number> = {
  KINDERGARTEN: 2,
  ELEMENTARY: 5,
  MIDDLE: 2,
  HIGH: 2,
  UNIVERSITY: 3,
  MILITARY: 2,
  FIRST_JOB: 3,
  MARRIAGE: 0,
};
const DEFAULT_START_AGE: Partial<Record<LifeStage, number>> = {
  KINDERGARTEN: 4,
  ELEMENTARY: 7,
  MIDDLE: 13,
  HIGH: 16,
  UNIVERSITY: 19,
  MILITARY: 20,
};
const STAGE_LABEL: Record<LifeStage, string> = {
  KINDERGARTEN: "유치원",
  ELEMENTARY: "국민학교(초등학교)",
  MIDDLE: "중학교",
  HIGH: "고등학교",
  UNIVERSITY: "대학",
  MILITARY: "입대",
  FIRST_JOB: "첫 직장",
  MARRIAGE: "결혼",
};
// 단어 → 단계. 공백 제거한 문자열에서 찾는다.
const STAGE_PATTERNS: readonly [LifeStage, RegExp][] = [
  ["KINDERGARTEN", /유치원|어린이집/],
  ["ELEMENTARY", /국민학|초등/],
  ["MIDDLE", /중학/],
  ["HIGH", /고등학교|고등학생|고교|농고|상고|공고|여고/],
  ["UNIVERSITY", /대학/],
  // "제대로"(부사)는 제대가 아니다.
  ["MILITARY", /군대|군생활|군복무|군시절|입대|제대(?!로)|전역|훈련소/],
  ["FIRST_JOB", /첫직장|첫회사|첫출근|입사/],
  ["MARRIAGE", /결혼|신혼|장가|시집/],
];

const KOR_TENS: Record<string, number> = {
  열: 10,
  스물: 20,
  스무: 20,
  서른: 30,
  마흔: 40,
  쉰: 50,
  예순: 60,
  일흔: 70,
  여든: 80,
  아흔: 90,
};
const KOR_ONES: Record<string, number> = {
  하나: 1,
  한: 1,
  둘: 2,
  두: 2,
  셋: 3,
  세: 3,
  넷: 4,
  네: 4,
  다섯: 5,
  여섯: 6,
  일곱: 7,
  여덟: 8,
  아홉: 9,
};
const SINO_GRADE: Record<string, number> = {
  일: 1,
  이: 2,
  삼: 3,
  사: 4,
  오: 5,
  육: 6,
};

function ok(
  yearFrom: number,
  yearTo: number,
  basis: PeriodBasis,
  extra: { lifeStage?: LifeStage; note?: string } = {},
): PeriodResult {
  const [from, to] =
    yearFrom <= yearTo ? [yearFrom, yearTo] : [yearTo, yearFrom];
  return {
    ok: true,
    yearFrom: from,
    yearTo: to,
    precision: from === to ? "YEAR" : "RANGE",
    basis,
    ...extra,
  };
}

function fullYear(raw: string, currentYear: number): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  return n <= currentYear % 100 ? 2000 + n : 1900 + n;
}

// ① 명시 연도·연대·범위.
function resolveNumeric(c: string, currentYear: number): PeriodResult | null {
  const range = c.match(/(\d{2,4})년?(?:부터|~|-|–)(\d{2,4})년(?:까지)?/);
  if (range)
    return ok(
      fullYear(range[1], currentYear),
      fullYear(range[2], currentYear),
      "NUMERIC",
    );

  const decade = c.match(/(\d{2}|\d{4})년대(초반|초|중반|중|후반|말)?/);
  if (decade) {
    const base = fullYear(decade[1], currentYear);
    const part = decade[2] ?? "";
    if (part.startsWith("초")) return ok(base, base + 3, "NUMERIC");
    if (part.startsWith("중")) return ok(base + 4, base + 6, "NUMERIC");
    if (part === "후반" || part === "말")
      return ok(base + 7, base + 9, "NUMERIC");
    return ok(base, base + 9, "NUMERIC");
  }

  // "10년 전"·"2년 동안" 같은 기간 표현은 연도가 아니다("전후"는 연도 근처).
  const year = c.match(
    /(?<!\d)(\d{4}|\d{2})년(?!대)(?!전(?!후)|동안|간|째|만에)(쯤|무렵|경|즈음|전후|께)?/,
  );
  if (year) {
    const y = fullYear(year[1], currentYear);
    return year[2] ? ok(y - 1, y + 1, "NUMERIC") : ok(y, y, "NUMERIC");
  }
  return null;
}

// ② 나이 표현. 한국 어르신은 세는 나이를 흔히 써서, "N살"은 만 나이·세는 나이를
// 모두 덮도록 [출생+N-2, 출생+N]. "만 N세"는 [출생+N, 출생+N+1].
function parseKoreanAge(c: string): { age: number; man: boolean } | null {
  // "20세기"·"3세대" 는 나이가 아니다.
  const digit = c.match(/(만)?(\d{1,3})(?:살|세(?![기대]))/);
  if (digit) return { age: Number(digit[2]), man: !!digit[1] };

  const kor = c.match(
    /(만)?(열|스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)?(하나|한|둘|두|셋|세|넷|네|다섯|여섯|일곱|여덟|아홉)?살/,
  );
  if (kor && (kor[2] || kor[3])) {
    return {
      age: (kor[2] ? KOR_TENS[kor[2]] : 0) + (kor[3] ? KOR_ONES[kor[3]] : 0),
      man: !!kor[1],
    };
  }
  // "서른 무렵"·"쉰 즈음" — 십 단위만(열 제외: "열심히" 오인). "쉬는"·"쉰다"와 구분되게 뒤 글자 제한.
  const tens = c.match(
    /(스물|스무|서른|마흔|쉰|예순|일흔|여든|아흔)(?=무렵|즈음|쯤|때|넘|초반|중반|후반)/,
  );
  if (tens) return { age: KOR_TENS[tens[1]], man: false };
  return null;
}

function resolveAge(c: string, birthYear: number | null): PeriodResult | null {
  const decade = c.match(/(?<![\d년])([1-9])0대/);
  const age = parseKoreanAge(c);
  if (!decade && !age) return null;
  if (birthYear == null)
    return { ok: false, reason: "출생연도를 몰라 나이를 연도로 바꿀 수 없음" };
  if (decade) {
    const n = Number(decade[1]) * 10;
    return ok(birthYear + n - 2, birthYear + n + 9, "AGE_EXPR");
  }
  const { age: n, man } = age!;
  return man
    ? ok(birthYear + n, birthYear + n + 1, "AGE_EXPR")
    : ok(birthYear + n - 2, birthYear + n, "AGE_EXPR");
}

// ③ 인생 단계.
function stageRange(
  stage: LifeStage,
  ctx: PeriodContext,
):
  | { from: number; to: number; basis: PeriodBasis; note?: string }
  | { reason: string } {
  if (ctx.skipped?.includes(stage)) {
    return {
      reason: `${STAGE_LABEL[stage]}은(는) 골격에서 건너뛴 단계라 추정하지 않음`,
    };
  }
  const anchor = ctx.anchors[stage];
  if (anchor) {
    return {
      from: anchor.start,
      to: anchor.end ?? anchor.start + DURATION[stage],
      basis: "SKELETON",
    };
  }
  const startAge = DEFAULT_START_AGE[stage];
  if (startAge !== undefined && ctx.birthYear != null) {
    const from = ctx.birthYear + startAge;
    return {
      from,
      to: from + DURATION[stage],
      basis: "DEFAULT_AGE",
      note: `${STAGE_LABEL[stage]} 기록 없음 — 출생연도로 추정`,
    };
  }
  return { reason: `${STAGE_LABEL[stage]} 기록이 없어 연도를 알 수 없음` };
}

function resolveStage(c: string, ctx: PeriodContext): PeriodResult | null {
  const matched = STAGE_PATTERNS.filter(([, re]) => re.test(c)).map(([s]) => s);
  if (matched.length === 0) return null;
  if (matched.length > 1) {
    return {
      ok: false,
      reason: `여러 시기가 섞여 있음(${matched.map((s) => STAGE_LABEL[s]).join("·")}) — 나눠서 해석`,
    };
  }
  const stage = matched[0];
  const r = stageRange(stage, ctx);
  if ("reason" in r) return { ok: false, reason: r.reason };
  const extra = { lifeStage: stage, note: r.note };

  if (stage === "MARRIAGE") {
    const y = r.from;
    if (/신혼/.test(c)) return ok(y, y + 2, r.basis, extra);
    if (/(결혼|장가|시집)(하기|가기)?전/.test(c))
      return ok(y - 5, y - 1, r.basis, extra);
    if (/(결혼|장가|시집)(하고|한뒤|한후|후|해서|가고|간뒤|간후)/.test(c))
      return ok(y, y + 5, r.basis, extra);
    return ok(y, y, r.basis, extra);
  }
  if (stage === "MILITARY") {
    if (/입대|훈련소/.test(c)) return ok(r.from, r.from, r.basis, extra);
    if (/제대(?!로)|전역/.test(c)) return ok(r.to, r.to, r.basis, extra);
    return ok(r.from, r.to, r.basis, extra);
  }
  if (stage === "FIRST_JOB") {
    if (/입사|첫출근/.test(c)) return ok(r.from, r.from, r.basis, extra);
    return ok(r.from, r.to, r.basis, extra);
  }
  // 학교 단계: N학년 > 입학 > 졸업 > 재학 기간 전체.
  const grade = c.match(/(\d|일|이|삼|사|오|육)학년/);
  if (grade) {
    const n = /\d/.test(grade[1]) ? Number(grade[1]) : SINO_GRADE[grade[1]];
    const y = r.from + n - 1;
    if (y > r.to)
      return {
        ok: false,
        reason: `${STAGE_LABEL[stage]} ${n}학년은 재학 기간 밖`,
      };
    return ok(y, y, r.basis, extra);
  }
  if (/입학/.test(c)) return ok(r.from, r.from, r.basis, extra);
  if (/졸업/.test(c)) return ok(r.to, r.to, r.basis, extra);
  return ok(r.from, r.to, r.basis, extra);
}

// ⑤ 시대 사건: 표현과 제목(공백·기호 제거)의 최장 공통 부분문자열 길이(3자 이상)로
// 겨룬다 — "서울올림픽 때"는 서울올림픽(5자)이 다른 올림픽(3자)을 이긴다. 동점
// 후보가 3년 넘게 퍼지면 모호로 본다("올림픽 때").
const ERA_MIN_OVERLAP = 3;

function longestCommonSubstring(a: string, b: string): number {
  let best = 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = up;
    }
  }
  return best;
}

function resolveEra(
  c: string,
  eras: readonly { title: string; year: number }[],
): PeriodResult | null {
  const lc = c.toLowerCase();
  const scored = eras
    .map((e) => {
      const title = e.title.toLowerCase().replace(/[\s·,()'"‘’“”]/g, "");
      return { ...e, best: longestCommonSubstring(lc, title) };
    })
    .filter((e) => e.best >= ERA_MIN_OVERLAP);
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((e) => e.best));
  const hits = scored.filter((e) => e.best === top);
  const years = hits.map((e) => e.year);
  const [from, to] = [Math.min(...years), Math.max(...years)];
  if (to - from > 2) {
    return {
      ok: false,
      reason: `여러 시대 사건과 겹침: ${hits.map((e) => `${e.title}(${e.year})`).join(", ")}`,
    };
  }
  return ok(from, to, "ERA");
}

export function resolvePeriod(
  expression: string,
  ctx: PeriodContext,
): PeriodResult {
  const c = expression.replace(/\s+/g, "");
  if (!c) return { ok: false, reason: "빈 표현" };
  const currentYear = ctx.currentYear ?? new Date().getFullYear();

  const numeric = resolveNumeric(c, currentYear);
  if (numeric) return numeric;

  const age = resolveAge(c, ctx.birthYear);
  if (age) return age;

  const stage = resolveStage(c, ctx);
  if (stage) return stage;

  if (/어릴때|어렸을때|어릴적|어렸을적|어린시절/.test(c)) {
    if (ctx.birthYear == null)
      return {
        ok: false,
        reason: "출생연도를 몰라 어린 시절을 연도로 바꿀 수 없음",
      };
    return ok(ctx.birthYear, ctx.birthYear + 12, "DEFAULT_AGE", {
      note: "어린 시절 — 출생부터 12세까지로 추정",
    });
  }

  const era = resolveEra(c, ctx.eras ?? []);
  if (era) return era;

  return { ok: false, reason: "시기로 해석할 수 있는 표현이 없음" };
}
