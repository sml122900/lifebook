"use client";

// 블로그식 글 고치기 — 문단(음성 입력)·소제목·사진, 위로·아래로·빼기, 저장 버튼(자동 저장 없음 — Q8).
// 이야기(/my-life/story/[id]/edit)·인물(/my-life/person/[id]/edit) 공용. 2b-3c(2026-11-03 — lib/node-body).
// 사진 넣기 = 이미 올린 사진(이 글의 메모리) 고르기 + 새로 올리기(/api/photos — 위치정보 제거·10MB, 기존 파이프라인 그대로).
// [빼기]는 글에서만(사진은 남음). 저장 안 한 변경이 있으면 [취소]가 화면 안에서 묻는다(브라우저 확인창 안 씀).

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { AssistantFabMode } from "@/app/components/AssistantFabMode";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { prepareItemBodyPhotoAction, preparePersonBodyPhotoAction, saveEpisodeBodyAction, saveItemBodyAction, savePersonBodyAction } from "@/app/actions/node-body";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { BODY_LIMITS, type BodyDoc, type SaveBodyResult } from "@/lib/node-body-doc";
import { stripGps } from "@/lib/photo-exif";

import { ConflictReload } from "./ConflictReload";

const C = MY_LIFE_COPY.body;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

type Block =
  | { key: string; type: "paragraph"; text: string }
  | { key: string; type: "heading"; text: string }
  | { key: string; type: "photo"; photoId: string; caption: string };

export type EditorPhoto = { id: string; url: string | null; caption: string | null };

let seq = 0;
const newKey = () => `b${++seq}`;

const INPUT =
  "w-full rounded-md border-2 border-line bg-canvas px-4 py-3 text-lg text-ink focus:border-brand focus:outline-none disabled:opacity-50";

export function BodyEditor({
  kind,
  nodeId,
  memoryId: initialMemoryId,
  initialDoc,
  version,
  photos,
  doneHref,
}: {
  kind: "story" | "person" | "item"; // item = 사용자 항목 글(custom-graph 2단계)
  nodeId: string;
  memoryId: string | null;
  initialDoc: BodyDoc;
  version: number;
  photos: EditorPhoto[];
  doneHref: string; // 저장·취소 뒤 갈 곳
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState<Block[]>(() =>
    initialDoc.blocks.map((b) =>
      b.type === "photo"
        ? { key: newKey(), type: "photo", photoId: b.photoId, caption: photos.find((p) => p.id === b.photoId)?.caption ?? "" }
        : { key: newKey(), type: b.type, text: b.text },
    ),
  );
  const [dirty, setDirty] = useState(false);
  const [memoryId, setMemoryId] = useState(initialMemoryId);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({}); // 방금 올린 사진 — 서버 주소가 오기 전 미리보기
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ kept: boolean } | null>(null); // 충돌 — 고치던 글을 이전 판에 남겼는지
  const [askLeave, setAskLeave] = useState(false);
  const [saving, startSave] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const busy = saving || uploading;
  const full = blocks.length >= BODY_LIMITS.blocks;
  const urlOf = (id: string) => photos.find((p) => p.id === id)?.url ?? previews[id] ?? null;
  const unused = photos.filter((p) => p.url && !blocks.some((b) => b.type === "photo" && b.photoId === p.id));

  function change(next: Block[]) {
    setBlocks(next);
    setDirty(true);
    setError(null);
    setAskLeave(false);
  }
  function update(key: string, patch: Partial<{ text: string; caption: string }>) {
    change(blocks.map((b) => (b.key === key ? ({ ...b, ...patch } as Block) : b)));
  }
  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    change(next);
  }
  function add(b: Block) {
    change([...blocks, b]);
    setJustAdded(b.key);
  }
  function addPhoto(photoId: string, caption: string) {
    add({ key: newKey(), type: "photo", photoId, caption });
    setPicking(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES) return setError(C.uploadTooBig);
    if (file.type === "image/heic" || file.type === "image/heif") return setError(C.uploadHeic);
    setUploading(true);
    try {
      let mid = memoryId;
      if (!mid) {
        const r = kind === "item" ? await prepareItemBodyPhotoAction(nodeId) : await preparePersonBodyPhotoAction(nodeId);
        if (!r.ok) return setError(C.uploadFailed);
        mid = r.memoryId;
        setMemoryId(mid);
      }
      const { file: clean, hadGps, stripped } = await stripGps(file);
      if (hadGps && !stripped) return setError(C.uploadGps);
      const fd = new FormData();
      fd.append("file", clean);
      fd.append("memoryId", mid);
      fd.append("periodAnchor", "both");
      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data: { ok: boolean; photoId?: string; error?: string } = await res.json();
      if (!data.ok || !data.photoId) return setError(data.error || C.uploadFailed);
      setPreviews((m) => ({ ...m, [data.photoId!]: URL.createObjectURL(clean) }));
      addPhoto(data.photoId, "");
      router.refresh(); // 새 사진의 서버 주소·사진 목록
    } catch (err) {
      console.error("[node-body] upload", err);
      setError(C.uploadFailed);
    } finally {
      setUploading(false);
    }
  }

  function save() {
    const doc = {
      v: 1,
      blocks: blocks.map((b) => (b.type === "photo" ? { type: "photo", photoId: b.photoId, caption: b.caption } : { type: b.type, text: b.text })),
    };
    setError(null);
    startSave(async () => {
      let r: SaveBodyResult;
      try {
        r = kind === "story" ? await saveEpisodeBodyAction(nodeId, doc, version) : kind === "item" ? await saveItemBodyAction(nodeId, doc, version) : await savePersonBodyAction(nodeId, doc, version);
      } catch (err) {
        console.error("[node-body] save", err);
        setError(C.errFailed);
        return;
      }
      if (r.ok) {
        setDirty(false);
        router.push(doneHref);
        return;
      }
      if (r.reason === "conflict") {
        setConflict({ kept: r.kept });
        setError(r.kept ? C.errConflict : C.errConflictOnly);
        return;
      }
      setConflict(null);
      setError(r.reason === "empty" ? C.errEmpty : r.reason === "too_long" ? C.errTooLong : r.reason === "bad_photo" ? C.errBadPhoto : C.errFailed);
    });
  }

  const counters = { paragraph: 0, heading: 0, photo: 0 };
  return (
    <div className="flex flex-col gap-5">
      {/* 둥근 비서 버튼 숨김 — 화면 끝 [저장]을 가렸다(2026-11-08 #14) */}
      <AssistantFabMode mode="hide" />
      {blocks.length === 0 && <p className="m-0 text-lg text-ink-soft">{C.emptyDoc}</p>}
      <ol className="m-0 flex list-none flex-col gap-5 p-0">
        {blocks.map((b, i) => {
          const n = ++counters[b.type];
          const label = b.type === "paragraph" ? C.paragraphLabel(n) : b.type === "heading" ? C.headingLabel(n) : C.photoLabel(n);
          const id = `body-${b.key}`;
          return (
            <li key={b.key} className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface p-3">
              {/* 문단은 VoiceTextarea 가 aria-label 로 이름을 가짐(id 를 받지 않음) — 소제목만 label 로 잇는다. 사진은 캡션 칸에 따로. */}
              {b.type === "heading" ? (
                <label htmlFor={id} className="text-lg font-semibold text-ink">
                  {label}
                </label>
              ) : (
                <p className="m-0 text-lg font-semibold text-ink">{label}</p>
              )}
              {b.type === "paragraph" ? (
                <VoiceTextarea value={b.text} onChange={(v) => update(b.key, { text: v })} rows={5} ariaLabel={label} />
              ) : b.type === "heading" ? (
                <input
                  id={id}
                  value={b.text}
                  onChange={(e) => update(b.key, { text: e.target.value })}
                  maxLength={BODY_LIMITS.heading}
                  autoFocus={justAdded === b.key}
                  autoComplete="off"
                  disabled={busy}
                  className={`${INPUT} font-semibold`}
                />
              ) : (
                <>
                  {urlOf(b.photoId) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urlOf(b.photoId)!} alt="" className="max-h-72 w-full rounded-md border border-line object-contain" />
                  ) : (
                    <p className="m-0 rounded-md border-2 border-dashed border-line px-4 py-6 text-center text-lg text-ink-soft">{C.photoGone}</p>
                  )}
                  <label htmlFor={id} className="text-lg text-ink-soft">
                    {C.captionLabel}
                  </label>
                  <input
                    id={id}
                    value={b.caption}
                    onChange={(e) => update(b.key, { caption: e.target.value })}
                    maxLength={BODY_LIMITS.caption}
                    autoComplete="off"
                    disabled={busy}
                    className={INPUT}
                  />
                </>
              )}
              <div className="flex gap-2">
                <Button variant="tertiary" size="lg" className="flex-1 px-2!" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`${label} ${C.up}`}>
                  {C.up}
                </Button>
                <Button variant="tertiary" size="lg" className="flex-1 px-2!" disabled={busy || i === blocks.length - 1} onClick={() => move(i, 1)} aria-label={`${label} ${C.down}`}>
                  {C.down}
                </Button>
                <Button variant="tertiary" size="lg" className="flex-1 px-2!" disabled={busy} onClick={() => change(blocks.filter((x) => x.key !== b.key))} aria-label={`${label} ${C.remove}`}>
                  {C.remove}
                </Button>
              </div>
              {b.type === "photo" && <p className="m-0 text-lg text-ink-soft">{C.removeNote}</p>}
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="secondary" size="lg" className="px-2!" disabled={busy || full} onClick={() => add({ key: newKey(), type: "paragraph", text: "" })}>
          {C.addParagraph}
        </Button>
        <Button variant="secondary" size="lg" className="px-2!" disabled={busy || full} onClick={() => add({ key: newKey(), type: "heading", text: "" })}>
          {C.addHeading}
        </Button>
        <Button variant="secondary" size="lg" className="px-2!" disabled={busy || full} aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
          {C.addPhoto}
        </Button>
      </div>

      {picking && (
        <section aria-label={C.addPhoto} className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-3">
          <p className="m-0 text-lg font-semibold text-ink">{C.pickTitle}</p>
          {unused.length === 0 ? (
            <p className="m-0 text-lg text-ink-soft">{C.pickNone}</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {unused.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={busy}
                  onClick={() => addPhoto(p.id, p.caption ?? "")}
                  aria-label={`${C.photoLabel(i + 1)}${p.caption ? ` — ${p.caption}` : ""} ${C.addPhoto}`}
                  className="overflow-hidden rounded-md border-2 border-line hover:border-brand focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url!} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-lg font-semibold text-ink">{C.upload}</span>
            <span className="text-lg text-ink-soft">{C.uploadHint}</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onFile}
              disabled={busy}
              className="min-h-[48px] text-lg file:mr-3 file:min-h-[48px] file:rounded-md file:border-2 file:border-brand file:bg-surface file:px-4 file:text-lg file:font-semibold file:text-action"
            />
          </label>
          {uploading && <p className="m-0 text-lg text-ink-soft">{C.uploading}</p>}
          <Button variant="tertiary" size="lg" onClick={() => setPicking(false)}>
            {C.pickClose}
          </Button>
        </section>
      )}

      {error && (
        <div role="alert" className="flex flex-col gap-2">
          <p className="m-0 text-lg text-danger">{error}</p>
          {conflict && <ConflictReload kept={conflict.kept} />}
        </div>
      )}

      {askLeave ? (
        <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-line bg-banner p-3">
          <p className="m-0 text-lg text-ink">{C.unsaved}</p>
          <Button variant="secondary" size="lg" onClick={() => setAskLeave(false)}>
            {C.unsavedStay}
          </Button>
          <Button variant="tertiary" size="lg" onClick={() => router.push(doneHref)}>
            {C.unsavedLeave}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Button variant="primary" size="lg" disabled={busy} onClick={save}>
            {saving ? C.saving : C.save}
          </Button>
          <Button variant="tertiary" size="lg" disabled={saving} onClick={() => (dirty ? setAskLeave(true) : router.push(doneHref))}>
            {C.cancel}
          </Button>
        </div>
      )}
    </div>
  );
}
