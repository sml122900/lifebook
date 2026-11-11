// 토큰 거래 내역 사유(TokenTransaction.reason)의 화면 이름표 — 토큰 화면(/account/tokens)·충전 화면(/billing) 공용.
// reason 은 자유 문자열이고 모델·깊이가 뒤에 붙는 것(companion_haiku·timemachine_assistant_web_simple)이 있어
// 정확히 같은 이름 → 앞부분 순으로 찾는다. 이름표가 없으면 내부 이름 그대로(폴백) — 회귀 test-print ⑫ 가
// 운영 원장의 모든 사유·코드가 쓰는 사유에 이름표가 있는지 확인한다(2026-11-12).

const EXACT: Record<string, string> = {
  signup_grant: "가입 무료 지급",
  ai_charge: "추억 정리",
  topup: "토큰 충전",
  topup_refund: "충전 환불", // 2026-11-10 — 고객센터 요청 → 관리자 환불(lib/tokens/refund-exec)
  refund: "환불",
  voice_cleanup: "음성 다듬기",
  daily_attendance: "매일 출석",
  attendance_streak_bonus: "연속 출석 보너스",
  stt_recording: "녹음 받아쓰기", // /api/clova-stt/charge
  custom_bg_set: "포스터 맞춤 배경", // 판매 종료된 강물 포스터(2026-11-08) — 옛 원장 줄
  timemachine_assistant_context_miss_refund: "AI에게 물어보기 환불", // 이전 답으로 못 답해 돌려드린 것
};

// 앞부분 — 위에서부터 먼저 맞는 것.
const PREFIX: [string, string][] = [
  ["timemachine_assistant_", "AI에게 물어보기"], // _context_·_context_miss_·_web_ + 깊이
  ["companion_", "말동무 대화"], // + 모델
  ["memory_refine_", "글 다듬기"], // + 모델
  ["inline_refine_", "글 다듬기"], // + 모델
];

function labelOf(reason: string): string | null {
  if (reason in EXACT) return EXACT[reason];
  for (const [p, label] of PREFIX) if (reason.startsWith(p)) return label;
  return null;
}

export function reasonLabel(reason: string): string {
  return labelOf(reason) ?? reason;
}

export function hasReasonLabel(reason: string): boolean {
  return labelOf(reason) !== null;
}
