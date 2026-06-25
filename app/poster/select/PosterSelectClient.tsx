"use client";

// P2 — 포스터 선택/분류/정정 UI (클라이언트).
//
// 후보 카드마다 노드/메모/제외 3택 + 제목·내용 인라인 정정 + P3 미리보기.
// 최대 20개 카운터. 저장 시 비제외 항목을 시간순 order 로 Poster 에 저장.
//
// 시니어 친화: 큰 버튼·큰 글씨·또렷한 상태색. 압박 X.

import { useMemo, useState, useTransition } from "react";

import { Check, Pencil, Eye } from "lucide-react";

import type { PosterCandidate } from "@/lib/poster/poster-candidates";
import {
  savePosterSelections,
  previewPosterSentence,
  updatePosterEventText,
} from "./actions";
import {
  MAX_MEMO_ITEMS,
  type PosterSelectionItem,
} from "@/lib/poster/select-constants";

type Choice = "node" | "memo" | "exclude";

type CardState = {
  candidate: PosterCandidate;
  title: string; // 정정 반영(로컬)
  content: string | null;
};

export function PosterSelectClient({
  candidates,
  savedSelections,
}: {
  candidates: PosterCandidate[];
  savedSelections: PosterSelectionItem[];
}) {
  // 시간순 정렬(연도 → 제목).
  const sorted = useMemo(
    () =>
      [...candidates].sort(
        (a, b) => (a.year ?? 0) - (b.year ?? 0) || a.title.localeCompare(b.title),
      ),
    [candidates],
  );

  const savedMap = useMemo(() => {
    const m = new Map<string, "node" | "memo">();
    for (const s of savedSelections) m.set(s.eventId, s.type);
    return m;
  }, [savedSelections]);

  const hasSaved = savedSelections.length > 0;

  // 카드별 제목/내용 로컬 상태(정정 반영).
  const [cards, setCards] = useState<Record<string, CardState>>(() => {
    const rec: Record<string, CardState> = {};
    for (const c of candidates) {
      rec[c.eventId] = { candidate: c, title: c.title, content: null };
    }
    return rec;
  });

  // 선택 상태.
  const [choices, setChoices] = useState<Record<string, Choice>>(() => {
    const rec: Record<string, Choice> = {};
    for (const c of candidates) {
      const saved = savedMap.get(c.eventId);
      if (saved) rec[c.eventId] = saved;
      else if (hasSaved) rec[c.eventId] = "exclude";
      else rec[c.eventId] = c.recommended ? c.suggestedType : "exclude";
    }
    return rec;
  });

  const nodeCount = useMemo(
    () => Object.values(choices).filter((c) => c === "node").length,
    [choices],
  );
  const memoCount = useMemo(
    () => Object.values(choices).filter((c) => c === "memo").length,
    [choices],
  );

  const [warn, setWarn] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  function setChoice(eventId: string, next: Choice) {
    setWarn(null);
    const cur = choices[eventId];
    // 메모 상한(좌10+우10=20)만 체크. 노드는 유연(제한 없음).
    if (next === "memo" && cur !== "memo" && memoCount >= MAX_MEMO_ITEMS) {
      setWarn(`메모는 최대 ${MAX_MEMO_ITEMS}개까지예요. 다른 메모를 빼거나 노드로 바꿔주세요.`);
      return;
    }
    setChoices((prev) => ({ ...prev, [eventId]: next }));
    setSavedMsg(null);
  }

  function save() {
    setWarn(null);
    setSavedMsg(null);
    // 비제외 항목을 시간순 order 로.
    const items: PosterSelectionItem[] = sorted
      .filter((c) => choices[c.eventId] !== "exclude")
      .map((c, i) => ({
        eventId: c.eventId,
        type: choices[c.eventId] as "node" | "memo",
        order: i,
      }));

    startSaving(async () => {
      const res = await savePosterSelections(items);
      if (res.ok) setSavedMsg(`${res.count}개를 포스터에 담았어요.`);
      else setWarn(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 고정 바 — 카운터 + 저장 */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-line bg-canvas px-4 py-3">
        <span className="text-base font-semibold text-ink sm:text-lg">
          노드 <b className="text-action">{nodeCount}</b>
          <span className="mx-2 text-ink-faint">·</span>
          메모 <b className={memoCount >= MAX_MEMO_ITEMS ? "text-danger" : "text-brand"}>{memoCount}</b> / {MAX_MEMO_ITEMS}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={isSaving}
          className="inline-flex min-h-[48px] items-center justify-center rounded-md bg-action px-5 py-2 text-base font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:cursor-not-allowed disabled:bg-line"
        >
          {isSaving ? "저장 중…" : "저장하기"}
        </button>
      </div>

      {warn && (
        <p role="alert" className="rounded-md border-2 border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          {warn}
        </p>
      )}
      {savedMsg && (
        <p className="rounded-md border-2 border-emerald-300 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          ✓ {savedMsg}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {sorted.map((c) => (
          <CandidateCard
            key={c.eventId}
            candidate={c}
            card={cards[c.eventId]}
            choice={choices[c.eventId]}
            onChoice={(next) => setChoice(c.eventId, next)}
            onEdited={(title, content) =>
              setCards((prev) => ({
                ...prev,
                [c.eventId]: { ...prev[c.eventId], title, content },
              }))
            }
          />
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({
  candidate,
  card,
  choice,
  onChoice,
  onEdited,
}: {
  candidate: PosterCandidate;
  card: CardState;
  choice: Choice;
  onChoice: (next: Choice) => void;
  onEdited: (title: string, content: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState<{ nodeLabel: string; memoText: string } | null>(null);
  const [isPending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const selected = choice !== "exclude";

  function doPreview() {
    setErr(null);
    start(async () => {
      const res = await previewPosterSentence(candidate.eventId);
      if (res.ok) setPreview({ nodeLabel: res.nodeLabel, memoText: res.memoText });
      else setErr(res.error);
    });
  }

  return (
    <li
      className={
        "rounded-md border-2 px-4 py-3 " +
        (selected ? "border-action bg-banner" : "border-line bg-surface")
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-semibold text-ink">
            <span className="text-ink-soft">{candidate.year ?? "----"}</span>
            <span className="truncate">{card.title}</span>
            {candidate.recommended && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">추천</span>
            )}
          </p>
          <p className="mt-0.5 text-sm text-ink-soft">{candidate.gist}</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          aria-label="제목·내용 고치기"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          <Pencil strokeWidth={1.75} aria-hidden className="h-4 w-4 text-ink-soft" />
        </button>
      </div>

      {/* 인라인 정정 */}
      {editing && (
        <EditBlock
          eventId={candidate.eventId}
          initialTitle={card.title}
          initialContent={card.content}
          onSaved={(title, content) => {
            onEdited(title, content);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* 3택 토글 */}
      <div className="mt-3 flex flex-wrap gap-2">
        <ChoiceButton label="큰 사건 (노드)" active={choice === "node"} onClick={() => onChoice("node")} tone="action" />
        <ChoiceButton label="작은 이야기 (메모)" active={choice === "memo"} onClick={() => onChoice("memo")} tone="brand" />
        <ChoiceButton label="제외" active={choice === "exclude"} onClick={() => onChoice("exclude")} tone="muted" />
        {selected && (
          <button
            type="button"
            onClick={doPreview}
            disabled={isPending}
            className="ml-auto inline-flex min-h-[44px] items-center gap-1 rounded-md border-2 border-line bg-surface px-3 py-1.5 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:opacity-50"
          >
            <Eye strokeWidth={1.75} aria-hidden className="h-4 w-4" />
            {isPending ? "만드는 중…" : "문장 미리보기"}
          </button>
        )}
      </div>

      {err && <p role="alert" className="mt-2 text-sm text-danger">{err}</p>}

      {/* P3 미리보기 */}
      {preview && selected && (
        <div className="mt-3 rounded-md border border-line bg-canvas px-3 py-2 text-sm">
          {choice === "node" ? (
            <p><span className="text-ink-faint">노드: </span><b className="text-ink">{preview.nodeLabel}</b></p>
          ) : (
            <p><span className="text-ink-faint">메모: </span><span className="text-ink">{preview.memoText}</span></p>
          )}
        </div>
      )}
    </li>
  );
}

function ChoiceButton({
  label,
  active,
  onClick,
  tone,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  tone: "action" | "brand" | "muted";
}) {
  const activeCls =
    tone === "action"
      ? "border-action bg-action text-white"
      : tone === "brand"
        ? "border-brand bg-brand text-white"
        : "border-ink-faint bg-ink-faint text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "inline-flex min-h-[44px] items-center justify-center rounded-md border-2 px-3 py-1.5 text-sm font-semibold focus:outline-none focus-visible:ring-4 focus-visible:ring-brand " +
        (active ? activeCls : "border-line bg-surface text-ink hover:bg-banner")
      }
    >
      {active && <Check strokeWidth={2.5} aria-hidden className="mr-1 h-4 w-4" />}
      {label}
    </button>
  );
}

function EditBlock({
  eventId,
  initialTitle,
  initialContent,
  onSaved,
  onCancel,
}: {
  eventId: string;
  initialTitle: string;
  initialContent: string | null;
  onSaved: (title: string, content: string | null) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent ?? "");
  const [isPending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function save() {
    setErr(null);
    start(async () => {
      const res = await updatePosterEventText(eventId, title, content);
      if (res.ok) onSaved(title.trim(), content.trim() === "" ? null : content.trim());
      else setErr(res.error);
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-line bg-canvas p-3">
      <label className="text-sm font-semibold text-ink-soft">제목</label>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={100}
        className="w-full rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
      />
      <label className="mt-1 text-sm font-semibold text-ink-soft">내용 (선택)</label>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        maxLength={2000}
        className="w-full rounded-md border-2 border-line bg-surface px-3 py-2 text-base text-ink focus:border-amber-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-500"
      />
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md bg-action px-4 py-1.5 text-sm font-bold text-white hover:bg-action-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand disabled:bg-line"
        >
          {isPending ? "저장 중…" : "정정 저장"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border-2 border-line bg-surface px-4 py-1.5 text-sm font-semibold text-ink-soft hover:bg-banner focus:outline-none focus-visible:ring-4 focus-visible:ring-brand"
        >
          취소
        </button>
      </div>
    </div>
  );
}
