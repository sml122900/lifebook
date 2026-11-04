// 말로 적기(음성 받아쓰기) 칸 문구 — app/components/VoiceTextarea. 쓰는 화면이 여럿이라 따로 둔다.
// 2026-11-04 화면 코드에서 글자 그대로 옮김 — 전부 [임시 — 성민 확정 필요]. 클라이언트에서도 쓰는 순수 모듈.
// (AI 다듬기 문구는 onCleanup 을 넘기는 화면 — 닫힌 타임머신 달 화면 — 에만 나와 아직 VoiceTextarea 코드에 있다.)

export const VOICE_COPY = {
  start: "말로 적기", // 버튼(녹음 전)
  stop: "녹음 멈추기", // 버튼·읽어 주기 이름(녹음 중)
  startAria: "음성으로 말하기", // 버튼 읽어 주기 이름(녹음 전)
  listening: "듣고 있어요… 다 말씀하시면 멈추기를 누르세요.", // 녹음 중 안내
  errPermission: "마이크 사용 권한이 필요해요.", // 마이크 권한 거부
  errRecording: "녹음 중 문제가 생겼어요. 다시 시도해 주세요.", // 녹음 중 오류
  errStart: "녹음을 시작할 수 없어요.", // 녹음 시작 실패
} as const;
