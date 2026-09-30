// 기억 에이전트 — 격리 규칙 정적 검사 (LLM·DB 0). phase/기억에이전트_R1-R4_기획.md "격리 조건".
//
//   ① 금지 import: lib/lab·app/lab 이 lib/commerce·lib/poster·app/poster·app/shop 을 import 하지 않는다
//   ② 원본 읽기 전용: lib/lab·app/lab 의 prisma 쓰기는 lab 테이블(MemorySourceUnit·MemoryCard·LabUsage)만,
//      raw SQL 쓰기(INSERT·UPDATE·DELETE)도 lab 테이블만
//   ③ 테스트 격리(2026-10-01): db/test-lab-*.ts·db/lab-eval.ts 는 페르소나 원장·카드를 읽기만 한다 —
//      페르소나 id(PERSONA_* 에서 온 식별자·"lab_persona_" 문자열)를 인자로 한 lab 테이블 쓰기·
//      syncSubject 호출·원본 테이블 쓰기를 금지. 쓰기 시나리오는 임시 사용자로.
//      (시드 db/lab-seed-persona.ts·동기화 CLI db/lab-sync.ts 는 테스트가 아니라 대상 밖.)
// 실행 결과 격리(런타임)는 db/test-lab-sync.ts 가 실행 전후 페르소나 원장·카드 불변으로 한 번 더 확인한다.
//
// 실행: npx tsx db/check-lab-isolation.ts

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

const ROOT = path.resolve(__dirname, "..");
const FORBIDDEN_PREFIXES = [
  "lib/commerce",
  "lib/poster",
  "app/poster",
  "app/shop",
];
const LAB_MODELS = new Set(["memorySourceUnit", "memoryCard", "labUsage"]);
const LAB_TABLES = new Set(["MemorySourceUnit", "MemoryCard", "LabUsage"]);
const WRITE_METHODS = new Set([
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
]);

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");
const parseText = (name: string, text: string) =>
  ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
const parse = (f: string) => parseText(f, fs.readFileSync(f, "utf8"));

// import 경로 → 저장소 기준 경로("@/x" 별칭·상대 경로 해석). 패키지 import 는 null.
function resolveImport(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return rel(path.resolve(path.dirname(file), spec));
  return null;
}

function forbiddenImports(file: string, sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    let spec: string | undefined;
    if (
      (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) &&
      n.moduleSpecifier &&
      ts.isStringLiteral(n.moduleSpecifier)
    ) {
      spec = n.moduleSpecifier.text;
    } else if (
      ts.isCallExpression(n) &&
      n.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ts.isStringLiteral(n.arguments[0])
    ) {
      spec = n.arguments[0].text;
    }
    if (spec) {
      const r = resolveImport(file, spec);
      if (r && FORBIDDEN_PREFIXES.some((p) => r === p || r.startsWith(`${p}/`)))
        out.push(spec);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

type WriteCall = { model: string; method: string; argText: string };

// prisma.X.write(...) / tx.X.write(...) 호출.
function prismaWrites(sf: ts.SourceFile): WriteCall[] {
  const out: WriteCall[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const method = n.expression.name.text;
      const inner = n.expression.expression;
      if (
        WRITE_METHODS.has(method) &&
        ts.isPropertyAccessExpression(inner) &&
        ts.isIdentifier(inner.expression)
      ) {
        const client = inner.expression.text;
        if (client === "prisma" || client === "tx") {
          out.push({
            model: inner.name.text,
            method,
            argText: n.arguments.map((a) => a.getText(sf)).join(","),
          });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// $executeRaw / $executeRawUnsafe 의 SQL 에서 쓰기 대상 테이블.
function rawWriteTables(sf: ts.SourceFile): string[] {
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    let sql: string | null = null;
    if (
      ts.isTaggedTemplateExpression(n) &&
      /\$executeRaw\b/.test(n.tag.getText(sf))
    )
      sql = n.template.getText(sf);
    if (
      ts.isCallExpression(n) &&
      /\$executeRaw(Unsafe)?$/.test(n.expression.getText(sf)) &&
      n.arguments[0]
    ) {
      sql = n.arguments[0].getText(sf);
    }
    if (sql) {
      for (const m of sql.matchAll(
        /(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?([A-Za-z_.]+)"?/gi,
      ))
        out.push(m[1]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

// 페르소나 id 를 담은 식별자(초기값에 PERSONA_ 또는 "lab_persona_").
function personaIdents(sf: ts.SourceFile): Set<string> {
  const ids = new Set<string>();
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.initializer
    ) {
      if (/PERSONA_|lab_persona_/.test(n.initializer.getText(sf)))
        ids.add(n.name.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return ids;
}

function mentionsPersona(text: string, idents: Set<string>): boolean {
  if (/PERSONA_|lab_persona_/.test(text)) return true;
  return [...idents].some((id) =>
    new RegExp(`(^|[^\\w$])${id.replace(/\$/g, "\\$")}([^\\w$]|$)`).test(text),
  );
}

// 테스트 파일에서 페르소나를 대상으로 한 쓰기·동기화 호출.
function personaWriteViolations(sf: ts.SourceFile): string[] {
  const idents = personaIdents(sf);
  const out: string[] = [];
  for (const w of prismaWrites(sf)) {
    if (mentionsPersona(w.argText, idents))
      out.push(`${w.model}.${w.method}(${w.argText.slice(0, 60)})`);
  }
  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      n.expression.getText(sf) === "syncSubject" &&
      n.arguments[0]
    ) {
      const a = n.arguments[0].getText(sf);
      if (mentionsPersona(a, idents)) out.push(`syncSubject(${a})`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

function main() {
  const labFiles = [
    ...walk(path.join(ROOT, "lib", "lab")),
    ...walk(path.join(ROOT, "app", "lab")),
  ];
  check("검사 대상 lab 코드 파일 있음", labFiles.length > 0, labFiles.length);

  // ① 금지 import
  for (const f of labFiles) {
    const bad = forbiddenImports(f, parse(f));
    check(`① ${rel(f)} 금지 import 없음`, bad.length === 0, bad);
  }

  // ② 원본 읽기 전용
  for (const f of labFiles) {
    const sf = parse(f);
    const writes = prismaWrites(sf).filter((w) => !LAB_MODELS.has(w.model));
    const raw = rawWriteTables(sf).filter((t) => !LAB_TABLES.has(t));
    check(
      `② ${rel(f)} 원본 쓰기 없음(prisma·raw SQL)`,
      writes.length === 0 && raw.length === 0,
      { writes, raw },
    );
  }

  // ③ 테스트 격리
  const testFiles = walk(path.join(ROOT, "db")).filter((f) =>
    /[\\/](test-lab-[^\\/]+|lab-eval)\.ts$/.test(f),
  );
  check(
    "검사 대상 lab 테스트 파일 있음",
    testFiles.length > 0,
    testFiles.map(rel),
  );
  for (const f of testFiles) {
    const v = personaWriteViolations(parse(f));
    check(`③ ${rel(f)} 페르소나 원장·카드·원본 쓰기 없음`, v.length === 0, v);
  }

  // 검사기 자체 검증(가짜 소스)
  const bad = parseText(
    "bad.ts",
    `import { x } from "@/lib/commerce/products";\nimport { y } from "../poster/render";\nconst USER = PERSONA_A.userId;\n` +
      `await prisma.memoryCard.deleteMany({ where: { userId: USER } });\n` +
      `await tx.userMemory.update({ where: { id } , data: {} });\n` +
      `await prisma.$executeRaw\`UPDATE "UserMemory" SET x = 1\`;\n` +
      `await syncSubject(USER, {});\nawait syncSubject("lab_persona_a");\n`,
  );
  check(
    "검사기 자체: 금지 import 2건을 잡음(별칭·상대 경로)",
    forbiddenImports(path.join(ROOT, "lib", "lab", "bad.ts"), bad).length === 2,
  );
  check(
    "검사기 자체: 원본 prisma 쓰기·raw SQL 쓰기를 잡음",
    prismaWrites(bad).some((w) => w.model === "userMemory") &&
      rawWriteTables(bad).includes("UserMemory"),
  );
  check(
    "검사기 자체: 페르소나 대상 쓰기·동기화 3건을 잡음",
    personaWriteViolations(bad).length === 3,
    personaWriteViolations(bad),
  );
  const good = parseText(
    "good.ts",
    `const USER = PERSONA_A.userId;\nconst tmp = \`wtest_\${Date.now()}\`;\n` +
      `await prisma.memoryCard.findMany({ where: { userId: USER } });\n` +
      `await prisma.memorySourceUnit.deleteMany({ where: { userId: tmp } });\nawait syncSubject(tmp);\n`,
  );
  check(
    "검사기 자체: 페르소나 읽기·임시 사용자 쓰기는 허용",
    personaWriteViolations(good).length === 0,
    personaWriteViolations(good),
  );

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
