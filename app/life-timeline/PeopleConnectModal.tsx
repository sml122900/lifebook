"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import {
  linkPersonAction,
  unlinkPersonAction,
} from "../people/actions";

// Phase P3 — 연혁 카드에서 인물을 직접 연결/해제하는 미니 모달.
//
// 정책:
//   - 새 fetch 없음. 부모(TimelineView) 가 page.tsx 에서 prefetch 한
//     allPeople + 이 이벤트의 현재 연결 목록을 prop 으로 받는다.
//   - 토글은 옵티미스틱: 클릭 즉시 로컬 connectedSet 토글 → 서버 액션 →
//     실패 시 되돌리고 에러 노출.
//   - onChange 콜백으로 부모(TimelineView) 의 peopleByEventState 동기화 →
//     모달 닫지 않아도 연혁 chip 즉시 갱신.
//   - "+ 새 인물 추가" 는 /people/new?returnTo=/life-timeline. 추가 후 메인
//     으로 돌아오면 새 인물이 allPeople 에 들어와 다시 모달 열면 보임.
//
// 닫기: Esc / 백드롭 / X 버튼. body scroll lock + autoFocus [닫기].

export type PersonLite = { id: string; name: string };

export function PeopleConnectModal({
  memoryId,
  eventLabel,
  allPeople,
  initialConnected,
  onClose,
  onConnectedChange,
}: {
  memoryId: string;
  eventLabel: string;
  allPeople: PersonLite[];
  // 이 이벤트에 현재 연결된 인물 (모달 열 때 부모가 준 스냅샷).
  initialConnected: PersonLite[];
  onClose: () => void;
  // 옵티미스틱으로 토글이 끝날 때마다 호출. 부모가 peopleByEventState 동기화.
  onConnectedChange: (memoryId: string, connected: PersonLite[]) => void;
}) {
  const router = useRouter();
  const [connectedIds, setConnectedIds] = useState<Set<string>>(
    () => new Set(initialConnected.map((p) => p.id)),
  );
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // 백드롭 클릭 + Esc + scroll lock.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // M9 — IME 조합 + 입력 위젯 안의 Esc 는 무시 (조합 취소/입력 손실 보호).
      if (e.isComposing) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) {
        return;
      }
      if (!isPending) onClose();
    };
    window.addEventListener("keydown", handler);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = prev;
    };
  }, [isPending, onClose]);

  // 연결/미연결 분리. allPeople 가 진실의 원천 — 이름 정렬은 부모가 보장.
  const { connectedList, disconnectedList } = useMemo(() => {
    const connected: PersonLite[] = [];
    const disconnected: PersonLite[] = [];
    for (const p of allPeople) {
      if (connectedIds.has(p.id)) connected.push(p);
      else disconnected.push(p);
    }
    return { connectedList: connected, disconnectedList: disconnected };
  }, [allPeople, connectedIds]);

  function recompute(nextIds: Set<string>): PersonLite[] {
    return allPeople.filter((p) => nextIds.has(p.id));
  }

  function toggle(person: PersonLite) {
    const wasConnected = connectedIds.has(person.id);
    const nextIds = new Set(connectedIds);
    if (wasConnected) nextIds.delete(person.id);
    else nextIds.add(person.id);

    // 옵티미스틱 갱신
    setConnectedIds(nextIds);
    onConnectedChange(memoryId, recompute(nextIds));
    setError(null);
    setPendingIds((s) => {
      const n = new Set(s);
      n.add(person.id);
      return n;
    });

    startTransition(async () => {
      const r = wasConnected
        ? await unlinkPersonAction(person.id, memoryId)
        : await linkPersonAction(person.id, memoryId);

      // 실패 처리 — 롤백.
      let failed = false;
      let msg = "";
      if (!r.ok) {
        failed = true;
        msg =
          ("error" in r && typeof r.error === "string"
            ? r.error
            : null) ?? "처리하지 못했어요.";
      } else if ("result" in r) {
        if (r.result === "not_found") {
          failed = true;
          msg = "이 인물 또는 이벤트를 찾을 수 없어요.";
        } else if (r.result === "not_linkable") {
          failed = true;
          msg = "여기에는 인물을 연결할 수 없어요.";
        }
        // "linked"/"already" 둘 다 성공으로 침묵 처리.
      }
      if (failed) {
        const rollback = new Set(connectedIds); // 원래 상태로
        setConnectedIds(rollback);
        onConnectedChange(memoryId, recompute(rollback));
        setError(msg);
      }
      setPendingIds((s) => {
        const n = new Set(s);
        n.delete(person.id);
        return n;
      });
      // 다른 화면(가족 룸 진척 등)에도 영향이 있을 수 있어 가벼운 refresh.
      router.refresh();
    });
  }

  const newPersonHref = `/people/new?returnTo=${encodeURIComponent(
    "/life-timeline",
  )}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="people-connect-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => !isPending && onClose()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-md flex-col rounded-md border-2 border-amber-300 bg-surface shadow-xl"
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-amber-100 px-5 py-4">
          <div className="min-w-0">
            <h2
              id="people-connect-title"
              className="text-xl font-bold text-ink"
            >
              함께한 분 고르기
            </h2>
            <p className="mt-1 truncate text-sm text-ink-soft">
              {eventLabel}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            autoFocus
            aria-label="닫기"
            className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border-2 border-line text-xl font-bold text-ink-soft hover:bg-banner disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
          >
            ✕
          </button>
        </div>

        {/* 본문 — 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {allPeople.length === 0 ? (
            <EmptyPeople newPersonHref={newPersonHref} />
          ) : (
            <>
              {/* 연결됨 섹션 */}
              {connectedList.length > 0 && (
                <section className="mb-4">
                  <h3 className="mb-2 text-sm font-semibold text-emerald-800">
                    이 사건에 연결된 분 ({connectedList.length})
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {connectedList.map((p) => (
                      <PersonRow
                        key={p.id}
                        person={p}
                        connected
                        pending={pendingIds.has(p.id)}
                        onClick={() => toggle(p)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {/* 미연결 섹션 */}
              {disconnectedList.length > 0 && (
                <section>
                  <h3 className="mb-2 text-sm font-semibold text-ink-soft">
                    다른 인물
                  </h3>
                  <ul className="flex flex-col gap-2">
                    {disconnectedList.map((p) => (
                      <PersonRow
                        key={p.id}
                        person={p}
                        connected={false}
                        pending={pendingIds.has(p.id)}
                        onClick={() => toggle(p)}
                      />
                    ))}
                  </ul>
                </section>
              )}

              {connectedList.length === 0 && disconnectedList.length === 0 && (
                <p className="text-base text-ink-soft">
                  아직 기록된 분이 없어요.
                </p>
              )}
            </>
          )}

          {error && (
            <p
              role="alert"
              className="mt-3 rounded-md border-2 border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-900"
            >
              {error}
            </p>
          )}
        </div>

        {/* 푸터 — 새 인물 추가 */}
        <div className="border-t-2 border-amber-100 px-5 py-4">
          <Link
            href={newPersonHref}
            className="inline-flex w-full min-h-[48px] items-center justify-center rounded-md border-2 border-amber-400 bg-amber-50 px-4 py-2 text-base font-bold text-amber-900 hover:bg-amber-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
          >
            + 새 인물 추가
          </Link>
        </div>
      </div>
    </div>
  );
}

function PersonRow({
  person,
  connected,
  pending,
  onClick,
}: {
  person: PersonLite;
  connected: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-pressed={connected}
        className={
          "flex w-full min-h-[48px] items-center justify-between gap-3 rounded-md border-2 px-4 py-2 text-left disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500 " +
          (connected
            ? "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100"
            : "border-line bg-surface text-ink hover:border-amber-300 hover:bg-amber-50")
        }
      >
        <span className="truncate text-base font-semibold">{person.name}</span>
        <span
          aria-hidden
          className={
            "flex-shrink-0 text-sm font-semibold " +
            (connected ? "text-emerald-700" : "text-amber-700")
          }
        >
          {pending ? "처리 중…" : connected ? "✓ 연결됨" : "+ 연결"}
        </span>
      </button>
    </li>
  );
}

function EmptyPeople({ newPersonHref }: { newPersonHref: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <p aria-hidden className="text-4xl">
        👥
      </p>
      <p className="text-lg text-ink">아직 기록된 분이 없어요.</p>
      <p className="text-sm text-ink-soft">
        새 인물을 추가하면 이 사건에 연결할 수 있어요.
      </p>
      <Link
        href={newPersonHref}
        className="mt-2 inline-flex min-h-[48px] items-center justify-center rounded-md bg-amber-600 px-5 py-2 text-base font-bold text-white hover:bg-amber-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
      >
        + 첫 인물 추가하기
      </Link>
    </div>
  );
}
