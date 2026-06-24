// Phase Place (C) 검증 — 독립 사진 장소 저장/수정/가드.
//
//   1) createIndependentPhoto place 저장 → getLifeEvents place 반영
//   2) updatePhotoMemoryPlace 수정 (장소 변경)
//   3) updatePhotoMemoryPlace 가드 — life_event 메모리엔 적용 X(false)
//   4) 남이 수정 시도 → false
//
// 실제 Storage 에 작은 PNG 를 올렸다가 끝에 정리.
// 실행: npx tsx db/test-photo-place.ts

import "dotenv/config";

import { getLifeEvents } from "../lib/life-events";
import { prisma } from "../lib/db";
import {
  createIndependentPhoto,
  deletePhotoOwned,
  updatePhotoMemoryPlaces,
} from "../lib/photos";

const PNG_1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

const CHUNCHEON = {
  placeName: "강원도 춘천시",
  placeAddress: "강원특별자치도 춘천시",
  lat: 37.8813,
  lng: 127.7298,
  placeSource: "naver" as const,
};
const SEOUL = {
  placeName: "서울특별시청",
  placeAddress: "서울 중구 세종대로 110",
  lat: 37.5665,
  lng: 126.978,
  placeSource: "google" as const,
};

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
    data: { email: `photo5-me-${Date.now()}@test`, name: "me" },
    select: { id: true },
  });
  const other = await prisma.user.create({
    data: { email: `photo5-other-${Date.now()}@test`, name: "other" },
    select: { id: true },
  });
  const lifeMem = await prisma.userMemory.create({
    data: {
      userId: me.id,
      createdVia: "life_event",
      year: 1990,
      title: "초등학교",
      eventYear: 1990,
      eventTitle: "초등학교",
    },
    select: { id: true },
  });

  const createdPhotoIds: string[] = [];

  console.log("\n[1] createIndependentPhoto place 저장 + getLifeEvents 반영");
  const r = await createIndependentPhoto(me.id, {
    fileBuffer: PNG_1x1,
    mimeType: "image/png",
    year: 2010,
    month: 6,
    caption: "백일잔치",
    place: CHUNCHEON,
  });
  createdPhotoIds.push(r.photoId);
  const mem = await prisma.userMemory.findUnique({
    where: { id: r.memoryId },
    select: { placeName: true, lat: true, lng: true, placeSource: true },
  });
  check("placeName 저장(춘천)", mem?.placeName === "강원도 춘천시", mem);
  check("placeSource 저장(naver)", mem?.placeSource === "naver", mem);
  check("lat 저장", mem?.lat === 37.8813, mem?.lat);

  const events = await getLifeEvents(me.id);
  const photoRow = events.find((e) => e.id === r.memoryId);
  check("getLifeEvents place.placeName 반영", photoRow?.place.placeName === "강원도 춘천시", photoRow?.place);
  check("kind=photo 유지", photoRow?.kind === "photo", photoRow?.kind);

  console.log("\n[2] updatePhotoMemoryPlaces 수정 (춘천 → 서울)");
  const ok = await updatePhotoMemoryPlaces(me.id, r.memoryId, [SEOUL]);
  check("수정 ok", ok === true, ok);
  const mem2 = await prisma.userMemory.findUnique({
    where: { id: r.memoryId },
    select: { placeName: true, placeSource: true },
  });
  check("placeName 서울로 변경", mem2?.placeName === "서울특별시청", mem2);
  check("placeSource google 로 변경", mem2?.placeSource === "google", mem2);

  console.log("\n[3] 가드 — life_event 메모리엔 updatePhotoMemoryPlaces X");
  const guardLife = await updatePhotoMemoryPlaces(me.id, lifeMem.id, [SEOUL]);
  check("life_event 대상 → false", guardLife === false, guardLife);
  const lifeRow = await prisma.userMemory.findUnique({
    where: { id: lifeMem.id },
    select: { placeName: true },
  });
  check("life_event 장소 안 바뀜(null 유지)", lifeRow?.placeName === null, lifeRow);

  console.log("\n[4] 남이 수정 시도 → false");
  const denied = await updatePhotoMemoryPlaces(other.id, r.memoryId, [CHUNCHEON]);
  check("남의 시도 → false", denied === false, denied);
  const mem3 = await prisma.userMemory.findUnique({
    where: { id: r.memoryId },
    select: { placeName: true },
  });
  check("남의 시도 후에도 서울 유지", mem3?.placeName === "서울특별시청", mem3);

  // 정리
  console.log("\n[정리] 사진·메모리·유저 삭제");
  for (const pid of createdPhotoIds) {
    await deletePhotoOwned(me.id, pid).catch((e) =>
      console.error("  정리 실패(photo):", pid, e),
    );
  }
  await prisma.userMemory.deleteMany({ where: { id: lifeMem.id } });
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
