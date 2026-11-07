// 노드 본문(블로그식 글) — 이야기·인물. 보기·저장·이전 판·되돌리기를 이 한 곳에서(auth 없음 — 앱은 app/actions/node-body.ts
// 래퍼, 회귀 db/test-node-body.ts 는 이 함수를 그대로 부른다).
// 설계: docs/phase/node-graph-self.md §1.8·2b.2 · docs/phase/my-life-restructure.md §16.4·§19.
//
// - 문서 = { v: 1, blocks: [문단·소제목·사진] }. 평문 = 문단·소제목을 빈 줄로 이은 것(사진 캡션은 넣지 않음 — Q27).
// - 이야기: 평문이 원본(Episode.content·브릿지 UserMemory.content). 문서는 저장된 평문과 같을 때만 보인다 — 다른 경로로
//   평문이 고쳐지면 평문 문단으로 보이고, 문서는 다음 저장 때 덮인다(평문이 언제나 진실).
// - 인물: 평문은 NodeBody.plainText 한 곳(Person.memo 와 무관). 본문 사진은 createdVia "node_body" 메모리.
// - 사진 캡션은 Photo.caption 한 곳 — 문서에는 넣지 않는다(D3: 이전 판으로 되돌려도 캡션은 지금 값).
// - 이전 판(NodeBodyRevision): 본문이 실제로 바뀌는 저장마다 바뀌기 직전 판 1행, 노드마다 최근 20판(D1).
// - 충돌로 저장이 거부되면(2026-11-04) 본문은 그대로 두고 고치던 글을 이전 판 1개("저장되지 않은 글")로 — keepUnsavedDraft.
//   글 고치기 화면 저장(saveBody)과 My Life 패널 평문 저장(lib/episode updateEpisodeContent) 둘 다 이 함수. 20판 한도 그대로.

import { prisma } from "./db";
import type { Prisma } from "./generated/prisma/client";
import {
  BODY_LIMITS,
  CREATED_VIA_NODE_BODY,
  docFromPlain,
  docOrNull,
  isUnsavedRevision,
  layoutKey,
  markUnsaved,
  parseDoc,
  plainOf,
  REVISIONS_KEPT,
  shownDoc,
  withoutCaptions,
  type BodyDoc,
  type BodyNodeType,
  type SaveBodyResult,
} from "./node-body-doc";

export { BODY_LIMITS, CREATED_VIA_NODE_BODY, REVISIONS_KEPT, type BodyDoc, type BodyNodeType, type SaveBodyResult };

type Tx = Prisma.TransactionClient;
const asJson = (doc: BodyDoc) => doc as unknown as Prisma.InputJsonValue;

const nodeKey = (nodeType: BodyNodeType, nodeId: string) => ({ nodeType_nodeId: { nodeType, nodeId } });

// 바뀌기 직전 판 1행(unsaved = 저장되지 않은 글) + 노드마다 최근 REVISIONS_KEPT 판만.
export async function keepRevision(tx: Tx, userId: string, nodeType: BodyNodeType, nodeId: string, plainText: string, doc: BodyDoc | null, unsaved = false) {
  const stored = doc && unsaved ? (markUnsaved(doc) as unknown as Prisma.InputJsonValue) : doc ? asJson(doc) : null;
  await tx.nodeBodyRevision.create({ data: { userId, nodeType, nodeId, plainText, ...(stored ? { doc: stored } : {}) } });
  const old = await tx.nodeBodyRevision.findMany({
    where: { nodeType, nodeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: REVISIONS_KEPT,
    select: { id: true },
  });
  if (old.length > 0) await tx.nodeBodyRevision.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

const EPISODE_SELECT = { id: true, memoryId: true, content: true, memory: { select: { content: true } } } as const;
type EpisodeRow = { id: string; memoryId: string; content: string; memory: { content: string | null } };

// 이야기 평문 쓰기 — 평문 [이야기 고치기](lib/episode updateEpisodeContent)·블로그 저장·되돌리기 공용(같은 트랜잭션).
// 본문이 실제로 바뀌면 바뀌기 전 판을 남기고, Episode.content·브릿지 content 갱신, 브릿지 본문이 바뀌면 다듬기 3필드 초기화(Q9).
// nextDoc = 블로그 저장의 문서(평문 저장이면 null — 평문만 비교).
export async function writeEpisodePlainTx(tx: Tx, userId: string, ep: EpisodeRow, next: string, nextDoc: BodyDoc | null): Promise<void> {
  const body = await tx.nodeBody.findUnique({ where: nodeKey("EPISODE", ep.id), select: { doc: true, plainText: true } });
  const prevDoc = body && body.plainText === ep.content ? docOrNull(body.doc) : null;
  const changed = ep.content !== next || (nextDoc !== null && layoutKey(prevDoc ?? docFromPlain(ep.content)) !== layoutKey(nextDoc));
  if (changed && ep.content.trim()) await keepRevision(tx, userId, "EPISODE", ep.id, ep.content, prevDoc);
  // 평문 저장이 본문을 바꾸면 블로그 문서 버전도 올림 — 그 사이 열어 둔 블로그 편집이 덮어쓰지 않고 충돌로 알게.
  // 본문 행이 없던 이야기면 평문 문단으로 만들고 버전 1(2026-11-04 — 없으면 버전이 0 그대로라 열어 둔 편집이 충돌을 모름).
  if (nextDoc === null && changed) {
    if (body) await tx.nodeBody.update({ where: nodeKey("EPISODE", ep.id), data: { version: { increment: 1 } } });
    else await tx.nodeBody.create({ data: { userId, nodeType: "EPISODE", nodeId: ep.id, doc: asJson(docFromPlain(next)), plainText: next, memoryId: ep.memoryId, version: 1 } });
  }
  if (ep.content !== next) await tx.episode.update({ where: { id: ep.id }, data: { content: next } });
  if (ep.memory.content !== next) {
    await tx.userMemory.update({
      where: { id: ep.memoryId },
      data: { content: next, refinedText: null, refinedAt: null, displayRefined: false },
    });
  }
}

const PERSON_WHERE = (userId: string, personId: string) => ({ id: personId, userId, subjectType: "person", isDraft: false });
// 사용자 항목(custom-graph 2단계 — Q78): 글은 항목(ITEM)만(카테고리·묶음은 글 없음). 인물 글과 같은 길(평문 = NodeBody 한 곳, 사진 = node_body 메모리).
const ITEM_WHERE = (userId: string, itemId: string) => ({ id: itemId, userId, kind: "ITEM" });
type NoteNodeType = "PERSON" | "CUSTOM";
async function ownedNote(db: Tx | typeof prisma, userId: string, nodeType: NoteNodeType, id: string): Promise<{ id: string; name: string } | null> {
  return nodeType === "PERSON"
    ? db.person.findFirst({ where: PERSON_WHERE(userId, id), select: { id: true, name: true } })
    : db.customNode.findFirst({ where: ITEM_WHERE(userId, id), select: { id: true, name: true } });
}

// 충돌로 저장이 거부된 글을 이전 판 1개("저장되지 않은 글")로 — 본문·버전은 그대로. 소유 확인은 보통 저장과 같은 조건(이야기 =
// 내 메모리의 이야기, 인물 = 내 확정 인물). 사진 블록은 부르는 쪽이 보통 저장과 같은 검사로 거른 문서(남의 사진이면 그 전에
// bad_photo, 지워졌거나 이 글 메모리를 떠난 사진은 그 칸만 빠짐 — 글은 남김). 캡션은 고치던 값 그대로 담는다(되돌리면 그 캡션).
// 남길 것이 없거나(빈 글) 실패하면 false — 화면은 다시 불러오기 전에 "고치던 글이 사라져요" 확인을 띄운다.
export async function keepUnsavedDraft(userId: string, nodeType: BodyNodeType, nodeId: string, doc: BodyDoc): Promise<boolean> {
  if (doc.blocks.length === 0) return false;
  try {
    return await prisma.$transaction(async (tx) => {
      const owned =
        nodeType === "EPISODE"
          ? await tx.episode.findFirst({ where: { id: nodeId, memory: { userId } }, select: { id: true } })
          : await ownedNote(tx, userId, nodeType, nodeId);
      if (!owned) return false;
      // 충돌 뒤 같은 글로 [저장]을 또 눌러도 한 번만(가장 최근 판이 같은 "저장되지 않은 글"이면 그대로).
      const last = await tx.nodeBodyRevision.findFirst({ where: { nodeType, nodeId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { doc: true } });
      if (last && isUnsavedRevision(last.doc) && JSON.stringify(docOrNull(last.doc)?.blocks) === JSON.stringify(doc.blocks)) return true;
      await keepRevision(tx, userId, nodeType, nodeId, plainOf(doc), doc, true);
      return true;
    });
  } catch (e) {
    console.error("[node-body] keep unsaved draft", e);
    return false;
  }
}

class Conflict extends Error {}

// 저장 공용 — 사진 확인 → (트랜잭션) 버전 확인 → 판 남기기·원본 갱신(write) → 문서 저장(버전 +1) → 캡션.
async function saveBody(o: {
  userId: string;
  nodeType: BodyNodeType;
  nodeId: string;
  memoryId: string | null; // 본문 사진이 붙는 메모리(이 메모리 사진만 넣을 수 있음)
  doc: BodyDoc;
  baseVersion: number; // 화면이 읽은 버전(본문이 없으면 0) — 그새 다른 곳에서 저장했으면 충돌
  allowEmpty: boolean;
  keepOnConflict: boolean; // 충돌 때 고치던 글을 이전 판으로(되돌리기는 false — 그 판이 이미 있음)
  write: (tx: Tx, prev: { doc: unknown; plainText: string } | null, doc: BodyDoc, plain: string) => Promise<void>;
}): Promise<SaveBodyResult> {
  const ids = o.doc.blocks.flatMap((b) => (b.type === "photo" ? [b.photoId] : []));
  const photos = ids.length > 0 ? await prisma.photo.findMany({ where: { id: { in: ids } }, select: { id: true, userId: true, memoryId: true, caption: true } }) : [];
  if (photos.some((p) => p.userId !== o.userId)) return { ok: false, reason: "bad_photo" };
  // 지워진 사진·이 글의 메모리를 떠난 사진(사진 화면에서 빼기 등) 블록은 뺀다.
  const here = new Map(photos.filter((p) => p.memoryId === o.memoryId).map((p) => [p.id, p]));
  const doc: BodyDoc = { v: 1, blocks: o.doc.blocks.filter((b) => b.type !== "photo" || here.has(b.photoId)) };
  const plain = plainOf(doc);
  if (!plain && !o.allowEmpty) return { ok: false, reason: "empty" };
  const stored = withoutCaptions(doc);
  try {
    return await prisma.$transaction(async (tx) => {
      const body = await tx.nodeBody.findUnique({ where: nodeKey(o.nodeType, o.nodeId), select: { id: true, version: true, doc: true, plainText: true } });
      if ((body?.version ?? 0) !== o.baseVersion) throw new Conflict();
      await o.write(tx, body, stored, plain);
      if (body) {
        const r = await tx.nodeBody.updateMany({
          where: { id: body.id, version: o.baseVersion },
          data: { doc: asJson(stored), plainText: plain, memoryId: o.memoryId, version: { increment: 1 } },
        });
        if (r.count === 0) throw new Conflict();
      } else {
        await tx.nodeBody.create({ data: { userId: o.userId, nodeType: o.nodeType, nodeId: o.nodeId, doc: asJson(stored), plainText: plain, memoryId: o.memoryId, version: 1 } });
      }
      for (const b of doc.blocks) {
        if (b.type !== "photo" || b.caption === undefined) continue;
        const caption = b.caption || null;
        if (here.get(b.photoId)!.caption !== caption) await tx.photo.update({ where: { id: b.photoId }, data: { caption } });
      }
      return { ok: true as const, version: o.baseVersion + 1 };
    });
  } catch (e) {
    if (e instanceof Conflict || (e as { code?: string }).code === "P2002") {
      const kept = o.keepOnConflict ? await keepUnsavedDraft(o.userId, o.nodeType, o.nodeId, doc) : false;
      return { ok: false, reason: "conflict", kept };
    }
    throw e;
  }
}

type SaveOpts = { keepOnConflict?: boolean };

export async function saveEpisodeBody(userId: string, episodeId: string, raw: unknown, baseVersion: number, opts: SaveOpts = {}): Promise<SaveBodyResult> {
  const parsed = parseDoc(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  const ep = await prisma.episode.findFirst({ where: { id: episodeId, memory: { userId } }, select: EPISODE_SELECT });
  if (!ep) return { ok: false, reason: "not_found" };
  return saveBody({
    userId,
    nodeType: "EPISODE",
    nodeId: ep.id,
    memoryId: ep.memoryId,
    doc: parsed.doc,
    baseVersion,
    allowEmpty: false, // 이야기를 지우려면 지우기로
    keepOnConflict: opts.keepOnConflict ?? true,
    write: (tx, _prev, doc, plain) => writeEpisodePlainTx(tx, userId, ep, plain, doc),
  });
}

export async function savePersonBody(userId: string, personId: string, raw: unknown, baseVersion: number, opts: SaveOpts = {}): Promise<SaveBodyResult> {
  return saveNoteBody(userId, "PERSON", personId, raw, baseVersion, opts);
}

export async function saveItemBody(userId: string, itemId: string, raw: unknown, baseVersion: number, opts: SaveOpts = {}): Promise<SaveBodyResult> {
  return saveNoteBody(userId, "CUSTOM", itemId, raw, baseVersion, opts);
}

// 인물·사용자 항목 글 — 노드 자체는 그대로라 비워 둘 수 있음. 바뀌기 전 판은 모양(문단·소제목·사진 자리)이 바뀔 때 남긴다.
async function saveNoteBody(userId: string, nodeType: NoteNodeType, id: string, raw: unknown, baseVersion: number, opts: SaveOpts): Promise<SaveBodyResult> {
  const parsed = parseDoc(raw);
  if (!parsed.ok) return { ok: false, reason: parsed.error };
  const person = await ownedNote(prisma, userId, nodeType, id);
  if (!person) return { ok: false, reason: "not_found" };
  const existing = await prisma.nodeBody.findUnique({ where: nodeKey(nodeType, person.id), select: { memoryId: true } });
  return saveBody({
    userId,
    nodeType,
    nodeId: person.id,
    memoryId: existing?.memoryId ?? null,
    doc: parsed.doc,
    baseVersion,
    allowEmpty: true, // 인물 글은 비워 둘 수 있음(인물 자체는 그대로)
    keepOnConflict: opts.keepOnConflict ?? true,
    write: async (tx, prev, doc) => {
      const prevDoc = prev ? (docOrNull(prev.doc) ?? docFromPlain(prev.plainText)) : null;
      if (prev && prevDoc && prevDoc.blocks.length > 0 && layoutKey(prevDoc) !== layoutKey(doc)) {
        await keepRevision(tx, userId, nodeType, person.id, prev.plainText, prevDoc);
      }
    },
  });
}

// 인물 글에 사진을 올리기 전 — 사진이 붙을 메모리(node_body)를 만든다(없을 때만). 본문이 아직 없으면 빈 본문(버전 0)도 같이 —
// 노드 삭제 트리거가 본문과 이 메모리를 함께 지우게(20261030000000_node_graph 트리거 ②).
export async function ensurePersonBodyMemory(userId: string, personId: string): Promise<string | null> {
  return ensureNoteBodyMemory(userId, "PERSON", personId);
}

export async function ensureItemBodyMemory(userId: string, itemId: string): Promise<string | null> {
  return ensureNoteBodyMemory(userId, "CUSTOM", itemId);
}

async function ensureNoteBodyMemory(userId: string, nodeType: NoteNodeType, id: string): Promise<string | null> {
  const person = await ownedNote(prisma, userId, nodeType, id);
  if (!person) return null;
  const attempt = () =>
    prisma.$transaction(async (tx) => {
      const body = await tx.nodeBody.findUnique({ where: nodeKey(nodeType, person.id), select: { id: true, memoryId: true } });
      if (body?.memoryId) return body.memoryId;
      const m = await tx.userMemory.create({
        data: { userId, year: new Date().getFullYear(), title: "", createdVia: CREATED_VIA_NODE_BODY },
        select: { id: true },
      });
      if (body) await tx.nodeBody.update({ where: { id: body.id }, data: { memoryId: m.id } });
      else await tx.nodeBody.create({ data: { userId, nodeType, nodeId: person.id, doc: asJson({ v: 1, blocks: [] }), plainText: "", memoryId: m.id, version: 0 } });
      return m.id;
    });
  try {
    return await attempt();
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    return attempt(); // 같은 때 두 번 눌러 본문이 먼저 생긴 경우 — 다시 읽으면 그 메모리
  }
}

export type BodyPhoto = { id: string; storagePath: string; caption: string | null };
export type BodyView = { nodeId: string; memoryId: string | null; doc: BodyDoc; version: number; photos: BodyPhoto[]; revisions: number };

const PHOTO_SELECT = { id: true, storagePath: true, caption: true } as const;

// 이야기 — 제목(브릿지 제목 칸)·평문도 같이(화면 제목 = lib/story-title displayTitle).
export async function getEpisodeBody(userId: string, episodeId: string): Promise<(BodyView & { title: string | null; content: string }) | null> {
  const ep = await prisma.episode.findFirst({
    where: { id: episodeId, memory: { userId } },
    select: { id: true, memoryId: true, content: true, memory: { select: { title: true, photos: { select: PHOTO_SELECT, orderBy: { createdAt: "asc" } } } } },
  });
  if (!ep) return null;
  const [body, revisions] = await Promise.all([
    prisma.nodeBody.findUnique({ where: nodeKey("EPISODE", ep.id), select: { doc: true, plainText: true, version: true } }),
    prisma.nodeBodyRevision.count({ where: { nodeType: "EPISODE", nodeId: ep.id } }),
  ]);
  return {
    nodeId: ep.id,
    memoryId: ep.memoryId,
    doc: shownDoc(body, ep.content),
    version: body?.version ?? 0,
    photos: ep.memory.photos,
    revisions,
    title: ep.memory.title,
    content: ep.content,
  };
}

export async function getPersonBody(userId: string, personId: string): Promise<(BodyView & { name: string; relation: string | null }) | null> {
  const person = await prisma.person.findFirst({ where: PERSON_WHERE(userId, personId), select: { id: true, name: true, relation: true } });
  if (!person) return null;
  const [body, revisions] = await Promise.all([
    prisma.nodeBody.findUnique({
      where: nodeKey("PERSON", person.id),
      select: { doc: true, plainText: true, version: true, memoryId: true, memory: { select: { photos: { select: PHOTO_SELECT, orderBy: { createdAt: "asc" } } } } },
    }),
    prisma.nodeBodyRevision.count({ where: { nodeType: "PERSON", nodeId: person.id } }),
  ]);
  return {
    nodeId: person.id,
    name: person.name,
    relation: person.relation,
    memoryId: body?.memoryId ?? null,
    doc: body ? shownDoc(body, body.plainText) : { v: 1, blocks: [] },
    version: body?.version ?? 0,
    photos: body?.memory?.photos ?? [],
    revisions,
  };
}

// 사용자 항목 글(custom-graph 2단계 — Q78) — 인물 글과 같은 모양(이름만).
export async function getItemBody(userId: string, itemId: string): Promise<(BodyView & { name: string }) | null> {
  const item = await ownedNote(prisma, userId, "CUSTOM", itemId);
  if (!item) return null;
  const [body, revisions] = await Promise.all([
    prisma.nodeBody.findUnique({
      where: nodeKey("CUSTOM", item.id),
      select: { doc: true, plainText: true, version: true, memoryId: true, memory: { select: { photos: { select: PHOTO_SELECT, orderBy: { createdAt: "asc" } } } } },
    }),
    prisma.nodeBodyRevision.count({ where: { nodeType: "CUSTOM", nodeId: item.id } }),
  ]);
  return {
    nodeId: item.id,
    name: item.name,
    memoryId: body?.memoryId ?? null,
    doc: body ? shownDoc(body, body.plainText) : { v: 1, blocks: [] },
    version: body?.version ?? 0,
    photos: body?.memory?.photos ?? [],
    revisions,
  };
}

export type Revision = { id: string; createdAt: Date; plainText: string; doc: BodyDoc; unsaved: boolean };

export async function listRevisions(userId: string, nodeType: BodyNodeType, nodeId: string): Promise<Revision[]> {
  const rows = await prisma.nodeBodyRevision.findMany({
    where: { userId, nodeType, nodeId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, createdAt: true, plainText: true, doc: true },
  });
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    plainText: r.plainText,
    doc: docOrNull(r.doc) ?? docFromPlain(r.plainText),
    unsaved: isUnsavedRevision(r.doc),
  }));
}

// 이전 판으로 되돌리기 = 그 판의 문서로 보통 저장(지금 판이 이전 판으로 남아 다시 되돌릴 수 있음). 캡션은 지금 값(D3 — 판에 없음).
export async function restoreRevision(
  userId: string,
  revisionId: string,
  baseVersion: number,
): Promise<SaveBodyResult & { nodeType?: BodyNodeType; nodeId?: string }> {
  const rev = await prisma.nodeBodyRevision.findFirst({ where: { id: revisionId, userId }, select: { nodeType: true, nodeId: true, doc: true, plainText: true } });
  if (!rev || (rev.nodeType !== "EPISODE" && rev.nodeType !== "PERSON" && rev.nodeType !== "CUSTOM")) return { ok: false, reason: "not_found" };
  const doc = docOrNull(rev.doc) ?? docFromPlain(rev.plainText);
  // 되돌리기가 충돌하면 그 판은 이미 목록에 있으니 다시 남기지 않는다.
  const opts = { keepOnConflict: false };
  const r =
    rev.nodeType === "EPISODE"
      ? await saveEpisodeBody(userId, rev.nodeId, doc, baseVersion, opts)
      : await saveNoteBody(userId, rev.nodeType, rev.nodeId, doc, baseVersion, opts);
  return { ...r, nodeType: rev.nodeType, nodeId: rev.nodeId };
}
