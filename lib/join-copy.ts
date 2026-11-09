// 가입 전 동의 화면(/join — 2026-11-03, docs/phase/my-life-restructure.md §16.3) 문구 단일 출처.
// 2026-11-04 성민 확정(preparing·saveFailed·syncFailed·retry 는 [임시]). 서비스 이름 화면 표기 = "Lifebook", 구글 = "Google". 순수 모듈(클라·서버 공용).
// 동의 항목 문구 자체는 /consent 와 같은 app/consent/ConsentChecklist(확정 문구 — 법적 표기라 "라이프북" 유지)를 쓴다.

export const JOIN_COPY = {
  title: "가입하기 전에",
  desc: "Lifebook을 쓰시려면 아래 세 가지에 동의해 주세요. 동의하신 뒤 가입 방법을 고르시면 바로 이어서 가입돼요.",
  // 로그인 화면에서 소셜 버튼을 눌렀는데 아직 계정이 없을 때(계정은 안 만들고 여기로 옴)
  bounced: (method: string) => `처음 오셨네요. 아래에서 동의하신 뒤 ${method} 버튼을 한 번 더 눌러 주세요.`,
  consentError: "필수 항목 세 가지에 모두 동의해 주세요.",
  methodsTitle: "가입 방법 고르기",
  methodName: { kakao: "카카오", naver: "네이버", google: "Google", email: "이메일" },
  kakao: "카카오로 가입하기",
  naver: "네이버로 가입하기",
  google: "Google로 가입하기",
  email: "이메일로 가입하기",
  needAll: "위 세 가지에 모두 동의하시면 가입 버튼을 누를 수 있어요.",
  pending: "가입 화면으로 넘어가는 중…",
  preparing: "준비 중이에요. 잠시만 기다려 주세요.", // [임시 — 성민 확정 필요] 체크칸·버튼이 눌림을 받기 전(/join 안내 줄 · /consent 버튼 아래 작은 글씨)
  preparingButton: "준비 중…", // [임시 — 성민 확정 필요] 2026-11-10 — /consent [시작하기] 자리(준비 전)
  saveFailed: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.", // [임시 — 성민 확정 필요] /consent 저장 실패
  syncFailed: "동의는 저장했는데 다음 화면으로 넘어가지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // [임시 — 성민 확정 필요] /consent 저장 뒤 세션 갱신 실패
  retry: "다시 시도", // [임시 — 성민 확정 필요]
  toLogin: "이미 가입하셨나요? 로그인하기",
} as const;
