// 일회성 진단 스크립트 — db/seed/era-events/ 의 두 CSV 가 우리 스키마에
// 깨끗하게 매핑되는지 확인. DB 저장·파일 출력 0. 통계와 문제 행만 출력.
//
// 실행: npx tsx db/inspect-era-csv.ts
//
// CSV 파서는 RFC 4180 미니 구현 — 따옴표 안 쉼표·이중따옴표·줄바꿈 모두
// 처리. UTF-8 BOM 도 제거. csv-parse 등 외부 의존 없이 일회성으로 끝.

import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(__dirname, "seed", "era-events");
const EVENTS_PATH = path.join(ROOT, "lifebook_MonthEvent_1980-2019.csv");
const MUSIC_PATH = path.join(ROOT, "lifebook_music_1980-2019.csv");

// ── RFC 4180 미니 파서 ────────────────────────────────────────────────
// 상태기계: IN_FIELD / IN_QUOTED / AFTER_QUOTE.
// `""` (따옴표 안 이중) → 리터럴 `"`.
// 줄 끝(\n 또는 \r\n)에서 행 push.
function parseCsv(raw: string): string[][] {
  // BOM 제거.
  const text = raw.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuoted = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    // 비-quoted 상태
    if (c === '"') {
      inQuoted = true;
      i++;
      continue;
    }
    if (c === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // \r\n 또는 단독 \r 모두 줄바꿈으로
      if (text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // 마지막 행 (개행 없이 끝난 경우)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 완전 빈 행 제거 (꼬리 개행 등).
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// ── enum 매핑 테이블 ──────────────────────────────────────────────────
const CATEGORY_MAP: Record<string, "POLITICS_SOCIETY" | "CULTURE" | "SPORTS" | "TREND"> = {
  "정치사회": "POLITICS_SOCIETY",
  "문화연예": "CULTURE",
  "스포츠": "SPORTS",
  "생활경제": "TREND",
};
const CONFIDENCE_MAP: Record<string, "VERIFIED" | "APPROX"> = {
  "검증됨": "VERIFIED",
  "추정": "APPROX",
};
const ORIGIN_MAP: Record<string, "DOMESTIC" | "INTERNATIONAL"> = {
  "국내": "DOMESTIC",
  "해외": "INTERNATIONAL",
};

// ── 검증 + 통계 ───────────────────────────────────────────────────────
function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

function bucket<T extends string>(arr: T[]): Record<string, number> {
  const o: Record<string, number> = {};
  for (const v of arr) o[v] = (o[v] ?? 0) + 1;
  return o;
}

type EventRow = {
  rowIdx: number;
  year: number | null;
  month: number | null;
  section: string | null;     // null = 매핑 실패
  title: string;
  description: string;
  confidence: string | null;
  source: string;
  raw: string[];
  problems: string[];
};

type MusicRow = {
  rowIdx: number;
  year: number | null;
  month: number | null;
  title: string;
  artist: string;
  origin: string | null;
  confidence: string | null;
  source: string;
  youtubeQuery: string;
  raw: string[];
  problems: string[];
};

function inspectEvents(): EventRow[] {
  const raw = fs.readFileSync(EVENTS_PATH, "utf-8");
  const rows = parseCsv(raw);
  const header = rows[0];
  console.log("\n[MonthEvent CSV]");
  console.log(`  파일: ${EVENTS_PATH}`);
  console.log(`  헤더 (${header.length}열): ${JSON.stringify(header)}`);
  console.log(`  데이터 행: ${rows.length - 1}`);

  const data = rows.slice(1);
  const out: EventRow[] = data.map((r, idx) => {
    const problems: string[] = [];
    if (r.length !== header.length) {
      problems.push(`열 개수 mismatch (${r.length} vs ${header.length})`);
    }
    const year = parseIntOrNull(r[0] ?? "");
    const month = parseIntOrNull(r[1] ?? "");
    const sectionRaw = (r[2] ?? "").trim();
    const section = CATEGORY_MAP[sectionRaw] ?? null;
    const title = (r[3] ?? "").trim();
    const description = (r[4] ?? "").trim();
    const confRaw = (r[5] ?? "").trim();
    const confidence = CONFIDENCE_MAP[confRaw] ?? null;
    const source = (r[6] ?? "").trim();

    if (year === null) problems.push(`연도 정수 변환 실패: "${r[0]}"`);
    if (year !== null && (year < 1900 || year > 2100)) {
      problems.push(`연도 범위 이상: ${year}`);
    }
    if (month !== null && (month < 1 || month > 12)) {
      problems.push(`월 범위 이상: ${month}`);
    }
    if (section === null) problems.push(`카테고리 매핑 실패: "${sectionRaw}"`);
    if (title === "") problems.push("제목 비어있음");
    if (confidence === null) problems.push(`검증 매핑 실패: "${confRaw}"`);

    return {
      rowIdx: idx + 2, // 1-based + 헤더 1줄
      year, month, section, title, description, confidence, source,
      raw: r,
      problems,
    };
  });
  return out;
}

function inspectMusic(): MusicRow[] {
  const raw = fs.readFileSync(MUSIC_PATH, "utf-8");
  const rows = parseCsv(raw);
  const header = rows[0];
  console.log("\n[ChartSong CSV]");
  console.log(`  파일: ${MUSIC_PATH}`);
  console.log(`  헤더 (${header.length}열): ${JSON.stringify(header)}`);
  console.log(`  데이터 행: ${rows.length - 1}`);

  const data = rows.slice(1);
  const out: MusicRow[] = data.map((r, idx) => {
    const problems: string[] = [];
    if (r.length !== header.length) {
      problems.push(`열 개수 mismatch (${r.length} vs ${header.length})`);
    }
    const year = parseIntOrNull(r[0] ?? "");
    const month = parseIntOrNull(r[1] ?? "");
    const title = (r[2] ?? "").trim();
    const artist = (r[3] ?? "").trim();
    const originRaw = (r[4] ?? "").trim();
    const origin = ORIGIN_MAP[originRaw] ?? null;
    const confRaw = (r[5] ?? "").trim();
    const confidence = CONFIDENCE_MAP[confRaw] ?? null;
    const source = (r[6] ?? "").trim();
    const youtubeQuery = `${title} ${artist}`.trim();

    if (year === null) problems.push(`연도 정수 변환 실패: "${r[0]}"`);
    if (year !== null && (year < 1900 || year > 2100)) {
      problems.push(`연도 범위 이상: ${year}`);
    }
    if (month !== null && (month < 1 || month > 12)) {
      problems.push(`월 범위 이상: ${month}`);
    }
    if (title === "") problems.push("곡명 비어있음");
    if (artist === "") problems.push("가수 비어있음");
    if (origin === null) problems.push(`국내/해외 매핑 실패: "${originRaw}"`);
    if (confidence === null) problems.push(`검증 매핑 실패: "${confRaw}"`);

    return {
      rowIdx: idx + 2,
      year, month, title, artist, origin, confidence, source, youtubeQuery,
      raw: r,
      problems,
    };
  });
  return out;
}

function reportProblems<T extends { rowIdx: number; problems: string[]; raw: string[] }>(
  label: string,
  rows: T[],
) {
  const bad = rows.filter((r) => r.problems.length > 0);
  console.log(`\n  문제 행: ${bad.length} / ${rows.length}`);
  if (bad.length > 0) {
    for (const r of bad.slice(0, 20)) {
      console.log(`    행 ${r.rowIdx}: ${r.problems.join("; ")}`);
      console.log(`      raw: ${JSON.stringify(r.raw)}`);
    }
    if (bad.length > 20) console.log(`    … 외 ${bad.length - 20}건`);
  }
  void label;
}

function reportEnumDistribution(events: EventRow[], music: MusicRow[]) {
  console.log("\n[enum 분포 — MonthEvent]");
  console.log("  section:    ", bucket(events.map((e) => e.section ?? "<unmapped>")));
  console.log("  confidence: ", bucket(events.map((e) => e.confidence ?? "<unmapped>")));
  console.log("  month null: ", events.filter((e) => e.month === null).length);
  console.log("  연도 범위:  ",
    Math.min(...events.filter((e) => e.year !== null).map((e) => e.year!)),
    "~",
    Math.max(...events.filter((e) => e.year !== null).map((e) => e.year!)));

  console.log("\n[enum 분포 — ChartSong]");
  console.log("  origin:     ", bucket(music.map((m) => m.origin ?? "<unmapped>")));
  console.log("  confidence: ", bucket(music.map((m) => m.confidence ?? "<unmapped>")));
  console.log("  month null: ", music.filter((m) => m.month === null).length);
  console.log("  연도 범위:  ",
    Math.min(...music.filter((m) => m.year !== null).map((m) => m.year!)),
    "~",
    Math.max(...music.filter((m) => m.year !== null).map((m) => m.year!)));
}

function reportQuoteSamples(events: EventRow[], music: MusicRow[]) {
  console.log("\n[따옴표·쉼표 포함 행 샘플 — 파싱 확인]");
  const evWithComma = events.filter(
    (e) => e.description.includes(",") || e.title.includes(","),
  );
  console.log(`  MonthEvent: 제목/설명에 쉼표 포함된 행 ${evWithComma.length}건`);
  for (const e of evWithComma.slice(0, 5)) {
    console.log(`    행 ${e.rowIdx}: "${e.title}" / "${e.description}"`);
  }
  const muWithComma = music.filter(
    (m) => m.title.includes(",") || m.artist.includes(","),
  );
  console.log(`  ChartSong: 곡명/가수에 쉼표 포함된 행 ${muWithComma.length}건`);
  for (const m of muWithComma.slice(0, 5)) {
    console.log(`    행 ${m.rowIdx}: "${m.title}" / "${m.artist}"`);
  }
}

function main() {
  const events = inspectEvents();
  reportProblems("MonthEvent", events);

  const music = inspectMusic();
  reportProblems("ChartSong", music);

  reportEnumDistribution(events, music);
  reportQuoteSamples(events, music);

  // 최종 요약 — pass/fail
  const evBad = events.filter((e) => e.problems.length > 0).length;
  const muBad = music.filter((m) => m.problems.length > 0).length;
  console.log("\n[요약]");
  console.log(`  MonthEvent: ${events.length}건, 문제 ${evBad}건`);
  console.log(`  ChartSong:  ${music.length}건, 문제 ${muBad}건`);
  console.log(evBad === 0 && muBad === 0
    ? "  ✓ 두 CSV 모두 매핑 깨끗. seed 변환 진행 가능."
    : "  ⚠ 문제 행 위 목록 확인 후 결정.");
}

main();
