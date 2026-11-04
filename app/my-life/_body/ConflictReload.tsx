"use client";

// 충돌 뒤 [다시 불러오기](2026-11-04) — 동작은 그대로(화면 다시 불러오기). 고치던 글을 이전 판에 남겼으면 바로, 못 남겼으면
// "고치던 글이 사라져요" 확인 뒤. 쓰는 곳 = 글 고치기 화면(BodyEditor) · My Life 이야기 패널 평문 고치기(MyLifeView StoryPanel).

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { MY_LIFE_COPY } from "@/lib/my-life-copy";

const C = MY_LIFE_COPY.body;

export function ConflictReload({ kept }: { kept: boolean }) {
  const [asking, setAsking] = useState(false);
  if (asking) {
    return (
      <div role="alert" className="flex flex-col gap-2 rounded-md border-2 border-line bg-banner p-3">
        <p className="m-0 text-lg text-ink">{C.reloadLoseAsk}</p>
        <Button variant="secondary" size="lg" onClick={() => window.location.reload()}>
          {C.reload}
        </Button>
        <Button variant="tertiary" size="lg" onClick={() => setAsking(false)}>
          {C.unsavedStay}
        </Button>
      </div>
    );
  }
  return (
    <Button variant="secondary" size="lg" onClick={() => (kept ? window.location.reload() : setAsking(true))}>
      {C.reload}
    </Button>
  );
}
