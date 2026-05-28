"use client";

import { useEffect, useRef } from "react";

import {
  markReactionsSeenAction,
  markRecordsSeenAction,
} from "./family-news-actions";

// 가족 소식 카드가 화면에 mount = 사용자가 봤다 → "읽음" 갱신.
// prefetch(미mount)나 월 화면 방문에서는 호출 안 됨 — 실제로 본
// /timemachine 메인에서만. 한 번만 실행 (ref 가드).

export function FamilyNewsSeen({
  markReactions,
  markRecords,
}: {
  markReactions: boolean;
  markRecords: boolean;
}) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    if (markReactions) void markReactionsSeenAction().catch(() => {});
    if (markRecords) void markRecordsSeenAction().catch(() => {});
  }, [markReactions, markRecords]);
  return null;
}
