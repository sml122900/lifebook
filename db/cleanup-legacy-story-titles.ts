// 옛 이야기 제목 정리 — 옛 저장 경로(개편 전 /chat-v3 이야기 대화·구간 대화)는 이야기 제목 칸(브릿지
// UserMemory.title)에 시기 이름("고등학교 입학", 구간이면 "… 이후")을 넣었다. 지금은 화면이 그런 제목을 제목으로
// 안 보고 본문 첫 문장을 쓴다(lib/my-life storyTitleOf). 이 스크립트가 그 제목을 본문 첫 문장(= 지금 지도에 보이는
// 글자)으로 바꾸면 그 판정을 코드에서 뺄 수 있다. docs/phase/my-life-restructure.md §13.
//
// 판정 = lib/my-life isPeriodNameTitle(그 이야기의 시기 이름·고친 이름, 또는 그 뒤 " 이후", 공백 무시).
// 새 제목 = lib/my-life-layout storyLead(본문). 본문이 비었거나 첫 문장도 시기 이름이면 건너뛴다.
// 바뀌는 곳: My Life 지도·목록(글자 그대로) · /story-review 이야기 이름 · 포스터 구간 행 제목(구간 이야기).
//
// 기본은 dry-run — 대상 건수와 예시 10건만 출력한다(쓰기 없음). --apply 일 때만 제목을 바꾼다
// (그사이 제목이 바뀐 행은 건드리지 않는다). 실고객 계정(sml122900)은 점검·정리 둘 다에서 빼고, 뺀 계정 수만 표기한다.
// User 가 0명으로 읽히면(잘못된 DB 연결) --apply 를 거부한다(db/reconcile-node-links.ts 와 같은 방어).
// 운영 --apply 는 dry-run 보고 → 성민 승인 뒤에만.
//
// 실행: npx tsx db/cleanup-legacy-story-titles.ts [--apply]

import "dotenv/config";

import { prisma } from "../lib/db";
import { CREATED_VIA_EPISODE } from "../lib/episode";
import { isPeriodNameTitle } from "../lib/my-life";
import { storyLead } from "../lib/my-life-layout";

const BLOCKED_LOCAL_PART = "sml122900";
const EXAMPLES = 10;

function mask(email: string | null): string {
  if (!email) return "(이메일 없음)";
  const [local, domain] = email.split("@");
  return `${local.slice(0, 2)}***@${domain ?? ""}`;
}

type Target = {
  memoryId: string;
  account: string;
  center: string;
  oldTitle: string;
  newTitle: string;
  isPeriod: boolean;
  afterLabel: boolean;
  self: boolean;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const excludeUserIds = users
    .filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART))
    .map((u) => u.id);
  const emailById = new Map(users.map((u) => [u.id, u.email]));
  console.log(`모드: ${apply ? "APPLY(정리)" : "dry-run(쓰기 없음)"} · User ${users.length}명 · 실고객 계정 ${excludeUserIds.length}명 제외`);

  const episodes = await prisma.episode.findMany({
    where: { lifeEvent: { userId: { notIn: excludeUserIds } }, memory: { createdVia: CREATED_VIA_EPISODE } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      memoryId: true,
      content: true,
      isPeriod: true,
      kind: true,
      memory: { select: { title: true } },
      lifeEvent: { select: { userId: true, label: true, correctedLabel: true } },
    },
  });

  const targets: Target[] = [];
  let noBody = 0;
  let leadIsPeriod = 0;
  for (const ep of episodes) {
    const oldTitle = ep.memory.title;
    const labels = [ep.lifeEvent.label, ep.lifeEvent.correctedLabel];
    if (!oldTitle.trim() || !isPeriodNameTitle(oldTitle, labels)) continue;
    const newTitle = storyLead(ep.content);
    if (!newTitle) {
      noBody += 1;
      continue;
    }
    if (isPeriodNameTitle(newTitle, labels)) {
      leadIsPeriod += 1;
      continue;
    }
    targets.push({
      memoryId: ep.memoryId,
      account: mask(emailById.get(ep.lifeEvent.userId) ?? null),
      center: ep.lifeEvent.correctedLabel ?? ep.lifeEvent.label,
      oldTitle,
      newTitle,
      isPeriod: ep.isPeriod,
      afterLabel: /이후\s*$/.test(oldTitle),
      self: ep.kind === "SELF",
    });
  }

  const found = targets.length + noBody + leadIsPeriod;
  console.log(`이야기 ${episodes.length}편 중 제목이 시기 이름인 옛 이야기 ${found}편`);
  console.log(`  바꿀 수 있음 ${targets.length}편 · 건너뜀 ${noBody + leadIsPeriod}편(본문 없음 ${noBody} · 첫 문장도 시기 이름 ${leadIsPeriod})`);
  console.log(
    `  바꿀 것 중 — 시기 이름 ${targets.filter((t) => !t.afterLabel).length} · "… 이후" ${targets.filter((t) => t.afterLabel).length}` +
      ` · 구간 이야기(포스터 구간 행 제목도 바뀜) ${targets.filter((t) => t.isPeriod && !t.self).length} · 그때의 나 ${targets.filter((t) => t.self).length}`,
  );
  const byAccount = new Map<string, Target[]>();
  for (const t of targets) byAccount.set(t.account, [...(byAccount.get(t.account) ?? []), t]);
  console.log(`  계정별: ${[...byAccount].map(([a, ts]) => `${a} ${ts.length}편`).join(" · ") || "없음"}`);

  // 예시 — 계정마다 돌아가며(한 계정에 몰리지 않게).
  const examples: Target[] = [];
  const queues = [...byAccount.values()].map((ts) => [...ts]);
  while (examples.length < EXAMPLES && queues.some((q) => q.length > 0)) {
    for (const q of queues) if (q.length > 0 && examples.length < EXAMPLES) examples.push(q.shift()!);
  }
  console.log(`예시 ${examples.length}건 (지금 제목 → 새 제목 = 지금 지도에 보이는 본문 첫 문장):`);
  examples.forEach((t, i) =>
    console.log(`  ${i + 1}. [${t.account} · 시기 ${t.center}${t.isPeriod ? " · 구간" : ""}${t.self ? " · 그때의 나" : ""}] "${t.oldTitle}" → "${t.newTitle}"`),
  );

  if (!apply) {
    console.log(targets.length === 0 ? "정리 대상 없음." : `정리 대상 ${targets.length}편 — 바꾸려면 --apply 로 다시 실행.`);
    return;
  }
  if (users.length === 0) throw new Error("User 가 0명으로 읽혀 --apply 중단(DB 연결 확인).");
  const done = await prisma.$transaction(
    targets.map((t) =>
      prisma.userMemory.updateMany({
        where: { id: t.memoryId, createdVia: CREATED_VIA_EPISODE, title: t.oldTitle },
        data: { title: t.newTitle },
      }),
    ),
  );
  const changed = done.reduce((n, r) => n + r.count, 0);
  console.log(`정리 완료: 제목 ${changed}편 바꿈${changed < targets.length ? ` (그사이 제목이 바뀐 ${targets.length - changed}편은 그대로)` : ""}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
