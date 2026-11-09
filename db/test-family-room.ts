// 가족 룸 V3 연결 회귀(2026-11-09 — 성민 결정 A~E, docs/phase/family-room-v3.md). LLM 0 · 결제 0 · 픽스처 계정만(.invalid).
//
//   ① 룸 주인 동의(C) — 동의 없이 만들기 거부(룸 0) · 동의하면 주인 동의 시각 기록
//   ② 보이는 것 — V3 이야기(제목·본문·연도) · "그때의 나"(SELF) 안 보임(A) · 연도 없는 이야기 = year null(연도 모름 묶음, B) ·
//      확정 안 된 시기의 이야기 안 보임 · V3 사용자의 옛 V2 기록 안 보임 · V2 멤버 기록은 그대로(사진 메모리는 안 보임)
//   ③ 비공개(D) — 카드 칸 = id·작성자·연도·월·제목·본문·만든 때·이름 뿐 · 사람·장소 이름·사진 경로 안 실림
//   ④ 동의 전 — 초대만 받은 멤버의 이야기 안 보임·룸도 못 봄 → 동의하면 보임 · 주인 동의가 없으면 주인 이야기도 안 보이고 룸도 못 봄
//   ⑤ 댓글·스탬프 — 보이는 이야기만(그때의 나·옛 V2 기록·사진 메모리·남의 룸 기록 거절)
//   ⑥ 남의 이야기 — 멤버는 고치기·글 저장·이름 바꾸기·옮기기·지우기 전부 못 함 · 이야기 그대로 · 룸 카드에 고치기·지우기 길 없음
//   ⑦ 화면 — 룸 만들기 동의칸(필수·서버 재확인) · 초대 동의 = 같은 공개 범위 문장 · "연도 모름" 묶음 · 문구 [임시]
//
// 실행: npx tsx db/test-family-room.ts

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { createComment } from "../lib/comments";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import { deleteEpisode, updateEpisodeContent } from "../lib/episode";
import { moveEpisodeToLifeEvent } from "../lib/episode-move";
import { createPeriodNode, createPersonNode, createPlaceNode, createStoryNode, deleteNode, renameNode } from "../lib/my-life-edit";
import { getEpisodeBody, saveEpisodeBody } from "../lib/node-body";
import { setReaction } from "../lib/reactions";
import { ROOM_COPY } from "../lib/room-copy";
import { createInvite, createRoom, getMembership, joinViaInvite, listRoomMemories, roomCanSeeMemory } from "../lib/rooms";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const EMAILS = { a: "fixture-family-room-a@lifebook.invalid", b: "fixture-family-room-b@lifebook.invalid", c: "fixture-family-room-c@lifebook.invalid" };
const ROOM_NAME = "[fixture] 가족 룸 V3";

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  if (ok) console.log(`PASS — ${label}`);
  else {
    failed += 1;
    console.log(`FAIL — ${label}`);
    if (detail !== undefined) console.log("   ", JSON.stringify(detail, null, 2)?.slice(0, 1500));
  }
}
const rejects = async (p: Promise<unknown>) => p.then(() => false, () => true);

async function removeFixtures() {
  for (const email of Object.values(EMAILS)) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function mkUser(email: string, name: string, track: "V2" | "V3") {
  const now = new Date();
  return (
    await prisma.user.create({
      data: { email, name, birthYear: 1950, onboardingTrack: track, isTestAccount: true, termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION },
      select: { id: true },
    })
  ).id;
}

const memoryOf = async (episodeId: string) => (await prisma.episode.findUniqueOrThrow({ where: { id: episodeId }, select: { memoryId: true } })).memoryId;
const must = <T extends { ok: boolean }>(r: T, what: string): Extract<T, { ok: true }> => {
  if (!r.ok) throw new Error(`${what} 실패: ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
};

async function main() {
  await removeFixtures();
  try {
    const a = await mkUser(EMAILS.a, "[fixture] 룸 주인", "V3");
    const b = await mkUser(EMAILS.b, "[fixture] 룸 멤버 V2", "V2");
    const c = await mkUser(EMAILS.c, "[fixture] 룸 초대만", "V3");

    // A(V3) — 시기 둘(연도 있음·없음), 이야기(사람·장소 연결)·그때의 나·연도 없는 이야기(제목 없음), 확정 안 된 시기의 이야기, 옛 V2 기록
    const per = must(await createPeriodNode(a, { label: "[fixture] 국민학교", year: 1957, endYear: null }), "시기");
    const perNoYear = must(await createPeriodNode(a, { label: "[fixture] 언젠가", year: null, endYear: null }), "연도 없는 시기");
    const mom = must(await createPersonNode(a, { name: "[fixture] 비밀어머니", relation: "어머니" }), "사람") as { ok: true; personId: string };
    const place = must(await createPlaceNode(a, { name: "[fixture] 비밀운동장" }), "장소") as { ok: true; placeId: string };
    const story = must(
      await createStoryNode(a, { lifeEventId: per.eventId, kind: "STORY", title: "[fixture] 운동회", content: "[fixture] 운동회 날 달리기를 했다.", personIds: [mom.personId], placeIds: [place.placeId] }),
      "이야기",
    );
    const self = must(await createStoryNode(a, { lifeEventId: per.eventId, kind: "SELF", title: "[fixture] 그때의 나", content: "[fixture] 그때 나는 수줍었다." }), "그때의 나");
    const noYear = must(await createStoryNode(a, { lifeEventId: perNoYear.eventId, kind: "STORY", title: "", content: "[fixture] 언제인지 모를 이야기." }), "연도 없는 이야기");
    const [storyMem, selfMem, noYearMem] = await Promise.all([memoryOf(story.episodeId), memoryOf(self.episodeId), memoryOf(noYear.episodeId)]);
    const photo = await prisma.photo.create({
      data: { userId: a, memoryId: storyMem, storagePath: `fixture-family-room/${a}/secret-photo.png`, mimeType: "image/png", fileBytes: 8, caption: "[fixture] 비밀사진설명" },
      select: { id: true },
    });
    const unconfirmed = await prisma.lifeEvent.create({ data: { userId: a, type: "CUSTOM", label: "[fixture] 확정 전", year: 1960, status: "UNCONFIRMED", sequenceOrder: 99 }, select: { id: true } });
    const unconfMem = await prisma.userMemory.create({ data: { userId: a, year: 1960, title: "[fixture] 확정 전 이야기", content: "x", createdVia: "episode" }, select: { id: true } });
    await prisma.episode.create({ data: { lifeEventId: unconfirmed.id, memoryId: unconfMem.id, content: "[fixture] 확정 전 이야기 본문", kind: "STORY" } });
    const aLegacy = await prisma.userMemory.create({ data: { userId: a, year: 1980, title: "[fixture] A 옛 V2 기록", content: "옛 기록", createdVia: "life_event" }, select: { id: true } });

    // B(V2) — 연혁 기록(보임)·사진 메모리(안 보임)
    const bMem = await prisma.userMemory.create({ data: { userId: b, year: 1985, title: "[fixture] B 연혁", content: "B 의 이야기", createdVia: "life_event" }, select: { id: true } });
    const bPhoto = await prisma.userMemory.create({ data: { userId: b, year: 1986, title: "[fixture] B 사진", content: null, createdVia: "photo" }, select: { id: true } });

    // C(V3) — 초대만 받은 멤버의 이야기
    const cPer = must(await createPeriodNode(c, { label: "[fixture] 첫 직장", year: 1980, endYear: null }), "C 시기");
    const cStory = must(await createStoryNode(c, { lifeEventId: cPer.eventId, kind: "STORY", title: "[fixture] C 첫 월급", content: "[fixture] 첫 월급." }), "C 이야기");
    const cMem = await memoryOf(cStory.episodeId);

    // ① 룸 주인 동의
    const noConsent = await rejects(createRoom(a, ROOM_NAME, false));
    const roomsAfterNo = await prisma.sharedRoom.count({ where: { ownerId: a } });
    const room = await createRoom(a, ROOM_NAME, true);
    const ownerRow = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: a } }, select: { role: true, consentAt: true } });
    check("① 룸 주인 동의 — 동의 없이 만들기 거부(룸 0) · 동의하면 만들어지고 주인 동의 시각 기록", noConsent && roomsAfterNo === 0 && ownerRow?.role === "owner" && !!ownerRow.consentAt, { noConsent, roomsAfterNo, ownerRow });

    const invite = await createInvite(a, room.id);
    await joinViaInvite(b, invite.token);
    await prisma.roomMember.create({ data: { roomId: room.id, userId: c, role: "member", consentAt: null } }); // 초대만 받고 동의 전

    // ② 보이는 것
    const viewB = (await listRoomMemories(room.id, b)) ?? [];
    const viewA = (await listRoomMemories(room.id, a)) ?? [];
    const ids = new Set(viewB.map((m) => m.id));
    const sRow = viewB.find((m) => m.id === storyMem);
    const nRow = viewB.find((m) => m.id === noYearMem);
    check("② V3 이야기 보임 — 제목·본문·연도(시기 연도) · 작성자 = 주인",
      !!sRow && sRow.title === "[fixture] 운동회" && sRow.content === "[fixture] 운동회 날 달리기를 했다." && sRow.year === 1957 && sRow.userId === a && sRow.month === null, sRow);
    check("② A — \"그때의 나\"(SELF) 안 보임", !ids.has(selfMem) && !JSON.stringify(viewB).includes("수줍었다"));
    check("② B — 연도 없는 이야기 = year null(연도 모름 묶음) · 제목 없음 = 빈 제목(카드가 제목 줄 생략) · 맨 뒤",
      !!nRow && nRow.year === null && nRow.title === "" && nRow.content === "[fixture] 언제인지 모를 이야기." && viewB[viewB.length - 1]?.id === noYearMem, nRow);
    check("② 확정 안 된 시기의 이야기 · V3 사용자의 옛 V2 기록 안 보임", !ids.has(unconfMem.id) && !ids.has(aLegacy.id));
    check("② V2 멤버 기록은 그대로 보임 · V2 사진 메모리는 안 보임", ids.has(bMem.id) && !ids.has(bPhoto.id));
    check("② 주인·멤버가 보는 목록 같음 · 연도순(1957 → 1985 → 연도 모름)",
      JSON.stringify(viewA.map((m) => m.id)) === JSON.stringify(viewB.map((m) => m.id)) && JSON.stringify(viewB.map((m) => m.year)) === JSON.stringify([1957, 1985, null]),
      viewB.map((m) => [m.title, m.year]));

    // ③ 비공개 칸
    const keys = [...new Set(viewB.flatMap((m) => Object.keys(m)))].sort();
    const blob = JSON.stringify(viewB);
    check("③ D — 카드 칸 = id·작성자·연도·월·제목·본문·만든 때·이름·시대 사건 뿐 · 사람·장소 이름·사진 경로·사진 설명 안 실림",
      JSON.stringify(keys) === JSON.stringify(["content", "createdAt", "event", "id", "month", "title", "user", "userId", "year"]) &&
        !blob.includes("비밀어머니") && !blob.includes("비밀운동장") && !blob.includes("secret-photo") && !blob.includes("비밀사진설명") && !blob.includes(photo.id),
      keys);

    // ④ 동의 전
    const cBefore = !ids.has(cMem) && (await listRoomMemories(room.id, c)) === null && (await getMembership(c, room.id)) === null;
    await joinViaInvite(c, invite.token);
    const cAfter = ((await listRoomMemories(room.id, b)) ?? []).some((m) => m.id === cMem);
    check("④ 초대만 받은 멤버 — 이야기 안 보임·룸 못 봄 → 동의하면 이야기 보임", cBefore && cAfter, { cBefore, cAfter });
    await prisma.roomMember.update({ where: { roomId_userId: { roomId: room.id, userId: a } }, data: { consentAt: null } });
    const noOwner = (await listRoomMemories(room.id, b)) ?? [];
    const ownerBlocked = (await getMembership(a, room.id)) === null && (await listRoomMemories(room.id, a)) === null;
    const ownerHidden = !noOwner.some((m) => m.userId === a) && noOwner.some((m) => m.id === bMem.id) && !(await roomCanSeeMemory(room.id, storyMem));
    await prisma.roomMember.update({ where: { roomId_userId: { roomId: room.id, userId: a } }, data: { consentAt: new Date() } });
    check("④ C — 주인 동의가 없으면 주인 이야기 안 보임(댓글 대상도 아님) · 주인도 룸 못 봄 · 다른 멤버 기록은 그대로", ownerBlocked && ownerHidden, { ownerBlocked, ownerHidden });

    // ⑤ 댓글·스탬프
    await createComment(b, room.id, "user_memory", storyMem, "[fixture] 좋은 이야기네요");
    await setReaction(b, room.id, "user_memory", storyMem, "touched", true);
    const okRows = (await prisma.comment.count({ where: { roomId: room.id, targetId: storyMem } })) === 1 && (await prisma.memoryReaction.count({ where: { roomId: room.id, targetId: storyMem } })) === 1;
    const refused = await Promise.all([
      rejects(createComment(b, room.id, "user_memory", selfMem, "x")),
      rejects(createComment(b, room.id, "user_memory", aLegacy.id, "x")),
      rejects(createComment(a, room.id, "user_memory", bPhoto.id, "x")),
      rejects(createComment(b, room.id, "user_memory", unconfMem.id, "x")),
      rejects(setReaction(b, room.id, "user_memory", selfMem, "touched", true)),
      rejects(setReaction(b, room.id, "user_memory", bPhoto.id, "touched", true)),
    ]);
    check("⑤ 댓글·스탬프 — 보이는 이야기만 · 그때의 나·옛 V2 기록·사진 메모리·확정 전 이야기 거절", okRows && refused.every(Boolean), { okRows, refused });

    // ⑥ 남의 이야기 — 멤버 b(V2)·c(V3) 둘 다
    const before = await prisma.episode.findUniqueOrThrow({ where: { id: story.episodeId }, select: { content: true, lifeEventId: true, memory: { select: { title: true } } } });
    const body = await getEpisodeBody(a, story.episodeId);
    const tries = [];
    for (const who of [b, c]) {
      tries.push(
        ...(await Promise.all([
          updateEpisodeContent(who, story.episodeId, "남이 고친 글."),
          saveEpisodeBody(who, story.episodeId, { v: 1, blocks: [{ type: "paragraph", text: "남이 쓴 글." }] }, body?.version ?? 0),
          renameNode(who, { type: "EPISODE", id: story.episodeId }, "남이 바꾼 제목"),
          moveEpisodeToLifeEvent(who, story.episodeId, perNoYear.eventId),
          deleteNode(who, { type: "EPISODE", id: story.episodeId }),
          deleteEpisode(who, story.episodeId),
        ])),
      );
    }
    const after = await prisma.episode.findUnique({ where: { id: story.episodeId }, select: { content: true, lifeEventId: true, memory: { select: { title: true } } } });
    const card = read("app/rooms/[roomId]/PersonalMemoryCard.tsx");
    check("⑥ 남의 이야기 — 멤버(V2·V3)는 고치기·글 저장·이름 바꾸기·옮기기·지우기 전부 못 함 · 이야기·제목·시기 그대로 · 룸 카드에 고치기·지우기 길 없음",
      tries.every((r) => !(r as { ok?: boolean }).ok) && JSON.stringify(after) === JSON.stringify(before) && (await getEpisodeBody(a, story.episodeId))?.version === body?.version &&
        !/my-life|edit|고치|지우|delete/i.test(card.replace(/\/\/.*$/gm, "")),
      { tries, before, after });

    // ⑦ 화면
    const roomsPage = read("app/rooms/page.tsx");
    const actions = read("app/rooms/actions.ts");
    const consent = read("app/invite/[token]/ConsentForm.tsx");
    const detail = read("app/rooms/[roomId]/page.tsx");
    check("⑦ 화면 — 룸 만들기 동의칸(필수 · 서버가 agree 다시 확인) · 초대 동의 = 같은 공개 범위 문장 · \"연도 모름\" 묶음 · 문구 [임시]",
      /name="agree"\s+required/.test(roomsPage) && roomsPage.includes("ROOM_COPY.shareScope") && actions.includes('formData.get("agree") !== "on"') &&
        consent.includes("ROOM_COPY.shareScope") && detail.includes("ROOM_COPY.yearUnknown") && ROOM_COPY.yearUnknown === "연도 모름" &&
        read("lib/room-copy.ts").includes("[임시 — 성민 확정 필요]"));
  } finally {
    await removeFixtures();
  }
  const left = await prisma.sharedRoom.count({ where: { name: ROOM_NAME } });
  const users = await prisma.user.count({ where: { email: { in: Object.values(EMAILS) } } });
  check("정리 — 탈퇴 경로로 픽스처 계정·룸 0", left === 0 && users === 0, { left, users });

  console.log(failed ? `\nFAIL ${failed} / ${count}` : `\nALL PASS (${count})`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
