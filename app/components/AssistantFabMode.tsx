"use client";

import { useEffect } from "react";

// 둥근 AI 버튼(app/life-timeline/AssistantModal floating — data-assistant-fab)이 화면의 버튼을 가리지 않게(2026-11-08 공개 화면 점검 #14).
// body 표식만 켜고 끈다 — 모양은 app/globals.css. (제안 카드의 data-proposal-card 숨김과 같은 방식)
//   hide = 숨김 — 이야기 상세·글 고치기·이전 판(화면 끝 버튼이 넓어 오른쪽 아래를 비울 수 없음, 이 화면에선 비서가 쓰이지 않음)
//   low  = 내려서 작게 — My Life 지도(도구줄 아래 줄 오른쪽 비운 자리 안에 들어가게 — 위 이동 줄과 안 겹침)
export function AssistantFabMode({ mode }: { mode: "hide" | "low" }) {
  useEffect(() => {
    document.body.setAttribute("data-assistant-fab-mode", mode);
    return () => document.body.removeAttribute("data-assistant-fab-mode");
  }, [mode]);
  return null;
}
