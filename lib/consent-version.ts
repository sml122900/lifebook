// 현재 서비스 동의 버전. 이 값이 올라가면 기존 동의자도 /consent 재노출.
// 변경 이력:
//   1 — 초기(텍스트·사진·AI 수집)
//   2 — 음성 녹음 파일 추가 수집 (2026-06-19, Phase 7b)
//   3 — AI 음성 동반자(실시간 멀티턴 대화) 추가, CLOVA STT 국내 위탁 명시 (2026-06-22)
export const CURRENT_CONSENT_VERSION = 3;
