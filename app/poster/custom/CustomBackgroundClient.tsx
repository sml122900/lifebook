"use client";

// P5-5b — 맞춤배경 생성 UI. 취향 확인/입력 → 사전안내 → 생성(애니메이션) →
// 미리보기 + 다시생성(잔여·새세트 확인) + 결정(5c 자리). reason 분기 처리.
// 어르신 친화: 큰 버튼·명확 안내·부드러운 대기 피드백.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { generateCustomBackground, saveCustomBackground } from "./actions";
import { saveUserPreferences } from "./preferences-actions";

type Props = {
  extracted: string[];
  initialUserPrefs: string[];
  initialRegensLeft: number;
  initialSetExhausted: boolean;
  initialBalance: number;
  tokenCost: number;
  imagesPerSet: number;
};

type ResultState = {
  imageDataUrl: string;
  regensLeft: number;
  unstable: boolean;
};

export function CustomBackgroundClient({
  extracted,
  initialUserPrefs,
  initialRegensLeft,
  initialBalance,
  tokenCost,
  imagesPerSet,
}: Props) {
  const [prefsText, setPrefsText] = useState(initialUserPrefs.join("\n"));
  const [balance, setBalance] = useState(initialBalance);
  const [regensLeft, setRegensLeft] = useState(initialRegensLeft);

  const [result, setResult] = useState<ResultState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showNewSetConfirm, setShowNewSetConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // "이 배경으로 결정" — Storage 저장 + template=custom → 노드/메모 고르기로.
  async function onDecide() {
    if (!result) return;
    setSaving(true);
    setDecideError(null);
    const res = await saveCustomBackground(result.imageDataUrl);
    if (res.ok) {
      router.push("/poster/select");
    } else {
      setDecideError(res.error);
      setSaving(false);
    }
  }

  function parsePrefs(): string[] {
    return prefsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }

  // 생성 실행. saveFirst=true 면 취향 먼저 저장(최초 "배경 만들기"). regen 은 false.
  function generate(confirmNewSet: boolean, saveFirst: boolean) {
    setError(null);
    setShowNewSetConfirm(false);
    setDecideError(null);
    startTransition(async () => {
      if (saveFirst) {
        await saveUserPreferences(parsePrefs());
      }
      const res = await generateCustomBackground(confirmNewSet);
      if (res.ok) {
        setResult({
          imageDataUrl: res.imageDataUrl,
          regensLeft: res.regensLeft,
          unstable: res.unstable,
        });
        setRegensLeft(res.regensLeft);
        setBalance(res.balanceAfter);
        return;
      }
      switch (res.reason) {
        case "need_new_set_confirm":
          setShowNewSetConfirm(true);
          break;
        case "insufficient_balance":
          setError(
            `토큰이 부족해요. 맞춤 배경 한 세트는 ${tokenCost}토큰이 필요해요. 충전 후 다시 시도해 주세요.`,
          );
          break;
        case "gen_failed":
          setError(res.message ?? "그림을 그리지 못했어요. 잠시 후 다시 시도해 주세요.");
          break;
        default:
          setError("문제가 생겼어요. 다시 시도해 주세요.");
      }
    });
  }

  const FIELD =
    "w-full rounded-md border-2 border-line bg-surface px-4 py-3 text-lg text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500";

  return (
    <div className="flex flex-col gap-6">
      {/* 잔액 */}
      <p className="text-base text-ink-soft">
        내 토큰 <b className="text-ink">{balance}</b>개
      </p>

      {/* 취향 — 추출분 표시 + 사용자 입력 */}
      <section className="flex flex-col gap-3 rounded-md border-2 border-line bg-surface p-5">
        <h2 className="text-lg font-bold text-ink">어떤 분위기를 좋아하세요?</h2>

        {extracted.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-sm text-ink-soft">대화에서 알게 된 취향이에요</p>
            <div className="flex flex-wrap gap-2">
              {extracted.map((e, i) => (
                <span
                  key={i}
                  className="rounded-full border-2 border-line bg-canvas px-3 py-1 text-sm text-ink-soft"
                >
                  {e}
                </span>
              ))}
            </div>
          </div>
        )}

        <label className="mt-1 flex flex-col gap-2">
          <span className="text-base font-semibold text-ink">
            직접 적으시면 더 잘 반영돼요 (한 줄에 하나씩)
          </span>
          <textarea
            value={prefsText}
            onChange={(e) => setPrefsText(e.target.value)}
            rows={4}
            placeholder={"예: 하늘색을 좋아해요\n보라색 꽃\n담백하고 따뜻한 느낌"}
            className={FIELD}
          />
        </label>
        <p className="text-sm text-ink-soft">
          이 취향으로 배경을 만들어요. 적은 내용이 더 우선해요.
        </p>
      </section>

      {/* 사전 안내 + 만들기 */}
      {!result && !isPending && (
        <div className="flex flex-col gap-3">
          <p className="rounded-md border-2 border-brand bg-banner px-4 py-3 text-base font-semibold text-action">
            맞춤 배경 만들기 = {tokenCost}토큰. 한 번 만들면 마음에 들 때까지 {imagesPerSet}장까지 다시 만들 수 있어요.
          </p>
          <button
            type="button"
            onClick={() => generate(false, true)}
            className="inline-flex min-h-[56px] items-center justify-center rounded-md bg-action px-6 py-4 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            배경 만들기 ({tokenCost}토큰)
          </button>
        </div>
      )}

      {/* 생성 중 애니메이션 */}
      {isPending && (
        <div className="flex flex-col items-center gap-4 rounded-md border-2 border-line bg-surface px-6 py-12 text-center">
          <div className="flex gap-2" aria-hidden>
            <span className="h-3 w-3 animate-bounce rounded-full bg-brand [animation-delay:-0.3s]" />
            <span className="h-3 w-3 animate-bounce rounded-full bg-brand [animation-delay:-0.15s]" />
            <span className="h-3 w-3 animate-bounce rounded-full bg-brand" />
          </div>
          <p className="text-lg font-semibold text-ink">그림을 그리는 중이에요…</p>
          <p className="text-base text-ink-soft">
            수십 초 걸릴 수 있어요. 잠시만 기다려 주세요.
          </p>
        </div>
      )}

      {/* 오류 안내 */}
      {error && !isPending && (
        <div className="flex flex-col gap-3 rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3">
          <p role="alert" className="text-base text-rose-900">{error}</p>
          <div className="flex flex-wrap gap-2">
            {error.includes("토큰") && (
              <a
                href="/account/tokens"
                className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-action px-4 py-2 text-base font-bold text-white hover:bg-action-hover"
              >
                토큰 충전하기
              </a>
            )}
            <button
              type="button"
              onClick={() => generate(false, false)}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-2 text-base font-semibold text-ink hover:bg-banner"
            >
              다시 시도
            </button>
          </div>
        </div>
      )}

      {/* 결과 미리보기 */}
      {result && !isPending && (
        <section className="flex flex-col gap-4">
          {result.unstable && (
            <p className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-3 text-base text-amber-900">
              그림이 조금 불안정하게 나왔어요. 마음에 안 드시면 다시 만들어 보세요.
            </p>
          )}

          <div className="overflow-hidden rounded-md border-2 border-line bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={result.imageDataUrl}
              alt="만든 맞춤 배경 미리보기"
              className="mx-auto block w-full max-w-sm"
            />
          </div>

          <p className="text-center text-base text-ink-soft">
            {regensLeft > 0
              ? `${regensLeft}장 더 만들 수 있어요`
              : "이번 세트의 마지막 장이에요"}
          </p>

          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => generate(false, false)}
              className="inline-flex min-h-[52px] items-center justify-center rounded-md border-2 border-action bg-surface px-5 py-3 text-lg font-bold text-action hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
            >
              다시 만들기
            </button>
            <button
              type="button"
              onClick={onDecide}
              disabled={saving}
              className="inline-flex min-h-[52px] items-center justify-center rounded-md bg-action px-6 py-3 text-lg font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:bg-line"
            >
              {saving ? "저장 중…" : "이 배경으로 결정"}
            </button>
          </div>

          {decideError && (
            <p role="alert" className="rounded-md border-2 border-rose-300 bg-rose-50 px-4 py-3 text-center text-base text-rose-900">
              {decideError}
            </p>
          )}
        </section>
      )}

      {/* 새 세트 확인 다이얼로그(세트 4장 소진 후 다시 만들기) */}
      {showNewSetConfirm && !isPending && (
        <div className="flex flex-col gap-3 rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-4">
          <p className="text-base font-semibold text-amber-900">
            이번 세트의 {imagesPerSet}장을 다 쓰셨어요. {tokenCost}토큰을 더 써서 새로
            만드시겠어요?
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => generate(true, false)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover"
            >
              {tokenCost}토큰으로 새로 시작
            </button>
            <button
              type="button"
              onClick={() => setShowNewSetConfirm(false)}
              className="inline-flex min-h-[48px] items-center justify-center rounded-md border-2 border-line bg-surface px-5 py-2 text-base font-semibold text-ink hover:bg-banner"
            >
              그만두기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
