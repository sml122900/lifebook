// Phase Photo (4단계) 검증 — periodAnchor 저장/조회/재태그.
//
//   1) 첨부 시 anchor "start"/"end"/기본(both) 저장
//   2) getLifeEvents 가 photos[].periodAnchor 정확히 매핑
//   3) updatePhotoAnchor 재태그 (start→end) + 권한(남이면 false)
//   4) isPhotoPeriodAnchor 검증 (순수)
//
// 실제 Storage 에 작은 PNG 를 올렸다가 끝에 정리.
// 실행: npx tsx db/test-photo-anchor.ts

import "dotenv/config";

import { getLifeEvents, isPhotoPeriodAnchor } from "../lib/life-events";
import { prisma } from "../lib/db";
import {
  attachPhotoToMemory,
  deletePhotoOwned,
  updatePhotoAnchor,
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

async function main() {
  const me = await prisma.user.create({
    data: { email: `photo4-me-${Date.now()}@test`, name: "me" },
    select: { id: true },
  });
  const other = await prisma.user.create({
    data: { email: `photo4-other-${Date.now()}@test`, name: "other" },
    select: { id: true },
  });
  // 기간 이벤트 (대학교 1985~1989)
  const periodMem = await prisma.userMemory.create({
    data: {
      userId: me.id,
      createdVia: "life_event",
      year: 1985,
      month: 3,
      title: "대학교",
      eventYear: 1985,
      eventMonth: 3,
      eventTitle: "대학교",
      endYear: 1989,
      endMonth: 2,
      precision: "EXACT",
      category: "UNIVERSITY",
    },
    select: { id: true },
  });

  const createdPhotoIds: string[] = [];

  console.log("\n[0] isPhotoPeriodAnchor 순수 검증");
  check("start/end/both true", isPhotoPeriodAnchor("start") && isPhotoPeriodAnchor("end") && isPhotoPeriodAnchor("both"), null);
  check("그 외 false", !isPhotoPeriodAnchor("xxx") && !isPhotoPeriodAnchor(null) && !isPhotoPeriodAnchor(3), null);

  console.log("\n[1] 첨부 anchor start/end/기본(both) 저장");
  const rStart = await attachPhotoToMemory(me.id, periodMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: "입학식",
    periodAnchor: "start",
  });
  const rEnd = await attachPhotoToMemory(me.id, periodMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: "졸업식",
    periodAnchor: "end",
  });
  const rDefault = await attachPhotoToMemory(me.id, periodMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: "캠퍼스",
    // periodAnchor 생략 → both
  });
  check("start 첨부 ok", rStart.ok, rStart);
  check("end 첨부 ok", rEnd.ok, rEnd);
  check("기본 첨부 ok", rDefault.ok, rDefault);
  if (rStart.ok) createdPhotoIds.push(rStart.photoId);
  if (rEnd.ok) createdPhotoIds.push(rEnd.photoId);
  if (rDefault.ok) createdPhotoIds.push(rDefault.photoId);

  const startRow = rStart.ok
    ? await prisma.photo.findUnique({ where: { id: rStart.photoId }, select: { periodAnchor: true } })
    : null;
  const endRow = rEnd.ok
    ? await prisma.photo.findUnique({ where: { id: rEnd.photoId }, select: { periodAnchor: true } })
    : null;
  const defaultRow = rDefault.ok
    ? await prisma.photo.findUnique({ where: { id: rDefault.photoId }, select: { periodAnchor: true } })
    : null;
  check("start 사진 periodAnchor=start", startRow?.periodAnchor === "start", startRow);
  check("end 사진 periodAnchor=end", endRow?.periodAnchor === "end", endRow);
  check("기본 사진 periodAnchor=both", defaultRow?.periodAnchor === "both", defaultRow);

  console.log("\n[2] getLifeEvents — photos[].periodAnchor 매핑");
  const events = await getLifeEvents(me.id);
  const row = events.find((e) => e.id === periodMem.id);
  check("이벤트 행 존재", !!row, row?.id);
  check("photos 3장", row?.photos.length === 3, row?.photos.length);
  const anchors = (row?.photos ?? []).map((p) => p.periodAnchor).sort();
  check("앵커 집합 = [both, end, start]", JSON.stringify(anchors) === JSON.stringify(["both", "end", "start"]), anchors);

  console.log("\n[3] updatePhotoAnchor 재태그 + 권한");
  if (rStart.ok) {
    const ok = await updatePhotoAnchor(me.id, rStart.photoId, "end");
    check("재태그 start→end ok", ok === true, ok);
    const after = await prisma.photo.findUnique({ where: { id: rStart.photoId }, select: { periodAnchor: true } });
    check("DB 반영 end", after?.periodAnchor === "end", after);
    const denied = await updatePhotoAnchor(other.id, rStart.photoId, "start");
    check("남이 재태그 → false", denied === false, denied);
    const stillEnd = await prisma.photo.findUnique({ where: { id: rStart.photoId }, select: { periodAnchor: true } });
    check("남의 시도 후에도 end 유지", stillEnd?.periodAnchor === "end", stillEnd);
  }

  // ── 정리 ──
  console.log("\n[정리] 업로드한 사진·메모리·유저 삭제");
  for (const pid of createdPhotoIds) {
    await deletePhotoOwned(me.id, pid).catch((e) =>
      console.error("  정리 실패(photo):", pid, e),
    );
  }
  await prisma.userMemory.deleteMany({ where: { id: periodMem.id } });
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
