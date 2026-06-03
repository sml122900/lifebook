"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { VoiceTextarea } from "@/app/components/VoiceTextarea";
import { calcAge, formatAge } from "@/lib/age";

import {
  createPersonAction,
  updatePersonAction,
  type PersonInputRaw,
} from "./actions";

// Phase P2 — 인물 추가/수정 공용 폼.
//
// 시니어 친화: 큰 라벨/입력, 큰 버튼, 자유 입력 보조에 음성(VoiceTextarea).
// 관계는 datalist 힌트로 후보 제시 (강제 선택 X — 자유 텍스트).
// 나이 자동 표시는 lib/age.ts 의 calcAge 재사용 — birthYear 가 없으면 표시 X.

export type PersonFormInitial = {
  id: string;
  name: string;
  relation: string | null;
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

export function PersonForm({
  mode,
  initial,
  birthYear = null,
  returnTo = null,
}: {
  mode: "add" | "edit";
  initial?: PersonFormInitial;
  birthYear?: number | null;
  // P3 — /people/new?returnTo=/life-timeline 같은 식으로 진입했을 때 저장
  // 후 그 경로로 돌아간다. null 이면 기본(추가→상세, 수정→상세).
  // 보안 — relative 경로(/로 시작) 만 허용 (외부 URL open redirect 방지).
  returnTo?: string | null;
}) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [name, setName] = useState(initial?.name ?? "");
  const [relation, setRelation] = useState(initial?.relation ?? "");
  const [metYearText, setMetYearText] = useState(
    initial?.metYear != null ? String(initial.metYear) : "",
  );
  const [memo, setMemo] = useState(initial?.memo ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 나이 힌트 — birthYear 와 metYear 둘 다 있을 때만.
  const metYearNum = parseIntOrNull(metYearText);
  const ageHint =
    birthYear !== null && metYearNum !== null
      ? calcAge(birthYear, metYearNum)
      : null;

  function buildRaw(): PersonInputRaw {
    return {
      name,
      relation: relation.trim() === "" ? null : relation,
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
      // returnTo 가 있으면 그곳으로 (추가 모드만; 수정은 항상 상세로).
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
          className="text-lg font-semibold text-zinc-900"
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
          className="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
        <p className="text-sm text-zinc-600">
          실명이 부담스러우면 별명·이니셜로 적어도 돼요.
        </p>
      </section>

      {/* 관계 (선택, datalist 힌트) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-relation"
          className="text-lg font-semibold text-zinc-900"
        >
          관계 <span className="font-normal text-zinc-500">(선택)</span>
        </label>
        <input
          id="person-relation"
          type="text"
          value={relation}
          onChange={(e) => setRelation(e.target.value)}
          maxLength={30}
          list="person-relation-hints"
          placeholder="예: 초등 친구, 직장 동료, 이웃"
          autoComplete="off"
          className="w-full rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
        />
        <datalist id="person-relation-hints">
          {RELATION_HINTS.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </section>

      {/* 처음 만난 연도 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-met-year"
          className="text-lg font-semibold text-zinc-900"
        >
          처음 만난 연도{" "}
          <span className="font-normal text-zinc-500">(선택)</span>
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
            className="w-40 rounded-md border-2 border-zinc-300 bg-white px-4 py-3 text-xl text-zinc-900 focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 focus-visible:ring-offset-2"
          />
          {ageHint && (
            <p className="text-base text-zinc-700">
              그때 {formatAge(ageHint)}쯤이었어요
            </p>
          )}
        </div>
      </section>

      {/* 메모 (선택) */}
      <section className="flex flex-col gap-2">
        <label
          htmlFor="person-memo"
          className="text-lg font-semibold text-zinc-900"
        >
          한 줄 메모 <span className="font-normal text-zinc-500">(선택)</span>
        </label>
        <VoiceTextarea
          value={memo}
          onChange={setMemo}
          rows={3}
          placeholder="이 분에 대해 떠오르는 한 마디"
          ariaLabel="인물 한 줄 메모"
        />
        <p className="text-sm text-zinc-600">최대 100자까지 적어주세요.</p>
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
          className="inline-flex min-h-[56px] items-center justify-center rounded-md border-2 border-zinc-300 px-5 py-3 text-lg font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          ← 취소
        </Link>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isPending}
          className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-zinc-900 px-6 py-3 text-lg font-bold text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:bg-zinc-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
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
