// Phase Photo (3단계) 검증 — attachPhotoToMemory + getLifeEvents photos.
//
//   1) 본인 아닌 메모리에 첨부 → memory_not_found (Storage 업로드 전 거부)
//   2) era_event 메모리에 첨부 → not_life_event
//   3) photo(독립) 메모리에 첨부 → not_life_event
//   4) 정상 life_event 첨부 → ok + 그 메모리의 photos 에 추가
//   5) 독립 업로드(createIndependentPhoto) 여전히 작동 + kind="photo"
//
// 실제 Supabase Storage 에 작은 PNG 를 올렸다가 끝에 정리한다.
// 실행: npx tsx db/test-photo-attach.ts

import "dotenv/config";

import { prisma } from "../lib/db";
import { getLifeEvents } from "../lib/life-events";
import {
  attachPhotoToMemory,
  createIndependentPhoto,
  deletePhotoOwned,
} from "../lib/photos";

// 1x1 투명 PNG (Storage 업로드용 — magic number 검증은 라우트 책임, 헬퍼는 raw put)
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
    data: { email: `photo3-me-${Date.now()}@test`, name: "me" },
    select: { id: true },
  });
  const other = await prisma.user.create({
    data: { email: `photo3-other-${Date.now()}@test`, name: "other" },
    select: { id: true },
  });

  const lifeMem = await prisma.userMemory.create({
    data: {
      userId: me.id,
      createdVia: "life_event",
      year: 1990,
      month: 3,
      title: "초등학교 입학",
      eventYear: 1990,
      eventMonth: 3,
      eventTitle: "초등학교 입학",
      precision: "EXACT",
      category: "ELEMENTARY",
    },
    select: { id: true },
  });
  const eraMem = await prisma.userMemory.create({
    data: {
      userId: me.id,
      createdVia: "era_event",
      year: 2001,
      month: 9,
      title: "9·11 테러",
      eventYear: 2001,
      eventMonth: 9,
      eventTitle: "9·11 테러",
    },
    select: { id: true },
  });
  const otherLifeMem = await prisma.userMemory.create({
    data: {
      userId: other.id,
      createdVia: "life_event",
      year: 1995,
      title: "남의 기록",
      eventYear: 1995,
      eventTitle: "남의 기록",
    },
    select: { id: true },
  });
  // 독립 사진(3단계 미러링 확인용) — createIndependentPhoto 가 만든 photo 메모리
  const indep = await createIndependentPhoto(me.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    year: 2010,
    month: 6,
    caption: "독립 사진 캡션",
  });

  // 정리 대상 추적
  const createdPhotoIds: string[] = [indep.photoId];

  console.log("\n[1] 본인 아닌 메모리에 첨부 → memory_not_found");
  const r1 = await attachPhotoToMemory(me.id, otherLifeMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: null,
  });
  check("거부 = memory_not_found", !r1.ok && r1.reason === "memory_not_found", r1);

  console.log("\n[2] era_event 메모리에 첨부 → not_life_event");
  const r2 = await attachPhotoToMemory(me.id, eraMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: null,
  });
  check("거부 = not_life_event", !r2.ok && r2.reason === "not_life_event", r2);

  console.log("\n[3] photo(독립) 메모리에 첨부 → not_life_event");
  const r3 = await attachPhotoToMemory(me.id, indep.memoryId, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: null,
  });
  check("거부 = not_life_event", !r3.ok && r3.reason === "not_life_event", r3);

  console.log("\n[4] 정상 life_event 첨부 → ok + photos 에 추가");
  const r4 = await attachPhotoToMemory(me.id, lifeMem.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    caption: "결혼식 단체사진",
  });
  check("첨부 = ok", r4.ok, r4);
  if (r4.ok) createdPhotoIds.push(r4.photoId);

  const photoRow = r4.ok
    ? await prisma.photo.findUnique({
        where: { id: r4.photoId },
        select: { memoryId: true, caption: true, userId: true },
      })
    : null;
  check("Photo.memoryId = lifeMem", photoRow?.memoryId === lifeMem.id, photoRow);
  check("Photo.caption 저장", photoRow?.caption === "결혼식 단체사진", photoRow);
  check("Photo.userId = me", photoRow?.userId === me.id, photoRow);

  console.log("\n[5] getLifeEvents — 첨부 사진이 그 life_event 행에 보임");
  const events = await getLifeEvents(me.id);
  const lifeRow = events.find((e) => e.id === lifeMem.id);
  check("life_event 행 존재", !!lifeRow, lifeRow?.id);
  check("kind = life_event", lifeRow?.kind === "life_event", lifeRow?.kind);
  check("photos 1장", lifeRow?.photos.length === 1, lifeRow?.photos.length);
  check(
    "photos[0].storagePath 채워짐",
    !!lifeRow?.photos[0]?.storagePath,
    lifeRow?.photos[0],
  );
  check(
    "photos[0].caption 매핑",
    lifeRow?.photos[0]?.caption === "결혼식 단체사진",
    lifeRow?.photos[0]?.caption,
  );

  console.log("\n[6] getLifeEvents — 독립 사진은 kind=photo 행 + photos 1장");
  const photoRowEv = events.find((e) => e.id === indep.memoryId);
  check("독립 photo 행 존재", !!photoRowEv, photoRowEv?.id);
  check("kind = photo", photoRowEv?.kind === "photo", photoRowEv?.kind);
  check("eventYear 미러링(2010)", photoRowEv?.eventYear === 2010, photoRowEv?.eventYear);
  check("eventMonth 미러링(6)", photoRowEv?.eventMonth === 6, photoRowEv?.eventMonth);
  check("photos 1장", photoRowEv?.photos.length === 1, photoRowEv?.photos.length);

  console.log("\n[7] era_event 행은 photos 항상 빈 배열");
  const eraRow = events.find((e) => e.id === eraMem.id);
  check("era 행 photos = []", eraRow?.photos.length === 0, eraRow?.photos.length);

  // ── 정리 (Storage + DB) ──────────────────────────────────────
  console.log("\n[정리] 업로드한 사진·메모리·유저 삭제");
  for (const pid of createdPhotoIds) {
    await deletePhotoOwned(me.id, pid).catch((e) =>
      console.error("  정리 실패(photo):", pid, e),
    );
  }
  // lifeMem(life_event)·eraMem·otherLifeMem 은 사진 삭제로 안 지워지므로 수동.
  await prisma.userMemory.deleteMany({
    where: { id: { in: [lifeMem.id, eraMem.id, otherLifeMem.id] } },
  });
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
