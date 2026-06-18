"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { PlaceSearchInput } from "@/app/components/PlaceSearchInput";
import { RefineInline } from "@/app/components/RefineInline";
import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { calcAge, formatAge } from "@/lib/age";
import { EMPTY_PLACE, type PlaceInfo } from "@/lib/place-types";
import type { LifeQuestion } from "@/lib/life-record/questions";
import type { LifeCategory } from "@/lib/generated/prisma/enums";

import { skipLifeRecord, submitLifeRecord } from "../actions";

// Phase L2 — 카테고리 폼(클라). 한 카테고리에 대해 제목·연·월·자유 응답
// 을 한 화면에 모아 받는다. "저장하고 다음" / "건너뛰기" / "전체 목록".
//
// L2(+) 확장:
//   - isPeriod=true 면 "끝난 해(선택)" 입력란 노출 — 학령기 5종/MILITARY/WORK
//   - birthYear 가 있으면 시작/끝 연도 입력 옆에 작게 나이 표시 — 어르신이
//     연도 떠올리기 어려운데 나이는 안다는 인사이트의 보조선
//   - "건너뛰기" 가 server action(skipLifeRecord) 호출 — 다시 후보로 안 잡히게
//
// 시니어 친화:
//   - 큰 라벨, 큰 입력 박스 (text-xl, py-3)
//   - 명확한 에러 ("연도를 적어주세요" 등 무엇을 하면 되는지)
//   - 음성 입력은 자유 응답에만 (제목·연도는 짧아 키보드가 더 빠름)
//   - 나이 표시는 *작고 보조적*으로(메인 입력 방해 X)
//   - 끝 연도 입력은 *시작 옆에 작게* — 메인은 시작

type InitialAnswer = {
  title: string;
  year: number;
  month: number | null;
  endYear: number | null;
  endMonth: number | null;
  content: string;
  place: PlaceInfo;
} | null;

export function CategoryForm({
  category,
  question,
  isPeriod,
  birthYear,
  initial,
  nextHref,
  backHref,
}: {
  category: LifeCategory;
  question: LifeQuestion;
  isPeriod: boolean;
  birthYear: number | null;
  initial: InitialAnswer;
  nextHref: string;
  backHref: string;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? "");
  const [yearText, setYearText] = useState(
    initial?.year != null ? String(initial.year) : "",
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
  const [content, setContent] = useState(initial?.content ?? "");
  const [place, setPlace] = useState<PlaceInfo>(initial?.place ?? EMPTY_PLACE);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasExisting = initial !== null;

  function parseIntOrNull(t: string): number | null {
    const trimmed = t.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    if (!Number.isInteger(n)) return null;
    return n;
  }

  function handleSave() {
    setError(null);
    const year = parseIntOrNull(yearText);
    const month = parseIntOrNull(monthText);
    const endYear = isPeriod ? parseIntOrNull(endYearText) : null;
    const endMonth =
      isPeriod && endYear !== null ? parseIntOrNull(endMonthText) : null;
    startTransition(async () => {
      const result = await submitLifeRecord(category, {
        title,
        year,
        month,
        endYear,
        endMonth,
        content: content.trim() === "" ? null : content,
        place: {
          placeName: place.placeName,
          placeAddress: place.placeAddress,
          lat: place.lat,
          lng: place.lng,
          placeSource: place.placeSource,
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(nextHref);
      router.refresh();
    });
  }

  function handleSkip() {
    setError(null);
    startTransition(async () => {
      const result = await skipLifeRecord(category);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // 인덱스 화면(/life-record)으로 — 시간 순으로 이어지는 질문이라 하나
      // 건너뛰면 다음도 모를 확률이 높음(예: "고등학교" 모르면 "대학교"도).
      // 자동으로 다음 질문에 박지 말고, 어느 질문이 답함/건너뜀/아직인지
      // 한눈에 보고 원하는 것부터 고를 수 있게.
      router.push("/life-record");
      router.refresh();
    });
  }

  // 입력 연도 옆 작은 나이 보조 — birthYear 가 있고 입력한 연도가 출생 이후일 때만.
  const yearNum = parseIntOrNull(yearText);
  const ageForYear =
    birthYear !== null && yearNum !== null ? calcAge(birthYear, yearNum) : null;
  const endYearNum = parseIntOrNull(endYearText);
  const ageForEndYear =
    birthYear !== null && endYearNum !== null
      ? calcAge(birthYear, endYearNum)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {hasExisting ? (
        <div
          className="rounded-md border-2 border-emerald-300 bg-emerald-50 px-5 py-4 text-base text-emerald-900"
          role="status"
        >
          이미 답하신 항목이에요. 수정하시려면 아래를 고친 뒤 저장해 주세요.
        </div>
      ) : (
        // 새 답 작성 시 노출(이미 답한 항목 수정 흐름엔 X). "지금은 큰 줄기
        // 한 가지만 적어도 OK + 사건은 연혁 화면에서 언제든 추가" 라는 정신
        // 모델을 첫 답부터 심어주기 위한 안내. 시니어 친화: 키워드만 굵게,
        // 두 단락 정도로 짧게.
        <div
          className="rounded-md border-2 border-brand border-l-4 border-l-brand bg-banner px-5 py-4"
          role="note"
        >
          <p className="text-base font-semibold text-action">
            지금 받는 질문은 인생 연혁의 기반이에요.
          </p>
          <p className="mt-1.5 text-sm text-action">
            큰 줄기 한 가지만 적어주시면 됩니다. 같은 시기에 여러 사건(예:
            초등학교 동안 이사 두 번)이 있어도, 답을 마친 뒤 <b>인생 연혁</b>{" "}
            화면에서 언제든 자유롭게 추가할 수 있어요. 모르거나 떠올리기
            어려우면 <b>건너뛰기</b> 를 눌러주세요.
          </p>
        </div>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="life-title" className="text-lg font-semibold text-ink">
          {question.titleLabel}
        </label>
        <input
          id="life-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={question.titlePlaceholder}
          maxLength={80}
          className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          autoComplete="off"
        />
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-ink">
          {isPeriod ? "언제 시작했어요?" : "언제였어요?"}
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label
              htmlFor="life-year"
              className="block text-base text-ink-soft"
            >
              {isPeriod ? "시작한 해" : "연도"}
            </label>
            <input
              id="life-year"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={yearText}
              onChange={(e) => setYearText(e.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="예: 1985"
              className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            />
            {ageForYear && (
              <p className="mt-1 text-sm text-ink-soft">
                그때 {formatAge(ageForYear)}쯤이에요
              </p>
            )}
          </div>
          <div className="w-32">
            <label
              htmlFor="life-month"
              className="block text-base text-ink-soft"
            >
              월 (선택)
            </label>
            <input
              id="life-month"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={monthText}
              onChange={(e) => setMonthText(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder="3"
              className="mt-1 w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
            />
          </div>
        </div>
        <p className="text-base text-ink-soft">
          정확한 달이 안 떠오르시면 비워두셔도 돼요.
        </p>
      </section>

      {isPeriod && (
        <section className="flex flex-col gap-2">
          <p className="text-lg font-semibold text-ink">
            언제 끝났어요? <span className="font-normal text-ink-faint">(선택)</span>
          </p>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="life-end-year" className="block text-base text-ink-soft">
                끝난 해
              </label>
              <input
                id="life-end-year"
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
              {ageForEndYear && (
                <p className="mt-1 text-sm text-ink-soft">
                  그때 {formatAge(ageForEndYear)}쯤이에요
                </p>
              )}
            </div>
            <div className="w-32">
              <label
                htmlFor="life-end-month"
                className="block text-base text-ink-soft"
              >
                월 (선택)
              </label>
              <input
                id="life-end-month"
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
            모르거나 아직 안 끝났으면 비워두셔도 돼요. 끝난 해를 적으시면 연혁
            에 <b>시작·끝 두 점</b>으로 표시돼요.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-lg font-semibold text-ink">
          어디였나요? <span className="font-normal text-ink-faint">(선택)</span>
        </p>
        <p className="text-base text-ink-soft">
          장소 이름을 검색해서 골라주세요. 모르시면 안 골라도 돼요.
        </p>
        <PlaceSearchInput value={place} onChange={setPlace} />
      </section>

      <section className="flex flex-col gap-2">
        <label
          htmlFor="life-content"
          className="text-lg font-semibold text-ink"
        >
          {question.contentLabel} <span className="text-ink-faint">(선택)</span>
        </label>
        <VoiceTextarea
          value={content}
          onChange={setContent}
          rows={5}
          placeholder={question.contentPlaceholder}
          ariaLabel={question.contentLabel}
        />
      </section>

      <RefineInline content={content} onApply={setContent} />

      {error && (
        <p
          role="alert"
          className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={backHref}
          className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-line px-5 py-3 text-lg font-semibold text-ink hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          ← 전체 목록
        </Link>

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleSkip}
            disabled={isPending}
            className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-line px-6 py-3 text-lg font-semibold text-ink hover:bg-banner disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            건너뛰기
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending}
            className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            {isPending ? "저장 중…" : "저장하고 다음 →"}
          </button>
        </div>
      </div>
    </div>
  );
}
