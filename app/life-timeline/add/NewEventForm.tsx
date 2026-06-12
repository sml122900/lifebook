"use client";

import { useState } from "react";

import { Camera } from "lucide-react";

import { stripGps } from "@/lib/photo-exif";

import { EventForm, type AnchorOption } from "../EventForm";

// Phase Photo 6 (1단계+) — "인생의 한 장면 추가"에서도 사진 첨부.
//
// add 화면은 아직 이벤트(memoryId)가 없어 즉시 첨부(EventPhotos)가 불가.
// 그래서 사진을 client 에 보류해 두고, EventForm 이 이벤트를 만든 직후
// onAfterCreate(eventId) 에서 그 memoryId 로 첨부한다(POST /api/photos).
//
// 시니어 친화: 여러 장 한 번에 고르기, 미리보기, 개별 빼기. periodAnchor 는
// both 고정(기간 세분은 저장 후 편집 화면에서) — 추가 흐름 단순화.

const MAX_BYTES_CLIENT = 10 * 1024 * 1024;

type Pending = { id: string; file: File; url: string };

export function NewEventForm({
  anchors,
  birthYear,
  defaultYear,
}: {
  anchors: AnchorOption[];
  birthYear: number | null;
  defaultYear: number | null;
}) {
  const [pending, setPending] = useState<Pending[]>([]);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoError(null);
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일 다시 고를 수 있게
    const next: Pending[] = [];
    for (const f of files) {
      if (f.size > MAX_BYTES_CLIENT) {
        setPhotoError(
          `사진은 10MB 까지 올릴 수 있어요. 큰 사진 ${f.name} 은 빼고 담았어요.`,
        );
        continue;
      }
      if (f.type === "image/heic" || f.type === "image/heif") {
        setPhotoError(
          "아이폰 HEIC 사진은 아직 받지 못해요. 설정 > 카메라 > 포맷 > '호환성' 으로 바꾼 뒤 다시 찍어주세요.",
        );
        continue;
      }
      next.push({
        id: crypto.randomUUID(),
        file: f,
        url: URL.createObjectURL(f),
      });
    }
    if (next.length > 0) setPending((prev) => [...prev, ...next]);
  }

  function removePending(id: string) {
    setPending((prev) => {
      const found = prev.find((p) => p.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((p) => p.id !== id);
    });
  }

  // EventForm 이 이벤트를 만든 뒤 호출. memoryId 로 사진을 순차 첨부한다.
  // 한 장 실패해도 나머지 진행(부분 실패 격리). 실패가 있으면 push 전에 알림
  // (M2) — 이벤트는 이미 저장됐고 누락 사진은 편집에서 다시 붙일 수 있다.
  async function attachPending(eventId: string) {
    let failed = 0;
    for (const p of pending) {
      try {
        // M1 — GPS 제거 실패면 그 사진 차단.
        const { file: cleanFile, hadGps, stripped } = await stripGps(p.file);
        if (hadGps && !stripped) {
          failed++;
          continue;
        }
        const fd = new FormData();
        fd.append("file", cleanFile);
        fd.append("memoryId", eventId);
        const res = await fetch("/api/photos", { method: "POST", body: fd });
        const data: { ok: boolean } = await res.json();
        if (!data.ok) failed++;
      } catch (e) {
        console.error("[new-event-photo-attach]", e);
        failed++;
      }
    }
    if (failed > 0) {
      // push 후엔 화면이 바뀌어 안내가 안 보이므로 alert 로 즉시 알림.
      window.alert(
        `사진 ${failed}장은 올리지 못했어요 (위치정보 제거 실패 또는 연결 문제).\n저장된 이야기를 편집해서 다시 붙일 수 있어요.`,
      );
    }
  }

  return (
    <EventForm
      mode="add"
      anchors={anchors}
      birthYear={birthYear}
      defaultYear={defaultYear}
      onAfterCreate={attachPending}
    >
      <PhotoPicker
        pending={pending}
        error={photoError}
        onPick={onPick}
        onRemove={removePending}
      />
    </EventForm>
  );
}

function PhotoPicker({
  pending,
  error,
  onPick,
  onRemove,
}: {
  pending: Pending[];
  error: string | null;
  onPick: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-line bg-surface p-5">
      <div>
        <h2 className="flex items-center gap-1.5 text-2xl font-bold text-ink">
          <Camera strokeWidth={1.75} aria-hidden className="h-6 w-6 text-ink shrink-0" />
          사진 <span className="text-base font-normal text-ink-faint">(선택)</span>
        </h2>
        <p className="mt-1 text-base text-ink-soft">
          이 이야기와 함께 남기고 싶은 사진을 골라주세요. 여러 장도 돼요.
        </p>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900"
        >
          {error}
        </p>
      )}

      {pending.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {pending.map((p) => (
            <li
              key={p.id}
              className="flex flex-col overflow-hidden rounded-md border-2 border-line bg-surface"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt="고른 사진"
                className="aspect-square w-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(p.id)}
                className="m-2 inline-flex min-h-[40px] items-center justify-center rounded-md border-2 border-line bg-surface px-3 py-1 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
              >
                빼기
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="flex flex-col gap-2 rounded-md border-2 border-dashed border-line bg-canvas p-4">
        <span className="text-base text-ink-soft">
          사진 고르기 (jpeg / png / webp, 최대 10MB, 여러 장 가능)
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          className="text-base file:mr-3 file:rounded-md file:border-2 file:border-line file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-canvas"
        />
      </label>

      <p className="text-sm text-ink-faint">
        저장하면 이 사진들이 사건에 함께 담겨요. 위치정보는 자동으로 지워요.
      </p>
    </section>
  );
}
