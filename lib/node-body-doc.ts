// 노드 본문 문서 형식·검사·표시 규칙 — 순수 모듈(클라이언트 편집기도 씀, prisma 없음). 저장·판 = lib/node-body.ts.
// 설계: docs/phase/node-graph-self.md §1.8·2b.2 · docs/phase/my-life-restructure.md §19.

export const CREATED_VIA_NODE_BODY = "node_body";
// 상한(Q22) — 캡션은 사진 화면·사진 올리기와 같은 200자(같은 Photo.caption 칸이라 한쪽에서 적은 캡션이 다른 쪽 저장을 막지 않게).
export const BODY_LIMITS = { blocks: 60, paragraph: 3000, heading: 40, caption: 200 } as const;
export const REVISIONS_KEPT = 20;

export type BodyBlock =
  | { type: "paragraph"; text: string }
  | { type: "heading"; text: string }
  | { type: "photo"; photoId: string; caption?: string }; // caption 없음 = 지금 캡션 그대로
export type BodyDoc = { v: 1; blocks: BodyBlock[] };
export type BodyNodeType = "EPISODE" | "PERSON";

// 평문 → 문단(빈 줄 기준).
export function paragraphsOf(plain: string): string[] {
  return plain
    .replace(/\r\n/g, "\n")
    .split(/\n[ \t]*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function docFromPlain(plain: string): BodyDoc {
  return { v: 1, blocks: paragraphsOf(plain).map((text) => ({ type: "paragraph" as const, text })) };
}

export function plainOf(doc: BodyDoc): string {
  return doc.blocks.flatMap((b) => (b.type === "photo" ? [] : [b.text])).join("\n\n");
}

// 소제목·사진이 있는 글(평문 칸으로 고치면 그 자리가 사라지는 글).
export function isRichDoc(doc: BodyDoc): boolean {
  return doc.blocks.some((b) => b.type !== "paragraph");
}

export type DocError = "invalid" | "too_long";

// 문서 검사 — 종류 3개만, 상한, 빈 문단·소제목은 뺌, 같은 사진은 한 번만.
export function parseDoc(raw: unknown): { ok: true; doc: BodyDoc } | { ok: false; error: DocError } {
  const invalid = { ok: false as const, error: "invalid" as const };
  const tooLong = { ok: false as const, error: "too_long" as const };
  if (!raw || typeof raw !== "object") return invalid;
  const r = raw as { v?: unknown; blocks?: unknown };
  if (r.v !== 1 || !Array.isArray(r.blocks)) return invalid;
  const blocks: BodyBlock[] = [];
  for (const b of r.blocks) {
    if (!b || typeof b !== "object") return invalid;
    const x = b as Record<string, unknown>;
    if (x.type === "paragraph" || x.type === "heading") {
      if (typeof x.text !== "string") return invalid;
      const text = x.type === "heading" ? x.text.replace(/\s+/g, " ").trim() : x.text.replace(/\r\n/g, "\n").trim();
      if (!text) continue;
      if (text.length > (x.type === "heading" ? BODY_LIMITS.heading : BODY_LIMITS.paragraph)) return tooLong;
      blocks.push({ type: x.type, text });
    } else if (x.type === "photo") {
      if (typeof x.photoId !== "string" || !x.photoId) return invalid;
      if (x.caption !== undefined && typeof x.caption !== "string") return invalid;
      const caption = typeof x.caption === "string" ? x.caption.trim() : undefined;
      if (caption && caption.length > BODY_LIMITS.caption) return tooLong;
      const photoId = x.photoId;
      if (blocks.some((o) => o.type === "photo" && o.photoId === photoId)) continue;
      blocks.push(caption === undefined ? { type: "photo", photoId } : { type: "photo", photoId, caption });
    } else {
      return invalid;
    }
  }
  if (blocks.length > BODY_LIMITS.blocks) return tooLong;
  return { ok: true, doc: { v: 1, blocks } };
}

export function docOrNull(raw: unknown): BodyDoc | null {
  const p = parseDoc(raw);
  return p.ok ? p.doc : null;
}

export const withoutCaptions = (doc: BodyDoc): BodyDoc => ({
  v: 1,
  blocks: doc.blocks.map((b) => (b.type === "photo" ? { type: "photo" as const, photoId: b.photoId } : b)),
});
export const layoutKey = (doc: BodyDoc) => JSON.stringify(withoutCaptions(doc).blocks);

// 화면에 그릴 문서 — 저장된 문서는 평문과 같을 때만, 아니면 평문 문단.
export function shownDoc(body: { doc: unknown; plainText: string } | null, plain: string): BodyDoc {
  if (body && body.plainText === plain) {
    const d = docOrNull(body.doc);
    if (d && d.blocks.length > 0) return d;
  }
  return docFromPlain(plain);
}

export type SaveBodyResult =
  | { ok: true; version: number }
  | { ok: false; reason: "not_found" | "invalid" | "too_long" | "empty" | "bad_photo" | "conflict" };
