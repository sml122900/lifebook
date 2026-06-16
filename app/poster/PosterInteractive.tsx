"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";

// 템플릿 피커 + 사건 빼고/넣기(체크) + 크기 S/M/L(잎/꽃/열매) + 제목·푸터·뿌리
// 글자 편집. 전부 DOM 주입(재렌더·재매핑·서버 왕복 0).
//
// 템플릿(느티나무·강물)은 서버에서 각각 렌더된 SVG + 슬롯맵으로 들어온다.
// 피커로 고르면 그 템플릿 SVG 만 표시(active 스왑). 슬롯이 달라 off/size 는
// 리셋, 텍스트(제목/푸터/뿌리)는 템플릿 무관이라 유지.
//
// off·size·text 를 한 useEffect 에서 active SVG 에 적용 → 충돌 0·idempotent.
// effect 는 커밋 후 실행이라 svg DOM 존재 보장.
//
// 클라 state 만(저장 X·마이그 0). T1~T3b 엔진(lib/poster/*) 무수정 — 추가 레이어.

export type Size = "S" | "M" | "L";

export type PosterSlot = {
  c: number;
  e: number;
  title: string;
  yearLabel: string;
  sizeable: boolean;
  initialSize: Size | null;
};

export type PosterTemplate = {
  id: string;
  name: string;
  accent: string; // 피커 색점
  svg: string;
  slots: PosterSlot[];
};

const keyOf = (s: PosterSlot) => `${s.c}-${s.e}`;

// 메모 키 — 사건 정체성 기준(제목+연도). 슬롯 위치(c,e)는 템플릿마다 클러스터가
// 달라 전환 시 어긋나므로 쓰지 않는다. mapping.ts(동결)가 원본 id 를 슬롯까지
// 넘기지 않아 제목+연도가 템플릿 무관·전환 안정적인 유일한 식별자. 앱 내 임시
// 메모라 동일 제목+연도 중복 충돌은 무시 가능.
const noteKeyOf = (s: PosterSlot) => `${s.title} ${s.yearLabel}`;

const SIZE_VARIANT: Record<Size, string> = { S: "leaf", M: "flower", L: "fruit" };

const SIZE_OPTIONS: { size: Size; label: string; sub: string }[] = [
  { size: "S", label: "작게", sub: "잎" },
  { size: "M", label: "보통", sub: "꽃" },
  { size: "L", label: "크게", sub: "열매" },
];

const MAX = { title: 16, footer: 30, root: 30, note: 50 };

// 화면 px → SVG user space (반응형 width:100% 스케일 자동 보정).
function clientToUser(svg: SVGSVGElement, cx: number, cy: number) {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const pt = svg.createSVGPoint();
  pt.x = cx;
  pt.y = cy;
  const u = pt.matrixTransform(ctm.inverse());
  return { x: u.x, y: u.y };
}

// 사건이 viewBox 밖으로 완전히 못 나가게 오프셋 클램프(getBBox = 변형 전 기하).
function clampOffset(
  svg: SVGSVGElement,
  slotEl: SVGGraphicsElement,
  dx: number,
  dy: number,
) {
  try {
    const bb = slotEl.getBBox();
    const vb = svg.viewBox.baseVal;
    return {
      dx: Math.min(Math.max(dx, -bb.x), vb.width - (bb.x + bb.width)),
      dy: Math.min(Math.max(dy, -bb.y), vb.height - (bb.y + bb.height)),
    };
  } catch {
    return { dx, dy };
  }
}

// 슬롯 그룹 + 두 라벨에 인라인 transform 적용(같이 이동). dx=dy=0 이면 제거.
// zelkova/river 슬롯엔 원본 transform 이 없어 안전(좌표는 use x/y 절대값).
function applyOffset(root: HTMLElement, slotId: string, dx: number, dy: number) {
  const t = dx || dy ? `translate(${dx.toFixed(2)} ${dy.toFixed(2)})` : "";
  const base = slotId.replace(/^slot-/, "label-");
  for (const id of [slotId, base, `${base}-t`]) {
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (!el) continue;
    if (t) el.setAttribute("transform", t);
    else el.removeAttribute("transform");
  }
}

function initSizes(slots: PosterSlot[]): Map<string, Size> {
  const m = new Map<string, Size>();
  for (const s of slots) {
    if (s.sizeable && s.initialSize) m.set(keyOf(s), s.initialSize);
  }
  return m;
}

export function PosterInteractive({
  templates,
  defaultTitle,
  defaultFooter,
  defaultRoot,
}: {
  templates: PosterTemplate[];
  defaultTitle: string;
  defaultFooter: string;
  defaultRoot: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [activeId, setActiveId] = useState(templates[0].id);
  const active = templates.find((t) => t.id === activeId) ?? templates[0];

  const [off, setOff] = useState<Set<string>>(new Set());
  const [sizes, setSizes] = useState<Map<string, Size>>(() =>
    initSizes(templates[0].slots),
  );

  // 글자 편집 — 템플릿 전환에도 유지(템플릿 무관). 빈칸이면 기본값(자동).
  const [title, setTitle] = useState("");
  const [footer, setFooter] = useState("");
  const [rootText, setRootText] = useState("");

  // 사건별 메모 — 앱 안에서만(포스터 SVG 엔 안 그림). 키 = 제목+연도라 템플릿
  // 전환에도 유지(text 처럼). 저장 X·마이그 0. 검증된 SVG 렌더 무영향.
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());

  // 편집 모드(드래그) — 기본 OFF(어르신 auto 경로 보존). positions = 슬롯별
  // 원위치 기준 오프셋(off/size 처럼 슬롯 키, 전환 시 리셋). 드래그 중엔 dragRef
  // 로 직접 transform 갱신(빠름) → pointerup 에 state 커밋(통합 effect 가 재적용).
  const [editMode, setEditMode] = useState(false);
  const [positions, setPositions] = useState<
    Record<string, { dx: number; dy: number }>
  >({});
  const dragRef = useRef<{
    slotId: string;
    slotEl: SVGGraphicsElement;
    svg: SVGSVGElement;
    baseDx: number;
    baseDy: number;
    startX: number;
    startY: number;
    lastDx: number;
    lastDy: number;
  } | null>(null);

  // off + size + text 를 active SVG DOM 에 함께 적용 (마운트·전환 시 포함).
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const setDisp = (id: string, val: string) => {
      const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (el) el.style.display = val;
    };

    for (const s of active.slots) {
      const key = keyOf(s);
      const hidden = off.has(key);
      const slotId = `slot-c${s.c}-e${s.e}`;
      setDisp(slotId, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}`, hidden ? "none" : "");
      setDisp(`label-c${s.c}-e${s.e}-t`, hidden ? "none" : "");
      if (s.sizeable) {
        const v = SIZE_VARIANT[sizes.get(key) ?? s.initialSize ?? "S"];
        for (const variant of ["leaf", "flower", "fruit"]) {
          setDisp(`${slotId}-${variant}`, !hidden && variant === v ? "" : "none");
        }
      }

      // 위치 오프셋 재적용(커밋된 positions — 같은 템플릿 재주입 시 유지).
      const p = positions[slotId];
      applyOffset(root, slotId, p?.dx ?? 0, p?.dy ?? 0);

      // 편집 모드 시각 — 드래그 가능 표시(grab 커서 + 약한 보라 하이라이트).
      const grab = editMode && !hidden;
      const slotEl = root.querySelector<SVGGElement>(`#${CSS.escape(slotId)}`);
      if (slotEl) {
        slotEl.style.cursor = grab ? "grab" : "";
        slotEl.style.filter = grab
          ? "drop-shadow(0 0 1.2px rgba(124,92,182,0.95))"
          : "";
      }
      for (const lid of [`label-c${s.c}-e${s.e}`, `label-c${s.c}-e${s.e}-t`]) {
        const lel = root.querySelector<SVGElement>(`#${CSS.escape(lid)}`);
        if (lel) lel.style.cursor = grab ? "grab" : "";
      }
    }

    // 빈 슬롯 토큰 스윕 — 미주입 라벨(textContent 에 "{" 남음 = 빈 슬롯)을 그
    // 짝 라벨·슬롯 그룹째 숨긴다. 실제 연도/제목엔 "{" 없음. server render 가
    // 이미 display="none" 을 줘도(검증), presentation 속성을 덮는 환경(브라우저
    // CSS 등)에서 토큰이 새는 걸 인라인 style 로 확실히 막는 가드. zelkova 는
    // 빈 라벨에 "{" 가 없어 no-op(회귀 0). idempotent — 전환·재주입마다 재적용.
    root.querySelectorAll<SVGTextElement>('text[id^="label-c"]').forEach((el) => {
      if (el.textContent?.includes("{")) {
        el.style.display = "none";
        const slotId = el.id.replace(/^label-/, "slot-").replace(/-t$/, "");
        const slot = root.querySelector<SVGElement>(`#${CSS.escape(slotId)}`);
        if (slot) slot.style.display = "none";
      }
    });

    // 글자 — 단일 <text> (제목·푸터)
    const applyText = (id: string, value: string, optional: boolean) => {
      const el = root.querySelector<SVGElement>(`#${CSS.escape(id)}`);
      if (!el) return;
      if (value) {
        el.textContent = value;
        el.style.display = "";
      } else if (optional) {
        el.style.display = "none";
      }
    };
    applyText("title-name", title.trim() || defaultTitle, false);
    applyText("footer-credit", footer.trim() || defaultFooter, true);

    // 뿌리(root-text = <g> + 텍스트 줄들)
    const rootG = root.querySelector<SVGElement>("#root-text");
    if (rootG) {
      const val = rootText.trim() || defaultRoot;
      const lines = rootG.querySelectorAll("text");
      if (val) {
        rootG.style.display = "";
        if (lines[0]) lines[0].textContent = val;
        // 이후 줄(템플릿 예시/토큰)은 비워 가짜·플레이스홀더 노출 방지.
        for (let i = 1; i < lines.length; i++) lines[i].textContent = "";
      } else {
        rootG.style.display = "none";
      }
    }
  }, [active, off, sizes, positions, editMode, title, footer, rootText, defaultTitle, defaultFooter, defaultRoot]);

  const selectTemplate = (id: string) => {
    if (id === activeId) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setActiveId(id);
    setOff(new Set()); // 슬롯 구성이 달라 리셋
    setSizes(initSizes(t.slots));
    setPositions({}); // 템플릿마다 원위치가 달라 리셋(off/size 처럼)
    // 텍스트·메모는 유지(템플릿 무관 — 메모 키 = 제목+연도)
  };

  // 드래그 — 포인터 이벤트(터치+마우스 통합). 채워진 보이는 슬롯만 대상.
  const startDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode) return;
    const root = containerRef.current;
    const svg = root?.querySelector("svg");
    if (!root || !svg) return;

    const target = e.target as Element;
    let slotId: string | null = null;
    const g = target.closest("g[id^='slot-c']"); // 심볼 잡기
    if (g) slotId = g.id;
    else {
      const lbl = target.closest("text[id^='label-c']"); // 라벨 잡기
      if (lbl) slotId = lbl.id.replace(/^label-/, "slot-").replace(/-t$/, "");
    }
    if (!slotId) return;

    const slotEl = root.querySelector<SVGGraphicsElement>(
      `#${CSS.escape(slotId)}`,
    );
    if (!slotEl || getComputedStyle(slotEl).display === "none") return; // 빈/off 비대상
    const start = clientToUser(svg as SVGSVGElement, e.clientX, e.clientY);
    if (!start) return;

    const cur = positions[slotId] ?? { dx: 0, dy: 0 };
    dragRef.current = {
      slotId,
      slotEl,
      svg: svg as SVGSVGElement,
      baseDx: cur.dx,
      baseDy: cur.dy,
      startX: start.x,
      startY: start.y,
      lastDx: cur.dx,
      lastDy: cur.dy,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    slotEl.style.cursor = "grabbing";
    e.preventDefault();
  };

  const moveDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    const p = clientToUser(d.svg, e.clientX, e.clientY);
    if (!p) return;
    const { dx, dy } = clampOffset(
      d.svg,
      d.slotEl,
      d.baseDx + (p.x - d.startX),
      d.baseDy + (p.y - d.startY),
    );
    d.lastDx = dx;
    d.lastDy = dy;
    if (containerRef.current) applyOffset(containerRef.current, d.slotId, dx, dy);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    d.slotEl.style.cursor = "grab";
    setPositions((prev) => ({
      ...prev,
      [d.slotId]: { dx: d.lastDx, dy: d.lastDy },
    }));
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* 캡처가 이미 해제됐으면 무시 */
    }
  };

  const toggle = (s: PosterSlot) => {
    const key = keyOf(s);
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const setSize = (s: PosterSlot, size: Size) => {
    setSizes((prev) => new Map(prev).set(keyOf(s), size));
  };

  const setNote = (k: string, v: string) =>
    setNotes((prev) => ({ ...prev, [k]: v }));

  const toggleNote = (k: string) =>
    setOpenNotes((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div>
      {/* 템플릿 피커 */}
      <div className="mb-6 flex flex-wrap justify-center gap-3">
        {templates.map((t) => {
          const on = t.id === activeId;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              onClick={() => selectTemplate(t.id)}
              className={
                "flex min-h-[56px] items-center gap-2 rounded-md border-2 px-5 transition-colors " +
                (on
                  ? "border-brand bg-banner text-ink"
                  : "border-line text-ink-soft hover:bg-banner")
              }
            >
              <span
                aria-hidden
                className="h-4 w-4 rounded-full"
                style={{ backgroundColor: t.accent }}
              />
              <span className="text-lg font-bold">{t.name}</span>
            </button>
          );
        })}
      </div>

      <div className="mx-auto lg:flex lg:items-start lg:gap-8">
        {/* 포스터 — active 템플릿만 표시(엔진이 width=100% 로 유동화). */}
        <div className="mx-auto w-full max-w-[560px] lg:mx-0 lg:flex-1">
          {editMode ? (
            <p className="mb-2 rounded-md bg-banner px-3 py-2 text-center text-base font-bold text-ink">
              ✋ 사건을 손가락이나 마우스로 끌어 옮겨보세요
            </p>
          ) : null}
          {/* 편집 모드 ON 시 touch-action:none 으로 드래그 중 페이지 스크롤 방지. */}
          <div className="overflow-hidden rounded-md border-2 border-line bg-surface shadow-sm">
            <div
              ref={containerRef}
              key={active.id}
              onPointerDown={startDrag}
              onPointerMove={moveDrag}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={editMode ? { touchAction: "none" } : undefined}
              dangerouslySetInnerHTML={{ __html: active.svg }}
            />
          </div>
        </div>

        {/* 컨트롤 — 편집 모드 + 글자 편집 + 사건 리스트 (active 기준) */}
        <div className="mx-auto mt-6 w-full max-w-[560px] space-y-6 lg:mt-0 lg:w-96 lg:shrink-0">
          <section className="rounded-md border-2 border-line p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold text-ink">자세히 편집</h3>
              <button
                type="button"
                role="switch"
                aria-checked={editMode}
                onClick={() => setEditMode((v) => !v)}
                className={
                  "min-h-[56px] rounded-md border-2 px-5 text-lg font-bold transition-colors " +
                  (editMode
                    ? "border-brand bg-banner text-ink"
                    : "border-line text-ink-soft hover:bg-banner")
                }
              >
                {editMode ? "편집 켜짐" : "편집 켜기"}
              </button>
            </div>
            <p className="mt-2 text-base text-ink-soft">
              {editMode
                ? "사건을 끌어서 원하는 자리로 옮기세요. 끄면 위치는 그대로 남아요."
                : "켜면 사건을 끌어 위치를 옮길 수 있어요."}
            </p>
            {editMode ? (
              <button
                type="button"
                onClick={() => setPositions({})}
                className="mt-3 flex min-h-[56px] w-full items-center justify-center rounded-md border-2 border-line text-base font-bold text-ink-soft transition-colors hover:bg-banner"
              >
                ↩ 위치 초기화
              </button>
            ) : null}
          </section>

          <section>
            <h3 className="text-lg font-bold text-ink">글자 바꾸기</h3>
            <p className="mt-1 text-base text-ink-soft">
              비워두면 자동으로 채워져요.
            </p>
            <div className="mt-3 space-y-4">
              <TextField
                label="포스터 제목"
                value={title}
                onChange={setTitle}
                placeholder={defaultTitle}
                max={MAX.title}
              />
              <TextField
                label="헌사 · 날짜"
                value={footer}
                onChange={setFooter}
                placeholder={defaultFooter || "예: 사랑하는 가족에게 · 2026 봄"}
                max={MAX.footer}
              />
              <TextField
                label="출생 · 부모"
                value={rootText}
                onChange={setRootText}
                placeholder={defaultRoot || "예: 충북 청주 · 1942"}
                max={MAX.root}
              />
            </div>
          </section>

          <fieldset>
            <legend className="text-lg font-bold text-ink">이야기 고르기</legend>
            <p className="mt-1 text-base text-ink-soft">
              체크로 넣고 빼고, 크기로 잎·꽃·열매를 바꿔보세요.
            </p>

            <ul className="mt-4 divide-y divide-line rounded-md border-2 border-line">
              {active.slots.map((s) => {
                const key = keyOf(s);
                const on = !off.has(key);
                const size = sizes.get(key) ?? s.initialSize;
                const nkey = noteKeyOf(s);
                return (
                  <li key={key} className="px-4 py-3">
                    <label
                      className={
                        "flex min-h-[44px] cursor-pointer items-center gap-3 transition-opacity " +
                        (on ? "opacity-100" : "opacity-40")
                      }
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(s)}
                        className="h-6 w-6 shrink-0 accent-[#C8923D]"
                      />
                      <span
                        className={
                          "text-lg text-ink " + (on ? "" : "line-through")
                        }
                      >
                        {s.title}
                      </span>
                      <span
                        className={
                          "ml-auto shrink-0 text-base text-ink-soft " +
                          (on ? "" : "line-through")
                        }
                      >
                        {s.yearLabel}
                      </span>
                    </label>

                    {s.sizeable ? (
                      <div
                        role="group"
                        aria-label="크기 고르기"
                        className={
                          "mt-2 flex gap-2 " +
                          (on ? "" : "pointer-events-none opacity-40")
                        }
                      >
                        {SIZE_OPTIONS.map((opt) => {
                          const activeBtn = size === opt.size;
                          return (
                            <button
                              key={opt.size}
                              type="button"
                              aria-pressed={activeBtn}
                              onClick={() => setSize(s, opt.size)}
                              className={
                                "flex min-h-[56px] flex-1 flex-col items-center justify-center rounded-md border-2 leading-tight transition-colors " +
                                (activeBtn
                                  ? "border-brand bg-banner text-ink"
                                  : "border-line text-ink-soft hover:bg-banner")
                              }
                            >
                              <span className="text-base font-bold">
                                {opt.label}
                              </span>
                              <span className="text-sm">{opt.sub}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="mt-2 text-base text-ink-soft">
                        🐦 특별한 인연 — 새로 그려져요
                      </p>
                    )}

                    {/* 사건별 메모 — 앱 안에서만. 제외(off)된 사건은 메모도 숨김. */}
                    {on ? (
                      <MemoRow
                        value={notes[nkey] ?? ""}
                        open={openNotes.has(nkey)}
                        onToggle={() => toggleNote(nkey)}
                        onChange={(v) => setNote(nkey, v)}
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        </div>
      </div>
    </div>
  );
}

// 사건 메모 — 기본 접힘(56px "메모 추가" 탭). 펼치면 18px textarea + n/50.
// 메모는 포스터 SVG 에 안 들어가고 이 행 아래 앱 안에서만 표시.
function MemoRow({
  value,
  open,
  onToggle,
  onChange,
}: {
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (v: string) => void;
}) {
  if (!open) {
    return (
      <div className="mt-2">
        {value ? (
          <p className="rounded-md bg-banner px-3 py-2 text-base text-ink">
            <span className="text-ink-soft">메모 </span>
            {value}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          className="mt-2 flex min-h-[56px] w-full items-center justify-center rounded-md border-2 border-line text-base font-bold text-ink-soft transition-colors hover:bg-banner"
        >
          {value ? "✏️ 메모 고치기" : "＋ 메모 추가"}
        </button>
      </div>
    );
  }
  return (
    <label className="mt-2 block">
      <span className="text-base font-bold text-ink">이 사건에 한마디</span>
      <textarea
        value={value}
        maxLength={MAX.note}
        rows={2}
        placeholder="예: 그날따라 하늘이 참 맑았지"
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full resize-none rounded-md border-2 border-line bg-surface px-3 py-2 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
      />
      <span className="mt-1 flex items-center justify-between text-sm text-ink-soft">
        <button
          type="button"
          onClick={onToggle}
          className="font-bold text-ink-soft transition-colors hover:text-ink"
        >
          접기
        </button>
        <span>
          {value.length}/{MAX.note}
        </span>
      </span>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  max,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  max: number;
}) {
  return (
    <label className="block">
      <span className="text-base font-bold text-ink">{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border-2 border-line bg-surface px-3 py-3 text-lg text-ink placeholder:text-ink-soft focus:border-brand focus:outline-none"
      />
      <span className="mt-1 block text-right text-sm text-ink-soft">
        {value.length}/{max}
      </span>
    </label>
  );
}
