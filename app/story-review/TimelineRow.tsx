"use client";

import { useState } from "react";

import type { TimelineItem } from "@/lib/story-review";

import { DeleteCustomEventButton } from "./DeleteCustomEventButton";

// v3 P21-2 — DeleteCustomEventButton 이 삭제 성공 후 router.refresh() 로
// /story-review 를 통째로 재계산하던 것을, EpisodeCard 와 같은 이유(배경
// RSC 요청 503)로 로컬 낙관적 숨김으로 바꾼다. 이 행 자신이 hidden 상태를
// 들고 있어야 해서(page.tsx 는 서버 컴포넌트) <li> 렌더를 이 컴포넌트로
// 옮겼다 — DeleteCustomEventButton 자체는 버튼/모달만 그대로 담당.
export function TimelineRow({ item }: { item: TimelineItem }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  const itemLabel = `${item.year ? `${item.year}년 ` : ""}${item.label}`;

  return (
    <li className="flex flex-col gap-2 rounded-md border-2 border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-lg text-ink">{itemLabel}</span>
        <div className="flex shrink-0 items-center gap-3">
          {item.hasEpisode && (
            <span className="rounded-full bg-banner px-3 py-1 text-base text-ink-soft">
              이야기 있음
            </span>
          )}
          {/* v3 P19-2 — 골격 이벤트(BIRTH~MARRIAGE)는 삭제 불가,
              CUSTOM(자유 승격)만 지울 수 있다. */}
          {item.type === "CUSTOM" && (
            <DeleteCustomEventButton
              eventId={item.id}
              eventLabel={itemLabel}
              onDeleted={() => setHidden(true)}
            />
          )}
        </div>
      </div>
      {item.people.length > 0 && (
        <p className="text-base text-ink-soft">
          👤 {item.people.map((p) => p.name).join(", ")}
        </p>
      )}
    </li>
  );
}
