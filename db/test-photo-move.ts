// Phase Photo 6 (3단계) 검증 — movePhotoToMemory(넣기/빼기, 삭제 X, orphan 0).
//
//   1) 독립 사진 → life_event 넣기 → photo.memoryId 변경 + 옛 photo-only 정리
//   2) life_event 사진 → 독립으로 빼기 → 새 photo 메모리 + 사진 보존(삭제 X)
//   3) 빼기 후 life_event 메모리 보존 (다른 데이터)
//   4) era_event 에 넣기 → dest_not_linkable (거부)
//   5) 남의 사진/메모리 → photo_not_found / dest_not_found
//   6) 독립 복귀 시 takenAt 으로 연/월 채움
//
// 실제 Storage 에 작은 PNG 올렸다가 끝에 정리.
// 실행: npx tsx db/test-photo-move.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import {
  createIndependentPhoto,
  deletePhotoOwned,
  movePhotoToMemory,
} from "../lib/photos";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, actual?: unknown) {
  if (cond) {
    pass++;
    console.log(`  [✓] ${label}`);
  } else {
    fail++;
    console.log(`  [✗] ${label} — 실제:`, actual);
  }
}

async function photoCount(memoryId: string) {
  return prisma.photo.count({ where: { memoryId } });
}
async function memExists(id: string) {
  return (await prisma.userMemory.findUnique({ where: { id }, select: { id: true } })) !== null;
}

async function main() {
  const me = await prisma.user.create({
    data: { email: `photo-move-me-${Date.now()}@test`, name: "me" },
    select: { id: true },
  });
  const other = await prisma.user.create({
    data: { email: `photo-move-other-${Date.now()}@test`, name: "other" },
    select: { id: true },
  });

  const lifeMem = await prisma.userMemory.create({
    data: {
      userId: me.id, createdVia: "life_event",
      year: 1995, month: 3, title: "초등학교 입학",
      eventYear: 1995, eventMonth: 3, content: "입학식",
    },
    select: { id: true },
  });
  const eraMem = await prisma.userMemory.create({
    data: {
      userId: me.id, createdVia: "era_event",
      year: 1997, title: "IMF", eventYear: 1997, monthEventId: null,
    },
    select: { id: true },
  });

  const cleanup: string[] = [];

  console.log("\n[1] 독립 사진 → life_event 넣기");
  const p1 = await createIndependentPhoto(me.id, {
    fileBuffer: PNG_1x1, mimeType: "image/png",
    year: 2001, month: 6, caption: "운동회",
  });
  cleanup.push(p1.photoId);
  const r1 = await movePhotoToMemory(me.id, p1.photoId, { kind: "event", memoryId: lifeMem.id });
  check("결과 moved", r1 === "moved", r1);
  const ph1 = await prisma.photo.findUnique({ where: { id: p1.photoId }, select: { memoryId: true } });
  check("photo.memoryId → life_event", ph1?.memoryId === lifeMem.id, ph1);
  check("옛 photo-only 메모리 정리됨", !(await memExists(p1.memoryId)), p1.memoryId);
  check("life_event 사진 1장", (await photoCount(lifeMem.id)) === 1);

  console.log("\n[2] life_event 사진 → 독립으로 빼기 (삭제 X)");
  const r2 = await movePhotoToMemory(me.id, p1.photoId, { kind: "independent" });
  check("결과 moved", r2 === "moved", r2);
  const ph2 = await prisma.photo.findUnique({
    where: { id: p1.photoId },
    select: { id: true, memoryId: true, memory: { select: { createdVia: true, year: true, month: true } } },
  });
  check("사진 보존(삭제 X)", ph2 !== null);
  check("새 부모 createdVia=photo", ph2?.memory.createdVia === "photo", ph2?.memory.createdVia);
  // takenAt 없는 사진 → 마지막 부모(life_event 1995)의 시기를 물려받음.
  // takenAt 있는 사진은 원본 보존([6] 확인).
  check("독립 메모리 연도=1995(마지막 부모 시기)", ph2?.memory.year === 1995, ph2?.memory.year);
  check("life_event 사진 0장", (await photoCount(lifeMem.id)) === 0);

  console.log("\n[3] life_event 메모리 보존 (빼기는 사건 안 지움)");
  check("life_event 메모리 그대로", await memExists(lifeMem.id));

  console.log("\n[4] era_event 에 넣기 → 거부");
  const r4 = await movePhotoToMemory(me.id, ph2!.id, { kind: "event", memoryId: eraMem.id });
  check("dest_not_linkable", r4 === "dest_not_linkable", r4);
  const ph4 = await prisma.photo.findUnique({ where: { id: ph2!.id }, select: { memoryId: true } });
  check("거부 후 사진 안 옮겨짐", ph4?.memoryId === ph2!.memoryId, ph4);

  console.log("\n[5] 남의 사진/메모리 거부");
  const denyPhoto = await movePhotoToMemory(other.id, ph2!.id, { kind: "independent" });
  check("남이 내 사진 이동 → photo_not_found", denyPhoto === "photo_not_found", denyPhoto);
  const denyDest = await movePhotoToMemory(me.id, ph2!.id, { kind: "event", memoryId: "nonexistent-id" });
  check("없는 대상 → dest_not_found", denyDest === "dest_not_found", denyDest);

  console.log("\n[6] takenAt 기반 독립 복귀 연/월");
  const taken = new Date("2010-08-15T00:00:00Z");
  const p6 = await createIndependentPhoto(me.id, {
    fileBuffer: PNG_1x1, mimeType: "image/png",
    year: 2010, month: null, caption: null, takenAt: taken,
  });
  cleanup.push(p6.photoId);
  await movePhotoToMemory(me.id, p6.photoId, { kind: "event", memoryId: lifeMem.id });
  const r6 = await movePhotoToMemory(me.id, p6.photoId, { kind: "independent" });
  check("moved", r6 === "moved", r6);
  const ph6 = await prisma.photo.findUnique({
    where: { id: p6.photoId },
    select: { memory: { select: { year: true, month: true } } },
  });
  check("takenAt 연도 2010", ph6?.memory.year === 2010, ph6?.memory.year);
  check("takenAt 월 8", ph6?.memory.month === 8, ph6?.memory.month);

  // 정리
  console.log("\n[정리]");
  for (const pid of cleanup) {
    await deletePhotoOwned(me.id, pid).catch((e) => console.error("정리 실패:", pid, e));
  }
  await prisma.userMemory.deleteMany({ where: { userId: me.id } });
  await prisma.user.deleteMany({ where: { id: { in: [me.id, other.id] } } });

  console.log(`\n${fail === 0 ? "전체 통과" : `실패 ${fail}건`} (통과 ${pass})`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
