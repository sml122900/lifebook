// 전역 AI 모델(라이브 응답) 단일 소스 — 순수(클라/서버 공용, prisma·DOM 무관).
//
// 사용자가 고르는 라이브 응답 모델: haiku/sonnet/opus. 추출은 이 값과 무관히
// 항상 Sonnet 고정(별도 모듈). 모델 ID·배수·UI 라벨·경고를 한 곳에 둔다.

import type { ModelTier } from "@/lib/tokens/policy";
import { MODEL_MULTIPLIER } from "@/lib/tokens/policy";

export type AiModel = ModelTier; // "haiku" | "sonnet" | "opus"

export const DEFAULT_AI_MODEL: AiModel = "haiku";

// 라이브 응답에 쓰는 실제 모델 ID.
const AI_MODEL_IDS: Record<AiModel, string> = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

export function modelId(m: AiModel): string {
  return AI_MODEL_IDS[m];
}

export function isAiModel(v: unknown): v is AiModel {
  return v === "haiku" || v === "sonnet" || v === "opus";
}

// 배수(차감 표시·계산) — 정책의 통일 배수 {1,3,8}.
const AI_MODEL_MULTIPLIER = MODEL_MULTIPLIER;

// UI 라벨(모델명 노출 X — 품질·속도 어휘). 시니어 친화.
export const AI_MODEL_LABEL: Record<AiModel, { name: string; desc: string }> = {
  haiku: { name: "빠름", desc: "빠르고 가벼워요" },
  sonnet: { name: "균형", desc: "두루 잘해요" },
  opus: { name: "최고 품질", desc: "가장 똑똑해요" },
};

// 칩·설정에 함께 표시할 배수 텍스트.
export function multiplierLabel(m: AiModel): string {
  return `×${AI_MODEL_MULTIPLIER[m]}`;
}

export const OPUS_WARNING =
  "가장 똑똑하지만 토큰을 8배 써요. 무료 토큰으론 몇 번 못 써요.";

export const AI_MODEL_NOTE =
  "대화·다듬기에 적용돼요. 기록 정리는 항상 안정적인 모델로 처리돼요.";

export const AI_MODELS: AiModel[] = ["haiku", "sonnet", "opus"];
