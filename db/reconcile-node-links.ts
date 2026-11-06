// 노드 그래프 연결 정합 점검 — docs/phase/node-graph-self.md §6 2b.4. 점검 본체는
// lib/node-graph-reconcile.ts(회귀 test-node-graph ⑨ 가 같은 함수를 픽스처 사용자 한정으로 부른다).
//
// 기본은 dry-run — 항목별 개수만 출력한다(이름·id·본문 출력 없음).
// --apply 일 때만 정리 대상 4종(끝이 없는 연결 · 노드가 없는 본문 · 고아 초안 인물 · 이야기 없는 시기↔사람 중 출처 STORY)을 지운다.
// --only <이메일> — 그 계정 하나만 점검·정리(실고객 계정이면 거부). 2026-11-02 test30 한정 정리용.
// 실고객 계정(sml122900)은 점검·정리 둘 다에서 빼고, 뺀 계정 수만 표기한다.
// User 가 0명으로 읽히면(잘못된 DB 연결) --apply 를 거부한다(db/reconcile-storage.ts 와 같은 방어).
// 운영 --apply 는 dry-run 개수 보고 → 성민 승인 뒤에만.
//
// 실행: npx tsx db/reconcile-node-links.ts [--apply] [--only <이메일>]

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
  console.log(`11 구성원 행 주인 불일치       ${i.memberOwnerMismatch}  [보고만]`);
  console.log(`12 이야기 없는 시기↔사람 연결  출처 STORY ${i.storyPeriodPeopleWithoutStory}  [정리 대상] · DIRECT ${i.directPeriodPeopleWithoutStory}  [보고만 — 직접 넣은 연결·출처 칸 전 기존 행]`);
  console.log(`13 장소 노드 없는 이야기 장소  ${i.storyPlacesWithoutNode}  [보고만 — 늘 0 이어야(My Life 에 안 보임)]`);
  const c = i.custom;
  console.log(
    `14 사용자 노드                 종류 값 ${c.badKind} · 자리 규칙 ${c.badHome} · 남의 자리 ${c.foreignParent} · 자기 자신 부모 ${c.selfParent} · 고리 ${c.cycles} · 기본 카테고리 행 ${c.builtinMisuse} · 같은 종류 넣기 ${c.sameKindMember} · 역할 불일치 ${c.roleMismatch} · 자리와 겹치는 넣기 ${c.homeMember}  [보고만 — 늘 0 이어야]`,
  );
  console.log(`15 행성 꾸미기 — 노드 없음      ${i.decorMissingNode}  [정리 대상] · 주인 불일치 ${i.decorOwnerMismatch} · 목록 밖 모양 ${i.decorBadShape}  [보고만]`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const onlyAt = process.argv.indexOf("--only");
  const onlyEmail = onlyAt >= 0 ? (process.argv[onlyAt + 1] ?? "").toLowerCase() : null;
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  const excludeUserIds = users
    .filter((u) => (u.email ?? "").toLowerCase().split("@")[0].includes(BLOCKED_LOCAL_PART))
    .map((u) => u.id);
  const only = onlyEmail ? users.find((u) => (u.email ?? "").toLowerCase() === onlyEmail) : undefined;
  if (onlyEmail && (!only || excludeUserIds.includes(only.id))) throw new Error(`--only ${onlyEmail}: 없는 계정이거나 실고객 계정 — 중단.`);

  console.log(
    `모드: ${apply ? "APPLY(정리)" : "dry-run(쓰기 없음)"} · User ${users.length}명 · 실고객 계정 ${excludeUserIds.length}명 집계 제외`,
  );
  if (only) console.log(`범위: ${onlyEmail} 한 계정만`);
  const scope = only ? { userId: only.id } : { excludeUserIds };
  const inScope = only ? { userId: only.id } : { userId: { notIn: excludeUserIds } };
  const [links, bodies, drafts] = await Promise.all([
    prisma.nodeLink.count({ where: inScope }),
    prisma.nodeBody.count({ where: inScope }),
    prisma.person.count({ where: { ...inScope, isDraft: true } }),
  ]);
  console.log(`점검 대상: 연결 ${links}행 · 본문 ${bodies}행 · 초안 인물 ${drafts}명`);
  const before = await countNodeGraphIssues(scope);
  print(before);
  const targets = before.danglingLinks + before.bodyMissingNode + before.orphanDrafts + before.storyPeriodPeopleWithoutStory + before.decorMissingNode;

  if (!apply) {
    console.log(targets === 0 ? "정리 대상 없음." : `정리 대상 ${targets}건 — 정리하려면 --apply 로 다시 실행.`);
    return;
  }
  if (users.length === 0) {
    throw new Error("User 가 0명으로 읽혀 --apply 중단(DB 연결 확인).");
  }
  const done = await applyNodeGraphCleanup(scope);
  console.log(`정리 완료: 연결 ${done.danglingLinks} · 본문 ${done.bodiesMissingNode} · 초안 인물 ${done.orphanDrafts} · 이야기 없는 시기↔사람(STORY) ${done.storyPeriodPeople} · 꾸미기 ${done.decorationsMissingNode}`);
  print(await countNodeGraphIssues(scope));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
