// 서버 렌더 날짜 KST 고정(lib/kst-date) 단위 검증 — DB·LLM 0.
//
//   ① 한국 시간 00:00~08:59 픽스처(UTC 로는 전날)를 서버(UTC) 환경에서 포맷 → 한국 날짜
//   ② 표기 무변: 예전 코드(timeZone 없음)를 한국 시간 서버에서 돌린 결과와 글자 그대로 같음
//   ③ 대조: 예전 코드를 UTC 서버에서 돌리면 전날이 나옴(픽스처가 실제로 경계를 넘는지)
//   ④ 배선: 대상 화면 9곳이 lib/kst-date 를 쓰고 시간대 없는 날짜 포맷이 남지 않음
//
// 실행: npx tsx db/test-kst-date.ts

import fs from "node:fs";
import path from "node:path";

import {
  KST_DATE_FMT,
  KST_DATE_LONG_FMT,
  KST_DATE_NUMERIC_FMT,
  KST_DATE_TIME_FMT,
  KST_DATE_TIME_FULL_FMT,
} from "../lib/kst-date";

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

function setTz(tz: string): boolean {
  process.env.TZ = tz;
  return new Intl.DateTimeFormat().resolvedOptions().timeZone === tz;
}

// 한국 시간 벽시계 → 실제 시각(UTC = KST − 9h).
function kstAt(y: number, m: number, d: number, hh: number, mm: number, ss = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hh - 9, mm, ss));
}

const FIXTURES: Array<{ at: Date; kst: [number, number, number] }> = [
  { at: kstAt(2026, 10, 25, 0, 0), kst: [2026, 10, 25] },
  { at: kstAt(2026, 10, 25, 0, 30), kst: [2026, 10, 25] },
  { at: kstAt(2026, 10, 25, 4, 15), kst: [2026, 10, 25] },
  { at: kstAt(2026, 10, 25, 8, 59, 59), kst: [2026, 10, 25] },
  { at: kstAt(2026, 3, 1, 8, 30), kst: [2026, 3, 1] }, // 월 경계(UTC 로는 2월 28일)
  { at: kstAt(2026, 1, 1, 0, 0), kst: [2026, 1, 1] }, // 연 경계(UTC 로는 2025년 12월 31일)
];

// 화면별 예전 코드(timeZone 없음)와 새 포맷의 짝. old 는 호출 시점의 프로세스 시간대를 쓴다.
const FORMATS: Array<{ name: string; screens: string; fmt: Intl.DateTimeFormat; old: (d: Date) => string }> = [
  {
    name: "KST_DATE_FMT",
    screens: "settings 가입일·동의 / rooms 가입일",
    fmt: KST_DATE_FMT,
    old: (d) => new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d),
  },
  {
    name: "KST_DATE_TIME_FMT",
    screens: "tokens·billing 거래 / 댓글 시각",
    fmt: KST_DATE_TIME_FMT,
    old: (d) =>
      new Intl.DateTimeFormat("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d),
  },
  {
    name: "KST_DATE_NUMERIC_FMT",
    screens: "account/orders·admin/orders 주문일",
    fmt: KST_DATE_NUMERIC_FMT,
    old: (d) => d.toLocaleDateString("ko-KR"),
  },
  {
    name: "KST_DATE_TIME_FULL_FMT",
    screens: "admin/orders 상세",
    fmt: KST_DATE_TIME_FULL_FMT,
    old: (d) => d.toLocaleString("ko-KR"),
  },
  {
    name: "KST_DATE_LONG_FMT",
    screens: "DraftReview",
    fmt: KST_DATE_LONG_FMT,
    old: (d) => d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" }),
  },
];

function ymd(fmt: Intl.DateTimeFormat, d: Date): [number, number, number] {
  const parts = fmt.formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value.replace(/\D/g, ""));
  return [get("year"), get("month"), get("day")];
}
const same = (a: number[], b: number[]) => a.length === b.length && a.every((v, i) => v === b[i]);

// 예전 코드 결과를 시간대별로 미리 계산.
check("전제: 프로세스 시간대를 Asia/Seoul 로 바꿀 수 있음", setTz("Asia/Seoul"));
const oldAtKst = FORMATS.map((f) => FIXTURES.map((x) => f.old(x.at)));
check("전제: 프로세스 시간대를 UTC 로 바꿀 수 있음(= Vercel 서버)", setTz("UTC"));
const oldAtUtc = FORMATS.map((f) => FIXTURES.map((x) => f.old(x.at)));

// 서버(UTC) 환경 그대로 새 포맷 검사.
FORMATS.forEach((f, fi) => {
  const results = FIXTURES.map((x) => f.fmt.format(x.at));
  check(
    `① ${f.name}(${f.screens}) — KST 00:00~08:59 픽스처 ${FIXTURES.length}개 모두 한국 날짜`,
    FIXTURES.every((x) => same(ymd(f.fmt, x.at), x.kst)),
    FIXTURES.map((x, i) => [x.at.toISOString(), results[i]]),
  );
  check(
    `② ${f.name} — 표기는 예전 코드를 한국 시간 서버에서 돌린 것과 글자 그대로 같음`,
    results.every((r, i) => r === oldAtKst[fi][i]),
    results.map((r, i) => [r, oldAtKst[fi][i]]),
  );
  check(
    `③ 대조 — 예전 코드를 UTC 서버에서 돌리면 ${FIXTURES.length}개 모두 한국 날짜와 다름(전날)`,
    oldAtUtc[fi].every((r, i) => r !== results[i]),
    oldAtUtc[fi],
  );
});

// 오전/AM 표기는 Node 의 ICU 데이터에 따라 달라 날짜만 고정 문자열로 본다.
const sample = kstAt(2026, 1, 5, 8, 30);
check(
  "표기 예시 — 2026. 01. 05. / 2026. 1. 5. / 2026년 1월 5일",
  KST_DATE_FMT.format(sample) === "2026. 01. 05." &&
    KST_DATE_NUMERIC_FMT.format(sample) === "2026. 1. 5." &&
    KST_DATE_LONG_FMT.format(sample) === "2026년 1월 5일",
  [KST_DATE_FMT.format(sample), KST_DATE_NUMERIC_FMT.format(sample), KST_DATE_LONG_FMT.format(sample)],
);

// ④ 배선 — 서버에서 그려지는 대상 화면.
const ROOT = path.resolve(__dirname, "..");
const SCREENS = [
  "app/account/settings/page.tsx",
  "app/account/tokens/page.tsx",
  "app/billing/page.tsx",
  "app/rooms/page.tsx",
  "app/rooms/[roomId]/CommentThread.tsx",
  "app/account/orders/page.tsx",
  "app/admin/orders/page.tsx",
  "app/admin/orders/[orderId]/page.tsx",
  "app/life-timeline/manage/DraftReview.tsx",
];
for (const rel of SCREENS) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  const leftovers = [
    /new Intl\.DateTimeFormat\(/,
    /toLocaleDateString\(/,
    /toLocaleTimeString\(/,
    /\b(?:d|o\.\w+At|\w+At)\.toLocaleString\(/,
  ].filter((re) => re.test(src));
  check(
    `④ ${rel} — 서버 컴포넌트·lib/kst-date 사용·시간대 없는 날짜 포맷 0`,
    !/^\s*["']use client["']/m.test(src) && src.includes('from "@/lib/kst-date"') && leftovers.length === 0,
    leftovers.map(String),
  );
}

console.log(failed === 0 ? `\nALL PASS (${count})` : `\n${failed} FAIL / ${count}`);
process.exit(failed === 0 ? 0 : 1);
