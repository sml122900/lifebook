"use client";

import { useRef, useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/Button";
import { useRouter } from "next/navigation";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import {
  type DateSource,
  extractPhotoDate,
  stripGps,
} from "@/lib/photo-exif";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";

// Phase Photo (2단계) — 업로드 폼.
// 1단계 폼 + year/month/caption 입력. 시니어 친화: 큰 입력·큰 버튼·압박 X.
// 클라 가드는 1차 (용량/연도 범위), 정확한 검증은 /api/photos.

type UploadResult =
  | { ok: true; photoId: string; memoryId: string }
  | { ok: false; error: string };

const MAX_BYTES_CLIENT = 10 * 1024 * 1024;
const CAPTION_MAX = 200;
const CURRENT_YEAR = new Date().getFullYear();

export function PhotosUploadForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [yearText, setYearText] = useState(String(CURRENT_YEAR));
  const [monthText, setMonthText] = useState("");
  const [caption, setCaption] = useState("");
  const [place, setPlace] = useState<PlaceInfo>(EMPTY_PLACE);
  // Phase Photo 6 (1단계) — EXIF 촬영시각 + 출처(자동 채움 신뢰도 표시).
  const [takenAtIso, setTakenAtIso] = useState<string | null>(null);
  const [dateSource, setDateSource] = useState<DateSource | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null);
    const f = e.target.files?.[0];
    if (!f) {
      setSelectedFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      setDateSource(null);
      setTakenAtIso(null);
      return;
    }
    if (f.size > MAX_BYTES_CLIENT) {
      setError(
        `사진은 10MB 까지 올릴 수 있어요. (지금 ${(f.size / 1024 / 1024).toFixed(1)}MB)`,
      );
      e.target.value = "";
      return;
    }
    setSelectedFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));

    // EXIF 촬영 날짜 → year/month 자동 prefill. 사용자가 덮어쓸 수 있음.
    setReading(true);
    setDateSource(null);
    setTakenAtIso(null);
    extractPhotoDate(f)
      .then((d) => {
        if (d.year !== null) setYearText(String(d.year));
        if (d.month !== null) setMonthText(String(d.month));
        setTakenAtIso(d.takenAt ? d.takenAt.toISOString() : null);
        setDateSource(d.source);
      })
      .catch(() => setDateSource("none"))
      .finally(() => setReading(false));
  }

  function onReset() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(null);
    setPreviewUrl(null);
    setCaption("");
    setPlace(EMPTY_PLACE);
    setTakenAtIso(null);
    setDateSource(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
    // year/month 는 유지 (연속 업로드 편의)
  }

  function onUpload() {
    if (!selectedFile) return;
    setError(null);

    // 클라 1차 — 연도 범위
    const yearNum = Number(yearText);
    if (
      !Number.isInteger(yearNum) ||
      yearNum < 1900 ||
      yearNum > CURRENT_YEAR + 1
    ) {
      setError(`사진을 찍은 해를 1900~${CURRENT_YEAR + 1} 범위로 적어주세요.`);
      return;
    }
    if (monthText.trim() !== "") {
      const m = Number(monthText);
      if (!Number.isInteger(m) || m < 1 || m > 12) {
        setError("달은 1~12 사이로 적거나 비워두세요.");
        return;
      }
    }
    if (caption.length > CAPTION_MAX) {
      setError(`한 줄 설명은 ${CAPTION_MAX}자까지 적을 수 있어요.`);
      return;
    }

    startTransition(async () => {
      try {
        // 🚨 프라이버시 — 업로드 전 GPS 위치정보 제거(JPEG, 무손실).
        // M1 — 제거 실패(hadGps && !stripped)면 차단(위치 누수 방지).
        const { file: cleanFile, hadGps, stripped } = await stripGps(selectedFile);
        if (hadGps && !stripped) {
          setError(
            "위치정보를 지우지 못해 올리지 못했어요. 다른 사진을 시도해 주세요.",
          );
          return;
        }

        const fd = new FormData();
        fd.append("file", cleanFile);
        fd.append("year", yearText.trim());
        if (monthText.trim() !== "") fd.append("month", monthText.trim());
        if (caption.trim() !== "") fd.append("caption", caption.trim());
        if (takenAtIso) fd.append("takenAt", takenAtIso);
        // Phase Place (C) — 장소 선택 시 5필드. 서버가 validatePlace 로 재검증.
        if (place.placeName) {
          fd.append("placeName", place.placeName);
          if (place.placeAddress) fd.append("placeAddress", place.placeAddress);
          if (place.lat != null) fd.append("lat", String(place.lat));
          if (place.lng != null) fd.append("lng", String(place.lng));
          if (place.placeSource) fd.append("placeSource", place.placeSource);
        }

        const res = await fetch("/api/photos", { method: "POST", body: fd });
        const data: UploadResult = await res.json();
        if (!data.ok) {
          setError(data.error);
          return;
        }
        onReset();
        router.refresh();
      } catch (e) {
        console.error("[photo-upload-client]", e);
        setError("사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
      }
    });
  }

  return (
    <section className="flex flex-col gap-4 rounded-md border-2 border-line bg-canvas p-5">
      <h2 className="text-xl font-bold text-ink">사진 올리기</h2>

      <label className="flex flex-col gap-2">
        <span className="text-base text-ink-soft">
          폰에서 사진을 골라주세요 (jpeg / png / webp, 최대 10MB).
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onFileChange}
          disabled={isPending}
          className="text-base file:mr-3 file:rounded-md file:border-2 file:border-line file:bg-surface file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink hover:file:bg-canvas"
        />
      </label>

      {previewUrl && (
        <div className="flex flex-col items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="미리보기"
            className="max-h-[280px] rounded-md border-2 border-line"
          />
          <p className="text-sm text-ink-soft">
            {selectedFile?.name} ·{" "}
            {((selectedFile?.size ?? 0) / 1024).toFixed(0)} KB
          </p>
        </div>
      )}

      {selectedFile && (
        <>
          <div className="flex flex-wrap gap-4">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink-soft">
                찍은 해
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={yearText}
                onChange={(e) =>
                  setYearText(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="w-28 rounded-md border-2 border-line bg-surface px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
                disabled={isPending}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-semibold text-ink-soft">
                달{" "}
                <span className="font-normal text-ink-faint">
                  (선택, 모르면 비워두세요)
                </span>
              </span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={monthText}
                onChange={(e) =>
                  setMonthText(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="1~12"
                className="w-24 rounded-md border-2 border-line bg-surface px-3 py-2 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
                disabled={isPending}
              />
            </label>
          </div>

          {/* Phase Photo 6 (1단계) — 날짜 자동 채움 출처 안내 */}
          <DateSourceBadge reading={reading} source={dateSource} />

          <label className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink-soft">
              한 줄 설명{" "}
              <span className="font-normal text-ink-faint">(선택)</span>
            </span>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="예: 첫 손주 백일잔치"
              maxLength={CAPTION_MAX}
              className="w-full rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
              disabled={isPending}
            />
          </label>

          {/* Phase Place (C) — 어디서 찍은 사진인지 (선택) */}
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-ink-soft">
              어디서 찍었나요?{" "}
              <span className="font-normal text-ink-faint">(선택)</span>
            </span>
            <PlaceSearchInput value={place} onChange={setPlace} />
          </div>
        </>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onUpload}
          disabled={!selectedFile || isPending}
          className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "올리는 중…" : "올리기"}
        </button>
        {selectedFile && !isPending && (
          <button
            type="button"
            onClick={onReset}
            className={buttonClasses("tertiary", "md")}
          >
            취소
          </button>
        )}
      </div>
    </section>
  );
}

// 날짜 자동 채움 출처 — exif="확실", file="추정", none="수동 입력".
function DateSourceBadge({
  reading,
  source,
}: {
  reading: boolean;
  source: DateSource | null;
}) {
  if (reading) {
    return (
      <p className="text-sm text-ink-faint">사진에서 찍은 날짜 읽는 중…</p>
    );
  }
  if (source === "exif") {
    return (
      <p className="inline-flex w-fit items-center gap-1 rounded-md border-2 border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900">
        <span aria-hidden>✓</span> 사진에 적힌 날짜예요 (확실)
      </p>
    );
  }
  if (source === "file") {
    return (
      <p className="inline-flex w-fit items-center gap-1 rounded-md border-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
        <span aria-hidden>≈</span> 추정한 날짜예요. 맞는지 확인해 주세요
      </p>
    );
  }
  if (source === "none") {
    return (
      <p className="inline-flex w-fit items-center gap-1 rounded-md border-2 border-line bg-canvas px-3 py-1.5 text-sm text-ink-soft">
        날짜를 못 읽었어요. 찍은 해를 적어주세요
      </p>
    );
  }
  return null;
}
