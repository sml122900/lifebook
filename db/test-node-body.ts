// 노드 본문(블로그식 글) 회귀 — 2b-3c(2026-11-03, docs/phase/my-life-restructure.md §19 · node-graph-self.md §2b.2). LLM 0.
// 픽스처 계정만 만들고 지운다(test30·실고객 접촉 0). 사진 1장을 실제 Storage 에 올렸다가 인물 삭제로 지운다(⑩·⑫).
//
//   ① 기존 평문 그대로 보임(본문 없음 → 평문 문단, 버전 0)
//   ② 블로그 저장 — Episode.content·브릿지 평문 동기화 · 다듬기 3필드 초기화(Q9) · 캡션은 평문에 안 들어가고 Photo.caption 한 곳 · 문서엔 캡션 없음
//   ③ 이전 판 — 바뀌면 직전 판 1행(평문 + 그때 맞던 문서) · 캡션만 바뀐 저장은 판 안 남김
//   ④ 문서 검사 — 상한(문단 3000·소제목 40·캡션 200·블록 60)·모양·빈 글 거부
//   ⑤ 사진 — 남의 사진 거부 · 지워진 사진·다른 메모리 사진 블록은 빠짐
//   ⑥ 버전 충돌 — 낡은 버전은 저장 안 함
//   ⑦ 평문 [이야기 고치기] — 판 남김 · 문서 버전 +1(열어 둔 블로그 편집이 충돌로 앎) · 낡은 문서는 안 보이고 평문 문단
//   ⑧ 20판 상한(D1) — 가장 오래된 것부터 지움
//   ⑨ 되돌리기 — 그 판 문서로 저장 · 지금 글이 판으로 남음 · 캡션은 지금 값(D3)
//   ⑩ 인물 글(D2) — 빈 본문 · 사진 메모리(node_body) · 실제 사진 첨부 허용 · 비워 두고 저장 가능 · 초안·남의 인물 거부
//   ⑪ 가족 룸 — node_body 메모리 안 보임 · My Life 데이터(richBody·인물 글) · 남의 이야기(2026-11-08 — 가족 룸 V3 연결 전 확인):
//      다른 사용자는 고치기·글 저장·되돌리기·옮기기·지우기 전부 못 함, 원래 이야기 그대로
//   ⑫ 노드 삭제 — 이야기 지우기·인물 지우기 → 본문·이전 판·사진 메모리·사진 파일 0
//   ⑬ 탈퇴 — 이전 판 Cascade 0 · ⑭ 남의 것 — 저장·되돌리기·목록 막힘
//   ⑯ 충돌 보존(2026-11-04) — 거부된 글 = 이전 판 "저장되지 않은 글"(본문 그대로·사진 칸 거르기·같은 글 한 번·남·빈 글 안 남김) → 그 판으로 되돌리기 · 인물 글
//   ⑰ 혼자 두 화면 — 패널 평문 저장(base 버전·평문)과 열어 둔 글 고치기 화면, 본문 없는 이야기도 · ⑱ 20판 한도 경계(저장되지 않은 글 포함)
//   ⑮ 문구(2026-11-04 확정) — 빈 글 오류의 버튼 이름 = 실제 [이 노드 지우기] · 패널 버튼 = 글 고치기 화면 이름 · 안내 18px · 말로 적기 문구는 문구 파일
//
// 실행: npx tsx db/test-node-body.ts

import "dotenv/config";

import fs from "node:fs";

import { prisma } from "../lib/db";
import { deleteAccountTx } from "../lib/account-deletion";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { createEpisodeBridge, deleteEpisode, updateEpisodeContent } from "../lib/episode";
import { moveEpisodeToLifeEvent } from "../lib/episode-move";
import { getMyLifeData } from "../lib/my-life";
import {
  BODY_LIMITS,
  CREATED_VIA_NODE_BODY,
  ensurePersonBodyMemory,
  getEpisodeBody,
  keepUnsavedDraft,
  getPersonBody,
  listRevisions,
  REVISIONS_KEPT,
  restoreRevision,
  saveEpisodeBody,
  savePersonBody,
} from "../lib/node-body";
import { deletePerson } from "../lib/people";
import { attachPhotoToMemory } from "../lib/photos";
import { createRoom, listRoomMemories } from "../lib/rooms";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import { VOICE_COPY } from "../lib/voice-copy";

const EMAIL_A = "fixture-node-body-a@lifebook.invalid";
const EMAIL_B = "fixture-node-body-b@lifebook.invalid";
const EMAIL_C = "fixture-node-body-c@lifebook.invalid"; // ⑬ 탈퇴

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

async function removeFixtures() {
  for (const email of [EMAIL_A, EMAIL_B, EMAIL_C]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (u) await deleteAccountTx(u.id);
  }
}

async function makeUser(email: string, name: string): Promise<string> {
  const now = new Date();
  const u = await prisma.user.create({
    data: { email, name, birthYear: 1955, onboardingTrack: "V3", termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION },
    select: { id: true },
  });
  await prisma.onboardingProfile.create({ data: { userId: u.id, birthYear: 1955, region: "전주", skeletonGeneratedAt: now } });
  return u.id;
}

async function makeEvent(userId: string, label: string, year: number) {
  return (await prisma.lifeEvent.create({ data: { userId, type: "HIGH_SCHOOL", label, year, status: "CONFIRMED", confirmedAt: new Date(), sequenceOrder: 0, personAsked: true }, select: { id: true } })).id;
}

const fakePhoto = (userId: string, memoryId: string, caption: string | null = null) =>
  prisma.photo.create({ data: { userId, memoryId, storagePath: `fixture-node-body/${userId}/${Math.random().toString(36).slice(2)}.png`, mimeType: "image/png", fileBytes: 8, caption }, select: { id: true } });

const P = (text: string) => ({ type: "paragraph", text });
const H = (text: string) => ({ type: "heading", text });
const PH = (photoId: string, caption?: string) => (caption === undefined ? { type: "photo", photoId } : { type: "photo", photoId, caption });
const doc = (...blocks: object[]) => ({ v: 1, blocks });

async function main() {
  await removeFixtures();
  try {
    const a = await makeUser(EMAIL_A, "[fixture] 노드 본문 A");
    const b = await makeUser(EMAIL_B, "[fixture] 노드 본문 B");
    const ev = await makeEvent(a, "고등학교 입학", 1971);
    const evB = await makeEvent(b, "고등학교 입학", 1971);

    // ── ① 기존 평문 그대로 보임 ───────────────────────────────────
    const st = (await createEpisodeBridge(a, ev, "수학여행", 1972, "경주로 수학여행을 갔다.\n\n불국사 앞에서 사진을 찍었다.", "", undefined, false, "STORY", true))!;
    const v0 = await getEpisodeBody(a, st.episodeId);
    check("① 본문 없음 → 평문 문단 2개 · 버전 0 · 이전 판 0",
      v0?.version === 0 && v0.revisions === 0 && JSON.stringify(v0.doc.blocks) === JSON.stringify([P("경주로 수학여행을 갔다."), P("불국사 앞에서 사진을 찍었다.")]), v0);

    // ── ② 블로그 저장 ─────────────────────────────────────────────
    await prisma.userMemory.update({ where: { id: st.memoryId }, data: { refinedText: "옛 다듬은 글", refinedAt: new Date(), displayRefined: true } });
    const ph1 = (await fakePhoto(a, st.memoryId)).id;
    const r2 = await saveEpisodeBody(a, st.episodeId, doc(H("경주"), P("경주로 수학여행을 갔다."), PH(ph1, "졸업식 날"), P("불국사 앞에서 사진을 찍었다.")), 0);
    const [ep2, mem2, photo2, body2] = await Promise.all([
      prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true } }),
      prisma.userMemory.findUnique({ where: { id: st.memoryId }, select: { content: true, refinedText: true, refinedAt: true, displayRefined: true } }),
      prisma.photo.findUnique({ where: { id: ph1 }, select: { caption: true } }),
      prisma.nodeBody.findUnique({ where: { nodeType_nodeId: { nodeType: "EPISODE", nodeId: st.episodeId } }, select: { doc: true, version: true, memoryId: true } }),
    ]);
    const plain2 = "경주\n\n경주로 수학여행을 갔다.\n\n불국사 앞에서 사진을 찍었다.";
    check("② 저장 → 버전 1 · Episode.content = 브릿지 평문 = 문단·소제목(캡션 없음) · 다듬기 3필드 초기화",
      r2.ok && r2.version === 1 && ep2?.content === plain2 && mem2?.content === plain2 && mem2.refinedText === null && mem2.refinedAt === null && mem2.displayRefined === false,
      { r2, ep2, mem2 });
    check("② 캡션 = Photo.caption 한 곳 · 저장된 문서엔 캡션 없음 · 본문 메모리 = 이야기 브릿지",
      photo2?.caption === "졸업식 날" && !JSON.stringify(body2?.doc).includes("졸업식") && body2?.memoryId === st.memoryId, { photo2, body2 });
    const v2 = await getEpisodeBody(a, st.episodeId);
    check("② 다시 읽기 — 소제목·문단·사진 순서 그대로", JSON.stringify(v2?.doc.blocks) === JSON.stringify([H("경주"), P("경주로 수학여행을 갔다."), PH(ph1), P("불국사 앞에서 사진을 찍었다.")]), v2?.doc);

    // ── ③ 이전 판 ─────────────────────────────────────────────────
    const revs3 = await listRevisions(a, "EPISODE", st.episodeId);
    check("③ 바뀐 저장 → 직전 판 1행(옛 평문, 그때 문서 없음 → 평문 문단)",
      revs3.length === 1 && revs3[0].plainText === "경주로 수학여행을 갔다.\n\n불국사 앞에서 사진을 찍었다." && revs3[0].doc.blocks.length === 2, revs3);
    const r3 = await saveEpisodeBody(a, st.episodeId, doc(H("경주"), P("경주로 수학여행을 갔다."), PH(ph1, "수학여행 날"), P("불국사 앞에서 사진을 찍었다.")), 1);
    const [revs3b, photo3] = await Promise.all([listRevisions(a, "EPISODE", st.episodeId), prisma.photo.findUnique({ where: { id: ph1 }, select: { caption: true } })]);
    check("③ 캡션만 바꾼 저장 → 버전 2 · 판 그대로 1 · 캡션 갱신", r3.ok && r3.version === 2 && revs3b.length === 1 && photo3?.caption === "수학여행 날", { r3, n: revs3b.length, photo3 });

    // ── ④ 문서 검사 ───────────────────────────────────────────────
    const tooLongP = await saveEpisodeBody(a, st.episodeId, doc(P("가".repeat(BODY_LIMITS.paragraph + 1))), 2);
    const tooLongH = await saveEpisodeBody(a, st.episodeId, doc(H("나".repeat(BODY_LIMITS.heading + 1)), P("본문")), 2);
    const tooLongC = await saveEpisodeBody(a, st.episodeId, doc(P("본문"), PH(ph1, "다".repeat(BODY_LIMITS.caption + 1))), 2);
    const tooMany = await saveEpisodeBody(a, st.episodeId, doc(...Array.from({ length: BODY_LIMITS.blocks + 1 }, (_, i) => P(`문단 ${i}`))), 2);
    const badType = await saveEpisodeBody(a, st.episodeId, { v: 1, blocks: [{ type: "list", text: "x" }] }, 2);
    const badV = await saveEpisodeBody(a, st.episodeId, { v: 2, blocks: [] }, 2);
    const empty = await saveEpisodeBody(a, st.episodeId, doc(P("   "), H(""), PH(ph1)), 2);
    const still = await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true } });
    check("④ 상한(문단·소제목·캡션·블록 수)·모양 → 거부 · 빈 글(사진만) → 거부 · 본문 그대로",
      !tooLongP.ok && tooLongP.reason === "too_long" && !tooLongH.ok && tooLongH.reason === "too_long" && !tooLongC.ok && tooLongC.reason === "too_long" &&
        !tooMany.ok && tooMany.reason === "too_long" && !badType.ok && badType.reason === "invalid" && !badV.ok && badV.reason === "invalid" &&
        !empty.ok && empty.reason === "empty" && still?.content === plain2,
      { tooLongP, tooLongH, tooLongC, tooMany, badType, badV, empty });

    // ── ⑤ 사진 ────────────────────────────────────────────────────
    const stB = (await createEpisodeBridge(b, evB, "B 이야기", 1972, "B 의 이야기.", "", undefined, false, "STORY", true))!;
    const phB = (await fakePhoto(b, stB.memoryId)).id;
    const otherMem = (await createEpisodeBridge(a, ev, "다른 이야기", 1973, "다른 이야기 본문.", "", undefined, false, "STORY", true))!;
    const phOther = (await fakePhoto(a, otherMem.memoryId)).id;
    const badPhoto = await saveEpisodeBody(a, st.episodeId, doc(P("본문"), PH(phB)), 2);
    const r5 = await saveEpisodeBody(a, st.episodeId, doc(H("경주"), P("경주로 수학여행을 갔다."), PH(ph1), PH("no-such-photo"), PH(phOther), P("불국사 앞에서.")), 2);
    const v5 = await getEpisodeBody(a, st.episodeId);
    check("⑤ 남의 사진 → 거부 · 없는 사진·다른 이야기 사진 블록은 빠지고 저장",
      !badPhoto.ok && badPhoto.reason === "bad_photo" && r5.ok && r5.version === 3 &&
        JSON.stringify(v5?.doc.blocks) === JSON.stringify([H("경주"), P("경주로 수학여행을 갔다."), PH(ph1), P("불국사 앞에서.")]),
      { badPhoto, r5, blocks: v5?.doc.blocks });

    // ── ⑥ 버전 충돌 ───────────────────────────────────────────────
    const stale = await saveEpisodeBody(a, st.episodeId, doc(P("낡은 화면에서 저장")), 2);
    const after6 = await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true } });
    check("⑥ 낡은 버전(2, 지금 3) → 충돌 · 본문 그대로", !stale.ok && stale.reason === "conflict" && after6?.content === "경주\n\n경주로 수학여행을 갔다.\n\n불국사 앞에서.", { stale, after6 });

    // ── ⑦ 평문 [이야기 고치기] ────────────────────────────────────
    const revsBefore7 = (await listRevisions(a, "EPISODE", st.episodeId)).length;
    const u7 = await updateEpisodeContent(a, st.episodeId, "평문으로 고친 글.");
    const [v7, revs7, d7] = await Promise.all([getEpisodeBody(a, st.episodeId), listRevisions(a, "EPISODE", st.episodeId), getMyLifeData(a)]);
    const s7 = d7.events.flatMap((e) => e.stories).find((s) => s.id === st.episodeId);
    check("⑦ 평문 고치기 → 판 +1(그때 문서 그대로 — 소제목·사진) · 문서 버전 +1 · 낡은 문서 안 보임(평문 문단) · richBody 꺼짐",
      u7.ok && revs7.length === revsBefore7 + 1 && revs7[0].doc.blocks.some((x) => x.type === "heading") && revs7[0].doc.blocks.some((x) => x.type === "photo") &&
        v7?.version === 4 && JSON.stringify(v7.doc.blocks) === JSON.stringify([P("평문으로 고친 글.")]) && s7?.richBody === false,
      { u7, n: revs7.length, v7: v7?.version, blocks: v7?.doc.blocks, rich: s7?.richBody });
    const sameText = await updateEpisodeContent(a, st.episodeId, "평문으로 고친 글.");
    const revs7b = await listRevisions(a, "EPISODE", st.episodeId);
    const v7b = await getEpisodeBody(a, st.episodeId);
    check("⑦ 같은 평문 다시 저장 → 판·버전 그대로", sameText.ok && revs7b.length === revs7.length && v7b?.version === 4, { n: revs7b.length, v: v7b?.version });
    const staleAfterPlain = await saveEpisodeBody(a, st.episodeId, doc(P("평문 고치기 전에 열어 둔 편집")), 3);
    check("⑦ 평문 고치기 전에 열어 둔 블로그 편집(버전 3) → 충돌", !staleAfterPlain.ok && staleAfterPlain.reason === "conflict", staleAfterPlain);

    // ── ⑧ 20판 상한 ───────────────────────────────────────────────
    const oldest = (await listRevisions(a, "EPISODE", st.episodeId)).at(-1)!;
    let ver = 4;
    for (let i = 0; i < REVISIONS_KEPT + 3; i++) {
      const r = await saveEpisodeBody(a, st.episodeId, doc(P(`고친 글 ${i}.`)), ver);
      if (r.ok) ver = r.version;
    }
    const revs8 = await listRevisions(a, "EPISODE", st.episodeId);
    check(`⑧ 계속 고치면 판은 ${REVISIONS_KEPT}개까지 · 가장 오래된 판부터 지움 · 최신 판 = 바로 전 글`,
      revs8.length === REVISIONS_KEPT && !revs8.some((r) => r.id === oldest.id) && revs8[0].plainText === `고친 글 ${REVISIONS_KEPT + 1}.` && ver === 4 + REVISIONS_KEPT + 3,
      { n: revs8.length, first: revs8[0]?.plainText, ver });

    // ── ⑨ 되돌리기 ────────────────────────────────────────────────
    // 소제목·사진이 있는 판을 하나 만들고, 캡션을 바꾼 뒤 그 판으로 되돌린다.
    const rRich = await saveEpisodeBody(a, st.episodeId, doc(H("되돌릴 판"), P("그때 글."), PH(ph1, "판 때 캡션")), ver);
    ver = rRich.ok ? rRich.version : ver;
    const rLater = await saveEpisodeBody(a, st.episodeId, doc(P("나중 글."), PH(ph1, "지금 캡션")), ver);
    ver = rLater.ok ? rLater.version : ver;
    const target = (await listRevisions(a, "EPISODE", st.episodeId)).find((r) => r.plainText === "되돌릴 판\n\n그때 글.")!;
    const back = await restoreRevision(a, target.id, ver);
    const [v9, ph9, revs9] = await Promise.all([getEpisodeBody(a, st.episodeId), prisma.photo.findUnique({ where: { id: ph1 }, select: { caption: true } }), listRevisions(a, "EPISODE", st.episodeId)]);
    check("⑨ 되돌리기 → 그 판 문서(소제목·문단·사진) · 평문 동기화 · 캡션은 지금 값(D3) · 지금 글이 최신 판으로",
      back.ok && back.nodeType === "EPISODE" && JSON.stringify(v9?.doc.blocks) === JSON.stringify([H("되돌릴 판"), P("그때 글."), PH(ph1)]) &&
        ph9?.caption === "지금 캡션" && revs9[0].plainText === "나중 글." && (await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true } }))?.content === "되돌릴 판\n\n그때 글.",
      { back, blocks: v9?.doc.blocks, ph9, latest: revs9[0]?.plainText });
    const staleRestore = await restoreRevision(a, target.id, ver);
    check("⑨ 낡은 버전으로 되돌리기 → 충돌", !staleRestore.ok && staleRestore.reason === "conflict", staleRestore);

    // ── ⑩ 인물 글 ─────────────────────────────────────────────────
    const person = (await prisma.person.create({ data: { userId: a, name: "[fixture] 담임 선생님", subjectType: "person", isDraft: false }, select: { id: true } })).id;
    const draft = (await prisma.person.create({ data: { userId: a, name: "[fixture] 초안 분", subjectType: "person", isDraft: true }, select: { id: true } })).id;
    const personB = (await prisma.person.create({ data: { userId: b, name: "[fixture] B 인물", subjectType: "person", isDraft: false }, select: { id: true } })).id;
    const p0 = await getPersonBody(a, person);
    check("⑩ 인물 글 없음 → 빈 문서 · 버전 0 · 사진 메모리 없음", p0?.version === 0 && p0.doc.blocks.length === 0 && p0.memoryId === null, p0);
    const pr1 = await savePersonBody(a, person, doc(P("엄하지만 따뜻한 분이었다.")), 0);
    const mem10 = await ensurePersonBodyMemory(a, person);
    const mem10b = await ensurePersonBodyMemory(a, person);
    const memRow = mem10 ? await prisma.userMemory.findUnique({ where: { id: mem10 }, select: { createdVia: true, userId: true } }) : null;
    const p1 = await getPersonBody(a, person);
    check("⑩ 저장 → 버전 1 · 사진 메모리(node_body) 한 번만 만들어 본문에 이음 · 버전 그대로",
      pr1.ok && pr1.version === 1 && !!mem10 && mem10 === mem10b && memRow?.createdVia === CREATED_VIA_NODE_BODY && memRow.userId === a && p1?.memoryId === mem10 && p1.version === 1,
      { pr1, mem10, mem10b, memRow, p1 });
    // 실제 사진 첨부(Storage) — attachPhotoToMemory 가 node_body 메모리를 받는다.
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const att = await attachPhotoToMemory(a, mem10!, { fileBuffer: png, mimeType: "image/png", caption: null });
    const attManual = await attachPhotoToMemory(a, (await prisma.userMemory.create({ data: { userId: a, year: 2000, title: "x", createdVia: "manual" }, select: { id: true } })).id, { fileBuffer: png, mimeType: "image/png", caption: null });
    const personPhoto = att.ok ? att.photoId : "";
    const storagePath = att.ok ? (await prisma.photo.findUnique({ where: { id: personPhoto }, select: { storagePath: true } }))?.storagePath ?? "" : "";
    check("⑩ 인물 글 사진 메모리에 실제 사진 첨부 허용 · 다른 종류(manual)는 그대로 거부", att.ok && !!storagePath && !attManual.ok && attManual.reason === "not_life_event", { att, attManual });
    const pr2 = await savePersonBody(a, person, doc(P("엄하지만 따뜻한 분이었다."), PH(personPhoto, "졸업 사진")), 1);
    const pr3 = await savePersonBody(a, person, doc(), pr2.ok ? pr2.version : 2);
    const [p3, prevs, phCap] = await Promise.all([getPersonBody(a, person), listRevisions(a, "PERSON", person), prisma.photo.findUnique({ where: { id: personPhoto }, select: { caption: true } })]);
    check("⑩ 사진 넣어 저장 · 비워 두고 저장도 됨(인물 글) · 판 2개(글만 → 글+사진) · 캡션 저장",
      pr2.ok && pr3.ok && p3?.doc.blocks.length === 0 && prevs.length === 2 && prevs[0].doc.blocks.some((x) => x.type === "photo") && phCap?.caption === "졸업 사진",
      { pr2, pr3, n: prevs.length, phCap });
    const [draftSave, draftMem, otherSave, bPersonView] = await Promise.all([
      savePersonBody(a, draft, doc(P("초안")), 0),
      ensurePersonBodyMemory(a, draft),
      savePersonBody(a, personB, doc(P("남의 인물")), 0),
      getPersonBody(a, personB),
    ]);
    check("⑩ 초안 인물·남의 인물 → 저장·사진 메모리·보기 막힘", !draftSave.ok && draftSave.reason === "not_found" && draftMem === null && !otherSave.ok && otherSave.reason === "not_found" && bPersonView === null,
      { draftSave, draftMem, otherSave });
    const pr4 = await savePersonBody(a, person, doc(P("다시 쓴 글.")), pr3.ok ? pr3.version : 3);

    // ── ⑪ 가족 룸·My Life 데이터 ─────────────────────────────────
    const room = await createRoom(a, "[fixture] 노드 본문 룸");
    const roomMems = (await listRoomMemories(room.id, a)) ?? [];
    check("⑪ 가족 룸 — 인물 글 사진 메모리(node_body)·이야기 브릿지 안 보임", !roomMems.some((m) => m.id === mem10 || m.id === st.memoryId), roomMems.map((m) => m.id));
    const d11 = await getMyLifeData(a);
    const s11 = d11.events.flatMap((e) => e.stories).find((s) => s.id === st.episodeId);
    const p11 = d11.people.find((p) => p.id === person);
    check("⑪ My Life — 소제목·사진 있는 이야기 richBody · 인물 글 평문 · 초안 인물 안 보임",
      pr4.ok && s11?.richBody === true && p11?.body === "다시 쓴 글." && !d11.people.some((p) => p.id === draft), { rich: s11?.richBody, body: p11?.body });

    // 남의 이야기 — b 가 a 의 이야기(st)를 손대려 해도 전부 막힘(가족 룸 V3 연결 전 확인 — 2026-11-08)
    const before11 = await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true, lifeEventId: true } });
    const bodyBefore11 = await getEpisodeBody(a, st.episodeId);
    const revA11 = (await listRevisions(a, "EPISODE", st.episodeId))[0];
    const [bEdit11, bBody11, bRestore11, bMove11, bDel11] = await Promise.all([
      updateEpisodeContent(b, st.episodeId, "남이 고친 글."),
      saveEpisodeBody(b, st.episodeId, doc(P("남이 쓴 글.")), bodyBefore11?.version ?? 0),
      revA11 ? restoreRevision(b, revA11.id, bodyBefore11?.version ?? 0) : Promise.resolve({ ok: false as const, reason: "not_found" as const }),
      moveEpisodeToLifeEvent(b, st.episodeId, evB),
      deleteEpisode(b, st.episodeId),
    ]);
    const after11 = await prisma.episode.findUnique({ where: { id: st.episodeId }, select: { content: true, lifeEventId: true } });
    const bodyAfter11 = await getEpisodeBody(a, st.episodeId);
    check("⑪ 남의 이야기 — 다른 사용자는 고치기·글 저장·되돌리기·옮기기·지우기 전부 막힘 · 이야기·글·시기 그대로",
      !(bEdit11 as { ok?: boolean }).ok && !bBody11.ok && !bRestore11.ok && !(bMove11 as { ok?: boolean }).ok && !(bDel11 as { ok?: boolean }).ok &&
        after11?.content === before11?.content && after11?.lifeEventId === before11?.lifeEventId && bodyAfter11?.version === bodyBefore11?.version,
      { bEdit11, bBody11, bRestore11, bMove11, bDel11 });

    // ── ⑫ 노드 삭제 정리 ─────────────────────────────────────────
    const delEp = await deleteEpisode(a, st.episodeId);
    const [nbEp, revEp] = await Promise.all([
      prisma.nodeBody.count({ where: { nodeType: "EPISODE", nodeId: st.episodeId } }),
      prisma.nodeBodyRevision.count({ where: { nodeType: "EPISODE", nodeId: st.episodeId } }),
    ]);
    check("⑫ 이야기 지우기 → 본문·이전 판 0(트리거)", delEp.ok && nbEp === 0 && revEp === 0, { delEp, nbEp, revEp });
    const delP = await deletePerson(a, person);
    const [nbP, revP, memP, phP, objP] = await Promise.all([
      prisma.nodeBody.count({ where: { nodeType: "PERSON", nodeId: person } }),
      prisma.nodeBodyRevision.count({ where: { nodeType: "PERSON", nodeId: person } }),
      prisma.userMemory.count({ where: { id: mem10! } }),
      prisma.photo.count({ where: { id: personPhoto } }),
      prisma.$queryRaw<{ c: number }[]>`SELECT COUNT(*)::int AS c FROM storage.objects WHERE bucket_id = 'photos' AND name = ${storagePath}`,
    ]);
    check("⑫ 인물 지우기 → 본문·이전 판·사진 메모리·사진 행·사진 파일 0", delP && nbP === 0 && revP === 0 && memP === 0 && phP === 0 && objP[0]?.c === 0, { delP, nbP, revP, memP, phP, objP });

    // ── ⑬ 탈퇴 ────────────────────────────────────────────────────
    const c = await makeUser(EMAIL_C, "[fixture] 노드 본문 C");
    const evC = await makeEvent(c, "고등학교 입학", 1971);
    const stC = (await createEpisodeBridge(c, evC, "C 이야기", 1972, "처음 글.", "", undefined, false, "STORY", true))!;
    await saveEpisodeBody(c, stC.episodeId, doc(P("고친 글.")), 0);
    const revC = await prisma.nodeBodyRevision.count({ where: { userId: c } });
    await deleteAccountTx(c);
    const [revC2, nbC2] = await Promise.all([prisma.nodeBodyRevision.count({ where: { userId: c } }), prisma.nodeBody.count({ where: { userId: c } })]);
    check("⑬ 탈퇴 → 이전 판·본문 0(Cascade)", revC === 1 && revC2 === 0 && nbC2 === 0, { revC, revC2, nbC2 });

    // ── ⑭ 남의 것 ────────────────────────────────────────────────
    const keep = await getEpisodeBody(a, otherMem.episodeId);
    await saveEpisodeBody(a, otherMem.episodeId, doc(P("A 가 고친 글.")), keep!.version);
    const revA = (await listRevisions(a, "EPISODE", otherMem.episodeId))[0];
    const [bSave, bRestore, bList, bView] = await Promise.all([
      saveEpisodeBody(b, otherMem.episodeId, doc(P("B 가 덮어쓰기")), 1),
      restoreRevision(b, revA.id, 1),
      listRevisions(b, "EPISODE", otherMem.episodeId),
      getEpisodeBody(b, otherMem.episodeId),
    ]);
    const stillA = await prisma.episode.findUnique({ where: { id: otherMem.episodeId }, select: { content: true } });
    check("⑭ 남의 이야기 — 저장·되돌리기·이전 판 목록·보기 막힘 · 본문 그대로",
      !bSave.ok && bSave.reason === "not_found" && !bRestore.ok && bRestore.reason === "not_found" && bList.length === 0 && bView === null && stillA?.content === "A 가 고친 글.",
      { bSave, bRestore, n: bList.length });

    // ── ⑮ 문구(2026-11-04 확정) ───────────────────────────────────
    const B = MY_LIFE_COPY.body;
    const editorSrc = fs.readFileSync("app/my-life/_body/BodyEditor.tsx", "utf8");
    const voiceSrc = fs.readFileSync("app/components/VoiceTextarea.tsx", "utf8");
    check("⑮ 빈 글 오류 = 실제 [이 노드 지우기] · 패널 버튼 = 글 고치기 화면 이름([글 고치기]) · 사진 안내 2줄 18px · 말로 적기 문구 7개는 문구 파일에서만 · 읽어 주기 이름·안내 속 버튼 이름 = 실제 버튼",
      B.errEmpty.includes(`[${MY_LIFE_COPY.edit.deleteNode}]`) && MY_LIFE_COPY.editBody === B.editTitle && B.richNote.includes(`[${B.editTitle}]`) &&
        editorSrc.includes('text-lg text-ink-soft">{C.uploadHint}') && editorSrc.includes('text-lg text-ink-soft">{C.removeNote}') &&
        Object.values(VOICE_COPY).every((t) => !voiceSrc.includes(t)) &&
        Object.keys(VOICE_COPY).every((k) => voiceSrc.includes(`VOICE_COPY.${k}`)) &&
        VOICE_COPY.startAria === VOICE_COPY.start && VOICE_COPY.listening.includes(`[${VOICE_COPY.stop}]`), // 읽어 주기 이름 = 버튼 이름 · 안내의 버튼 이름 = 실제 버튼(2026-11-04 확정)
      { errEmpty: B.errEmpty, editBody: MY_LIFE_COPY.editBody });

    // ── ⑯ 충돌 → 고치던 글 = 이전 판("저장되지 않은 글") → 그 판으로 되돌리기(2026-11-04) ─────────────
    const st16 = (await createEpisodeBridge(a, ev, "충돌", 1974, "처음 글.", "", undefined, false, "STORY", true))!;
    const ph16 = (await fakePhoto(a, st16.memoryId)).id;
    const other16 = await saveEpisodeBody(a, st16.episodeId, doc(P("다른 창 글.")), 0); // 다른 창에서 먼저 저장 → 버전 1
    const c16 = await saveEpisodeBody(a, st16.episodeId, doc(H("고치던"), P("고치던 글."), PH(ph16, "고치던 캡션"), PH(phOther), PH("no-such-photo")), 0);
    const [v16, revs16, cap16] = await Promise.all([
      getEpisodeBody(a, st16.episodeId),
      listRevisions(a, "EPISODE", st16.episodeId),
      prisma.photo.findUnique({ where: { id: ph16 }, select: { caption: true } }),
    ]);
    const unsaved16 = revs16.filter((r) => r.unsaved);
    check("⑯ 충돌 → 본문·버전 그대로 · 고치던 글 = 이전 판 1개(저장되지 않은 글) · 다른 이야기·없는 사진 칸만 빠지고 글은 남음 · 캡션은 판에만",
      other16.ok && !c16.ok && c16.reason === "conflict" && c16.kept && v16?.version === 1 && v16.doc.blocks.length === 1 &&
        revs16[0].unsaved && unsaved16.length === 1 && revs16[0].plainText === "고치던\n\n고치던 글." &&
        JSON.stringify(revs16[0].doc.blocks) === JSON.stringify([H("고치던"), P("고치던 글."), PH(ph16, "고치던 캡션")]) && cap16?.caption === null &&
        revs16.filter((r) => !r.unsaved).length === 1,
      { c16, v: v16?.version, revs: revs16.map((r) => [r.plainText, r.unsaved]), cap16 });
    const again16 = await saveEpisodeBody(a, st16.episodeId, doc(H("고치던"), P("고치던 글."), PH(ph16, "고치던 캡션")), 0);
    const badPhoto16 = await saveEpisodeBody(a, st16.episodeId, doc(P("남의 사진이 섞인 글."), PH(phB)), 0);
    const foreign16 = await saveEpisodeBody(b, st16.episodeId, doc(P("남이 쓴 글.")), 0);
    const keepForeign = await keepUnsavedDraft(b, "EPISODE", st16.episodeId, { v: 1, blocks: [{ type: "paragraph", text: "남의 판." }] });
    const keepEmpty = await keepUnsavedDraft(a, "EPISODE", st16.episodeId, { v: 1, blocks: [] });
    const revs16b = await listRevisions(a, "EPISODE", st16.episodeId);
    check("⑯ 같은 글로 다시 [저장] → 판 하나 그대로 · 남의 사진 섞임 → bad_photo(판 없음) · 남의 이야기 → not_found(판 없음) · 남·빈 글 남기기 → false",
      !again16.ok && again16.reason === "conflict" && again16.kept && !badPhoto16.ok && badPhoto16.reason === "bad_photo" &&
        !foreign16.ok && foreign16.reason === "not_found" && keepForeign === false && keepEmpty === false && revs16b.length === revs16.length,
      { again16, badPhoto16, foreign16, keepForeign, keepEmpty, n: revs16b.length });
    const back16 = await restoreRevision(a, revs16[0].id, 1);
    const [v16c, revs16c, cap16c] = await Promise.all([
      getEpisodeBody(a, st16.episodeId),
      listRevisions(a, "EPISODE", st16.episodeId),
      prisma.photo.findUnique({ where: { id: ph16 }, select: { caption: true } }),
    ]);
    const staleBack16 = await restoreRevision(a, revs16[0].id, 1);
    const n16d = (await listRevisions(a, "EPISODE", st16.episodeId)).length;
    check("⑯ 저장되지 않은 글로 되돌리기 → 본문 = 고치던 글(소제목·사진·캡션) · 다른 창 글은 보통 판으로 · 되돌리기 충돌은 판을 더 만들지 않음",
      back16.ok && v16c?.version === 2 && JSON.stringify(v16c.doc.blocks) === JSON.stringify([H("고치던"), P("고치던 글."), PH(ph16)]) && cap16c?.caption === "고치던 캡션" &&
        revs16c[0].plainText === "다른 창 글." && !revs16c[0].unsaved && revs16c.length === revs16.length + 1 &&
        !staleBack16.ok && staleBack16.reason === "conflict" && !staleBack16.kept && n16d === revs16c.length,
      { back16, blocks: v16c?.doc.blocks, cap16c, first: revs16c[0], staleBack16, n16d });
    const per16 = (await prisma.person.create({ data: { userId: a, name: "[fixture] 충돌 인물", subjectType: "person", isDraft: false }, select: { id: true } })).id;
    const perOther = await savePersonBody(a, per16, doc(P("다른 창 인물 글.")), 0);
    const perC = await savePersonBody(a, per16, doc(P("고치던 인물 글.")), 0);
    const perEmpty = await savePersonBody(a, per16, doc(), 0);
    const perRevs = await listRevisions(a, "PERSON", per16);
    check("⑯ 인물 글도 같은 처리 — 충돌 → 저장되지 않은 글 판 · 빈 글 충돌 → 남길 것 없음(kept=false)",
      perOther.ok && !perC.ok && perC.reason === "conflict" && perC.kept && !perEmpty.ok && perEmpty.reason === "conflict" && !perEmpty.kept &&
        perRevs.length === 1 && perRevs[0].unsaved && perRevs[0].plainText === "고치던 인물 글.",
      { perC, perEmpty, perRevs: perRevs.map((r) => [r.plainText, r.unsaved]) });

    // ── ⑰ 혼자 두 화면 — 패널 평문 저장 · 열어 둔 글 고치기 화면(⑦ 계열, 2026-11-04) ─────────────────
    const st17 = (await createEpisodeBridge(a, ev, "두 화면", 1975, "처음.", "", undefined, false, "STORY", true))!;
    const s17 = (await getMyLifeData(a)).events.flatMap((e) => e.stories).find((s) => s.id === st17.episodeId)!;
    const open17 = (await getEpisodeBody(a, st17.episodeId))!.version; // 글 고치기 화면을 먼저 열어 둠(버전 0)
    const p17 = await updateEpisodeContent(a, st17.episodeId, "패널에서 고친 글.", { version: s17.bodyVersion, content: s17.content });
    const e17 = await saveEpisodeBody(a, st17.episodeId, doc(P("화면에서 고친 글.")), open17);
    const p17b = await updateEpisodeContent(a, st17.episodeId, "다른 패널 글.", { version: s17.bodyVersion, content: s17.content }); // 새로 안 읽은 패널
    const after17 = await prisma.episode.findUnique({ where: { id: st17.episodeId }, select: { content: true } });
    const revs17 = await listRevisions(a, "EPISODE", st17.episodeId);
    check("⑰ 본문 없는 이야기 — 패널 저장 → 본문 버전 1 · 먼저 열어 둔 화면 저장 → 충돌·고치던 글 판 · 새로 안 읽은 패널 → 충돌·판 · 본문 = 패널 글",
      s17.bodyVersion === 0 && open17 === 0 && p17.ok && p17.version === 1 && !e17.ok && e17.reason === "conflict" && e17.kept &&
        !p17b.ok && "conflict" in p17b && p17b.kept && after17?.content === "패널에서 고친 글." &&
        JSON.stringify(revs17.map((r) => [r.plainText, r.unsaved])) === JSON.stringify([["다른 패널 글.", true], ["화면에서 고친 글.", true], ["처음.", false]]),
      { p17, e17, p17b, after17, revs: revs17.map((r) => [r.plainText, r.unsaved]) });
    const p17c = p17.ok ? await updateEpisodeContent(a, st17.episodeId, "패널 두 번째 글.", { version: p17.version, content: "패널에서 고친 글." }) : null;
    const screen17 = (await getEpisodeBody(a, st17.episodeId))!.version; // 지금 연 화면
    const e17b = await saveEpisodeBody(a, st17.episodeId, doc(P("화면 두 번째 글.")), screen17);
    const p17d = p17c?.ok ? await updateEpisodeContent(a, st17.episodeId, "그사이 패널 글.", { version: p17c.version, content: "패널 두 번째 글." }) : null;
    const top17 = (await listRevisions(a, "EPISODE", st17.episodeId))[0];
    check("⑰ 저장 뒤 받은 버전으로 다시 패널 저장 → 됨 · 그 뒤 연 화면 저장 → 됨 · 그사이 패널(낡은 버전) → 충돌·판",
      !!p17c?.ok && p17c.version === 2 && e17b.ok && e17b.version === 3 && !!p17d && !p17d.ok && "conflict" in p17d && p17d.kept &&
        top17.plainText === "그사이 패널 글." && top17.unsaved,
      { p17c, e17b, p17d, top17: [top17?.plainText, top17?.unsaved] });

    // ── ⑱ 20판 한도 경계 — 저장되지 않은 글도 같은 한도(2026-11-04) ─────────────────────────────────
    const st18 = (await createEpisodeBridge(a, ev, "한도", 1976, "글 0.", "", undefined, false, "STORY", true))!;
    let ver18 = 0;
    for (let i = 1; i < REVISIONS_KEPT; i++) {
      const r = await saveEpisodeBody(a, st18.episodeId, doc(P(`글 ${i}.`)), ver18);
      if (r.ok) ver18 = r.version;
    }
    const revs18a = await listRevisions(a, "EPISODE", st18.episodeId);
    const c18a = await saveEpisodeBody(a, st18.episodeId, doc(P("한도 앞 고치던 글.")), ver18 - 1);
    const revs18b = await listRevisions(a, "EPISODE", st18.episodeId);
    const c18b = await saveEpisodeBody(a, st18.episodeId, doc(P("한도 넘는 고치던 글.")), ver18 - 1);
    const revs18c = await listRevisions(a, "EPISODE", st18.episodeId);
    const oldest18 = revs18a.at(-1)!;
    check(`⑱ 판 ${REVISIONS_KEPT - 1}개 + 충돌 → ${REVISIONS_KEPT}개(지운 것 없음) · 한 번 더 → ${REVISIONS_KEPT}개 그대로(가장 오래된 판 지움) · 최신 = 저장되지 않은 글`,
      revs18a.length === REVISIONS_KEPT - 1 && !c18a.ok && c18a.reason === "conflict" && c18a.kept &&
        revs18b.length === REVISIONS_KEPT && revs18b.some((r) => r.id === oldest18.id) && revs18b[0].unsaved &&
        !c18b.ok && c18b.reason === "conflict" && c18b.kept && revs18c.length === REVISIONS_KEPT && !revs18c.some((r) => r.id === oldest18.id) &&
        revs18c[0].unsaved && revs18c[0].plainText === "한도 넘는 고치던 글." && revs18c[1].plainText === "한도 앞 고치던 글.",
      { a: revs18a.length, b: revs18b.length, c: revs18c.length, first: revs18c[0]?.plainText });
  } finally {
    await removeFixtures();
    const left = await prisma.user.count({ where: { email: { in: [EMAIL_A, EMAIL_B, EMAIL_C] } } });
    check("정리 — 픽스처 계정 0", left === 0, left);
    await prisma.$disconnect();
  }
  console.log(failed === 0 ? `ALL PASS (${count})` : `FAIL ${failed}/${count}`);
  if (failed > 0) process.exitCode = 1;
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
