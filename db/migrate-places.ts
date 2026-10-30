// 노드 그래프 1단계 — MemoryPlace → Place 이관 (docs/phase/node-graph-self.md §1.7).
//
// 같은 사용자·같은 장소명(공백 정규화) 행을 Place 1곳으로 묶고 MemoryPlace.placeId 를 채운다.
// MemoryPlace 행은 지우지 않는다(v2 화면은 placeId 를 몰라도 그대로 동작).
//
// - 2행 이상 묶음은 승인 목록(APPROVED_MERGES, 2026-10-30 성민 승인)에 있는 것만 합친다.
//   목록 밖 묶음(이후 새로 생긴 동명 행 등)은 건드리지 않고 "보류"로만 센다.
// - 1행짜리 장소는 그대로 Place 1곳.
// - 실고객 계정(sml122900) 행은 제외(그 행들은 placeId 가 빈 채로 남는다).
// - 이미 placeId 가 있는 행은 건너뛴다(다시 돌려도 같은 결과 — 멱등).
// - 주소가 서로 다른 묶음은 승인 목록에 있어도 합치지 않는다(동명 다른 곳 방지).
//
// 기본은 dry-run(묶음별 건수만 출력). --apply 일 때만 쓴다.
// 실행: npx tsx db/migrate-places.ts [--apply]

import "dotenv/config";

import { prisma } from "../lib/db";

const BLOCKED_LOCAL_PART = "sml122900";

// 승인된 병합 묶음 — 소유자는 lab 가상 페르소나(id 접두 lab_persona_) 1명. 건수가 다르면
// (그사이 행이 늘거나 줄면) 합치지 않고 보류한다.
const APPROVED_MERGES: { name: string; rows: number }[] = [
  { name: "서울 구로", rows: 5 },
  { name: "부산 동래", rows: 3 },
  { name: "전남 목포", rows: 3 },
  { name: "부산 해운대", rows: 3 },
  { name: "부산 태종대", rows: 3 },
  { name: "부산 영도", rows: 3 },
];
const APPROVED_OWNER_PREFIX = "lab_persona_";

const normName = (s: string) => s.trim().replace(/\s+/g, " ");

type Row = {
  id: string;
  placeName: string;
  placeAddress: string | null;
  lat: number | null;
  lng: number | null;
  placeSource: string | null;
  userId: string;
};

async function main() {
  const apply = process.argv.includes("--apply");

  const all = await prisma.memoryPlace.findMany({
    where: { placeId: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      placeName: true,
      placeAddress: true,
      lat: true,
      lng: true,
      placeSource: true,
      memory: { select: { userId: true, user: { select: { email: true } } } },
    },
  });
  const blocked = all.filter((r) => (r.memory.user.email ?? "").startsWith(BLOCKED_LOCAL_PART));
  const rows: Row[] = all
    .filter((r) => !(r.memory.user.email ?? "").startsWith(BLOCKED_LOCAL_PART))
    .map((r) => ({ ...r, userId: r.memory.userId }));

  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.userId}\u0000${normName(r.placeName)}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const plan: { name: string; rows: Row[]; kind: "single" | "merge" }[] = [];
  const held: { name: string; rows: number; why: string }[] = [];
  for (const g of groups.values()) {
    const name = normName(g[0].placeName);
    if (g.length === 1) {
      plan.push({ name, rows: g, kind: "single" });
      continue;
    }
    const approved = APPROVED_MERGES.find((a) => a.name === name);
    const addresses = new Set(g.map((r) => r.placeAddress ?? ""));
    if (!approved) held.push({ name, rows: g.length, why: "승인 목록 밖" });
    else if (!g[0].userId.startsWith(APPROVED_OWNER_PREFIX)) held.push({ name, rows: g.length, why: "승인된 소유자 아님" });
    else if (approved.rows !== g.length) held.push({ name, rows: g.length, why: `건수 변동(승인 ${approved.rows})` });
    else if (addresses.size > 1) held.push({ name, rows: g.length, why: "주소가 서로 다름" });
    else plan.push({ name, rows: g, kind: "merge" });
  }

  const merges = plan.filter((p) => p.kind === "merge");
  console.log(`${apply ? "[적용]" : "[dry-run]"} placeId 빈 MemoryPlace ${all.length}행 · 실고객 계정 ${blocked.length}행 제외 · 대상 ${rows.length}행`);
  console.log(`  → Place ${plan.length}곳 생성 예정(단독 ${plan.length - merges.length} + 병합 ${merges.length}묶음 ${merges.reduce((n, m) => n + m.rows.length, 0)}행)`);
  for (const m of merges) console.log(`  · 병합 "${m.name}" ${m.rows.length}행 → 1곳`);
  for (const h of held) console.log(`  · 보류 "${h.name}" ${h.rows}행 — ${h.why}`);

  if (!apply) {
    console.log("dry-run — 쓰기 없음. 적용은 --apply");
    return;
  }

  let created = 0;
  let linked = 0;
  for (const p of plan) {
    const first = p.rows[0];
    await prisma.$transaction(async (tx) => {
      const place = await tx.place.create({
        data: {
          userId: first.userId,
          name: p.name,
          address: first.placeAddress,
          lat: p.rows.find((r) => r.lat !== null)?.lat ?? null,
          lng: p.rows.find((r) => r.lng !== null)?.lng ?? null,
          source: p.rows.find((r) => r.placeSource)?.placeSource ?? null,
        },
        select: { id: true },
      });
      const res = await tx.memoryPlace.updateMany({
        where: { id: { in: p.rows.map((r) => r.id) }, placeId: null },
        data: { placeId: place.id },
      });
      if (res.count !== p.rows.length) {
        throw new Error(`"${p.name}" 연결 ${res.count}/${p.rows.length} — 그사이 바뀜, 이 묶음 롤백`);
      }
      created += 1;
      linked += res.count;
    });
  }
  console.log(`적용 완료 — Place ${created}곳 생성 · MemoryPlace ${linked}행 연결`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
