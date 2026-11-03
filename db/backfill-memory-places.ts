// Q72 — 이름만 남은 옛 장소(MemoryPlace, placeId 없음)를 Place 로 백필. docs/phase/my-life-restructure.md §15.7.
//
// 규칙(성민 2026-11-03):
//   - 같은 계정 안 같은 이름(공백 무시 — lib/my-life-edit norm 과 같은 기준)은 Place 하나로 합친다.
//   - 그 계정에 이미 같은 이름 Place 가 있으면 그쪽에 잇는다(Place 는 고치지 않음).
//   - 새로 만들 때 주소·좌표가 있으면 그대로 옮긴다(주소 있는 첫 행 — 이름은 가장 오래된 행).
//   - MemoryPlace 행은 placeId 만 채운다(장소명·주소 칸 그대로 — v2 화면·연구실 원천은 이 칸을 읽는다).
//   보류(건드리지 않고 보고만): 같은 이름인데 주소가 서로 다른 묶음 · 같은 이름 Place 가 여럿이라 어느 쪽인지 모름 ·
//   기존 Place 주소와 행 주소가 다름. 건너뜀: 같은 이야기(메모리)에 같은 장소가 이미 이어져 있음(한 쌍 = 한 곳).
//
// 계정 구분: test30(test30@test.com) · test.com(그 밖 @test.com) · lab_persona(id 접두 lab_persona_) ·
//   실고객(이메일 앞부분에 sml122900 — 1단계 이관 db/migrate-places.ts 와 같은 기준) · 그 밖(픽스처 등).
//   적용 대상 = test30·test.com·lab_persona 만(허용 목록). 실고객·그 밖은 수만 표시(기록 종류별 행 수·같은 이름 묶음 수 —
//   장소 이름은 안 보임). --only <이메일> = 그 계정 하나만(허용 목록 또는 픽스처 .invalid 계정 — 규칙 검증용, 실고객 거부).
//
// 기본은 dry-run(쓰기 없음). --apply 일 때만 쓴다:
//   쓰기 전에 db/backups/memory-place-backfill-<시각>.json 에 계획(행 id·대상)을 남기고, 묶음마다 커밋 뒤
//   실제 결과(이은 행·새로 만든 Place id)를 다시 쓴다. --expect=N(대상 행 수) 이 다르면 중단.
// 되돌리기: --restore <백업> (dry-run) / --restore <백업> --apply — placeId 가 아직 그 값인 행만 비우고, 이 백필이
//   만든 Place 중 아무 데도 안 이어진(장소 행·묶음·연결 0) 것만 지운다(그사이 쓰인 곳은 남기고 보고).
//
// 실행: npx tsx db/backfill-memory-places.ts [--only <이메일>] [--apply [--expect=N]]
//       npx tsx db/backfill-memory-places.ts --restore db/backups/<파일>.json [--apply]

import "dotenv/config";

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../lib/db";

const BLOCKED_LOCAL_PART = "sml122900";
const BACKUP_DIR = path.resolve(__dirname, "backups");
const EXAMPLES = 8;

type Kind = "test30" | "testcom" | "lab" | "customer" | "other";
const KIND_LABEL: Record<Kind, string> = { test30: "test30", testcom: "test.com", lab: "lab_persona", customer: "실고객", other: "그 밖" };
const APPLY_KINDS: readonly Kind[] = ["test30", "testcom", "lab"];

function kindOf(u: { id: string; email: string | null }): Kind {
  const email = (u.email ?? "").toLowerCase();
  if (email.split("@")[0].includes(BLOCKED_LOCAL_PART)) return "customer";
  if (u.id.startsWith("lab_persona_")) return "lab";
  if (email === "test30@test.com") return "test30";
  if (email.endsWith("@test.com")) return "testcom";
  return "other";
}

const norm = (s: string) => s.normalize("NFC").replace(/\s+/g, "");

type Row = {
  id: string;
  memoryId: string;
  placeName: string;
  placeAddress: string | null;
  lat: number | null;
  lng: number | null;
  placeSource: string | null;
  userId: string;
  createdVia: string;
};
type PlaceRow = { id: string; name: string; address: string | null };

type Group = {
  userId: string;
  kind: Kind;
  key: string;
  name: string;
  rows: Row[];
  // 결과
  action: "link" | "create" | "hold";
  targetPlaceId: string | null; // link 대상
  holdWhy: string | null;
  linkRows: Row[]; // 실제로 이을 행
  skipRows: Row[]; // 같은 이야기에 같은 장소가 이미 있어 건너뜀
};

type Backup = {
  kind: "memory-place-backfill";
  createdAt: string;
  status: "planned" | "partial" | "done";
  linked: { memoryPlaceId: string; userId: string; placeId: string }[];
  createdPlaceIds: string[];
  planned: { memoryPlaceIds: string[]; userId: string; target: string }[];
};

function arg(name: string): string | null {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function plan(onlyEmail: string | null) {
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  if (users.length === 0) throw new Error("User 0명 — DB 연결 확인. 중단.");
  const kindById = new Map(users.map((u) => [u.id, kindOf(u)]));
  let onlyId: string | null = null;
  if (onlyEmail) {
    const u = users.find((x) => (x.email ?? "").toLowerCase() === onlyEmail.toLowerCase());
    const k = u ? kindOf(u) : null;
    if (!u || !(k && (APPLY_KINDS.includes(k) || (k === "other" && onlyEmail.toLowerCase().endsWith(".invalid")))))
      throw new Error(`--only ${onlyEmail}: 없는 계정이거나 허용 목록·픽스처 계정이 아님 — 중단.`);
    onlyId = u.id;
  }

  const raw = await prisma.memoryPlace.findMany({
    where: { placeId: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      memoryId: true,
      placeName: true,
      placeAddress: true,
      lat: true,
      lng: true,
      placeSource: true,
      memory: { select: { userId: true, createdVia: true } },
    },
  });
  const all: Row[] = raw.map((r) => ({ ...r, userId: r.memory.userId, createdVia: r.memory.createdVia }));

  // 계정 구분별 집계(실고객·그 밖은 수만)
  const byKind = new Map<Kind, { users: Set<string>; rows: number; via: Map<string, number> }>();
  for (const r of all) {
    const k = kindById.get(r.userId) ?? "other";
    const s = byKind.get(k) ?? { users: new Set<string>(), rows: 0, via: new Map<string, number>() };
    s.users.add(r.userId);
    s.rows += 1;
    s.via.set(r.createdVia, (s.via.get(r.createdVia) ?? 0) + 1);
    byKind.set(k, s);
  }

  const targets = onlyId ? all.filter((r) => r.userId === onlyId) : all.filter((r) => APPLY_KINDS.includes(kindById.get(r.userId) ?? "other"));
  // 제외 계정(실고객·그 밖)의 같은 이름 묶음 수 — 숫자만.
  const excludedGroups = new Map<Kind, Map<string, number>>();
  for (const r of all) {
    const k = kindById.get(r.userId) ?? "other";
    if (APPLY_KINDS.includes(k)) continue;
    const m = excludedGroups.get(k) ?? new Map<string, number>();
    const key = `${r.userId}\u0000${norm(r.placeName)}`;
    m.set(key, (m.get(key) ?? 0) + 1);
    excludedGroups.set(k, m);
  }
  const targetUsers = [...new Set(targets.map((r) => r.userId))];
  const [places, linkedRows] = await Promise.all([
    prisma.place.findMany({ where: { userId: { in: targetUsers } }, select: { id: true, name: true, address: true, userId: true } }),
    prisma.memoryPlace.findMany({
      where: { placeId: { not: null }, memory: { userId: { in: targetUsers } } },
      select: { memoryId: true, placeId: true },
    }),
  ]);
  const placesByUser = new Map<string, PlaceRow[]>();
  for (const p of places) placesByUser.set(p.userId, [...(placesByUser.get(p.userId) ?? []), p]);
  const linkedPairs = new Set(linkedRows.map((m) => `${m.memoryId}\u0000${m.placeId}`));

  const groupMap = new Map<string, Group>();
  for (const r of targets) {
    const key = `${r.userId}\u0000${norm(r.placeName)}`;
    const g = groupMap.get(key);
    if (g) g.rows.push(r);
    else
      groupMap.set(key, {
        userId: r.userId,
        kind: kindById.get(r.userId)!,
        key: norm(r.placeName),
        name: r.placeName.trim(),
        rows: [r],
        action: "hold",
        targetPlaceId: null,
        holdWhy: null,
        linkRows: [],
        skipRows: [],
      });
  }

  const groups = [...groupMap.values()];
  for (const g of groups) {
    const addrs = [...new Set(g.rows.map((r) => r.placeAddress).filter((a): a is string => !!a))];
    const existing = (placesByUser.get(g.userId) ?? []).filter((p) => norm(p.name) === g.key);
    if (existing.length === 1) {
      const p = existing[0];
      if (p.address && addrs.some((a) => a !== p.address)) g.holdWhy = "기존 장소 주소와 행 주소가 다름";
      else if (addrs.length > 1) g.holdWhy = "같은 이름인데 주소가 서로 다름";
      else {
        g.action = "link";
        g.targetPlaceId = p.id;
      }
    } else if (existing.length > 1) {
      const byAddr = addrs.length === 1 ? existing.filter((p) => p.address === addrs[0]) : [];
      if (byAddr.length === 1) {
        g.action = "link";
        g.targetPlaceId = byAddr[0].id;
      } else g.holdWhy = `같은 이름 장소가 ${existing.length}곳 — 어느 쪽인지 모름`;
    } else if (addrs.length > 1) g.holdWhy = "같은 이름인데 주소가 서로 다름";
    else g.action = "create";

    if (g.action === "hold") continue;
    // 한 쌍 = 한 곳 — 같은 이야기에 그 장소가 이미 이어져 있거나, 묶음 안에서 같은 이야기의 두 번째 행이면 건너뜀.
    const seenMemory = new Set<string>();
    for (const r of g.rows) {
      const dupExisting = g.targetPlaceId !== null && linkedPairs.has(`${r.memoryId}\u0000${g.targetPlaceId}`);
      if (dupExisting || seenMemory.has(r.memoryId)) g.skipRows.push(r);
      else {
        seenMemory.add(r.memoryId);
        g.linkRows.push(r);
      }
    }
  }
  return { all, byKind, targets, groups, excludedGroups, onlyId };
}

function report(p: Awaited<ReturnType<typeof plan>>, apply: boolean) {
  const { all, byKind, targets, groups, excludedGroups, onlyId } = p;
  console.log(`모드: ${apply ? "APPLY" : "dry-run(쓰기 없음)"}${onlyId ? " · --only 한 계정" : ""} · placeId 빈 MemoryPlace 전체 ${all.length}행`);
  console.log("\n[계정 구분별 — placeId 빈 행]");
  for (const k of ["test30", "testcom", "lab", "customer", "other"] as Kind[]) {
    const s = byKind.get(k);
    const via = s ? [...s.via.entries()].sort().map(([v, n]) => `${v} ${n}`).join(" · ") : "";
    const target = APPLY_KINDS.includes(k) ? "대상" : "제외(수만)";
    if (k === "customer" || k === "other") {
      const eg = [...(excludedGroups.get(k)?.values() ?? [])].filter((c) => c > 1);
      console.log(`  ${KIND_LABEL[k]}: 계정 ${s?.users.size ?? 0} · ${s?.rows ?? 0}행${via ? ` (${via})` : ""} · 같은 이름 2행 이상 묶음 ${eg.length}개·${eg.reduce((a, b) => a + b, 0)}행 — ${target}`);
    }
    else console.log(`  ${KIND_LABEL[k]}: 계정 ${s?.users.size ?? 0} · ${s?.rows ?? 0}행${via ? ` (${via})` : ""} — ${target}`);
  }

  const link = groups.filter((g) => g.action === "link");
  const create = groups.filter((g) => g.action === "create");
  const hold = groups.filter((g) => g.action === "hold");
  const multi = groups.filter((g) => g.rows.length > 1);
  const n = (gs: Group[], f: (g: Group) => Row[]) => gs.reduce((s, g) => s + f(g).length, 0);
  console.log(`\n[대상 ${targets.length}행 → 이름 묶음 ${groups.length}개(같은 계정·같은 이름)]`);
  console.log(`  같은 이름 2행 이상 묶음: ${multi.length}개 · ${n(multi, (g) => g.rows)}행`);
  for (const k of APPLY_KINDS) {
    const gs = multi.filter((g) => g.kind === k);
    if (gs.length) console.log(`    ${KIND_LABEL[k]}: ${gs.length}개 · ${n(gs, (g) => g.rows)}행`);
  }
  for (const g of multi.slice(0, EXAMPLES)) console.log(`    · [${KIND_LABEL[g.kind]}] "${g.name}" ${g.rows.length}행${new Set(g.rows.map((r) => r.placeName)).size > 1 ? ` (표기: ${[...new Set(g.rows.map((r) => r.placeName))].join(" / ")})` : ""}`);
  console.log(`  기존 같은 이름 Place 에 잇기: ${link.length}묶음 · ${n(link, (g) => g.linkRows)}행`);
  for (const g of link.slice(0, EXAMPLES)) console.log(`    · [${KIND_LABEL[g.kind]}] "${g.name}" ${g.linkRows.length}행`);
  console.log(`  새 Place 만들기: ${create.length}곳 · ${n(create, (g) => g.linkRows)}행 (주소 있음 ${create.filter((g) => g.rows.some((r) => r.placeAddress)).length}곳 · 좌표 있음 ${create.filter((g) => g.rows.some((r) => r.lat !== null)).length}곳)`);
  for (const k of APPLY_KINDS) {
    const gs = create.filter((g) => g.kind === k);
    if (gs.length) console.log(`    ${KIND_LABEL[k]}: ${gs.length}곳 · ${n(gs, (g) => g.linkRows)}행`);
  }
  console.log(`  건너뜀(같은 이야기에 같은 장소 이미 있음): ${n(groups, (g) => g.skipRows)}행`);
  for (const g of groups.filter((x) => x.skipRows.length).slice(0, EXAMPLES)) console.log(`    · [${KIND_LABEL[g.kind]}] "${g.name}" ${g.skipRows.length}행`);
  console.log(`  보류: ${hold.length}묶음 · ${n(hold, (g) => g.rows)}행`);
  for (const g of hold.slice(0, EXAMPLES)) console.log(`    · [${KIND_LABEL[g.kind]}] "${g.name}" ${g.rows.length}행 — ${g.holdWhy}`);
  return n([...link, ...create], (g) => g.linkRows);
}

async function applyPlan(groups: Group[], expect: number | null, toLink: number) {
  if (expect !== null && expect !== toLink) throw new Error(`--expect=${expect} 인데 이을 행 ${toLink} — 중단(쓰기 없음).`);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `memory-place-backfill-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const work = groups.filter((g) => g.action !== "hold" && g.linkRows.length > 0);
  const backup: Backup = {
    kind: "memory-place-backfill",
    createdAt: new Date().toISOString(),
    status: "planned",
    linked: [],
    createdPlaceIds: [],
    planned: work.map((g) => ({ memoryPlaceIds: g.linkRows.map((r) => r.id), userId: g.userId, target: g.targetPlaceId ?? `new:${g.name}` })),
  };
  const save = () => {
    fs.writeFileSync(file, JSON.stringify(backup, null, 1));
    const back = JSON.parse(fs.readFileSync(file, "utf8")) as Backup;
    if (back.linked.length !== backup.linked.length || back.planned.length !== backup.planned.length) throw new Error("백업 확인 실패 — 중단.");
  };
  save();
  console.log(`\n백업(계획): ${path.relative(process.cwd(), file)}`);

  for (const g of work) {
    const res = await prisma.$transaction(async (tx) => {
      let placeId = g.targetPlaceId;
      let created = false;
      if (!placeId) {
        const src = g.rows.find((r) => r.placeAddress || r.lat !== null) ?? g.rows[0];
        placeId = (
          await tx.place.create({
            data: { userId: g.userId, name: g.name, address: src.placeAddress, lat: src.lat, lng: src.lng, source: src.placeSource },
            select: { id: true },
          })
        ).id;
        created = true;
      }
      const u = await tx.memoryPlace.updateMany({ where: { id: { in: g.linkRows.map((r) => r.id) }, placeId: null }, data: { placeId } });
      if (u.count !== g.linkRows.length) throw new Error(`"${g.name}" 연결 ${u.count}/${g.linkRows.length} — 그사이 바뀜, 이 묶음 롤백`);
      return { placeId, created };
    });
    if (res.created) backup.createdPlaceIds.push(res.placeId);
    for (const r of g.linkRows) backup.linked.push({ memoryPlaceId: r.id, userId: g.userId, placeId: res.placeId });
    backup.status = "partial";
    save();
  }
  backup.status = "done";
  save();
  console.log(`적용 완료 — 새 Place ${backup.createdPlaceIds.length}곳 · MemoryPlace ${backup.linked.length}행 연결`);
  console.log(`되돌리기: npx tsx db/backfill-memory-places.ts --restore ${path.relative(process.cwd(), file)} --apply`);
}

async function restore(file: string, apply: boolean) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8")) as Backup;
  if (backup.kind !== "memory-place-backfill") throw new Error("이 스크립트의 백업이 아님 — 중단.");
  const stillLinked = await prisma.memoryPlace.findMany({
    where: { id: { in: backup.linked.map((l) => l.memoryPlaceId) } },
    select: { id: true, placeId: true },
  });
  const want = new Map(backup.linked.map((l) => [l.memoryPlaceId, l.placeId]));
  const unlink = stillLinked.filter((m) => m.placeId !== null && want.get(m.id) === m.placeId).map((m) => m.id);
  console.log(`모드: ${apply ? "RESTORE APPLY" : "restore dry-run"} · 백업 ${backup.linked.length}행 · 새 Place ${backup.createdPlaceIds.length}곳`);
  console.log(`  placeId 비울 행 ${unlink.length}(그사이 지워지거나 다른 장소로 바뀐 행 ${backup.linked.length - unlink.length}은 그대로)`);
  if (!apply) {
    console.log("dry-run — 쓰기 없음. 적용은 --apply");
    return;
  }
  const u = await prisma.memoryPlace.updateMany({ where: { id: { in: unlink } }, data: { placeId: null } });
  const removable: string[] = [];
  const kept: string[] = [];
  for (const id of backup.createdPlaceIds) {
    const [mp, gm, nl] = await Promise.all([
      prisma.memoryPlace.count({ where: { placeId: id } }),
      prisma.placeGroupMember.count({ where: { placeId: id } }),
      prisma.nodeLink.count({ where: { OR: [{ toType: "PLACE", toId: id }, { fromType: "PLACE", fromId: id }] } }),
    ]);
    if (mp + gm + nl === 0) removable.push(id);
    else kept.push(id);
  }
  const d = await prisma.place.deleteMany({ where: { id: { in: removable } } });
  console.log(`되돌림 — placeId 비움 ${u.count}행 · 새 Place 삭제 ${d.count}곳 · 그사이 쓰여 남긴 Place ${kept.length}곳`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const restoreFile = arg("--restore");
  if (restoreFile) return restore(restoreFile, apply);
  const expectArg = process.argv.find((a) => a.startsWith("--expect="));
  const p = await plan(arg("--only"));
  const toLink = report(p, apply);
  if (!apply) {
    console.log(`\ndry-run — 쓰기 없음. 적용: npx tsx db/backfill-memory-places.ts --apply --expect=${toLink}`);
    return;
  }
  await applyPlan(p.groups, expectArg ? Number(expectArg.split("=")[1]) : null, toLink);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
