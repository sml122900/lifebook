// 옛 이야기 제목 정리 — 옛 저장 경로(개편 전 /chat-v3 이야기 대화·구간 대화, /onboarding-episode-chat)는 이야기
// 제목 칸(브릿지 UserMemory.title)에 시기 이름("고등학교 입학", 구간이면 "… 이후")을 넣었다. 이 스크립트는 그 제목을
// 빈 문자열(= 제목 없음)로 비운다. 화면은 제목이 없으면 본문 첫 문장을 쓰므로(lib/story-title displayTitle) 지도에
// 보이는 글자는 그대로이고, 본문을 고쳐도 제목이 굳지 않으며, 사용자가 지은 제목과 섞이지 않는다.
// (UserMemory.title 이 NOT NULL 이라 NULL 대신 빈 문자열 — 성민 결정 2026-11-02.) docs/phase/my-life-restructure.md §13.3.
//
// 대상 = 제목이 그 이야기 시기의 이름(고친 이름 포함)·"… 이후"(공백 무시, 아래 isPeriodNameTitle).
// 빼는 것: ① 카드 경로가 생긴 뒤(CARD_TITLE_SINCE) 만든 이야기 — 제안 카드 [고치기]로 사용자가 정했을 수 있는 제목
//   (사용자가 고쳤다는 표시는 데이터에 없다: UserMemory 에 수정 시각이 없고, 카드 원래 제목은 [만들기] 때 지워진다 →
//   만든 시각으로만 가른다) ② 본문이 빈 이야기(제목까지 비우면 보일 글자가 없다).
// 바뀌는 곳: /story-review 이야기 이름·인물 확인·포스터 구간 행 제목·오늘의 인터뷰 요약이 시기 이름 → 본문 첫 문장
// (포스터 구간 행은 다음 동기화 때 바뀌고, 시안 문장 캐시는 입력이 바뀌어 다시 만든다). My Life 지도·목록 글자는 그대로.
//
// 범위: 기본 = 실고객 계정(sml122900) 뺀 전부. --customers = 실고객 계정만(dry-run 보고용 — 실행은 성민 승인 뒤).
// 기본은 dry-run(건수·예시 — 기본 범위 10건, --customers 는 전부). --apply 일 때만 쓴다:
//   쓰기 전에 db/backups/legacy-story-titles-<시각>.json 에 대상 id·옛 제목을 남긴다(실패하면 중단).
//   --expect=N 을 주면 대상이 N편이 아닐 때 중단. User 0명으로 읽히면(잘못된 DB 연결) 중단.
// 되돌리기: --restore <백업 파일> (dry-run) / --restore <백업 파일> --apply — 제목이 아직 빈 행만 옛 제목으로.
//
// 넓힌 보고: --wide [--customers] — 이야기뿐 아니라 모든 기록 종류의 제목 칸(dry-run 전용, 아래 wide()).
//
// 실행: npx tsx db/cleanup-legacy-story-titles.ts [--customers] [--apply [--expect=N]]
//       npx tsx db/cleanup-legacy-story-titles.ts --restore db/backups/<파일>.json [--apply]

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";
import { CREATED_VIA_EPISODE } from "../lib/episode";
import { storyLead } from "../lib/story-title";

const BLOCKED_LOCAL_PART = "sml122900";
// 제안 카드 경로(제목 [고치기] 포함) 첫 커밋 — 2단계 436291a. 운영 반영은 이보다 늦으므로 이 시각 이후 이야기는 전부 뺀다.
const CARD_TITLE_SINCE = new Date("2026-11-01T22:21:50+09:00");
const EXAMPLES = 10;
const BACKUP_DIR = path.resolve(__dirname, "backups");

// 옛 저장 경로가 제목 칸에 넣은 시기 이름인지("고등학교 입학", 구간이면 "… 이후", 공백 무시). 2026-11-02 까지는 화면도
// 이 판정으로 그런 제목을 숨겼다(lib/my-life storyTitleOf — 정리 뒤 제거). 지금은 이 스크립트만 쓴다.
function isPeriodNameTitle(title: string, eventLabels: readonly (string | null)[]): boolean {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const t = norm(title);
  return eventLabels.filter((l): l is string => !!l).some((l) => norm(l) === t || norm(`${l} 이후`) === t);
}

type BackupRow = { memoryId: string; episodeId: string; userId: string; oldTitle: string };
type Backup = { kind: "legacy-story-titles"; createdAt: string; scope: "default" | "customers"; rows: BackupRow[] };

function mask(email: string | null): string {
  if (!email) return "(이메일 없음)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? ""}`;
}

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

// --wide(dry-run 전용) — 경로·종류와 상관없이 모든 기록(UserMemory 전 종류)의 제목 칸을 본다.
// 시기 이름 = 그 계정의 시기 이름(고친 이름 포함) + 앱 골격이 만드는 기본 시기 이름(모든 계정의 CUSTOM 아닌 시기 이름).
// 이야기(에피소드) 밖 기록은 제목이 곧 그 기록의 이름(연혁 사건·시대 사건·사진 등)이라 --apply 대상이 아니다 — 보고만.
async function wide(scope: { in: string[] } | { notIn: string[] }, customers: boolean, emailById: Map<string, string | null>) {
  const norm = (s: string) => s.replace(/\s+/g, "");
  const [own, standard, memories] = await Promise.all([
    prisma.lifeEvent.findMany({ where: { userId: scope }, select: { userId: true, label: true, correctedLabel: true } }),
    prisma.lifeEvent.findMany({ where: { type: { not: "CUSTOM" } }, select: { label: true }, distinct: ["label"] }),
    prisma.userMemory.findMany({
      where: { userId: scope },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        userId: true,
        createdVia: true,
        title: true,
        content: true,
        episode: { select: { lifeEvent: { select: { label: true, correctedLabel: true } } } },
      },
    }),
  ]);
  const ownByUser = new Map<string, (string | null)[]>();
  for (const e of own) ownByUser.set(e.userId, [...(ownByUser.get(e.userId) ?? []), e.label, e.correctedLabel]);
  const standardLabels = standard.map((s) => s.label);

  type Hit = { account: string; createdVia: string; kind: string; title: string; lead: string };
  const hits: Hit[] = [];
  for (const m of memories) {
    const t = m.title.trim();
    if (!t) continue;
    const linked = m.episode ? [m.episode.lifeEvent.label, m.episode.lifeEvent.correctedLabel] : [];
    const kind = isPeriodNameTitle(t, linked)
      ? "그 이야기 시기 이름"
      : isPeriodNameTitle(t, ownByUser.get(m.userId) ?? [])
        ? "그 계정의 다른 시기 이름"
        : isPeriodNameTitle(t, standardLabels)
          ? "기본 시기 이름"
          : /이후$/.test(norm(t))
            ? "\"… 이후\""
            : null;
    if (!kind) continue;
    hits.push({ account: mask(emailById.get(m.userId) ?? null), createdVia: m.createdVia, kind, title: t, lead: m.content ? storyLead(m.content) : "" });
  }

  const count = new Map<string, number>();
  for (const h of hits) count.set(`${h.createdVia} · ${h.kind}`, (count.get(`${h.createdVia} · ${h.kind}`) ?? 0) + 1);
  const byVia = new Map<string, number>();
  for (const m of memories) byVia.set(m.createdVia, (byVia.get(m.createdVia) ?? 0) + 1);
  console.log(`넓힌 dry-run — 기록 ${memories.length}행(${[...byVia].map(([v, n]) => `${v} ${n}`).join(" · ") || "없음"}) · 기본 시기 이름 ${standardLabels.length}개`);
  console.log(`  제목이 시기 이름·"… 이후"인 기록 ${hits.length}행 — My Life 이야기(episode) ${hits.filter((h) => h.createdVia === CREATED_VIA_EPISODE).length}행`);
  for (const [k, n] of [...count].sort()) console.log(`    ${k}: ${n}`);
  const limit = customers ? Infinity : EXAMPLES;
  console.log(`예시 ${Math.min(limit, hits.length)}건${customers ? "(전부)" : ""}:`);
  hits.slice(0, limit).forEach((h, i) =>
    console.log(`  ${i + 1}. [${h.account} · ${h.createdVia} · ${h.kind}] "${h.title}" · 본문 첫 문장 "${h.lead || "(본문 없음)"}"`),
  );
}

async function restore(file: string, apply: boolean) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8")) as Backup;
  if (backup.kind !== "legacy-story-titles" || !Array.isArray(backup.rows)) throw new Error("백업 파일 모양이 아니에요.");
  const current = await prisma.userMemory.findMany({
    where: { id: { in: backup.rows.map((r) => r.memoryId) }, createdVia: CREATED_VIA_EPISODE },
    select: { id: true, title: true },
  });
  const titleById = new Map(current.map((m) => [m.id, m.title]));
  const ready = backup.rows.filter((r) => titleById.get(r.memoryId) === "");
  const gone = backup.rows.filter((r) => !titleById.has(r.memoryId)).length;
  const changed = backup.rows.length - ready.length - gone;
  console.log(`되돌리기 ${apply ? "APPLY" : "dry-run"} · 백업 ${backup.rows.length}행(${backup.createdAt}, ${backup.scope})`);
  console.log(`  되돌릴 수 있음 ${ready.length} · 그사이 제목을 새로 정함 ${changed}(그대로 둠) · 이야기 없어짐 ${gone}`);
  if (!apply) return;
  const done = await prisma.$transaction(
    ready.map((r) =>
      prisma.userMemory.updateMany({ where: { id: r.memoryId, createdVia: CREATED_VIA_EPISODE, title: "" }, data: { title: r.oldTitle } }),
    ),
  );
  console.log(`되돌리기 완료: ${done.reduce((n, x) => n + x.count, 0)}행`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const restoreFile = arg("--restore");
  if (restoreFile) return restore(restoreFile, apply);

  const customers = process.argv.includes("--customers");
  const expectArg = process.argv.find((a) => a.startsWith("--expect="));
  const expect = expectArg ? Number(expectArg.slice("--expect=".length)) : null;

  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const customerIds = users
    .filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART))
    .map((u) => u.id);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  const userScope = customers ? { in: customerIds } : { notIn: customerIds };
  if (process.argv.includes("--wide")) {
    if (apply) throw new Error("--wide 는 dry-run 전용이에요(--apply 와 같이 못 씀).");
    console.log(`모드: 넓힌 dry-run(쓰기 없음) · 범위: ${customers ? `실고객 계정 ${customerIds.length}명만` : `실고객 계정 ${customerIds.length}명 제외`} · User ${users.length}명`);
    return wide(userScope, customers, emailById);
  }
  console.log(
    `모드: ${apply ? "APPLY(정리)" : "dry-run(쓰기 없음)"} · 범위: ${customers ? `실고객 계정 ${customerIds.length}명만` : `실고객 계정 ${customerIds.length}명 제외`} · User ${users.length}명`,
  );

  const episodes = await prisma.episode.findMany({
    where: { lifeEvent: { userId: userScope }, memory: { createdVia: CREATED_VIA_EPISODE } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      memoryId: true,
      createdAt: true,
      content: true,
      isPeriod: true,
      kind: true,
      memory: { select: { title: true } },
      lifeEvent: { select: { userId: true, label: true, correctedLabel: true } },
    },
  });

  type Target = BackupRow & { account: string; center: string; lead: string; isPeriod: boolean; afterLabel: boolean; self: boolean };
  const targets: Target[] = [];
  let afterCard = 0;
  let noBody = 0;
  for (const ep of episodes) {
    const oldTitle = ep.memory.title;
    if (!oldTitle.trim() || !isPeriodNameTitle(oldTitle, [ep.lifeEvent.label, ep.lifeEvent.correctedLabel])) continue;
    if (ep.createdAt >= CARD_TITLE_SINCE) {
      afterCard += 1;
      continue;
    }
    const lead = storyLead(ep.content);
    if (!lead) {
      noBody += 1;
      continue;
    }
    targets.push({
      memoryId: ep.memoryId,
      episodeId: ep.id,
      userId: ep.lifeEvent.userId,
      oldTitle,
      account: mask(emailById.get(ep.lifeEvent.userId) ?? null),
      center: ep.lifeEvent.correctedLabel ?? ep.lifeEvent.label,
      lead,
      isPeriod: ep.isPeriod,
      afterLabel: /이후\s*$/.test(oldTitle),
      self: ep.kind === "SELF",
    });
  }

  const periodRows = targets.filter((t) => t.isPeriod && !t.self);
  const posterUsers = await prisma.poster.findMany({
    where: { userId: { in: [...new Set(periodRows.map((t) => t.userId))] } },
    select: { userId: true },
  });
  console.log(`이야기 ${episodes.length}편 중 제목이 시기 이름인 옛 이야기 ${targets.length + afterCard + noBody}편`);
  console.log(`  비울 것 ${targets.length}편 · 뺌 ${afterCard + noBody}편(카드 경로 뒤 — [고치기] 제목일 수 있음 ${afterCard} · 본문 없음 ${noBody})`);
  console.log(
    `  비울 것 중 — 시기 이름 ${targets.filter((t) => !t.afterLabel).length} · "… 이후" ${targets.filter((t) => t.afterLabel).length}` +
      ` · 그때의 나 ${targets.filter((t) => t.self).length} · 포스터 구간 행 ${periodRows.length}(포스터 있는 계정 ${new Set(posterUsers.map((p) => p.userId)).size}명)`,
  );
  const byAccount = new Map<string, Target[]>();
  for (const t of targets) byAccount.set(t.account, [...(byAccount.get(t.account) ?? []), t]);
  console.log(`  계정별: ${[...byAccount].map(([a, ts]) => `${a} ${ts.length}편`).join(" · ") || "없음"}`);

  // 예시 — 계정마다 돌아가며(한 계정에 몰리지 않게). 실고객 범위는 전부.
  const limit = customers ? Infinity : EXAMPLES;
  const examples: Target[] = [];
  const queues = [...byAccount.values()].map((ts) => [...ts]);
  while (examples.length < limit && queues.some((q) => q.length > 0)) {
    for (const q of queues) if (q.length > 0 && examples.length < limit) examples.push(q.shift()!);
  }
  console.log(`예시 ${examples.length}건 (지금 제목 → 비움 · 화면 글자 = 본문 첫 문장):`);
  examples.forEach((t, i) =>
    console.log(`  ${i + 1}. [${t.account} · 시기 ${t.center}${t.isPeriod ? " · 구간" : ""}${t.self ? " · 그때의 나" : ""}] "${t.oldTitle}" → "" · 화면 "${t.lead}"`),
  );

  if (!apply) {
    console.log(targets.length === 0 ? "정리 대상 없음." : `정리 대상 ${targets.length}편 — 비우려면 --apply 로 다시 실행.`);
    return;
  }
  if (users.length === 0) throw new Error("User 가 0명으로 읽혀 --apply 중단(DB 연결 확인).");
  if (expect !== null && targets.length !== expect) throw new Error(`대상 ${targets.length}편 ≠ --expect=${expect} — 중단(쓰기 없음).`);
  if (targets.length === 0) return;

  const backup: Backup = {
    kind: "legacy-story-titles",
    createdAt: new Date().toISOString(),
    scope: customers ? "customers" : "default",
    rows: targets.map(({ memoryId, episodeId, userId, oldTitle }) => ({ memoryId, episodeId, userId, oldTitle })),
  };
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `legacy-story-titles-${backup.createdAt.replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  if ((JSON.parse(fs.readFileSync(file, "utf8")) as Backup).rows.length !== targets.length) throw new Error("백업 확인 실패 — 중단(쓰기 없음).");
  console.log(`백업: ${file} (${targets.length}행)`);

  const done = await prisma.$transaction(
    targets.map((t) =>
      prisma.userMemory.updateMany({ where: { id: t.memoryId, createdVia: CREATED_VIA_EPISODE, title: t.oldTitle }, data: { title: "" } }),
    ),
  );
  const changed = done.reduce((n, r) => n + r.count, 0);
  console.log(`정리 완료: 제목 ${changed}편 비움${changed < targets.length ? ` (그사이 제목이 바뀐 ${targets.length - changed}편은 그대로)` : ""}`);
  console.log(`되돌리기: npx tsx db/cleanup-legacy-story-titles.ts --restore ${path.relative(process.cwd(), file)} --apply`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
