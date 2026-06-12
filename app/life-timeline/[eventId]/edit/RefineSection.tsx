"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import type { ModelTier } from "@/lib/tokens/policy";

import {
  applyRefinedAction,
  discardRefinedAction,
  saveMemoryContentAction,
} from "../../actions";

// 다듬기 정밀도 — tier 별 모델·토큰 비용. 사용자에겐 모델 이름 대신 "빠르게/
// 꼼꼼하게/가장 정밀" + 토큰 비용만 노출(어르신이 비용 알고 고르게). 토큰 수는
// 안내용 근사치(MODEL_MULTIPLIER 와 같은 1/3/5) — 실제 차감은 서버가 사용량으로.
const TIERS: { tier: ModelTier; label: string; cost: string }[] = [
  { tier: "haiku", label: "빠르게", cost: "1토큰" },
  { tier: "sonnet", label: "꼼꼼하게", cost: "3토큰" },
  { tier: "opus", label: "가장 정밀", cost: "5토큰" },
];

// 문장 다듬기 Lv2 — 편집 화면 "더 떠오르는 게 있다면" 회상을 다듬는다.
//
// UX 개편 (자동 저장 + 다듬기):
//   - 섹션은 항상 노출. textarea(content)가 비어 있으면 버튼은 비활성 스타일
//     + aria-disabled, 눌러도 안내 토스트만.
//   - 글이 있으면 [글 다듬기] = 현재 textarea 내용 자동 저장 → 교정 → 전/후 카드.
//     ("수정 저장" 후 재진입하는 동선 제거. 미저장 draft 가 교정에 반영 안 돼
//      "고칠 곳 없음" 으로 오발하던 문제도 자동 저장으로 해소.)
//
// 원문 보존: 교정본은 refinedText 별도 저장, [이대로 바꾸기] 를 눌러야 표시가
// 바뀌고, 바뀐 후에도 "원래 글 보기" 로 원문 항상 접근 가능.
//
// 상태 흐름:
//   idle → loading(저장+다듬기) → review(전/후 카드 + 결정 버튼 2개)
//   no_change → 토스트("고칠 곳이 없어요…") 후 idle 복귀
//   apply → displayRefined=true (원래 글/다듬은 글 두 카드 상시 표시), 재다듬기 가능

export function RefineSection({
  memoryId,
  content,
  initialRefinedText,
  initialDisplayRefined,
}: {
  memoryId: string;
  // 라이브 textarea 내용 (EventForm 의 content state). 비어 있으면 버튼 비활성.
  content: string;
  initialRefinedText: string | null;
  initialDisplayRefined: boolean;
}) {
  const router = useRouter();
  // 이전 방문에서 다듬어놓고 결정 안 한 교정본이 있으면 review 부터.
  const [refinedText, setRefinedText] = useState(initialRefinedText);
  const [displayRefined, setDisplayRefined] = useState(initialDisplayRefined);
  const [reviewing, setReviewing] = useState(
    initialRefinedText !== null && !initialDisplayRefined,
  );
  const [loading, setLoading] = useState(false);
  const [tier, setTier] = useState<ModelTier>("haiku");
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  const isEmpty = content.trim() === "";

  async function handleRefine() {
    // 비어 있으면 다듬을 대상이 없음 — 안내만 (버튼은 비활성 스타일이지만
    // onClick 은 살려둬 토스트를 띄운다).
    if (isEmpty) {
      showToast("더 떠오르는 게 있다면 항목에 글을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      // 1) 현재 textarea 내용을 먼저 저장 (자동 저장). 실패하면 중단.
      const saved = await saveMemoryContentAction(memoryId, content);
      if (!saved.ok) {
        showToast(saved.error ?? "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      // 2) 저장된 내용을 선택한 정밀도(tier)로 다듬기.
      const res = await fetch(`/api/memory/${memoryId}/refine`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        status?: string;
        refinedText?: string | null;
        tokensSpent?: number;
        balanceAfter?: number | null;
        error?: string;
      };
      if (!data.ok) {
        // 402(잔액 부족) 포함 — 서버가 친화 메시지를 내려준다.
        showToast(data.error ?? "다듬기에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (data.status === "no_change") {
        // 저장된 교정본이 없으니 차감도 0 — 안내만.
        showToast("고칠 곳이 없어요. 잘 쓰셨어요!");
        return;
      }
      if (data.status === "refined" && data.refinedText) {
        setRefinedText(data.refinedText);
        setReviewing(true);
        if (data.tokensSpent && data.tokensSpent > 0) {
          const left =
            typeof data.balanceAfter === "number"
              ? ` (남은 토큰 ${data.balanceAfter}개)`
              : "";
          showToast(`${data.tokensSpent}토큰을 사용했어요.${left}`);
        }
      }
    } catch {
      showToast("다듬기에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    const r = await applyRefinedAction(memoryId);
    if (!r.ok) {
      showToast(r.error ?? "바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setDisplayRefined(true);
    setReviewing(false);
    router.refresh();
  }

  async function handleDiscard() {
    const r = await discardRefinedAction(memoryId);
    if (!r.ok) {
      showToast(r.error ?? "처리하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    setRefinedText(null);
    setDisplayRefined(false);
    setReviewing(false);
    router.refresh();
  }

  return (
    <section
      aria-label="문장 다듬기"
      className="flex flex-col gap-4 rounded-md border-2 border-line bg-surface p-5"
    >
      <h2 className="text-lg font-bold text-ink">문장 다듬기</h2>
      <p className="text-lg text-ink-soft">
        맞춤법과 문장을 보기 좋게 정리해 드려요. 말투와 표현은 그대로
        둡니다. 원래 글은 항상 보관돼요.
      </p>

      {/* 정밀도(tier) 선택 — 칩 3개. 선택 칩은 banner+brand 보더(필 금지,
          디자인 토큰 칩 스펙). 라벨에 토큰 비용 명시해 어르신이 비용 알고 고름. */}
      <div role="radiogroup" aria-label="다듬기 정밀도" className="flex flex-col gap-2">
        <p className="text-base font-semibold text-ink">
          얼마나 꼼꼼히 다듬을까요?
        </p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {TIERS.map((t) => {
            const selected = tier === t.tier;
            return (
              <button
                key={t.tier}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={loading}
                onClick={() => setTier(t.tier)}
                className={
                  "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-md border-2 px-4 py-3 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60 " +
                  (selected
                    ? "border-brand bg-banner text-action"
                    : "border-line bg-surface text-ink-soft hover:bg-banner")
                }
              >
                <span className="text-lg font-bold">{t.label}</span>
                <span className="text-sm">{t.cost}</span>
              </button>
            );
          })}
        </div>
      </div>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className={
          "self-start" + (isEmpty && !loading ? " opacity-60" : "")
        }
        onClick={handleRefine}
        disabled={loading}
        aria-disabled={isEmpty || loading}
      >
        <Pencil aria-hidden strokeWidth={1.75} className="h-5 w-5" />
        {loading ? "다듬는 중…" : "글 다듬기"}
      </Button>

      {/* review — 전/후 카드 세로 배치 + 결정 버튼. "원래 글" = 방금 저장한 내용. */}
      {reviewing && refinedText && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border-2 border-line bg-canvas p-4">
            <p className="text-base font-bold text-ink-soft">원래 글</p>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
              {content}
            </p>
          </div>
          <div className="rounded-md border-2 border-brand bg-banner p-4">
            <p className="text-base font-bold text-action">다듬은 글</p>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
              {refinedText}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="primary" size="lg" onClick={handleApply}>
              이대로 바꾸기
            </Button>
            <Button type="button" variant="tertiary" size="lg" onClick={handleDiscard}>
              그대로 두기
            </Button>
          </div>
        </div>
      )}

      {/* 바꾼 후 — 토글 없이 원래 글/다듬은 글 두 카드 상시 표시 (전/후와 동일
          스타일 재사용). 재다듬기는 상단 [글 다듬기] 버튼으로 다시 돌릴 수 있다. */}
      {displayRefined && refinedText && !reviewing && (
        <div className="flex flex-col gap-4">
          <p className="text-lg text-ink">
            <strong className="text-action">다듬은 글</strong>이 연혁에
            표시되고 있어요. 원래 글도 보관돼 있어요.
          </p>
          <div className="rounded-md border-2 border-line bg-canvas p-4">
            <p className="text-base font-bold text-ink-soft">원래 글</p>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
              {content}
            </p>
          </div>
          <div className="rounded-md border-2 border-brand bg-banner p-4">
            <p className="text-base font-bold text-action">다듬은 글</p>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
              {refinedText}
            </p>
          </div>
        </div>
      )}

      {/* 토스트 — 시니어 가독 위해 화면 하단 큰 글씨 */}
      {toast && (
        <p
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md border-2 border-success bg-success/10 px-6 py-4 text-lg font-semibold text-success-deep shadow-lg"
        >
          {toast}
        </p>
      )}
    </section>
  );
}
