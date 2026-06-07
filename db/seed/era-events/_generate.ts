// CSV → .ts 모듈 생성기. db/seed/era-events/*.csv 를 읽어 같은 폴더의
// era-events.ts / era-music.ts 를 덮어쓴다. CSV 갱신 시 재실행만 하면 됨.
//
// 실행: npx tsx db/seed/era-events/_generate.ts
//
// 출력 파일은 손으로 편집 X — CSV 를 고치고 이 generator 를 재실행.
// 헤더 주석에 마지막 생성 시각 + 원본 CSV 경로를 명시.

import fs from "node:fs";
import path from "node:path";

const HERE = __dirname;
const EVENTS_CSV = path.join(HERE, "lifebook_MonthEvent_1980-2019.csv");
const MUSIC_CSV = path.join(HERE, "lifebook_music_1980-2019.csv");
const EVENTS_OUT = path.join(HERE, "era-events.ts");
const MUSIC_OUT = path.join(HERE, "era-music.ts");

// ── RFC 4180 미니 파서 (inspect-era-csv.ts 와 동일) ─────────────────
function parseCsv(raw: string): string[][] {
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
    if (c === '"') { inQuoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r") {
      if (text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = ""; i++;
      continue;
    }
    if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = ""; i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const CATEGORY_MAP: Record<string, string> = {
  "정치사회": "POLITICS_SOCIETY",
  "문화연예": "CULTURE",
  "스포츠": "SPORTS",
  "생활경제": "TREND",
};
const CONFIDENCE_MAP: Record<string, string> = {
  "검증됨": "VERIFIED",
  "추정": "APPROX",
};
const ORIGIN_MAP: Record<string, string> = {
  "국내": "DOMESTIC",
  "해외": "INTERNATIONAL",
};

function parseIntOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
}

// 한 줄 객체 리터럴로 직렬화. 키 순서는 schema 순서와 일치.
function literal(v: string | number | null): string {
  if (v === null) return "null";
  if (typeof v === "number") return String(v);
  // 작은따옴표 안에 백슬래시·작은따옴표만 escape. 백틱 충돌 회피로 single
  // 대신 double 따옴표 + JSON.stringify 사용 — 한글/유니코드도 안전.
  return JSON.stringify(v);
}

function renderEventRow(r: string[]): string {
  const year = parseIntOrNull(r[0] ?? "");
  const month = parseIntOrNull(r[1] ?? "");
  const section = CATEGORY_MAP[(r[2] ?? "").trim()];
  const title = (r[3] ?? "").trim();
  const description = (r[4] ?? "").trim();
  const confidence = CONFIDENCE_MAP[(r[5] ?? "").trim()];
  const source = (r[6] ?? "").trim();
  if (!section) throw new Error(`카테고리 매핑 실패: "${r[2]}" (행 ${JSON.stringify(r)})`);
  if (!confidence) throw new Error(`검증 매핑 실패: "${r[5]}" (행 ${JSON.stringify(r)})`);
  if (year === null) throw new Error(`연도 변환 실패: ${JSON.stringify(r)}`);
  if (title === "") throw new Error(`제목 빈 행: ${JSON.stringify(r)}`);
  // 시대 사건(아카이빙된 큰 사건) 은 단일 시점 — isPeriod/start/end 모두 비움.
  // 향후 기간 사건이 필요해지면 CSV 컬럼 확장 + generator 보강.
  return (
    `  { year: ${literal(year)}, month: ${literal(month)}, section: "${section}", tag: null, ` +
    `title: ${literal(title)}, description: ${literal(description)}, eventDate: null, ` +
    `isPeriod: false, startYear: null, startMonth: null, endYear: null, endMonth: null, ` +
    `confidence: "${confidence}", source: ${literal(source)} },`
  );
}

function renderMusicRow(r: string[]): string {
  const year = parseIntOrNull(r[0] ?? "");
  const month = parseIntOrNull(r[1] ?? "");
  const title = (r[2] ?? "").trim();
  const artist = (r[3] ?? "").trim();
  const origin = ORIGIN_MAP[(r[4] ?? "").trim()];
  const confidence = CONFIDENCE_MAP[(r[5] ?? "").trim()];
  // 출처 컬럼은 ChartSong 스키마에 없음 — drop. confidence 만 보존.
  if (!origin) throw new Error(`국내/해외 매핑 실패: "${r[4]}" (행 ${JSON.stringify(r)})`);
  if (!confidence) throw new Error(`검증 매핑 실패: "${r[5]}" (행 ${JSON.stringify(r)})`);
  if (year === null) throw new Error(`연도 변환 실패: ${JSON.stringify(r)}`);
  if (title === "") throw new Error(`곡명 빈 행: ${JSON.stringify(r)}`);
  if (artist === "") throw new Error(`가수 빈 행: ${JSON.stringify(r)}`);
  const youtubeQuery = `${title} ${artist}`.trim();
  // eraColor — 연대별 톤. SongCard 가 era 별 색상 룩업하는 패턴(2020s 등).
  const eraColor =
    year < 1990 ? "1980s" :
    year < 2000 ? "1990s" :
    year < 2010 ? "2000s" :
    year < 2020 ? "2010s" : "2020s";
  // 차트 순위 데이터 없음 → rank null. 시대 사건 음악은 단일 곡 — isPeriod false.
  return (
    `  { origin: "${origin}", rank: null, title: ${literal(title)}, artist: ${literal(artist)}, ` +
    `year: ${literal(year)}, month: ${literal(month)}, isPeriod: false, ` +
    `startYear: null, startMonth: null, endYear: null, endMonth: null, ` +
    `youtubeQuery: ${literal(youtubeQuery)}, eraColor: "${eraColor}", confidence: "${confidence}" },`
  );
}

function header(originalCsv: string, count: number, kind: "MonthEvent" | "ChartSong"): string {
  const stamp = new Date().toISOString();
  return [
    `// AUTO-GENERATED — 직접 편집 X.`,
    `// 원본 CSV: ${path.basename(originalCsv)}`,
    `// 생성 시각: ${stamp}`,
    `// 재생성: npx tsx db/seed/era-events/_generate.ts`,
    `//`,
    `// ${kind} 시드 ${count}건 (시대 사건/음악 1980~2019). seed-era-events.ts 가`,
    `// deterministic id 로 per-row upsert 하여 재실행해도 중복 안 생김.`,
    ``,
    `import type { ${kind}CreateManyInput } from "../../../lib/generated/prisma/models";`,
    ``,
  ].join("\n");
}

function main() {
  // 사건
  const eventsRaw = fs.readFileSync(EVENTS_CSV, "utf-8");
  const eventsRows = parseCsv(eventsRaw).slice(1); // 헤더 제외
  const eventsBody = eventsRows.map(renderEventRow).join("\n");
  const eventsFile =
    header(EVENTS_CSV, eventsRows.length, "MonthEvent") +
    `export const eraMonthEvents: MonthEventCreateManyInput[] = [\n${eventsBody}\n];\n`;
  fs.writeFileSync(EVENTS_OUT, eventsFile, "utf-8");
  console.log(`✓ ${path.basename(EVENTS_OUT)} — ${eventsRows.length}건`);

  // 음악
  const musicRaw = fs.readFileSync(MUSIC_CSV, "utf-8");
  const musicRows = parseCsv(musicRaw).slice(1);
  const musicBody = musicRows.map(renderMusicRow).join("\n");
  const musicFile =
    header(MUSIC_CSV, musicRows.length, "ChartSong") +
    `export const eraChartSongs: ChartSongCreateManyInput[] = [\n${musicBody}\n];\n`;
  fs.writeFileSync(MUSIC_OUT, musicFile, "utf-8");
  console.log(`✓ ${path.basename(MUSIC_OUT)} — ${musicRows.length}건`);
}

main();
