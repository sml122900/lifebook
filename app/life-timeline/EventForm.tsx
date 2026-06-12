"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { calcAge, formatAge } from "@/lib/age";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";
import type { EventPrecision, LifeCategory } from "@/lib/generated/prisma/enums";

// L2(+) — EventForm 의 카테고리 = LifeCategory enum 전체에서 자유 선택이라
// 폼 안에서 isPeriod 를 즉시 판단해야 함(서버 도움 없이). 백엔드 헬퍼와
// 동일 집합 유지(lib/life-events.ts 의 PERIOD_CATEGORIES).
const PERIOD_CATEGORIES: ReadonlySet<LifeCategory> = new Set([
  "KINDERGARTEN",
  "ELEMENTARY",
  "MIDDLE",
  "HIGH",
  "UNIVERSITY",
  "MILITARY",
  "WORK",
]);

import {
  addLifeEventAction,
  updateLifeEventAction,
  type LifeEventInputRaw,
} from "./actions";

// Phase L4 — 인생 이벤트 추가/수정 공용 폼.
//
// 추가 모드(mode="add"):
//   - 두 모드 토글:
//       (나) 두 사건 사이에 끼우기  ← 기본 (v3 의 핵심 — 정확한 시점 모를 때)
//       (가) 정확한 연·월을 알아요
//   - "(나)" 는 두 앵커를 select 2개로 골라 추정 연도를 자동 계산하고
//     사용자가 수정 가능. precision=APPROXIMATE 강제.
//   - "(가)" 는 연·월 직접 입력. precision = month 유무로 결정(없으면
//     자동 APPROXIMATE 다운그레이드 — 서버 헬퍼에서).
//
// 수정 모드(mode="edit"):
//   - 토글 숨김(단순화). 정확/대략은 기존 값에 따라 결정.
//
// 시니어 친화:
//   - 큰 라벨/입력, 큰 라디오 카드, 명확한 에러
//   - 음성 입력은 자유 보조 textarea 에만 (제목/연/월은 키보드가 빠름)
//   - 카테고리는 3x3 큰 라디오 그리드 (모바일 1열)

export type AnchorOption = {
  id: string;
  // "1972년 3월 초등학교 입학" 같은 사람-읽기 라벨
  label: string;
  // timeKey (year + (month-1)/12 or year + 0.5)
  sortKey: number;
};

export type EventFormInitial = {
  eventId: string;
  category: LifeCategory;
  precision: EventPrecision;
  title: string;
  year: number;
  month: number | null;
  endYear: number | null;
  endMonth: number | null;
  content: string;
  // Phase Place — 수정 모드 prefill. 신규 추가는 항상 EMPTY_PLACE 로 시작.
  place: PlaceInfo;
};

type Mode = "between" | "exact";

export function EventForm({
  mode,
  anchors = [],
  initial,
  birthYear = null,
  defaultYear = null,
  children,
  onAfterCreate,
}: {
  mode: "add" | "edit";
  anchors?: AnchorOption[];
  initial?: EventFormInitial;
  birthYear?: number | null;
  // v3.3 — 빈 공간 클릭/+버튼으로 진입했을 때 미리 채울 연도. 추가 모드 전용.
  // 있으면 "exact" 모드로 시작(anchors 있어도 사용자가 정확한 연도를 가리키고
  // 왔으므로 between 모드가 부자연스러움). 사용자는 폼에서 변경 가능.
  defaultYear?: number | null;
  // Phase Photo (4단계) — 폼 본문과 취소/저장 버튼 사이에 끼울 보조 섹션
  // (편집 모드의 사진 첨부 등). 버튼이 항상 화면 맨 아래에 오도록.
  children?: ReactNode;
  // Phase Photo 6 (1단계+) — 추가 모드에서 이벤트 생성 직후(memoryId 확보)
  // 보류해 둔 사진을 첨부할 훅. push 전에 await. 실패해도 이벤트는 저장됨.
  onAfterCreate?: (eventId: string) => Promise<void>;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";

  // 추가 모드: defaultYear 가 있으면 exact (외부에서 연도를 정해 진입한 신호).
  // 그 외엔 앵커 2개 이상이면 between, 아니면 exact.
  const [formMode, setFormMode] = useState<Mode>(
    isEdit
      ? "exact"
      : defaultYear !== null
        ? "exact"
        : anchors.length >= 2
          ? "between"
          : "exact",
  );

  // 카테고리 — UI 에서 분류 선택을 제거(사용자 단순화). 수정 모드는 기존
  // 값 유지, 추가 모드는 중립값 FAMILY (BIRTH/학령기/MILITARY/WORK 가 아닌
  // 일반 인생 사건 의미). setCategory 는 isPeriod 일관성을 위해 남겨두지만
  // UI 에서는 호출되지 않음.
  const [category] = useState<LifeCategory>(initial?.category ?? "FAMILY");

  // 정확 모드 입력 (수정 모드는 항상 이쪽)
  // v3.3 — initial(수정) → defaultYear(외부 진입 prefill) → 빈 문자열 순.
  const [yearText, setYearText] = useState(
    initial?.year != null
      ? String(initial.year)
      : defaultYear !== null
        ? String(defaultYear)
        : "",
  );
  const [monthText, setMonthText] = useState(
    initial?.month != null ? String(initial.month) : "",
  );
  const [endYearText, setEndYearText] = useState(
    initial?.endYear != null ? String(initial.endYear) : "",
  );
  const [endMonthText, setEndMonthText] = useState(
    initial?.endMonth != null ? String(initial.endMonth) : "",
  );

  // L4(+) — "기간" 은 카테고리가 아니라 사용자 선택. 학령기/군대/직장 카테고리
  // 이거나(초기값) 이미 endYear 가 있으면 켜진 채로 시작. 자유 추가는 꺼짐 →
  // 사용자가 토글로 켜면 시작·끝을 입력할 수 있다.
  const [isPeriod, setIsPeriod] = useState<boolean>(
    PERIOD_CATEGORIES.has(category) || initial?.endYear != null,
  );

  // 앵커 사이 모드 입력 (추가 모드만)
  const [anchorBeforeId, setAnchorBeforeId] = useState<string>(""); // "이 사건 다음에"
  const [anchorAfterId, setAnchorAfterId] = useState<string>(""); // "이 사건 전에"
  const [betweenYearText, setBetweenYearText] = useState(""); // 자동 추정값(수정 가능)

  // 추정 연도 자동 채움 — 두 앵커 선택 즉시.
  const estimatedYear = useMemo(() => {
    const before = anchors.find((a) => a.id === anchorBeforeId);
    const after = anchors.find((a) => a.id === anchorAfterId);
    if (!before || !after) return null;
    if (before.sortKey >= after.sortKey) return null; // 잘못된 순서
    const mid = (before.sortKey + after.sortKey) / 2;
    return Math.round(mid);
  }, [anchors, anchorBeforeId, anchorAfterId]);

  // 두 앵커가 새로 골라지면 추정값을 자동으로 채움 (사용자가 손댄 적 없으면).
  const [betweenYearTouched, setBetweenYearTouched] = useState(false);
  const effectiveBetweenYear =
    betweenYearTouched || betweenYearText !== ""
      ? betweenYearText
      : estimatedYear !== null
        ? String(estimatedYear)
        : "";

  const [title, setTitle] = useState(initial?.title ?? "");
  const [content, setContent] = useState(initial?.content ?? "");
  const [place, setPlace] = useState<PlaceInfo>(initial?.place ?? EMPTY_PLACE);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function parseIntOrNull(t: string): number | null {
    const trimmed = t.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return null;
    return n;
  }

  function buildPayload(): LifeEventInputRaw | { error: string } {
    // Phase Place — 둘 모드 공통 장소. PlaceSearchInput state 그대로.
    const placePayload = {
      placeName: place.placeName,
      placeAddress: place.placeAddress,
      lat: place.lat,
      lng: place.lng,
      placeSource: place.placeSource,
    };
    if (!isEdit && formMode === "between") {
      const before = anchors.find((a) => a.id === anchorBeforeId);
      const after = anchors.find((a) => a.id === anchorAfterId);
      if (!before || !after) {
        return { error: "두 사건을 모두 골라주세요." };
      }
      if (before.id === after.id) {
        return { error: "같은 사건을 두 번 고르지 말아주세요." };
      }
      if (before.sortKey >= after.sortKey) {
        return {
          error: "'다음에' 사건이 '전에' 사건보다 이전이어야 해요.",
        };
      }
      const year = parseIntOrNull(effectiveBetweenYear);
      return {
        category,
        precision: "APPROXIMATE",
        title,
        year,
        month: null, // 사이 이벤트는 월 없음
        endYear: null, // 사이 모드는 단일 시점
        endMonth: null,
        content,
        place: placePayload,
      };
    }
    // 정확 모드(또는 수정)
    const endYearVal = isPeriod ? parseIntOrNull(endYearText) : null;
    return {
      category,
      precision: parseIntOrNull(monthText) !== null ? "EXACT" : "APPROXIMATE",
      title,
      year: parseIntOrNull(yearText),
      month: parseIntOrNull(monthText),
      endYear: endYearVal,
      endMonth:
        isPeriod && endYearVal !== null ? parseIntOrNull(endMonthText) : null,
      content,
      place: placePayload,
    };
  }

  function handleSubmit() {
    setError(null);
    const built = buildPayload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    startTransition(async () => {
      const result = isEdit && initial
        ? await updateLifeEventAction(initial.eventId, built)
        : await addLifeEventAction(built);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // Phase Photo 6 — 추가 모드: 새 이벤트(result.id)에 보류 사진 첨부.
      // 사진 실패는 이벤트 저장을 막지 않음(내부에서 처리, 여기선 await 만).
      if (!isEdit && onAfterCreate) {
        await onAfterCreate(result.id);
      }
      // 저장 후 연혁으로.
      router.push("/life-timeline");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {/* 모드 선택 — 추가 모드 + 앵커 2개 이상일 때만 */}
      {!isEdit && anchors.length >= 2 && (
        <section className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-ink">
            시점을 어떻게 정할까요?
          </p>
          <ModeRadio
            value={formMode}
            onChange={setFormMode}
            options={[
              {
                value: "between",
                label: "두 사건 사이에 끼우기",
                hint: "정확한 시점은 모르지만, 어느 사건과 어느 사건 사이인지는 아세요.",
              },
              {
                value: "exact",
                label: "정확한 연·월을 알아요",
                hint: "기억나는 연도가 있어요 (월은 몰라도 돼요).",
              },
            ]}
          />
        </section>
      )}

      {/* 시점 입력 */}
      {!isEdit && formMode === "between" && anchors.length >= 2 ? (
        <BetweenSection
          anchors={anchors}
          anchorBeforeId={anchorBeforeId}
          setAnchorBeforeId={setAnchorBeforeId}
          anchorAfterId={anchorAfterId}
          setAnchorAfterId={setAnchorAfterId}
          estimatedYear={estimatedYear}
          yearText={effectiveBetweenYear}
          onYearChange={(v) => {
            setBetweenYearTouched(true);
            setBetweenYearText(v);
          }}
          birthYear={birthYear}
        />
      ) : (
        <ExactSection
          yearText={yearText}
          setYearText={setYearText}
          monthText={monthText}
          setMonthText={setMonthText}
          isPeriod={isPeriod}
          onTogglePeriod={setIsPeriod}
          endYearText={endYearText}
          setEndYearText={setEndYearText}
          endMonthText={endMonthText}
          setEndMonthText={setEndMonthText}
          birthYear={birthYear}
        />
      )}

      {/* 제목 */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="event-title"
          className="text-lg font-semibold text-ink"
        >
          어떤 일이었는지 한 줄로
        </label>
        <input
          id="event-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="예: 친구들과 첫 여행, 큰 병원 입원"
          maxLength={80}
          autoComplete="off"
          className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
      </section>

      {/* 장소 (선택) */}
      <section className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-ink">
          어디였나요? <span className="font-normal text-ink-faint">(선택)</span>
        </p>
        <p className="text-base text-ink-soft">
          장소 이름을 검색해서 골라주세요. 모르시면 안 골라도 돼요.
        </p>
        <PlaceSearchInput value={place} onChange={setPlace} />
      </section>

      {/* 자유 보조 */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="event-content"
          className="text-lg font-semibold text-ink"
        >
          더 떠오르는 게 있다면{" "}
          <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <VoiceTextarea
          value={content}
          onChange={setContent}
          rows={5}
          placeholder="그날의 장면, 함께 있던 사람…"
          ariaLabel="자유 보조 내용"
        />
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      {/* 보조 섹션(편집 모드 사진 첨부 등) — 취소/저장 버튼 바로 위. */}
      {children}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/life-timeline"
          className={buttonClasses("tertiary", "lg")}
        >
          ← 취소
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {isPending ? "저장 중…" : isEdit ? "수정 저장" : "추가하기"}
        </button>
      </div>
    </div>
  );
}

// 모드 라디오 — 큰 카드 2장.
function ModeRadio({
  value,
  onChange,
  options,
}: {
  value: Mode;
  onChange: (v: Mode) => void;
  options: { value: Mode; label: string; hint: string }[];
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={
              "flex flex-col items-start gap-2 rounded-md border-2 px-5 py-4 text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
              (selected
                ? "border-amber-600 bg-amber-50"
                : "border-line bg-surface hover:border-brand")
            }
          >
            <span
              className={
                "text-lg font-bold " +
                (selected ? "text-amber-900" : "text-ink")
              }
            >
              {selected ? "● " : "○ "}
              {o.label}
            </span>
            <span className="text-base text-ink-soft">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

function parseIntOrNullLocal(t: string): number | null {
  const trimmed = t.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n;
}

// 앵커 사이 모드 입력.
function BetweenSection({
  anchors,
  anchorBeforeId,
  setAnchorBeforeId,
  anchorAfterId,
  setAnchorAfterId,
  estimatedYear,
  yearText,
  onYearChange,
  birthYear,
}: {
  anchors: AnchorOption[];
  anchorBeforeId: string;
  setAnchorBeforeId: (v: string) => void;
  anchorAfterId: string;
  setAnchorAfterId: (v: string) => void;
  estimatedYear: number | null;
  yearText: string;
  onYearChange: (v: string) => void;
  birthYear: number | null;
}) {
  const yearNum = parseIntOrNullLocal(yearText);
  const ageHint =
    birthYear !== null && yearNum !== null ? calcAge(birthYear, yearNum) : null;
  return (
    <section className="flex flex-col gap-3 rounded-md border-2 border-amber-200 bg-amber-50 p-5">
      <p className="text-lg font-semibold text-amber-900">
        어느 사건과 어느 사건 사이에 있었나요?
      </p>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink">
            이 사건 <b>다음에</b> 있었어요
          </span>
          <select
            value={anchorBeforeId}
            onChange={(e) => setAnchorBeforeId(e.target.value)}
            className="rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <option value="">— 골라주세요 —</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-base font-semibold text-ink">
            이 사건 <b>전에</b> 있었어요
          </span>
          <select
            value={anchorAfterId}
            onChange={(e) => setAnchorAfterId(e.target.value)}
            className="rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          >
            <option value="">— 골라주세요 —</option>
            {anchors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        <label htmlFor="between-year" className="text-base text-ink-soft">
          추정 연도{" "}
          {estimatedYear !== null && (
            <span className="text-ink-faint">
              (자동으로 {estimatedYear}년으로 잡았어요 — 다르면 고쳐주세요)
            </span>
          )}
        </label>
        <input
          id="between-year"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={yearText}
          onChange={(e) =>
            onYearChange(e.target.value.replace(/\D/g, "").slice(0, 4))
          }
          placeholder="예: 1985"
          className="w-40 rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
        {ageHint && (
          <p className="mt-1 text-sm text-amber-900">
            그때 {formatAge(ageHint)}쯤이에요
          </p>
        )}
      </div>
      <p className="text-base text-ink-soft">
        대략적인 시점으로 저장돼요 — 연혁에서 작은 점선 점으로 보여요.
      </p>
    </section>
  );
}

// 정확 모드 입력.
function ExactSection({
  yearText,
  setYearText,
  monthText,
  setMonthText,
  isPeriod,
  onTogglePeriod,
  endYearText,
  setEndYearText,
  endMonthText,
  setEndMonthText,
  birthYear,
}: {
  yearText: string;
  setYearText: (v: string) => void;
  monthText: string;
  setMonthText: (v: string) => void;
  isPeriod: boolean;
  onTogglePeriod: (v: boolean) => void;
  endYearText: string;
  setEndYearText: (v: string) => void;
  endMonthText: string;
  setEndMonthText: (v: string) => void;
  birthYear: number | null;
}) {
  const yearNum = parseIntOrNullLocal(yearText);
  const endYearNum = parseIntOrNullLocal(endYearText);
  const startAge =
    birthYear !== null && yearNum !== null ? calcAge(birthYear, yearNum) : null;
  const endAge =
    birthYear !== null && endYearNum !== null
      ? calcAge(birthYear, endYearNum)
      : null;

  return (
    <section className="flex flex-col gap-3">
      <p className="text-lg font-semibold text-ink">
        {isPeriod ? "언제 시작했어요?" : "언제였어요?"}
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="exact-year" className="block text-base text-ink-soft">
            {isPeriod ? "시작한 해" : "연도"}
          </label>
          <input
            id="exact-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={yearText}
            onChange={(e) =>
              setYearText(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="예: 1985"
            className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          />
          {startAge && (
            <p className="mt-1 text-sm text-ink-soft">
              그때 {formatAge(startAge)}쯤이에요
            </p>
          )}
        </div>
        <div className="w-32">
          <label
            htmlFor="exact-month"
            className="block text-base text-ink-soft"
          >
            월 (선택)
          </label>
          <input
            id="exact-month"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={monthText}
            onChange={(e) =>
              setMonthText(e.target.value.replace(/\D/g, "").slice(0, 2))
            }
            placeholder="3"
            className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          />
        </div>
      </div>
      <p className="text-base text-ink-soft">
        월을 적으시면 정확한 시점(앵커)으로, 비워두시면 대략 시점으로 저장돼요.
      </p>

      {/* L4(+) — 기간 토글. 학교·군대처럼 한동안 이어진 일이면 끝 시점도 입력. */}
      <button
        type="button"
        role="switch"
        aria-checked={isPeriod}
        onClick={() => onTogglePeriod(!isPeriod)}
        className={
          "flex items-center gap-3 rounded-md border-2 px-4 py-3 text-left text-lg font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 " +
          (isPeriod
            ? "border-amber-500 bg-amber-50 text-amber-900"
            : "border-line bg-surface text-ink hover:bg-banner")
        }
      >
        <span aria-hidden className="text-2xl">
          {isPeriod ? "☑" : "☐"}
        </span>
        한동안 이어진 일이에요 (시작~끝 기간으로 입력)
      </button>

      {isPeriod && (
        <div className="flex flex-col gap-1">
          <p className="text-base font-semibold text-ink">
            언제 끝났어요? <span className="font-normal text-ink-faint">(선택)</span>
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label
                htmlFor="exact-end-year"
                className="block text-base text-ink-soft"
              >
                끝난 해
              </label>
              <input
                id="exact-end-year"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={endYearText}
                onChange={(e) =>
                  setEndYearText(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="예: 1991"
                className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
              />
              {endAge && (
                <p className="mt-1 text-sm text-ink-soft">
                  그때 {formatAge(endAge)}쯤이에요
                </p>
              )}
            </div>
            <div className="w-32">
              <label
                htmlFor="exact-end-month"
                className="block text-base text-ink-soft"
              >
                월 (선택)
              </label>
              <input
                id="exact-end-month"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={endMonthText}
                onChange={(e) =>
                  setEndMonthText(e.target.value.replace(/\D/g, "").slice(0, 2))
                }
                placeholder="2"
                disabled={endYearText.trim() === ""}
                className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-faint"
              />
            </div>
          </div>
          <p className="text-base text-ink-soft">
            모르거나 아직 안 끝났으면 비워두셔도 돼요. 적으시면 연혁에{" "}
            <b>시작·끝 두 점</b>으로 보여요.
          </p>
        </div>
      )}
    </section>
  );
}

