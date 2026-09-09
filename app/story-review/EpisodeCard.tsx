"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/Button";
import { deleteEpisodeAction, updateEpisodeContentAction } from "@/app/actions/episode";

const EPISODE_EXCERPT_LENGTH = 120;

// v3 P19-1/P19-3 — 이야기 카드: 보기(발췌) / 고치기(인라인 textarea) / 지우기
// (확인 모달) 세 상태를 한 컴포넌트가 관리한다. DeleteButton.tsx(life-timeline/
// manage) 와 같은 모달 패턴(Escape 닫힘·body scroll lock)이지만, 트리거
// 버튼도 destructive 디자인 시스템 variant 를 그대로 쓴다(빨강 필 금지).
// 존엄 원칙 — 버튼 문구는 "고치기"/"지우기"만 쓰고 "삭제"/"오류"는 피한다.
export function EpisodeCard({
  episodeId,
  label,
  year,
  content,
  familyActivityCount,
}: {
  episodeId: string;
  label: string;
  year: number | null;
  content: string;
  familyActivityCount: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!confirmOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) setConfirmOpen(false);
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [confirmOpen, isPending]);

  // P20-1 — 서버 액션 응답 자체가 503 등으로 실패해도(트랜짓 오류), DB
  // 쓰기는 이미 끝났을 가능성이 높다(액션이 이제 가벼운 쓰기만 하고 바로
  // 반환 — app/actions/episode.ts 참조). "실패한 것처럼 보이는데 실제론
  // 성공" 상태로 방치하지 않도록, throw 케이스도 router.refresh() 로
  // 화면을 실제 서버 상태와 동기화하고 안내만 중립적으로 보여준다.
  function handleSave() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateEpisodeContentAction(episodeId, draft);
        if (!result.ok) {
          setError(result.error ?? "고치지 못했어요.");
          return;
        }
        setEditing(false);
        router.refresh();
      } catch (e) {
        console.error("[episode-save]", e);
        setError("처리 중 문제가 있었어요. 화면을 새로고침할게요.");
        router.refresh();
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteEpisodeAction(episodeId);
        if (!result.ok) {
          setError(result.error ?? "지우지 못했어요.");
          return;
        }
        setConfirmOpen(false);
        router.refresh();
      } catch (e) {
        console.error("[episode-delete]", e);
        setError("처리 중 문제가 있었어요. 화면을 새로고침할게요.");
        router.refresh();
      }
    });
  }

  const titleLine = `${year ? `${year}년 ` : ""}${label}`;
  const excerpt =
    content.length > EPISODE_EXCERPT_LENGTH
      ? `${content.slice(0, EPISODE_EXCERPT_LENGTH)}…`
      : content;

  return (
    <div className="rounded-md border-2 border-line bg-surface p-5">
      <p className="text-lg font-semibold text-ink">{titleLine}</p>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={4}
            autoComplete="off"
            data-lpignore="true"
            data-1p-ignore
            data-form-type="other"
            className="w-full rounded-md border-2 border-line bg-canvas px-4 py-3 text-lg leading-relaxed text-ink focus:border-brand focus:outline-none disabled:opacity-50"
            disabled={isPending}
          />
          {error && (
            <p role="alert" className="text-base text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setDraft(content);
                setEditing(false);
                setError(null);
              }}
              disabled={isPending}
              className={buttonClasses("tertiary", "md")}
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending || !draft.trim()}
              className={buttonClasses("primary", "md")}
            >
              {isPending ? "저장 중…" : "저장"}
            </button>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-2 text-lg leading-relaxed text-ink-soft">{excerpt}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={buttonClasses("secondary", "md")}
            >
              고치기
            </button>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className={buttonClasses("destructive", "md")}
            >
              지우기
            </button>
          </div>
        </>
      )}

      {confirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-episode-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-6"
          onClick={() => !isPending && setConfirmOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-md border-2 border-line bg-surface p-6 shadow-xl"
          >
            <h2 id="delete-episode-title" className="text-2xl font-bold text-ink">
              이 이야기를 지울까요?
            </h2>
            <p className="mt-3 text-lg text-ink">
              <b>{titleLine}</b>
            </p>
            <p className="mt-2 text-base text-ink-soft">지우면 되돌릴 수 없어요.</p>
            {familyActivityCount > 0 && (
              <p className="mt-2 text-base text-ink-soft">
                가족이 남긴 댓글·반응 {familyActivityCount}개도 함께 지워져요.
              </p>
            )}

            {error && (
              <p
                role="alert"
                className="mt-3 rounded-md border-2 border-line bg-canvas px-3 py-2 text-base text-danger"
              >
                {error}
              </p>
            )}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
                autoFocus
                className={buttonClasses("tertiary", "md")}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className={buttonClasses("destructive", "md")}
              >
                {isPending ? "지우는 중…" : "지우기"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
