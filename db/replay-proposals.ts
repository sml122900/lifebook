// 제안 프롬프트 재생 세트 — db/test-fixtures/proposal-replay/*.json 의 실제(또는 같은 구조로 재구성한) 제안 입력을
// 프롬프트별로 N회 다시 돌려 기대 시기 적중률을 낸다. CLAUDE.md 작업 규칙 9: 제안·요약 등 모델 프롬프트를 바꾸면
// 변경 전(git ref)·후(작업 트리)를 각 10회 비교한 뒤 커밋하고, 새 실패 사례는 이 세트에 더한다.
//
// 실행: npx tsx db/replay-proposals.ts [--prompt work,HEAD,<git ref>...] [--n 10] [--case <파일 이름 일부>]
//   work = 작업 트리 lib/prompts/free-chat.ts · 그 밖 = 그 git ref 의 같은 파일(상대 import 를 그 폴더 기준으로 바꿔
//   db/test-logs/replay-prompts/ 에 임시로 씀 — git 무시 폴더).
// 판정 = 앱과 같은 pickCenter(모델 응답, 입력의 [시기 후보], 주제 시기) 결과 시기 이름이 expectCenter 인지. 괄호 = 모델이
//   낸 id 그대로의 적중(이름 확인 전). 호출 설정 = 앱 제안과 같음(lib/node-proposal PROPOSAL_CALL).
// 실제 모델 호출 — 시작 때 테스트 한도(db/live-log requireTestBudget) 확인, 원가는 픽스처 계정
// (fixture-proposal-replay@lifebook.invalid)으로 원장에 TEST_ 로 남기고 끝에 계정을 지운다(원장은 남음). 실고객·test30 접촉 0.

import "dotenv/config";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { deleteAccountTx } from "../lib/account-deletion";
import { chat } from "../lib/ai";
import { costMicroUsd, recordChatUsage } from "../lib/chat-v3-usage";
import { prisma } from "../lib/db";
import { pickCenter, PROPOSAL_CALL } from "../lib/node-proposal";
import { requireTestBudget } from "./live-log";

type Case = { name: string; source: string; expectCenter: string; fallbackCenter: string | null; birthYear: number | null; input: string };
type Center = { id: string; label: string; year: number | null };

const ROOT = path.resolve(__dirname, "..").replace(/\\/g, "/");
const CASE_DIR = path.join(__dirname, "test-fixtures", "proposal-replay");
const FIXTURE_EMAIL = "fixture-proposal-replay@lifebook.invalid";
const CONCURRENCY = 5;

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

function centersOf(input: string): Center[] {
  const m = input.match(/\[시기 후보\]\n([\s\S]*?)\n\n\[/);
  if (!m || m[1].trim() === "(없음)") return [];
  return m[1].split("\n").map((line) => {
    const parts = line.replace(/^- /, "").split(" · ");
    const year = /^\d{4}년$/.test(parts[parts.length - 1]) ? Number(parts.pop()!.slice(0, 4)) : null;
    return { id: parts[0], label: parts.slice(1).join(" · "), year };
  });
}

// git ref 의 PROPOSAL_SYSTEM_PROMPT — 그 시점 파일을 임시 모듈로 써서 읽는다(상대 import 를 임시 폴더 기준으로 바꿈).
async function promptAt(ref: string): Promise<string> {
  if (ref === "work") return (await import("../lib/prompts/free-chat")).PROPOSAL_SYSTEM_PROMPT;
  if (!/^[\w.\-/~^]+$/.test(ref)) throw new Error(`git ref 모양이 아님: ${ref}`);
  const src = execFileSync("git", ["show", `${ref}:lib/prompts/free-chat.ts`], { cwd: ROOT, encoding: "utf8" })
    .replace(/from "(\.\.?)\/([^"]+)"/g, (_m, dots: string, rest: string) => `from "../../../lib/${dots === "." ? "prompts/" : ""}${rest}"`);
  const dir = path.join(__dirname, "test-logs", "replay-prompts");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `free-chat-${ref.replace(/[^\w.-]/g, "_")}.ts`);
  fs.writeFileSync(file, src);
  return (await import(pathToFileURL(file).href)).PROPOSAL_SYSTEM_PROMPT;
}

async function main() {
  const refs = arg("prompt", "work,HEAD").split(",").filter(Boolean);
  const n = Number(arg("n", "10"));
  const only = arg("case", "");
  const cases = fs
    .readdirSync(CASE_DIR)
    .filter((f) => f.endsWith(".json") && f.includes(only))
    .sort()
    .map((f) => ({ file: f, ...(JSON.parse(fs.readFileSync(path.join(CASE_DIR, f), "utf8")) as Case) }));
  console.log(`재생 세트 ${cases.length}건 × 프롬프트 ${refs.length}개 × ${n}회 = 호출 ${cases.length * refs.length * n}회`);

  await requireTestBudget("replay-proposals");
  const prompts = new Map<string, string>();
  for (const r of refs) prompts.set(r, await promptAt(r));

  const left = await prisma.user.findUnique({ where: { email: FIXTURE_EMAIL }, select: { id: true } });
  if (left) await deleteAccountTx(left.id);
  const userId = (await prisma.user.create({ data: { email: FIXTURE_EMAIL, name: "[fixture] proposal replay" }, select: { id: true } })).id;

  let cost = 0;
  const table: Record<string, Record<string, string>> = {};
  try {
    for (const c of cases) {
      const centers = centersOf(c.input);
      const fallback = c.fallbackCenter ? centers.find((x) => x.label === c.fallbackCenter) : undefined;
      for (const r of refs) {
        let hit = 0;
        let rawHit = 0;
        const picks: Record<string, number> = {};
        const once = async () => {
          const res = await chat([{ role: "user", content: c.input }], { system: prompts.get(r)!, ...PROPOSAL_CALL });
          await recordChatUsage(userId, "PROPOSAL", res);
          cost += costMicroUsd(res.model, res.inputTokens, res.outputTokens);
          let obj: Record<string, unknown> = {};
          try {
            obj = JSON.parse(res.text.trim().replace(/^```json\s*|^```\s*/i, "").replace(/\s*```$/, "").match(/\{[\s\S]*\}/)?.[0] ?? "");
          } catch {
            picks["(JSON 아님)"] = (picks["(JSON 아님)"] ?? 0) + 1;
            return;
          }
          const raw = centers.find((x) => x.id === ((obj.center ?? {}) as Record<string, unknown>).matchId);
          const got = pickCenter(obj, centers, fallback, c.birthYear);
          const name = !got ? "(미지정)" : "id" in got ? got.label : `새 시기 ${got.new.label}`;
          picks[name] = (picks[name] ?? 0) + 1;
          if (raw?.label === c.expectCenter) rawHit++;
          if (got && "id" in got && got.label === c.expectCenter) hit++;
        };
        for (let i = 0; i < n; i += CONCURRENCY) await Promise.all(Array.from({ length: Math.min(CONCURRENCY, n - i) }, once));
        (table[c.name] ??= {})[r] = `${hit}/${n} (${rawHit})`;
        console.log(`  ${c.file} · ${r}: 적중 ${hit}/${n} (id 그대로 ${rawHit}) — ${JSON.stringify(picks)}`);
      }
    }
  } finally {
    await deleteAccountTx(userId);
  }

  console.log(`\n| 입력(기대 시기) | ${refs.join(" | ")} |\n|---|${refs.map(() => "---").join("|")}|`);
  for (const c of cases) console.log(`| ${c.name} | ${refs.map((r) => table[c.name]?.[r] ?? "-").join(" | ")} |`);
  console.log(`\n원가 $${(cost / 1e6).toFixed(4)}(원장 TEST_ — 픽스처 계정)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
