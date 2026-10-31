// 노드 그래프 연결 정합 점검 — docs/phase/node-graph-self.md §6 2b.4. 점검 본체는
// lib/node-graph-reconcile.ts(회귀 test-node-graph ⑨ 가 같은 함수를 픽스처 사용자 한정으로 부른다).
//
// 기본은 dry-run — 항목별 개수만 출력한다(이름·id·본문 출력 없음).
// --apply 일 때만 정리 대상 3종(끝이 없는 연결 · 노드가 없는 본문 · 고아 초안 인물)을 지운다.
// 실고객 계정(sml122900)은 점검·정리 둘 다에서 빼고, 뺀 계정 수만 표기한다.
// User 가 0명으로 읽히면(잘못된 DB 연결) --apply 를 거부한다(db/reconcile-storage.ts 와 같은 방어).
// 운영 --apply 는 dry-run 개수 보고 → 성민 승인 뒤에만.
//
// 실행: npx tsx db/reconcile-node-links.ts [--apply]

import "dotenv/config";

import { prisma } from "../lib/db";
import { applyNodeGraphCleanup, countNodeGraphIssues, type NodeGraphIssues } from "../lib/node-graph-reconcile";

const BLOCKED_LOCAL_PART = "sml122900";

function print(i: NodeGraphIssues) {
  const byType = Object.entries(i.danglingByType).map(([t, c]) => `${t} ${c}`).join(" · ") || "없음";
  console.log(`1  끝이 없는 연결              ${i.danglingLinks}  (없는 끝: ${byType})  [정리 대상]`);
  console.log(`2  연결 주인 ≠ 노드 주인       ${i.ownerMismatch}  [보고만]`);
  console.log(`3  방향 위반·허용 안 된 쌍     ${i.badDirectionOrPair}  [보고만]`);
  console.log(`4  한 쌍 두 곳 — 주 소속       ${i.primaryMembershipDup} · 대상 인물 ${i.episodeSubjectDup}  [보고만]`);
  console.log(`5  본문 — 노드 없음            ${i.bodyMissingNode}  [정리 대상] · 주인 불일치 ${i.bodyOwnerMismatch} · 남의 메모리 ${i.bodyForeignMemory}  [보고만]`);
  console.log(`6  낡은 이야기 본문            ${i.staleBodies}  [보고만]`);
  console.log(`7  없는 사진을 가리키는 블록   ${i.missingPhotoBlocks}  [보고만]`);
  console.log(`8  고아 초안 인물              ${i.orphanDrafts}  [정리 대상]`);
  console.log(`9  확인 대기 연결              ${i.pendingLinks} (이야기→인물 ${i.pendingPeopleLinks}) · 가장 오래된 대기 ${i.oldestPendingDays ?? "-"}일  [지표]`);
  console.log(`10 장소형 인물                 ${i.locationPeople}  [지표]`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const excludeUserIds = users
    .filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART))
    .map((u) => u.id);

  console.log(
    `모드: ${apply ? "APPLY(정리)" : "dry-run(쓰기 없음)"} · User ${users.length}명 · 실고객 계정 ${excludeUserIds.length}명 집계 제외`,
  );
  const scope = { excludeUserIds };
  const inScope = { userId: { notIn: excludeUserIds } };
  const [links, bodies, drafts] = await Promise.all([
    prisma.nodeLink.count({ where: inScope }),
    prisma.nodeBody.count({ where: inScope }),
    prisma.person.count({ where: { ...inScope, isDraft: true } }),
  ]);
  console.log(`점검 대상: 연결 ${links}행 · 본문 ${bodies}행 · 초안 인물 ${drafts}명`);
  const before = await countNodeGraphIssues(scope);
  print(before);
  const targets = before.danglingLinks + before.bodyMissingNode + before.orphanDrafts;

  if (!apply) {
    console.log(targets === 0 ? "정리 대상 없음." : `정리 대상 ${targets}건 — 정리하려면 --apply 로 다시 실행.`);
    return;
  }
  if (users.length === 0) {
    throw new Error("User 가 0명으로 읽혀 --apply 중단(DB 연결 확인).");
  }
  const done = await applyNodeGraphCleanup(scope);
  console.log(`정리 완료: 연결 ${done.danglingLinks} · 본문 ${done.bodiesMissingNode} · 초안 인물 ${done.orphanDrafts}`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
