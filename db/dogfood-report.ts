// 도그푸딩 로그 집계 — 읽기 전용(SELECT·count 만). DB 쓰기 0.
//   실행: npx tsx db/dogfood-report.ts --user <id|email> [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//
// - 날짜는 KST. --from 기본 = 계정 생성일, --to 기본 = 오늘. 활동이 있는 날만 표에 나온다.
// - 대화·본문·사건 이름·인물 이름은 출력하지 않는다(숫자만). 발화 글자 수도 SQL LENGTH 로
//   세어 본문을 불러오지 않는다.
// - 기존 테이블에 없는 항목은 "기록 없음"으로 표시한다(새 기록을 만들지 않는다).
// - 실고객 계정(sml122900)은 --user 로 줘도 거부한다.
// - 오늘의 인터뷰(InterviewItem): 세션 수·완료율·출처별 문항·문항별 답 길이·AI 사용량.
//   비용은 lib/lab/usage.ts 가격표(가정값) 기준 추정.
import "dotenv/config";

import { prisma } from "../lib/db";
import { estimateCostMicroUsd } from "../lib/lab/usage";

const BLOCKED_LOCAL_PART = "sml122900";
const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const NO_RECORD = "기록 없음";

function kstDay(d: Date): string {
  return new Date(d.getTime() + KST_MS).toISOString().slice(0, 10);
}

// KST 자정 → UTC 시각.
function kstMidnight(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - KST_MS);
}

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--") && argv[i + 1] !== undefined) out[a.slice(2)] = argv[++i];
  }
  return out;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function isBlocked(value: string | null | undefined): boolean {
  if (!value) return false;
  return value.toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART);
}

// 한글은 터미널에서 두 칸 — 표 정렬용 근사.
function width(s: string): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1;
  return w;
}
function pad(s: string, n: number, right = false): string {
  const gap = " ".repeat(Math.max(0, n - width(s)));
  return right ? gap + s : s + gap;
}
function printTable(headers: string[], rows: string[][]) {
  const widths = headers.map((h, i) => Math.max(width(h), ...rows.map((r) => width(r[i]))));
  const line = (cells: string[]) => cells.map((c, i) => pad(c, widths[i], i > 0)).join("  ");
  console.log(line(headers));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function inc(map: Map<string, number>, key: string, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

type DayRow = {
  sessions: Set<string>;
  userMsgs: number;
  userChars: number;
  confirmed: number;
  confirmedNoYear: number;
  episodes: number;
  periodEpisodes: number;
  people: number;
  tokenCharges: number;
  tokensSpent: number;
  labCalls: number;
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const userArg = args.user;
  if (!userArg) fail("사용법: npx tsx db/dogfood-report.ts --user <id|email> [--from YYYY-MM-DD] [--to YYYY-MM-DD]");
  if (isBlocked(userArg)) fail("거부: 실고객 계정은 집계하지 않습니다.");

  const user = await prisma.user.findFirst({
    where: userArg.includes("@") ? { email: userArg } : { id: userArg },
    select: { id: true, email: true, name: true, createdAt: true },
  });
  if (!user) fail("사용자를 찾지 못했어요.");
  if (isBlocked(user.email) || isBlocked(user.name)) fail("거부: 실고객 계정은 집계하지 않습니다.");

  const dayRe = /^\d{4}-\d{2}-\d{2}$/;
  const fromDay = args.from ?? kstDay(user.createdAt);
  const toDay = args.to ?? kstDay(new Date());
  if (!dayRe.test(fromDay) || !dayRe.test(toDay) || fromDay > toDay) {
    fail("--from/--to 는 YYYY-MM-DD 형식이고 from ≤ to 여야 해요.");
  }
  const from = kstMidnight(fromDay);
  const to = new Date(kstMidnight(toDay).getTime() + DAY_MS); // 미포함 상한
  const inRange = (d: Date | null | undefined) => !!d && d >= from && d < to;
  const userId = user.id;

  const [messages, lifeEvents, episodes, people, tokenTxs, labUsages, aiMessages, poster, interviewItems] = await Promise.all([
    // 본문은 불러오지 않고 길이만.
    prisma.$queryRaw<{ sessionId: string; role: string; createdAt: Date; len: number }[]>`
      SELECT "sessionId", role::text AS role, "createdAt", LENGTH(content)::int AS len
      FROM "OnboardingChatMessage"
      WHERE "userId" = ${userId} AND "createdAt" >= ${from} AND "createdAt" < ${to}`,
    prisma.lifeEvent.findMany({
      where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
      select: { type: true, status: true, year: true, correctedYear: true, confirmedAt: true, updatedAt: true },
    }),
    prisma.episode.findMany({
      where: { lifeEvent: { userId }, createdAt: { gte: from, lt: to } },
      select: { createdAt: true, isPeriod: true },
    }),
    prisma.person.findMany({
      where: { userId, createdAt: { gte: from, lt: to } },
      select: { createdAt: true, isDraft: true, subjectType: true },
    }),
    prisma.tokenTransaction.findMany({
      where: { userId, delta: { lt: 0 }, createdAt: { gte: from, lt: to } },
      select: { reason: true, delta: true, createdAt: true },
    }),
    prisma.labUsage.findMany({
      where: { userId, createdAt: { gte: from, lt: to } },
      select: { purpose: true, inputTokens: true, outputTokens: true, costMicroUsd: true, createdAt: true },
    }),
    prisma.aIMessage.findMany({
      where: { conversation: { userId }, role: "assistant", createdAt: { gte: from, lt: to } },
      select: { inputTokens: true, outputTokens: true },
    }),
    prisma.poster.findUnique({
      where: { userId },
      select: { selections: true, design: true, updatedAt: true },
    }),
    // 세션 키(day)가 KST 날짜 문자열이라 그대로 범위 비교.
    prisma.interviewItem.findMany({
      where: { userId, day: { gte: fromDay, lte: toDay } },
      select: {
        day: true,
        source: true,
        status: true,
        askedAt: true,
        answerChars: true,
        aiCalls: true,
        aiInputTokens: true,
        aiOutputTokens: true,
        aiModel: true,
      },
    }),
  ]);

  const days = new Map<string, DayRow>();
  const day = (d: Date): DayRow => {
    const k = kstDay(d);
    let r = days.get(k);
    if (!r) {
      r = {
        sessions: new Set(),
        userMsgs: 0,
        userChars: 0,
        confirmed: 0,
        confirmedNoYear: 0,
        episodes: 0,
        periodEpisodes: 0,
        people: 0,
        tokenCharges: 0,
        tokensSpent: 0,
        labCalls: 0,
      };
      days.set(k, r);
    }
    return r;
  };

  // /chat-v3 — 세션 = OnboardingChatMessage.sessionId(브라우저 방문 1회). 자정을 넘긴
  // 세션은 양쪽 날에 1씩 잡히고, 기간 합계는 중복 없이 센다.
  const allSessions = new Set<string>();
  let totalUserMsgs = 0;
  let totalUserChars = 0;
  for (const m of messages) {
    const r = day(m.createdAt);
    r.sessions.add(m.sessionId);
    allSessions.add(m.sessionId);
    if (m.role === "user") {
      r.userMsgs++;
      r.userChars += m.len;
      totalUserMsgs++;
      totalUserChars += m.len;
    }
  }

  // 확정 사건 — CONFIRMED 는 confirmedAt, CORRECTED 는 확정 시각 컬럼이 없어 updatedAt(근사).
  const confirmedByType = new Map<string, number>();
  let confirmedInRange = 0;
  let confirmedNoYearInRange = 0;
  let correctedApprox = 0;
  let noYearNow = 0;
  for (const e of lifeEvents) {
    const noYear = (e.correctedYear ?? e.year) === null;
    if (noYear) noYearNow++;
    const at = e.status === "CONFIRMED" ? (e.confirmedAt ?? e.updatedAt) : e.updatedAt;
    if (!inRange(at)) continue;
    const r = day(at);
    r.confirmed++;
    confirmedInRange++;
    inc(confirmedByType, e.type);
    if (e.status === "CORRECTED") correctedApprox++;
    if (noYear) {
      r.confirmedNoYear++;
      confirmedNoYearInRange++;
    }
  }

  let periodEpisodes = 0;
  for (const ep of episodes) {
    const r = day(ep.createdAt);
    r.episodes++;
    if (ep.isPeriod) {
      r.periodEpisodes++;
      periodEpisodes++;
    }
  }

  const peopleBreakdown = new Map<string, number>();
  for (const p of people) {
    day(p.createdAt).people++;
    inc(peopleBreakdown, `${p.subjectType}${p.isDraft ? "(초안)" : ""}`);
  }

  const chargeByReason = new Map<string, { count: number; tokens: number }>();
  for (const t of tokenTxs) {
    const r = day(t.createdAt);
    r.tokenCharges++;
    r.tokensSpent += -t.delta;
    const agg = chargeByReason.get(t.reason) ?? { count: 0, tokens: 0 };
    agg.count++;
    agg.tokens += -t.delta;
    chargeByReason.set(t.reason, agg);
  }

  const labByPurpose = new Map<string, { calls: number; inTok: number; outTok: number; micro: number }>();
  for (const u of labUsages) {
    day(u.createdAt).labCalls++;
    const agg = labByPurpose.get(u.purpose) ?? { calls: 0, inTok: 0, outTok: 0, micro: 0 };
    agg.calls++;
    agg.inTok += u.inputTokens;
    agg.outTok += u.outputTokens;
    agg.micro += u.costMicroUsd;
    labByPurpose.set(u.purpose, agg);
  }

  // ── 출력 ───────────────────────────────────────────────────
  console.log(`도그푸딩 집계 — 대상 ${userId} · 기간 ${fromDay} ~ ${toDay} (KST)`);
  console.log("※ 숫자만 출력. 활동이 있는 날만 표시.\n");

  const sortedDays = [...days.keys()].sort();
  printTable(
    ["날짜", "세션", "발화", "글자", "확정", "연도없음", "Episode", "구간", "인물", "토큰차감", "연구실호출"],
    sortedDays.map((k) => {
      const r = days.get(k)!;
      return [
        k,
        String(r.sessions.size),
        String(r.userMsgs),
        String(r.userChars),
        String(r.confirmed),
        String(r.confirmedNoYear),
        String(r.episodes),
        String(r.periodEpisodes),
        String(r.people),
        r.tokenCharges ? `${r.tokenCharges}건/${r.tokensSpent}` : "0",
        String(r.labCalls),
      ];
    }),
  );
  if (sortedDays.length === 0) console.log("(기간 안 활동 없음)");

  console.log("\n── 기간 합계 ──");
  console.log(`/chat-v3 세션 수: ${allSessions.size}`);
  console.log(`사용자 발화 수: ${totalUserMsgs} · 총 글자 수: ${totalUserChars}`);
  console.log(
    `확정 사건(CONFIRMED/CORRECTED): ${confirmedInRange}` +
      (correctedApprox ? ` (그중 CORRECTED ${correctedApprox}건은 확정 시각 컬럼이 없어 updatedAt 기준 근사)` : ""),
  );
  for (const [type, n] of [...confirmedByType].sort()) console.log(`  - ${type}: ${n}`);
  console.log(`  - 그중 연도 없음: ${confirmedNoYearInRange}`);
  console.log(`연도 없는 확정 사건(현재 시점 전체): ${noYearNow}`);
  console.log(`새 Episode: ${episodes.length} · 그중 구간(isPeriod): ${periodEpisodes}`);
  console.log(`인물(Person) 추가: ${people.length}`);
  for (const [k, n] of [...peopleBreakdown].sort()) console.log(`  - ${k}: ${n}`);

  console.log("\n── AI 호출 ──");
  console.log(
    `/chat-v3 AI 호출 수·토큰·비용: ${NO_RECORD} (lib/ai.ts chat() 는 사용량을 DB 에 남기지 않음 — 오늘의 인터뷰만 아래 섹션에 기록)`,
  );
  if (chargeByReason.size === 0) {
    console.log("사용자 토큰 차감(TokenTransaction): 기간 안 0건");
  } else {
    console.log("사용자 토큰 차감(TokenTransaction, 서비스 토큰 단위 — API 토큰 아님):");
    for (const [reason, a] of [...chargeByReason].sort()) {
      console.log(`  - ${reason}: ${a.count}건 · ${a.tokens}토큰`);
    }
  }
  if (labByPurpose.size === 0) {
    console.log("연구실 원가 원장(LabUsage): 기간 안 0건");
  } else {
    console.log("연구실 원가 원장(LabUsage, 추정 원가):");
    for (const [purpose, a] of [...labByPurpose].sort()) {
      console.log(
        `  - ${purpose}: ${a.calls}회 · 입력 ${a.inTok} · 출력 ${a.outTok} · $${(a.micro / 1e6).toFixed(6)}`,
      );
    }
  }
  const aiIn = aiMessages.reduce((s, m) => s + (m.inputTokens ?? 0), 0);
  const aiOut = aiMessages.reduce((s, m) => s + (m.outputTokens ?? 0), 0);
  console.log(
    `레거시 추억 대화(AIMessage): ${aiMessages.length}회 · 입력 ${aiIn} · 출력 ${aiOut}` +
      (aiMessages.length ? " (모델 컬럼 없음 — 비용 추정 안 함)" : ""),
  );

  printInterview(interviewItems);

  console.log("\n── 포스터 ──");
  console.log(`선택 저장 횟수: ${NO_RECORD} (Poster 는 사용자당 1행 — 저장 이력 없음)`);
  console.log(`시안 생성 횟수: ${NO_RECORD} (항목마다 마지막 생성 시각만 남음)`);
  if (poster) {
    const items = Array.isArray(poster.selections) ? (poster.selections as unknown[]) : [];
    const generatedInRange = items.filter((it) => {
      const g = (it as { generatedAt?: unknown } | null)?.generatedAt;
      return typeof g === "string" && inRange(new Date(g));
    }).length;
    const cacheAt = (poster.design as { candidateCache?: { generatedAt?: unknown } } | null)?.candidateCache
      ?.generatedAt;
    console.log(`  참고(횟수 아님): 현재 선택 ${items.length}개 중 저장 문장 생성 시각이 기간 안인 항목 ${generatedInRange}개`);
    console.log(
      `  참고(횟수 아님): 후보 캐시 마지막 생성 ${typeof cacheAt === "string" ? kstDay(new Date(cacheAt)) : "없음"} · Poster 마지막 갱신 ${kstDay(poster.updatedAt)}`,
    );
  } else {
    console.log("  (Poster 행 없음)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

type InterviewRow = {
  day: string;
  source: string;
  status: string;
  askedAt: Date | null;
  answerChars: number;
  aiCalls: number;
  aiInputTokens: number;
  aiOutputTokens: number;
  aiModel: string | null;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// 오늘의 인터뷰 — 세션 = (사용자, day). 시작 = 문항 하나라도 화면에 나옴(askedAt),
// 완료 = PLANNED 로 남은 문항 0. 비용은 문항별 모델 기준 추정(가격표에 없으면 따로 표시).
function printInterview(rows: InterviewRow[]) {
  console.log("\n── 오늘의 인터뷰 ──");
  if (rows.length === 0) {
    console.log("기간 안 세션 없음");
    return;
  }
  const cost = (r: InterviewRow): number | null => {
    if (r.aiCalls === 0) return 0;
    if (!r.aiModel) return null;
    try {
      return estimateCostMicroUsd(r.aiModel, { input: r.aiInputTokens, output: r.aiOutputTokens });
    } catch {
      return null;
    }
  };
  const usd = (micro: number) => `$${(micro / 1e6).toFixed(4)}`;
  const isDone = (r: InterviewRow) => r.status !== "PLANNED";
  const countBy = (rs: InterviewRow[], status: string) => rs.filter((r) => r.status === status).length;
  const days = [...new Set(rows.map((r) => r.day))].sort();

  printTable(
    ["날짜", "문항", "답", "건너뜀", "제외", "남음", "답 글자", "AI호출", "추정비용"],
    days.map((d) => {
      const rs = rows.filter((r) => r.day === d);
      return [
        d,
        String(rs.length),
        String(countBy(rs, "ANSWERED")),
        String(countBy(rs, "SKIPPED")),
        String(countBy(rs, "DROPPED")),
        String(rs.filter((r) => !isDone(r)).length),
        String(rs.reduce((n, r) => n + r.answerChars, 0)),
        String(rs.reduce((n, r) => n + r.aiCalls, 0)),
        usd(rs.reduce((n, r) => n + (cost(r) ?? 0), 0)),
      ];
    }),
  );

  const started = days.filter((d) => rows.some((r) => r.day === d && r.askedAt)).length;
  const completed = days.filter((d) => rows.filter((r) => r.day === d).every(isDone)).length;
  console.log(
    `세션 수: ${days.length} · 시작: ${started} · 완료: ${completed} · 완료율: ${Math.round((completed / days.length) * 100)}%`,
  );

  console.log("출처별 문항 — 제시 → 답/건너뜀/제외/남음 · 답한 문항의 답 글자 평균·중앙값:");
  for (const source of [...new Set(rows.map((r) => r.source))].sort()) {
    const rs = rows.filter((r) => r.source === source);
    const lens = rs.filter((r) => r.status === "ANSWERED").map((r) => r.answerChars);
    const avg = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;
    console.log(
      `  - ${source}: ${rs.length} → ${lens.length}/${countBy(rs, "SKIPPED")}/${countBy(rs, "DROPPED")}/${rs.filter((r) => !isDone(r)).length}` +
        ` · 평균 ${avg} · 중앙값 ${median(lens)}`,
    );
  }

  const unpriced = rows.filter((r) => cost(r) === null).length;
  const models = [...new Set(rows.map((r) => r.aiModel).filter(Boolean))].join(", ") || "없음";
  console.log(
    `AI: ${rows.reduce((n, r) => n + r.aiCalls, 0)}회 · 입력 ${rows.reduce((n, r) => n + r.aiInputTokens, 0)}` +
      ` · 출력 ${rows.reduce((n, r) => n + r.aiOutputTokens, 0)} · 모델 ${models}` +
      ` · 추정 ${usd(rows.reduce((n, r) => n + (cost(r) ?? 0), 0))}` +
      (unpriced ? ` (가격표에 없는 모델 문항 ${unpriced}개는 비용 제외)` : ""),
  );
}
