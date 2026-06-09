"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  type DateSource,
  extractPhotoDate,
  stripGps,
} from "@/lib/photo-exif";

// Phase Photo 6 (2단계) — 대량 업로드.
//
// 다중선택 → 사진별 EXIF 날짜 읽기(extractPhotoDate) + 업로드 전 GPS 제거
// (stripGps) → 날짜순 그룹 그리드 → concurrency 3 으로 일괄 업로드
// (POST /api/photos, 사진당 1요청). 부분 실패 격리 + 실패분 다시 시도.
//
// 기존 단일 PhotosUploadForm 과 완전 별도(무영향). createIndependentPhoto
// 흐름·라우트 재사용.

const MAX_BYTES_CLIENT = 10 * 1024 * 1024;
const MAX_BATCH = 30;
const CONCURRENCY = 3;
const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MAX = CURRENT_YEAR + 1;

type Status = "ready" | "uploading" | "done" | "error";

type Item = {
  id: string;
  file: File;
  url: string;
  year: number | null; // 제안값 — 사용자가 수정 가능
  month: number | null;
  takenAt: Date | null;
  source: DateSource;
  status: Status;
  error?: string;
};

export function BulkUploadForm() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [bulkYear, setBulkYear] = useState("");
  const [uploading, setUploading] = useState(false);

  function patch(id: string, p: Partial<Item>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    setNotice(null);
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (picked.length === 0) return;

    let heic = 0;
    let tooBig = 0;
    const accepted: File[] = [];
    for (const f of picked) {
      if (f.type === "image/heic" || f.type === "image/heif") {
        heic++;
        continue;
      }
      if (f.size > MAX_BYTES_CLIENT) {
        tooBig++;
        continue;
      }
      accepted.push(f);
    }

    const room = MAX_BATCH - items.length;
    const toAdd = accepted.slice(0, Math.max(0, room));
    const overflow = accepted.length - toAdd.length;

    const notices: string[] = [];
    if (heic > 0)
      notices.push(
        `아이폰 HEIC 사진 ${heic}장은 못 받았어요 (설정 > 카메라 > 포맷 > '호환성').`,
      );
    if (tooBig > 0) notices.push(`10MB 넘는 사진 ${tooBig}장은 뺐어요.`);
    if (overflow > 0)
      notices.push(`한 번에 ${MAX_BATCH}장까지라 ${overflow}장은 다음에 올려주세요.`);
    if (notices.length > 0) setNotice(notices.join(" "));
    if (toAdd.length === 0) return;

    // 먼저 미리보기로 즉시 추가(읽기 전 상태), 그 후 EXIF 채움.
    const base: Item[] = toAdd.map((f) => ({
      id: crypto.randomUUID(),
      file: f,
      url: URL.createObjectURL(f),
      year: null,
      month: null,
      takenAt: null,
      source: "none" as DateSource,
      status: "ready" as Status,
    }));
    setItems((prev) => [...prev, ...base]);

    setReading(true);
    await Promise.all(
      base.map(async (it) => {
        const d = await extractPhotoDate(it.file).catch(() => null);
        if (d) {
          patch(it.id, {
            year: d.year,
            month: d.month,
            takenAt: d.takenAt,
            source: d.source,
          });
        }
      }),
    );
    setReading(false);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((i) => i.id !== id);
    });
  }

  function setItemYear(id: string, raw: string) {
    const v = raw.replace(/\D/g, "").slice(0, 4);
    patch(id, { year: v === "" ? null : Number(v) });
  }

  // 날짜 없는 사진(source none) 에 일괄 연도 지정.
  function applyBulkYear() {
    const v = bulkYear.replace(/\D/g, "").slice(0, 4);
    if (v === "") return;
    const y = Number(v);
    setItems((prev) =>
      prev.map((i) =>
        i.source === "none" && i.year === null ? { ...i, year: y } : i,
      ),
    );
  }

  // 정렬: 연도 ASC → takenAt ASC. year null 은 맨 뒤.
  const sorted = useMemo(() => {
    return [...items].sort((a, b) => {
      const ay = a.year ?? Infinity;
      const by = b.year ?? Infinity;
      if (ay !== by) return ay - by;
      const at = a.takenAt?.getTime() ?? 0;
      const bt = b.takenAt?.getTime() ?? 0;
      return at - bt;
    });
  }, [items]);

  const noDateItems = sorted.filter((i) => i.year === null);
  const datedItems = sorted.filter((i) => i.year !== null);

  // 연도 헤더 그룹 (datedItems 만).
  const groups = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const i of datedItems) {
      const arr = map.get(i.year as number) ?? [];
      arr.push(i);
      map.set(i.year as number, arr);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [datedItems]);

  const doneCount = items.filter((i) => i.status === "done").length;
  const total = items.length;

  async function uploadOne(snapshot: {
    id: string;
    file: File;
    year: number;
    month: number | null;
    takenAt: Date | null;
  }) {
    patch(snapshot.id, { status: "uploading", error: undefined });
    try {
      // M1 — GPS 제거 실패면 그 사진만 차단(나머지 진행).
      const { file: cleanFile, hadGps, stripped } = await stripGps(snapshot.file);
      if (hadGps && !stripped) {
        patch(snapshot.id, {
          status: "error",
          error: "위치정보를 못 지워 못 올렸어요",
        });
        return;
      }
      const fd = new FormData();
      fd.append("file", cleanFile);
      fd.append("year", String(snapshot.year));
      if (snapshot.month) fd.append("month", String(snapshot.month));
      if (snapshot.takenAt) fd.append("takenAt", snapshot.takenAt.toISOString());

      const res = await fetch("/api/photos", { method: "POST", body: fd });
      const data: { ok: boolean; error?: string } = await res.json();
      if (!data.ok) {
        patch(snapshot.id, { status: "error", error: data.error || "올리기 실패" });
        return;
      }
      patch(snapshot.id, { status: "done" });
    } catch (e) {
      console.error("[bulk-upload]", e);
      patch(snapshot.id, { status: "error", error: "올리기 실패" });
    }
  }

  async function runUpload() {
    setNotice(null);
    // 올릴 대상 — ready/error + 연도 있음. 연도 없으면 건너뜀(안내).
    const targets = items.filter(
      (i) => (i.status === "ready" || i.status === "error") && i.year !== null,
    );
    const skipped = items.filter(
      (i) => (i.status === "ready" || i.status === "error") && i.year === null,
    );
    if (targets.length === 0) {
      setNotice(
        skipped.length > 0
          ? "날짜 없는 사진에 먼저 연도를 적어주세요."
          : "올릴 사진이 없어요.",
      );
      return;
    }

    // 연도 범위 클라 1차 — 벗어나면 error 표시하고 제외.
    const valid: typeof targets = [];
    for (const i of targets) {
      const y = i.year as number;
      if (y < 1900 || y > YEAR_MAX) {
        patch(i.id, { status: "error", error: `연도를 1900~${YEAR_MAX} 로` });
      } else {
        valid.push(i);
      }
    }
    if (valid.length === 0) return;

    const snapshots = valid.map((i) => ({
      id: i.id,
      file: i.file,
      year: i.year as number,
      month: i.month,
      takenAt: i.takenAt,
    }));

    setUploading(true);
    let idx = 0;
    const worker = async () => {
      while (idx < snapshots.length) {
        const s = snapshots[idx++];
        await uploadOne(s);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, snapshots.length) }, () =>
        worker(),
      ),
    );
    setUploading(false);
    router.refresh();
  }

  const allDone = total > 0 && items.every((i) => i.status === "done");
  const remaining = items.filter(
    (i) => i.status === "ready" || i.status === "error",
  ).length;

  return (
    <div className="flex flex-col gap-6">
      {/* 고르기 */}
      <label className="flex flex-col gap-2 rounded-md border-2 border-dashed border-zinc-300 bg-zinc-50 p-5">
        <span className="text-lg font-semibold text-zinc-800">
          사진 여러 장 고르기{" "}
          <span className="text-base font-normal text-zinc-500">
            (jpeg / png / webp, 최대 10MB, 한 번에 {MAX_BATCH}장)
          </span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          disabled={uploading}
          className="text-base file:mr-3 file:rounded-md file:border-2 file:border-zinc-300 file:bg-white file:px-4 file:py-2 file:text-base file:font-semibold file:text-zinc-800 hover:file:bg-zinc-100"
        />
        <span className="text-sm text-zinc-500">
          찍은 날짜는 자동으로 읽어 와요. 위치정보는 올리기 전에 지워요.
        </span>
      </label>

      {notice && (
        <p
          role="alert"
          className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900"
        >
          {notice}
        </p>
      )}

      {reading && (
        <p className="text-base text-zinc-600">사진에서 찍은 날짜 읽는 중…</p>
      )}

      {total > 0 && (
        <>
          {/* 진행 카운트 */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xl font-bold text-zinc-900">
              {total}장 중 <span className="text-emerald-700">{doneCount}장</span>{" "}
              올렸어요
            </p>
            <button
              type="button"
              onClick={runUpload}
              disabled={uploading || remaining === 0}
              className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-zinc-900 px-6 py-3 text-lg font-bold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-zinc-400"
            >
              {uploading
                ? "올리는 중…"
                : remaining === 0
                  ? "다 올렸어요"
                  : `연혁에 추가 (${remaining}장)`}
            </button>
          </div>

          {allDone && (
            <div className="flex flex-col gap-2 rounded-md border-2 border-emerald-300 bg-emerald-50 px-5 py-4">
              <p className="text-lg font-bold text-emerald-900">
                ✓ {total}장 모두 연혁에 담았어요.
              </p>
              <a
                href="/life-timeline"
                className="w-fit text-base font-semibold text-emerald-800 underline hover:text-emerald-900"
              >
                인생 연혁에서 보기 →
              </a>
            </div>
          )}

          {/* 날짜 없는 사진 — 일괄 연도 지정 */}
          {noDateItems.length > 0 && (
            <section className="flex flex-col gap-3 rounded-md border-2 border-amber-200 bg-amber-50 p-4">
              <p className="text-lg font-semibold text-amber-900">
                날짜를 못 읽은 사진 {noDateItems.length}장
              </p>
              <p className="text-base text-amber-900">
                카톡·캡처 사진은 찍은 날짜가 없을 수 있어요. 아래에 연도를
                적고 <b>일괄 지정</b>을 누르거나, 사진마다 따로 적어주세요.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-semibold text-zinc-700">
                    연도
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={bulkYear}
                    onChange={(e) =>
                      setBulkYear(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="예: 2005"
                    disabled={uploading}
                    className="w-32 rounded-md border-2 border-zinc-300 bg-white px-3 py-2 text-lg text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
                  />
                </label>
                <button
                  type="button"
                  onClick={applyBulkYear}
                  disabled={uploading || bulkYear.trim() === ""}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-amber-500 bg-white px-4 py-2 text-base font-semibold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {noDateItems.length}장에 일괄 지정
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {noDateItems.map((i) => (
                  <PhotoCard
                    key={i.id}
                    item={i}
                    uploading={uploading}
                    onYear={setItemYear}
                    onRemove={removeItem}
                  />
                ))}
              </ul>
            </section>
          )}

          {/* 연도별 그룹 */}
          {groups.map(([year, list]) => (
            <section key={year} className="flex flex-col gap-3">
              <h3 className="text-xl font-bold text-zinc-900">{year}년</h3>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {list.map((i) => (
                  <PhotoCard
                    key={i.id}
                    item={i}
                    uploading={uploading}
                    onYear={setItemYear}
                    onRemove={removeItem}
                  />
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: Status }) {
  const map: Record<Status, { text: string; cls: string }> = {
    ready: { text: "대기", cls: "border-zinc-300 bg-white text-zinc-600" },
    uploading: {
      text: "올리는 중…",
      cls: "border-sky-300 bg-sky-50 text-sky-800",
    },
    done: { text: "✓ 완료", cls: "border-emerald-300 bg-emerald-50 text-emerald-800" },
    error: { text: "⚠ 실패", cls: "border-rose-300 bg-rose-50 text-rose-800" },
  };
  const s = map[status];
  return (
    <span
      className={
        "inline-flex w-fit items-center rounded-md border-2 px-2 py-0.5 text-xs font-semibold " +
        s.cls
      }
    >
      {s.text}
    </span>
  );
}

function PhotoCard({
  item,
  uploading,
  onYear,
  onRemove,
}: {
  item: Item;
  uploading: boolean;
  onYear: (id: string, raw: string) => void;
  onRemove: (id: string) => void;
}) {
  const sourceLabel =
    item.source === "exif"
      ? "사진 날짜 (확실)"
      : item.source === "file"
        ? "추정 날짜"
        : null;
  return (
    <li className="flex flex-col gap-2 overflow-hidden rounded-md border-2 border-zinc-200 bg-white p-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.url}
        alt="고른 사진"
        className="aspect-square w-full rounded object-cover"
      />
      <StatusChip status={item.status} />
      {item.error && <p className="text-xs text-rose-700">{item.error}</p>}
      <div className="flex items-center gap-2">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={item.year ?? ""}
          onChange={(e) => onYear(item.id, e.target.value)}
          placeholder="연도"
          disabled={uploading || item.status === "done"}
          className="w-20 rounded-md border-2 border-zinc-300 bg-white px-2 py-1 text-base text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 disabled:bg-zinc-100"
        />
        {item.month != null && (
          <span className="text-sm text-zinc-500">{item.month}월</span>
        )}
        {sourceLabel && (
          <span
            className={
              "text-xs " +
              (item.source === "exif" ? "text-emerald-700" : "text-amber-700")
            }
          >
            {sourceLabel}
          </span>
        )}
      </div>
      {item.status !== "done" && !uploading && (
        <button
          type="button"
          onClick={() => onRemove(item.id)}
          className="inline-flex min-h-[36px] items-center justify-center rounded-md border-2 border-zinc-300 bg-white px-2 py-1 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500"
        >
          빼기
        </button>
      )}
    </li>
  );
}
