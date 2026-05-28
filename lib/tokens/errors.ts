// Phase 8.4 — 토큰 관련 서버 액션이 던지는 타입 에러.
//
// actions.ts 가 아니라 여기 두는 이유: "use server" 파일은 async 함수만
// export 할 수 있다. 이 클래스는 서버 전용 부수효과가 없어 어디서 import
// 해도 안전하다.

export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}
