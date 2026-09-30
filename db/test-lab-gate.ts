// 기억 에이전트 R1-2 — /lab 게이트 2중 검증 (LLM·DB 0).
//
//   층 ① 화면      : app/lab/memory 의 layout.tsx·모든 page.tsx → requireLabPage() → notFound()
//   층 ② 서버 액션 : app/lab·lib/lab 의 모든 "use server" 액션 첫 문장 →
//                    requireLabUser() / requireLabSubject()
//
// 판정 로직(lib/lab/gate.ts)은 env 를 바꿔 가며 직접 호출하고, 배선(layout·page·
// 액션이 실제로 게이트를 부르는지)은 TypeScript AST 정적 검사로 확인한다 — auth() 는
// 요청 컨텍스트가 필요해 스크립트에서 부를 수 없기 때문. 정적 검사는 이후 추가되는
// 페이지·액션에도 그대로 적용되는 회귀 장치다.
//
// 실행: npx tsx db/test-lab-gate.ts

import fs from "node:fs";
import path from "node:path";

import ts from "typescript";

import {
  assertLabSubject,
  assertLabUser,
  canAccessSubject,
  enforceLabPage,
  isLabUser,
  LabAccessError,
  labSubjectsFor,
} from "../lib/lab/gate";

let failed = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  console.log(
    `${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`,
  );
  if (!ok) failed += 1;
}

const ROOT = path.resolve(__dirname, "..");

// ── 판정 로직 헬퍼 ───────────────────────────────────────────────
function isNotFound(e: unknown): boolean {
  const digest = (e as { digest?: unknown } | null)?.digest;
  return typeof digest === "string" && digest.includes("404");
}
function throwsNotFound(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return isNotFound(e);
  }
}
function throwsLabAccess(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch (e) {
    return e instanceof LabAccessError;
  }
}

// ── 정적 검사 헬퍼 ───────────────────────────────────────────────
function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
}
function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}
function isUseServerFile(sf: ts.SourceFile): boolean {
  const first = sf.statements[0];
  return (
    !!first &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === "use server"
  );
}
function hasExport(node: ts.Node): boolean {
  return (
    (ts.getCombinedModifierFlags(node as ts.Declaration) &
      ts.ModifierFlags.Export) !==
    0
  );
}
// 함수 본문 안의 "use server"(인라인 서버 액션) — 파일 단위 검사를 우회하므로 금지.
function findInlineUseServer(sf: ts.SourceFile): number {
  let count = 0;
  const visit = (n: ts.Node) => {
    if (ts.isBlock(n) && n.statements.length > 0) {
      const s = n.statements[0];
      if (
        ts.isExpressionStatement(s) &&
        ts.isStringLiteral(s.expression) &&
        s.expression.text === "use server"
      ) {
        count += 1;
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return count;
}
// "use server" 파일의 export 액션 → 첫 문장 텍스트.
function exportedActions(
  sf: ts.SourceFile,
): { name: string; firstStatement: string }[] {
  const out: { name: string; firstStatement: string }[] = [];
  const firstOf = (body: ts.ConciseBody | undefined): string => {
    if (!body) return "";
    if (!ts.isBlock(body)) return body.getText(sf);
    return body.statements[0]?.getText(sf) ?? "";
  };
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && hasExport(st)) {
      out.push({
        name: st.name?.text ?? "(default)",
        firstStatement: firstOf(st.body),
      });
    } else if (ts.isVariableStatement(st) && hasExport(st)) {
      for (const d of st.declarationList.declarations) {
        const init = d.initializer;
        const fn =
          init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))
            ? init
            : undefined;
        out.push({
          name: d.name.getText(sf),
          firstStatement: fn ? firstOf(fn.body) : "(함수 아님)",
        });
      }
    }
  }
  return out;
}
const GUARD_RE = /^(?:const\s+[\s\S]+?=\s*)?await\s+requireLab(User|Subject)\(/;

async function main() {
  const saved = process.env.LAB_ALLOWED_USER_IDS;
  try {
    // ── 판정 로직: 미설정 = 아무도 통과 못 함 ─────────────────────
    delete process.env.LAB_ALLOWED_USER_IDS;
    check(
      "미설정: 어떤 id 도 isLabUser false",
      !isLabUser("lab_persona_a") && !isLabUser("x"),
    );
    check(
      "미설정: 화면 층 notFound",
      throwsNotFound(() => enforceLabPage("lab_persona_a")),
    );
    check(
      "미설정: 액션 층 LabAccessError",
      throwsLabAccess(() => assertLabUser("lab_persona_a")),
    );

    // 운영자 me·other(둘 다 허용 목록) + 페르소나 a·b. 공백·빈 항목 섞어 파싱 확인.
    process.env.LAB_ALLOWED_USER_IDS =
      " op_me , op_other,,lab_persona_a,lab_persona_b ";

    // ── 층 ① 화면 ─────────────────────────────────────────────────
    check(
      "① 비로그인(undefined) → notFound",
      throwsNotFound(() => enforceLabPage(undefined)),
    );
    check(
      "① 빈 문자열 → notFound",
      throwsNotFound(() => enforceLabPage("")),
    );
    check(
      "① 비허용 로그인 사용자 → notFound",
      throwsNotFound(() => enforceLabPage("stranger")),
    );
    check(
      "① 대소문자 다른 id → notFound(정확 일치만)",
      throwsNotFound(() => enforceLabPage("OP_ME")),
    );
    let pageId: string | null = null;
    try {
      pageId = enforceLabPage("op_me");
    } catch {
      pageId = null;
    }
    check("① 허용 운영자 → 통과, 자기 id 반환", pageId === "op_me", pageId);

    // ── 층 ② 서버 액션 ─────────────────────────────────────────────
    check(
      "② 비로그인 → LabAccessError",
      throwsLabAccess(() => assertLabUser(undefined)),
    );
    check(
      "② 비허용 → LabAccessError",
      throwsLabAccess(() => assertLabUser("stranger")),
    );
    check("② 허용 → id 반환", assertLabUser("op_me") === "op_me");
    const msg = new LabAccessError().message;
    check(
      "② 오류 문구가 연구실 존재를 드러내지 않음",
      !/lab|연구|허용|LAB_/i.test(msg),
      msg,
    );

    // ── 대상 제한(결정 4): 허용 목록 AND (본인 OR lab_persona_) ────
    check("대상: 본인 → 허용", canAccessSubject("op_me", "op_me"));
    check(
      "대상: 허용 목록의 페르소나 → 허용",
      canAccessSubject("op_me", "lab_persona_a"),
    );
    check(
      "대상: 다른 운영자(허용 목록이지만 본인·페르소나 아님) → 거부",
      !canAccessSubject("op_me", "op_other"),
    );
    check(
      "대상: 허용 목록 밖 페르소나 id → 거부",
      !canAccessSubject("op_me", "lab_persona_zz"),
    );
    check(
      "대상: 허용 목록 밖 실계정 → 거부",
      !canAccessSubject("op_me", "stranger"),
    );
    check(
      "대상: 비허용 뷰어 → 페르소나도 거부",
      !canAccessSubject("stranger", "lab_persona_a"),
    );
    check(
      "대상: 뷰어가 허용된 페르소나 자신이면 허용(본인 규칙)",
      canAccessSubject("lab_persona_a", "lab_persona_a"),
    );
    check(
      "대상: assertLabSubject 는 거부를 LabAccessError 로",
      throwsLabAccess(() => assertLabSubject("op_me", "op_other")),
    );
    const subjects = labSubjectsFor("op_me");
    check(
      "대상 목록: 본인 + 페르소나만(다른 운영자 제외), 허용 목록 순서",
      JSON.stringify(subjects) ===
        JSON.stringify(["op_me", "lab_persona_a", "lab_persona_b"]),
      subjects,
    );

    // ── 배선 정적 검사 ① 화면 ─────────────────────────────────────
    const labApp = path.join(ROOT, "app", "lab");
    const appFiles = walk(labApp);
    const layout = path.join(labApp, "memory", "layout.tsx");
    const layoutSrc = fs.existsSync(layout)
      ? fs.readFileSync(layout, "utf8")
      : "";
    check(
      "① layout.tsx 가 await requireLabPage() 호출",
      /await\s+requireLabPage\(\)/.test(layoutSrc),
    );
    check(
      "① layout.tsx metadata robots noindex·nofollow",
      /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(layoutSrc),
    );
    const pages = appFiles.filter((f) => path.basename(f) === "page.tsx");
    check("① app/lab 아래 page.tsx 1개 이상", pages.length > 0, pages.length);
    for (const p of pages) {
      check(
        `① ${rel(p)} 가 await requireLabPage() 직접 호출`,
        /await\s+requireLabPage\(\)/.test(fs.readFileSync(p, "utf8")),
      );
    }
    const nestedLayouts = appFiles.filter(
      (f) => path.basename(f) === "layout.tsx" && f !== layout,
    );
    for (const l of nestedLayouts) {
      check(
        `① ${rel(l)} 가 await requireLabPage() 호출`,
        /await\s+requireLabPage\(\)/.test(fs.readFileSync(l, "utf8")),
      );
    }
    const routes = [
      ...appFiles,
      ...walk(path.join(ROOT, "app", "api", "lab")),
    ].filter((f) => path.basename(f) === "route.ts");
    check(
      "① lab API 라우트 없음(서버 액션만 — 계획 §8)",
      routes.length === 0,
      routes.map(rel),
    );

    // access.ts 래퍼가 세션 userId 를 판정 함수에 그대로 넘기는지.
    const accessSrc = fs.readFileSync(
      path.join(ROOT, "lib", "lab", "access.ts"),
      "utf8",
    );
    check(
      "배선: requireLabPage → enforceLabPage(세션 id)",
      /enforceLabPage\(await sessionUserId\(\)\)/.test(accessSrc),
    );
    check(
      "배선: requireLabUser → assertLabUser(세션 id)",
      /return assertLabUser\(await sessionUserId\(\)\)/.test(accessSrc),
    );
    check(
      "배선: requireLabSubject → assertLabUser + assertLabSubject",
      /assertLabUser\(await sessionUserId\(\)\)[\s\S]*assertLabSubject\(viewerId, subjectId\)/.test(
        accessSrc,
      ),
    );
    check(
      "배선: sessionUserId 는 auth() 의 session.user.id",
      /session\?\.user\?\.id/.test(accessSrc),
    );

    // ── 배선 정적 검사 ② 서버 액션 ────────────────────────────────
    const serverScope = [...appFiles, ...walk(path.join(ROOT, "lib", "lab"))];
    let actionFiles = 0;
    let actionCount = 0;
    for (const f of serverScope) {
      const sf = parse(f);
      const inline = findInlineUseServer(sf);
      check(`② ${rel(f)} 인라인 "use server" 없음`, inline === 0, inline);
      if (!isUseServerFile(sf)) continue;
      actionFiles += 1;
      for (const a of exportedActions(sf)) {
        actionCount += 1;
        check(
          `② ${rel(f)} ${a.name}() 첫 문장이 requireLabUser/requireLabSubject`,
          GUARD_RE.test(a.firstStatement),
          a.firstStatement.slice(0, 80),
        );
      }
    }
    console.log(
      `   (lab "use server" 파일 ${actionFiles}개, 액션 ${actionCount}개 검사 — R1-2 시점엔 0개가 정상, R1-6 부터 생김)`,
    );

    // 정적 검사기가 실제로 잡는지 자체 검증(가짜 소스).
    const bad = ts.createSourceFile(
      "bad.ts",
      `"use server";\nexport async function leak(id: string) {\n  const x = await prisma.user.findMany();\n  await requireLabUser();\n  return x;\n}\nexport const leak2 = async () => { return 1; };\n`,
      ts.ScriptTarget.Latest,
      true,
    );
    const badActions = exportedActions(bad);
    check(
      "검사기 자체: 게이트 없는 액션 2개를 모두 잡음",
      isUseServerFile(bad) &&
        badActions.length === 2 &&
        badActions.every((a) => !GUARD_RE.test(a.firstStatement)),
      badActions,
    );
    const good = ts.createSourceFile(
      "good.ts",
      `"use server";\nexport async function ok(s: string): Promise<{ a: number }> {\n  const { viewerId } = await requireLabSubject(s);\n  return { a: viewerId.length };\n}\n`,
      ts.ScriptTarget.Latest,
      true,
    );
    check(
      "검사기 자체: 반환 타입에 중괄호가 있어도 게이트 첫 문장을 인식",
      exportedActions(good).every((a) => GUARD_RE.test(a.firstStatement)),
      exportedActions(good),
    );
    const inlineBad = ts.createSourceFile(
      "inline.tsx",
      `export default function P() {\n  async function act() {\n    "use server";\n    return 1;\n  }\n  return null;\n}\n`,
      ts.ScriptTarget.Latest,
      true,
    );
    check(
      "검사기 자체: 인라인 서버 액션을 잡음",
      findInlineUseServer(inlineBad) === 1,
    );
  } finally {
    if (saved === undefined) delete process.env.LAB_ALLOWED_USER_IDS;
    else process.env.LAB_ALLOWED_USER_IDS = saved;
  }

  console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
