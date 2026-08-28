"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";

import { completeOnboarding } from "@/app/actions/onboarding";

const MIN_BIRTH_YEAR = 1920;
const MAX_BIRTH_YEAR = 2015;

const GENDERS = ["남", "여", "선택안함"] as const;

// 17개 시/도 (2026 기준 명칭 — 강원특별자치도·전북특별자치도 반영).
const REGIONS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시",
  "대전광역시", "울산광역시", "세종특별자치시", "경기도", "강원특별자치도",
  "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도",
  "경상남도", "제주특별자치도",
];

const FIELD_CLASS =
  "w-full rounded-md border-2 border-line px-4 py-3 text-xl focus:border-action focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2";

type SubmitState = { phase: "idle" } | { phase: "error"; message: string };

export function OnboardingV2Form({ userId }: { userId: string }) {
  const router = useRouter();
  const [birthYear, setBirthYear] = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender, setGender] = useState<(typeof GENDERS)[number] | "">("");
  const [region, setRegion] = useState("");
  const [state, setState] = useState<SubmitState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  const yearNum = Number(birthYear);
  const isYearValid =
    birthYear !== "" &&
    Number.isInteger(yearNum) &&
    yearNum >= MIN_BIRTH_YEAR &&
    yearNum <= MAX_BIRTH_YEAR;
  const canSubmit = isYearValid && gender !== "" && region !== "" && !isPending;

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    setState({ phase: "idle" });
    startTransition(async () => {
      try {
        await completeOnboarding(userId, {
          birthYear: yearNum,
          birthMonth: birthMonth === "" ? null : Number(birthMonth),
          gender,
          region,
        });
        // STAGE2(확인질문 채팅)로 자동 이동 — CREATED/ALREADY_DONE 둘 다 확인질문
        // 대상 LifeEvent 가 DB 에 있으므로 같은 경로로 넘어간다.
        router.push("/onboarding-confirm");
      } catch (err) {
        console.error("[onboarding-v2]", err);
        setState({
          phase: "error",
          message: "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <section className="rounded-md border-2 border-line bg-surface p-5">
        <label htmlFor="birthYear" className="text-lg font-semibold text-ink">
          태어난 해
        </label>
        <p className="mt-1 text-base text-ink-soft">예: 1958</p>
        <input
          id="birthYear"
          type="number"
          inputMode="numeric"
          min={MIN_BIRTH_YEAR}
          max={MAX_BIRTH_YEAR}
          placeholder="예: 1958"
          value={birthYear}
          onChange={(e) => setBirthYear(e.target.value)}
          className={`mt-3 ${FIELD_CLASS}`}
        />
      </section>

      <section className="rounded-md border-2 border-line bg-surface p-5">
        <label htmlFor="birthMonth" className="text-lg font-semibold text-ink">
          태어난 달 <span className="text-base font-normal text-ink-soft">(선택)</span>
        </label>
        <input
          id="birthMonth"
          type="number"
          inputMode="numeric"
          min={1}
          max={12}
          placeholder="예: 3"
          value={birthMonth}
          onChange={(e) => setBirthMonth(e.target.value)}
          className={`mt-3 ${FIELD_CLASS}`}
        />
      </section>

      <section className="rounded-md border-2 border-line bg-surface p-5">
        <p className="text-lg font-semibold text-ink">성별</p>
        <div className="mt-3 flex flex-col gap-3" role="radiogroup" aria-label="성별">
          {GENDERS.map((g) => (
            <label
              key={g}
              className="flex min-h-[56px] items-center gap-3 rounded-md border-2 border-line px-4 py-2 text-lg text-ink has-[:checked]:border-action has-[:checked]:bg-banner"
            >
              <input
                type="radio"
                name="gender"
                value={g}
                checked={gender === g}
                onChange={() => setGender(g)}
                className="h-6 w-6"
              />
              {g}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-md border-2 border-line bg-surface p-5">
        <label htmlFor="region" className="text-lg font-semibold text-ink">
          사시는 곳 (시/도)
        </label>
        <select
          id="region"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
          className={`mt-3 ${FIELD_CLASS}`}
        >
          <option value="" disabled>
            선택해 주세요
          </option>
          {REGIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </section>

      {state.phase === "error" && (
        <p className="text-base text-rose-700" role="alert">
          {state.message}
        </p>
      )}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        disabled={!canSubmit}
        className="w-full"
      >
        {isPending ? "저장 중…" : "다음"}
      </Button>
    </form>
  );
}
