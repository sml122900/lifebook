"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";

// 인라인 텍스트 다듬기 — RefineSection 과 같은 UX이지만 UserMemory 없이
// 동작한다. 온보딩·CategoryForm 처럼 저장 전 상태에서 content 를 다듬을 때 사용.
//
// content   : 부모의 textarea 현재 값 (빈 문자열이면 버튼 비활성).
// onApply   : 사용자가 [이대로 바꾸기] 를 누르면 교정된 텍스트를 돌려준다.
//             부모가 이 값으로 자신의 state 를 갱신하면 textarea 에 반영.
//
// 차이점(vs RefineSection):
//   - memoryId 없음 → /api/refine-text 호출 (DB 저장 없이 차감만)
//   - apply 는 server action 없이 onApply 콜백만
//   - discard 는 state 리셋(DB 무관)

export function RefineInline({
  content,
  onApply,
}: {
  content: string;
  onApply: (refined: string) => void;
}) {
  const router = useRouter();
  const [refinedText, setRefinedText] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // content 가 바뀌면 이전 교정본 초기화 (draft 불일치 방지)
  useEffect(() => {
    setRefinedText(null);
    setReviewing(false);
  }, [content]);

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
    if (isEmpty) {
      showToast("입력한 글이 없어요. 내용을 먼저 적어주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/refine-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
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
        if (data.tokensSpent && data.tokensSpent > 0) {
          const left =
            typeof data.balanceAfter === "number"
              ? ` (남은 토큰 ${data.balanceAfter}개)`
              : "";
          showToast(`${data.tokensSpent}토큰을 사용했어요.${left}`);
          // 다듬기 차감 후 사이드 패널(루트 레이아웃) 잔액 갱신 (#1 배경 생성과 동일).
          router.refresh();
        }
      }
    } catch {
      showToast("다듬기에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!refinedText) return;
    onApply(refinedText);
    setRefinedText(null);
    setReviewing(false);
  }

  function handleDiscard() {
    setRefinedText(null);
    setReviewing(false);
  }

  return (
    <section
      aria-label="문장 다듬기"
      className="flex flex-col gap-4 rounded-md border-2 border-line bg-surface p-5"
    >
      <h2 className="text-lg font-bold text-ink">문장 다듬기</h2>
      <p className="text-lg text-ink-soft">
        맞춤법과 문장을 보기 좋게 정리해 드려요. 말투와 표현은 그대로
        둡니다.
      </p>

      <Button
        type="button"
        variant="secondary"
        size="lg"
        className={"self-start" + (isEmpty && !loading ? " opacity-60" : "")}
        onClick={handleRefine}
        disabled={loading}
        aria-disabled={isEmpty || loading}
      >
        <Pencil aria-hidden strokeWidth={1.75} className="h-5 w-5" />
        {loading ? "다듬는 중…" : "글 다듬기"}
      </Button>

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
