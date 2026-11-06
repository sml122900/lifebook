// 행성 꾸미기(우주 개편 U4 — docs/phase/ui-space.md §5·§7.5). 그림 = CSS 만(app/globals.css .decor-*), JS 프레임 없음.
// DecorArt — 행성 가운데에 행성 지름 크기 네모로 놓고(부모가 left·top·width·height), 조각은 그 비율로 그린다.
//   .dc-a = 놓는 틀(멈춘 그림) · .dc-b = 움직이는 조각(정지 규칙: 화면 밖 = 움직임 없음 · 전체 보기 배율·[움직임 멈추기]·
//   움직임 줄이기 = 그 자리 멈춤 — 공전과 같은 표식 .space-map[data-motion] · .decor-sys[data-orbit]). 멈춰도 모양이 보이게 그린다.
// DecorPicker — 행성 패널의 꾸미기 고르기(모양 그림 + 이름, 고른 것 = SELECTED 한 가지 · aria-pressed).
import { SELECTED } from "@/components/ui/chip";
import { Button } from "@/components/ui/Button";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";
import { DECOR_SHAPES } from "@/lib/space-decor";

const C = MY_LIFE_COPY;

export function DecorArt({ shape, style }: { shape: string; style: React.CSSProperties }) {
  return (
    <span aria-hidden className={`decor decor-${shape}`} style={style}>
      <span className="dc-a">
        <span className="dc-b" />
      </span>
    </span>
  );
}

// 행성 하나에 하나 — 이미 고른 모양을 다시 누르면 아무것도 안 함(없애기는 아래 버튼).
export function DecorPicker({ current, planetClass, onPick }: { current: string | null; planetClass: string; onPick: (shape: string | null) => void }) {
  return (
    <section aria-labelledby="mylife-decor-title" className="flex flex-col gap-2">
      <p id="mylife-decor-title" className="text-lg font-semibold text-ink">
        {C.space.decorate}
      </p>
      <p className="text-lg text-ink-soft">{C.space.decorHint}</p>
      <ul className="grid grid-cols-3 gap-2">
        {DECOR_SHAPES.map((d) => {
          const on = current === d.key;
          return (
            <li key={d.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => {
                  if (!on) onPick(d.key);
                }}
                className={`flex min-h-[104px] w-full flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-lg leading-6 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                  on ? SELECTED : "border-2 border-line bg-surface text-ink hover:bg-banner"
                }`}
              >
                <span aria-hidden className="decor-preview relative block h-16 w-16 shrink-0">
                  <DecorArt shape={d.key} style={{ left: 16, top: 16, width: 32, height: 32 }} />
                  <span className={`${planetClass} absolute left-4 top-4 block h-8 w-8 rounded-full border-2`} data-decor={d.key} />
                </span>
                <span className="text-center">{d.name}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {current && (
        <Button variant="secondary" size="lg" onClick={() => onPick(null)}>
          {C.space.decorClear}
        </Button>
      )}
    </section>
  );
}
