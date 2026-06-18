"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { buttonClasses } from "@/components/ui/Button";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { calcAge, formatAge } from "@/lib/age";

import {
  createPersonAction,
  updatePersonAction,
  type PersonInputRaw,
} from "./actions";

export type PersonFormInitial = {
  id: string;
  name: string;
  relation: string | null;
  birthYear: number | null;
  category: string | null;
  metYear: number | null;
  memo: string | null;
};

const RELATION_HINTS = [
  "초등 친구",
  "중학교 친구",
  "고등학교 친구",
  "대학교 친구",
  "직장 동료",
  "직장 선배",
  "직장 후배",
  "이웃",
  "가족",
  "은사님",
  "동아리",
];

const CATEGORY_PRESETS = ["가족", "친척", "친구", "직장", "이웃", "기타"];

export function PersonForm({
  mode,
  initial,
  birthYear: userBirthYear = null,
  returnTo = null,
}: {
  mode: "add" | "edit";
  initial?: PersonFormInitial;
  // 사용자 본인의 출생년도 — metYear 나이 힌트 + 인물 나이차 계산용
  birthYear?: number | null;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [name, setName] = useState(initial?.name ?? "");
  const [relation, setRelation] = useState(initial?.relation ?? "");
  const [category, setCategory] = useState(initial?.category ?? "");
  const [personBirthYearText, setPersonBirthYearText] = useState(
    initial?.birthYear != null ? String(initial.birthYear) : "",
  );
  // 나이차 헬퍼 — "나보다 N살 위/아래" 입력
  const [ageDiffText, setAgeDiffText] = useState("");
  const [ageDiffDir, setAgeDiffDir] = useState<"above" | "below">("above");
  const [metYearText, setMetYearText] = useState(
    initial?.metYear != null ? String(initial.metYear) : "",
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const personBirthYear = parseIntOrNull(personBirthYearText);

  // metYear 기준 나이 힌트 (본인 생년 사용)
  const metYearNum = parseIntOrNull(metYearText);
  const ageHint =
    userBirthYear !== null && metYearNum !== null
      ? calcAge(userBirthYear, metYearNum)
      : null;

  // 나이차 → 인물 birthYear 환산
  function applyAgeDiff() {
    if (userBirthYear === null) return;
    const diff = parseIntOrNull(ageDiffText);
    if (diff === null || diff < 0) return;
    const computed =
      ageDiffDir === "above" ? userBirthYear - diff : userBirthYear + diff;
    setPersonBirthYearText(String(computed));
    setAgeDiffText("");
  }

  function buildRaw(): PersonInputRaw {
    return {
      name,
      relation: relation.trim() === "" ? null : relation,
      birthYear: personBirthYear,
      category: category.trim() === "" ? null : category,
      metYear: metYearNum,
      memo: memo.trim() === "" ? null : memo,
    };
  }

  function handleSubmit() {
    setError(null);
    const raw = buildRaw();
    startTransition(async () => {
      const result =
        isEdit && initial
          ? await updatePersonAction(initial.id, raw)
          : await createPersonAction(raw);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const dest =
        !isEdit && returnTo ? returnTo : `/people/${result.id}`;
      router.push(dest);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-7">
      {/* 이름 (필수) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-name"
          className="text-lg font-semibold text-ink"
        >
          이름 또는 별명{" "}
          <span className="font-normal text-rose-700">*</span>
        </label>
        <input
          id="person-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          placeholder="예: 철수, 김OO 선생님, 옆집 누나"
          autoComplete="off"
          className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
        <p className="text-sm text-ink-soft">
          실명이 부담스러우면 별명·이니셜로 적어도 돼요.
        </p>
      </section>

      {/* 카테고리 (선택) */}
      <section className="flex flex-col gap-2">
        <label className="text-lg font-semibold text-ink">
          분류 <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {CATEGORY_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() =>
                setCategory((prev) => (prev === preset ? "" : preset))
              }
              className={[
                "min-h-[44px] rounded-full px-4 py-2 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
                category === preset
                  ? "bg-amber-500 text-white"
                  : "border-2 border-line bg-surface text-ink hover:bg-banner",
              ].join(" ")}
            >
              {preset}
            </button>
          ))}
        </div>
        <input
          id="person-category"
          type="text"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          maxLength={30}
          placeholder="직접 입력 (예: 군대 전우, 교회 지인)"
          autoComplete="off"
          className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
      </section>

      {/* 관계 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-relation"
          className="text-lg font-semibold text-ink"
        >
          관계 설명 <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <input
          id="person-relation"
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          maxLength={30}
          list="person-relation-hints"
          placeholder="관계"
          autoComplete="off"
          className="w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
        <datalist id="person-relation-hints">
          {RELATION_HINTS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </section>

      {/* 출생년도 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-birth-year"
          className="text-lg font-semibold text-ink"
        >
          출생년도 <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            id="person-birth-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={personBirthYearText}
            onChange={(e) =>
              setPersonBirthYearText(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="예: 1950"
            className="w-40 rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          />
          {personBirthYear !== null && userBirthYear !== null && (
            <p className="text-base text-ink-soft">
              나보다{" "}
              {Math.abs(userBirthYear - personBirthYear)}살{" "}
              {personBirthYear < userBirthYear ? "위" : personBirthYear > userBirthYear ? "아래" : "동갑"}
            </p>
          )}
        </div>
        {/* 나이차 헬퍼 — 본인 birthYear 있을 때만 */}
        {userBirthYear !== null && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base text-ink-soft">나보다</span>
            <input
              type="text"
              inputMode="numeric"
              value={ageDiffText}
              onChange={(e) =>
                setAgeDiffText(e.target.value.replace(/\D/g, "").slice(0, 3))
              }
              placeholder="0"
              className="w-20 rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-amber-500 focus:outline-none"
            />
            <span className="text-base text-ink-soft">살</span>
            <button
              type="button"
              onClick={() => setAgeDiffDir("above")}
              className={[
                "min-h-[40px] rounded-full px-3 py-1 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                ageDiffDir === "above"
                  ? "bg-amber-500 text-white"
                  : "border border-line bg-surface text-ink",
              ].join(" ")}
            >
              위
            </button>
            <button
              type="button"
              onClick={() => setAgeDiffDir("below")}
              className={[
                "min-h-[40px] rounded-full px-3 py-1 text-base font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500",
                ageDiffDir === "below"
                  ? "bg-amber-500 text-white"
                  : "border border-line bg-surface text-ink",
              ].join(" ")}
            >
              아래
            </button>
            <button
              type="button"
              onClick={applyAgeDiff}
              disabled={!ageDiffText || parseIntOrNull(ageDiffText) === null}
              className="min-h-[40px] rounded-md border border-amber-400 bg-amber-50 px-3 py-1 text-base text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
              적용
            </button>
          </div>
        )}
      </section>

      {/* 처음 만난 연도 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-met-year"
          className="text-lg font-semibold text-ink"
        >
          처음 만난 연도{" "}
          <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <div className="flex items-center gap-3">
          <input
            id="person-met-year"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={metYearText}
            onChange={(e) =>
              setMetYearText(e.target.value.replace(/\D/g, "").slice(0, 4))
            }
            placeholder="예: 1985"
            className="w-40 rounded-md border-2 border-line bg-surface px-4 py-3 text-xl text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          />
          {ageHint && (
            <p className="text-base text-ink-soft">
              그때 {formatAge(ageHint)}쯤이었어요
            </p>
          )}
        </div>
      </section>

      {/* 메모 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-memo"
          className="text-lg font-semibold text-ink"
        >
          메모 <span className="font-normal text-ink-faint">(선택)</span>
        </label>
        <VoiceTextarea
          value={memo}
          onChange={setMemo}
          rows={3}
          placeholder="이 분에 대해 떠오르는 한 마디"
          ariaLabel="인물 메모"
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

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={
            isEdit && initial
              ? `/people/${initial.id}`
              : returnTo ?? "/people"
          }
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

function parseIntOrNull(t: string): number | null {
  const trimmed = t.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isInteger(n)) return null;
  return n;
}
