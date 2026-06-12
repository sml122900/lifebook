"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

import { applyRefinedAction, discardRefinedAction } from "../../actions";

// 문장 다듬기 Lv2 — 저장된 회상(content)의 맞춤법·띄어쓰기 + 군말·반복·비문 정리.
// 원문 영구 보존: 교정본은 refinedText 별도 저장, [이대로 바꾸기] 를 눌러야
// 표시가 바뀌고, 바뀐 후에도 "원래 글 보기" 로 원문 항상 접근 가능.
//
// 상태 흐름:
//   idle(다듬기 버튼) → loading → review(전/후 카드 + 결정 버튼 2개)
//   no_change → 토스트("고칠 곳이 없어요…") 후 idle 복귀
//   apply → displayRefined=true (원래 글 보기 토글 노출), 재다듬기 가능

export function RefineSection({
  memoryId,
  savedContent,
  initialRefinedText,
  initialDisplayRefined,
}: {
  memoryId: string;
  savedContent: string | null;
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
  const [showOriginal, setShowOriginal] = useState(false);
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

  // 저장된 회상이 없으면 다듬을 대상이 없음 — 섹션 자체를 안 그림.
  if (!savedContent || savedContent.trim() === "") return null;

  async function handleRefine() {
    setLoading(true);
    try {
      const res = await fetch(`/api/memory/${memoryId}/refine`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok: boolean;
        status?: string;
        refinedText?: string | null;
        error?: string;
      };
      if (!data.ok) {
        showToast(data.error ?? "다듬기에 실패했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (data.status === "no_change") {
        showToast("고칠 곳이 없어요. 잘 쓰셨어요!");
        return;
      }
      if (data.status === "refined" && data.refinedText) {
        setRefinedText(data.refinedText);
        setReviewing(true);
        setShowOriginal(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-ink">문장 다듬기</h2>
        <Button
          type="button"
          variant="secondary"
          size="md"
          onClick={handleRefine}
          disabled={loading}
        >
          <Pencil aria-hidden strokeWidth={1.75} className="h-5 w-5" />
          {loading ? "다듬는 중…" : "글 다듬기"}
        </Button>
      </div>
      <p className="text-lg text-ink-soft">
        맞춤법과 문장을 보기 좋게 정리해 드려요. 말투와 표현은 그대로
        둡니다. 원래 글은 항상 보관돼요.
      </p>

      {/* review — 전/후 카드 세로 배치 + 결정 버튼 */}
      {reviewing && refinedText && (
        <div className="flex flex-col gap-4">
          <div className="rounded-md border-2 border-line bg-canvas p-4">
            <p className="text-base font-bold text-ink-soft">원래 글</p>
            <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
              {savedContent}
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

      {/* 바꾼 후 — 다듬은 글 표시 중 + 원래 글 보기 토글 (원문 상시 접근) */}
      {displayRefined && refinedText && !reviewing && (
        <div className="flex flex-col gap-3">
          <p className="text-lg text-ink">
            지금은 <strong className="text-action">다듬은 글</strong>이
            보이고 있어요.
          </p>
          <Button
            type="button"
            variant="tertiary"
            size="md"
            className="self-start"
            onClick={() => setShowOriginal((v) => !v)}
            aria-expanded={showOriginal}
          >
            {showOriginal ? "원래 글 닫기" : "원래 글 보기"}
          </Button>
          {showOriginal && (
            <div className="rounded-md border-2 border-line bg-canvas p-4">
              <p className="text-base font-bold text-ink-soft">원래 글</p>
              <p className="mt-2 whitespace-pre-wrap text-lg text-ink">
                {savedContent}
              </p>
            </div>
          )}
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
