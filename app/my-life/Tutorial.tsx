"use client";

// My Life 튜토리얼(docs/phase/tutorial.md — T1~T8 2026-11-08 확정).
//   첫 진입 카드(T1 — [둘러보기]·[나중에]) → 연습 판 3단계(① 지도 읽기 ② 직접 넣기 ③ 막히면 AI에게) + 끝 카드 → 실제 [찾기] 한 번 가리키기.
//   다시 보기(T3) = 사이드 패널 도움(/my-life?tutorial=1) · [찾기] 시트 맨 아래(TUTORIAL_EVENT).
// 연습 판 = 실제 지도와 같은 그리기 코드(layoutMyLife · StoryPlanet · OrbitSystem · ORBIT_CSS · 공전 ./orbit · 끌기 ./drag beginPress)에
// 가짜 데이터(lib/tutorial-practice). AI 카드도 실제 시트와 같은 부품(./AskCards). DB 쓰기·모델 호출 0 — 서버 액션은 투어 기록
// (markTourCompletedAction — User.completedTours) 하나뿐. 문구 전부 [임시](lib/my-life-copy tutorial).

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from "react";

import { CoachMarks } from "@/app/components/CoachMarks";
import { markTourCompletedAction } from "@/app/life-timeline/tour-actions";
import { Button } from "@/components/ui/Button";
import type { MyLifeData } from "@/lib/my-life";
import { MY_LIFE_COPY as C } from "@/lib/my-life-copy";
import { L, layoutMyLife, type LayoutSatellite } from "@/lib/my-life-layout";
import { orbitShape } from "@/lib/space-orbit";
import { SIDE_PANEL_EVENT } from "@/lib/tours";
import {
  closeTourId,
  initialTutorial,
  shouldOffer,
  showButtonAdd,
  TUTORIAL_EVENT,
  TUTORIAL_LATER,
  TUTORIAL_QUERY,
  TUTORIAL_STEP_COUNT,
  TUTORIAL_STEPS,
  tutorialReducer,
} from "@/lib/tutorial";
import { PRACTICE_STORY_KEY, practiceClaims, practiceData, practiceRename, practiceResult } from "@/lib/tutorial-practice";

import { AnswerClaims, PlanCard, ResultCard } from "./AskCards";
import { beginPress, dragJustEnded } from "./drag";
import { ORBIT_CSS, OrbitSystem, StoryPlanet } from "./MyLifeView";
import { animateClose, animateOpen, observeOrbits, readMotion, resyncOrbits, snapshotSats, subscribeMotion } from "./orbit";

const T = C.tutorial;
const SHEET = "inset-x-0 bottom-0 top-auto mx-auto mb-0 max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-md border-2 border-b-0 border-line bg-surface p-0 text-ink backdrop:bg-scrim";
const FLOAT = "fixed inset-x-4 bottom-40 z-40 mx-auto flex max-w-md flex-col gap-3 rounded-md border-2 bg-surface p-4";

export function MyLifeTutorial({ completed }: { completed: string[] }) {
  const searchParams = useSearchParams();
  const asked = searchParams.get(TUTORIAL_QUERY) !== null; // 다른 화면의 [지도 쓰는 법 다시 보기]
  const [offer, setOffer] = useState(() => !asked && shouldOffer(completed));
  const [laterNote, setLaterNote] = useState(false);
  const [practice, setPractice] = useState(asked);
  const [round, setRound] = useState(0); // 다시 볼 때마다 처음부터
  const [point, setPoint] = useState(false);

  // ?tutorial= 흔적 정리 — 새로고침에 또 열리지 않게(다른 주소 값은 그대로).
  useEffect(() => {
    if (!asked) return;
    const sp = new URLSearchParams(window.location.search);
    sp.delete(TUTORIAL_QUERY);
    const rest = sp.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}`);
  }, [asked]);

  // 같은 화면에서 다시 보기([찾기] 시트·사이드 패널)
  useEffect(() => {
    const on = () => {
      window.dispatchEvent(new CustomEvent(SIDE_PANEL_EVENT, { detail: { open: false } })); // 사이드 패널에서 눌렀으면 닫고(연습 판 뒤에 남지 않게)
      setOffer(false);
      setLaterNote(false);
      setPoint(false);
      setRound((r) => r + 1);
      setPractice(true);
    };
    window.addEventListener(TUTORIAL_EVENT, on);
    return () => window.removeEventListener(TUTORIAL_EVENT, on);
  }, []);

  useEffect(() => {
    if (!laterNote) return;
    const t = setTimeout(() => setLaterNote(false), 8000);
    return () => clearTimeout(t);
  }, [laterNote]);

  return (
    <>
      {offer && (
        <section aria-labelledby="mylife-tutorial-offer" data-tutorial-offer className={`${FLOAT} border-brand`}>
          <p className="m-0 text-lg text-ink-soft">{T.mood}</p>
          <p id="mylife-tutorial-offer" className="m-0 text-xl font-bold text-ink">
            {T.offer}
          </p>
          <div className="flex gap-3">
            <Button
              variant="primary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setOffer(false);
                setPractice(true);
              }}
            >
              {T.start}
            </Button>
            <Button
              variant="secondary"
              size="lg"
              className="flex-1"
              onClick={() => {
                setOffer(false);
                setLaterNote(true);
                void markTourCompletedAction(TUTORIAL_LATER);
              }}
            >
              {T.later}
            </Button>
          </div>
        </section>
      )}
      {laterNote && (
        <p role="status" className={`${FLOAT} border-line text-lg text-ink`}>
          {T.laterNote}
        </p>
      )}
      {practice && (
        <PracticeSheet
          key={round}
          onClose={(how) => {
            setPractice(false);
            void markTourCompletedAction(closeTourId(how));
            if (how === "finish") setPoint(true);
          }}
        />
      )}
      {point && (
        <CoachMarks
          steps={[{ target: "mylife-find", title: T.findPointTitle, desc: T.findPoint, panel: "closed" }]}
          tourId="my-life-find"
          autoStart
          onComplete={() => setPoint(false)}
        />
      )}
    </>
  );
}

function PracticeSheet({ onClose }: { onClose: (how: "finish" | "skip") => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const closedRef = useRef(false);
  const grabbedRef = useRef(false);
  const [s, dispatch] = useReducer(tutorialReducer, undefined, initialTutorial);
  const [added, setAdded] = useState(false);
  const [title, setTitle] = useState(T.fakeStory);
  const [isOpen, setIsOpen] = useState(false); // 연습 이야기가 펼쳐졌는지
  const data = useMemo(() => practiceData({ added, title }), [added, title]);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  function close(how: "finish" | "skip") {
    if (closedRef.current) return;
    closedRef.current = true;
    ref.current?.close();
    onClose(how);
  }

  // ② 끌기 — 실제 지도와 같은 집기·나선·튕김(./drag beginPress). 저장 대신 화면 데이터만 바꾼다.
  function onPress(e: React.PointerEvent<HTMLButtonElement>) {
    const root = boardRef.current;
    const dlg = ref.current;
    if (!root || !dlg || !e.isPrimary) return;
    grabbedRef.current = false;
    const planetEl = (k: string) => root.querySelector<HTMLElement>(`button[data-node-key="${CSS.escape(k)}"]`);
    beginPress({
      kind: "person",
      name: T.fakeCandidate,
      origin: e.currentTarget,
      pointer: { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp },
      ghostHost: dlg,
      edgeBox: null,
      planets: () => {
        const el = planetEl(PRACTICE_STORY_KEY);
        if (!el) return [];
        const r = el.getBoundingClientRect();
        const o = orbitShape(r.width, 0);
        return [{ key: PRACTICE_STORY_KEY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, rx: o.rx, ry: o.ry }];
      },
      allowed: new Set([PRACTICE_STORY_KEY]),
      planetEl,
      onGrab: () => {
        grabbedRef.current = true;
        root.setAttribute("data-dragging", "");
        planetEl(PRACTICE_STORY_KEY)?.setAttribute("data-drop-ok", "");
      },
      onAutoPan: () => {},
      onDrop: async () => "added",
      onLand: () => {
        setAdded(true);
        dispatch({ t: "dropped" });
      },
      onSettled: () => {},
      onBounce: () => dispatch({ t: "dropFail" }),
      onEnd: () => {
        root.removeAttribute("data-dragging");
        planetEl(PRACTICE_STORY_KEY)?.removeAttribute("data-drop-ok");
      },
    });
  }

  const stepNo = Math.min(TUTORIAL_STEPS.indexOf(s.step) + 1, TUTORIAL_STEP_COUNT);
  const rename = practiceRename();

  return (
    <dialog
      ref={ref}
      aria-labelledby="mylife-tutorial-title"
      data-tutorial
      onCancel={(e) => {
        e.preventDefault();
        close("skip");
      }}
      className={SHEET}
    >
      <div data-tutorial-step={s.step} className="flex flex-col gap-4 px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6">
        <div className="flex items-center justify-between gap-3">
          <h2 id="mylife-tutorial-title" className="m-0">
            {T.title}
          </h2>
          {s.step !== "end" && <span className="text-lg text-ink-soft">{T.progress(stepNo, TUTORIAL_STEP_COUNT)}</span>}
        </div>
        <p className="m-0 text-lg text-ink-soft">{T.practiceTag}</p>

        {s.step !== "end" && (
          <PracticeBoard
            data={data}
            open={isOpen}
            boardRef={boardRef}
            onTap={() => {
              setIsOpen((o) => !o);
              dispatch({ t: "openPlanet" });
            }}
          />
        )}

        <div aria-live="polite" className="flex flex-col gap-3">
          {s.step === "read" && (
            <>
              <h3 className="m-0 text-xl font-bold text-ink">{T.readTitle}</h3>
              <p className="m-0 text-lg text-ink">{T.readBody}</p>
              <p className="m-0 text-lg text-ink">{s.opened ? T.readDone : T.readTry}</p>
            </>
          )}
          {s.step === "drag" && (
            <>
              <h3 className="m-0 text-xl font-bold text-ink">{T.dragTitle}</h3>
              <p className="m-0 text-lg text-ink">{s.dropped ? T.dragDone : s.dragFails > 0 ? T.dragRetry : T.dragBody}</p>
              {!added && (
                <button
                  type="button"
                  data-tutorial-candidate
                  onPointerDown={onPress}
                  onClick={() => {
                    // 길게 누르지 않고 뗀 것 = 못 넣음(끌기가 막 끝난 뒤 생기는 클릭은 셈하지 않음)
                    if (!grabbedRef.current && !dragJustEnded()) dispatch({ t: "dropFail" });
                  }}
                  className="mx-auto flex min-h-[56px] items-center gap-3 rounded-full border-2 border-person bg-person-wash px-5 text-lg font-semibold text-ink"
                  style={{ touchAction: "none" }}
                >
                  <span aria-hidden className="moon-person flex h-10 w-10 items-center justify-center rounded-full border-2 border-person">
                    {T.fakeCandidate.slice(0, 1)}
                  </span>
                  {T.fakeCandidate}
                </button>
              )}
              {showButtonAdd(s) && (
                <>
                  <p className="m-0 text-lg text-ink">{T.dragButtonNote}</p>
                  <Button
                    variant="secondary"
                    size="lg"
                    data-tutorial-button-add
                    onClick={() => {
                      setAdded(true);
                      dispatch({ t: "dropped" });
                    }}
                  >
                    {T.dragButton(T.fakeCandidate)}
                  </Button>
                </>
              )}
            </>
          )}
          {s.step === "ai" && (
            <>
              <h3 className="m-0 text-xl font-bold text-ink">{T.aiTitle}</h3>
              <p className="m-0 text-lg text-ink">{T.aiBody}</p>
              <Button variant="secondary" size="lg" className="h-auto! py-3! text-left" onClick={() => dispatch({ t: "ask" })}>
                {T.aiAsk(T.askQ)}
              </Button>
              {s.askShown && <AnswerClaims claims={practiceClaims()} onGo={() => {}} />}
              <Button variant="secondary" size="lg" className="h-auto! py-3! text-left" onClick={() => dispatch({ t: "editPlan" })}>
                {T.aiEdit(T.editQ)}
              </Button>
              {s.edit === "plan" && (
                <PlanCard
                  plan={[rename]}
                  pending={false}
                  apply={() => {
                    setTitle(T.fakeStoryRenamed);
                    dispatch({ t: "editApply" });
                  }}
                  clear={() => dispatch({ t: "editCancel" })}
                />
              )}
              {(s.edit === "done" || s.edit === "undone") && (
                <ResultCard
                  result={practiceResult()}
                  undoState={s.edit === "undone" ? "done" : "idle"}
                  pending={false}
                  onGo={() => {}}
                  undo={() => {
                    setTitle(T.fakeStory);
                    dispatch({ t: "editUndo" });
                  }}
                />
              )}
              <p className="m-0 text-lg text-ink-soft">{T.aiEditNote}</p>
            </>
          )}
          {s.step === "end" && (
            <>
              <h3 className="m-0 text-xl font-bold text-ink">{T.endTitle}</h3>
              <p className="m-0 text-lg text-ink">{T.endBody}</p>
            </>
          )}
        </div>

        {s.step === "end" ? (
          <Button variant="primary" size="lg" onClick={() => close("finish")}>
            {T.finish}
          </Button>
        ) : (
          <>
            {/* 확인 카드가 떠 있는 동안 주요 버튼은 카드의 [이대로 하기] 하나(실제 AI 시트와 같음) */}
            <Button variant={s.edit === "plan" && s.step === "ai" ? "secondary" : "primary"} size="lg" data-tutorial-next onClick={() => dispatch({ t: "next" })}>
              {T.next}
            </Button>
            <Button variant="tertiary" size="lg" data-tutorial-skip onClick={() => close("skip")}>
              {T.skip}
            </Button>
          </>
        )}
      </div>
    </dialog>
  );
}

// 연습 판 — 실제 지도와 같은 배치·그리기(layoutMyLife → 이야기 행성 + 위성 계)를 작은 상자에. 공전·펼침·움직임 멈춤도 실제와 같은 규칙.
function PracticeBoard({ data, open, boardRef, onTap }: { data: MyLifeData; open: boolean; boardRef: React.RefObject<HTMLDivElement | null>; onTap: () => void }) {
  const motion = useSyncExternalStore(subscribeMotion, readMotion, () => "run" as const) === "stop" ? "hold" : "run";
  const layout = useMemo(() => layoutMyLife(data), [data]);
  const node = layout.nodes.find((n) => n.key === PRACTICE_STORY_KEY);
  const sats = useMemo(() => layout.satellites.filter((x) => x.planetKey === PRACTICE_STORY_KEY), [layout]);

  useEffect(() => {
    const root = boardRef.current;
    return root ? observeOrbits(root) : undefined;
  }, [boardRef]);
  useEffect(() => {
    const root = boardRef.current;
    if (root) resyncOrbits(root);
  }, [boardRef, sats.length]);

  if (!node || node.kind !== "story") return null;
  const story = data.events[0].stories[0];
  const p = node.planet;
  // 보이는 범위 = 행성 + 가장 큰 궤도(위성 칸 반 + 이름표) + 펼친 위성 칸
  const orbitR = Math.max(...[orbitShape(p.d, 0), orbitShape(p.d, 1)].map((o) => Math.max(o.rx, o.ry)));
  let minX = p.cx - orbitR - L.SAT_CELL_W / 2;
  let maxX = p.cx + orbitR + L.SAT_CELL_W / 2;
  const minY = p.cy - orbitR - L.SAT_D / 2;
  let maxY = p.cy + orbitR + L.SAT_CELL_H;
  for (const x of sats) {
    minX = Math.min(minX, x.x);
    maxX = Math.max(maxX, x.x + x.w);
    maxY = Math.max(maxY, x.y + x.h);
  }
  const W = Math.ceil(maxX - minX);
  const H = Math.ceil(maxY - minY) + 8;
  const nameOf = (x: LayoutSatellite) => story.chips.find((c) => c.id === x.ref?.id)?.name ?? "";

  return (
    <div
      ref={boardRef}
      data-motion={motion}
      data-tutorial-board
      onClick={(e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>("[data-node-key]");
        if (el?.dataset.nodeKey !== PRACTICE_STORY_KEY) return;
        const sys = boardRef.current?.querySelector<HTMLElement>(`.orbit-sys[data-sys="${CSS.escape(PRACTICE_STORY_KEY)}"]`);
        if (sys && !open) {
          const from = snapshotSats(sys, motion === "run");
          sys.setAttribute("data-open", "");
          animateOpen(sys, from);
        } else if (sys) animateClose(sys, motion === "run");
        onTap();
      }}
      className="space-map relative mx-auto max-w-full overflow-hidden rounded-md border-2 border-line"
      style={{ width: W, height: H }}
    >
      <style>{ORBIT_CSS}</style>
      <div className="absolute" style={{ left: -minX, top: -minY + 4 }}>
        <StoryPlanet story={story} node={node} style={{ left: p.cx - p.d / 2, top: p.cy - p.d / 2, width: p.d, height: p.d }} />
        <OrbitSystem
          n={node}
          list={sats}
          selected={open ? PRACTICE_STORY_KEY : null}
          decor={null}
          style={{ left: node.x, top: node.y, width: node.w, height: node.h }}
          nameOf={nameOf}
          targetOf={(x) => (x.ref ? `${x.ref.kind === "place" ? "pl" : "pe"}:${x.ref.id}` : null)}
        />
      </div>
    </div>
  );
}
