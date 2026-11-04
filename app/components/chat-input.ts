"use client";

// 대화 입력칸 공용 — 키보드 판정 · Enter 판정 · 높이 자동 늘림(2026-11-04). 쓰는 곳 = /chat-v3(설정 단계·자유 대화 같은 칸)·
// 말동무(/life-timeline/companion). 오늘의 인터뷰 칸은 원래 Enter = 줄바꿈 · 보내기는 버튼이라 그대로.
//
// - 키보드 판정: 주 입력 장치가 마우스·트랙패드(CSS hover: hover 이고 pointer: fine — PC·노트북)면 키보드도 있다고 본다.
//   휴대폰·태블릿(손가락이 주 입력)은 아니라고 본다. 서버 그림·하이드레이션은 "없음"으로 그린 뒤 그 기기 값으로(입력 장치가 바뀌면 다시).
// - Enter: 키보드 있음 = Enter 보내기 · Shift+Enter 줄바꿈 / 터치 기기 = 키보드의 줄바꿈 키는 줄바꿈, 보내기는 [전송] 버튼만.
//   한글 조합 중 Enter 는 늘 무시(isComposing · Safari 는 조합을 끝내는 Enter 가 keyCode 229) — 조합 확정과 보내기가 겹쳐 두 번 처리되지 않게.
// - 높이: 내용만큼 늘어나고(최소 = rows) 칸의 max-height 에서 멈춘 뒤 칸 안에서 스크롤.

import { useLayoutEffect, useSyncExternalStore, type KeyboardEvent, type RefObject } from "react";

const KEYBOARD_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeKeyboardQuery(cb: () => void) {
  const mq = window.matchMedia(KEYBOARD_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useHasKeyboard(): boolean {
  return useSyncExternalStore(subscribeKeyboardQuery, () => window.matchMedia(KEYBOARD_QUERY).matches, () => false);
}

// 한글 조합 중 Enter(조합을 확정하는 Enter 포함 — Safari 는 isComposing 없이 keyCode 229) — 보내지 않는다.
// 한 줄 입력칸(글로벌 비서·사용법 챗)도 이 판정을 쓴다(2026-11-04).
export function isComposingEnter(e: KeyboardEvent<Element>): boolean {
  return e.key === "Enter" && (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229);
}

// 이 keydown 으로 보내야 하는지(여러 줄 입력칸) — 맞으면 호출부가 preventDefault 후 보낸다.
export function isSendEnter(e: KeyboardEvent<HTMLTextAreaElement>, hasKeyboard: boolean): boolean {
  if (e.key !== "Enter" || e.shiftKey || isComposingEnter(e)) return false;
  return hasKeyboard;
}

export function useAutoGrow(ref: RefObject<HTMLTextAreaElement | null>, value: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [ref, value]);
}
