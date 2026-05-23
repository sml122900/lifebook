# 트러블슈팅 — `"use server"` 파일에서 클래스 export 시 빌드 에러

## 문제 상황

Phase 8.4에서 잔액 부족 사전 차단을 구현하며 `InsufficientBalanceError` 클래스를 만들고 server action에서 throw, `AnswerForm` (client component)에서 message로 분기하려 했다. 초기 코드:

```ts
// app/memory/[eventId]/actions.ts
"use server";

import { ... } from "...";

export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}

export async function submitMemoryAnswer(formData: FormData) {
  // ...
  if (balance < MIN_BALANCE_TO_START_CYCLE) {
    throw new InsufficientBalanceError();
  }
  // ...
}
```

Next.js 빌드/dev 컴파일 시점에 다음 에러:

```
Only async functions are allowed to be exported in a "use server" file.
```

dev 페이지 진입이 막혀 답변 제출 흐름 자체 확인 불가.

## 시도한 것들

1. `export class` → `export default class` 변경 시도 — 동일 에러. "use server" 파일은 named/default 어떤 형태든 함수 외 export 거부.
2. 클래스 export 제거하고 throw 자리에 `throw new Error("insufficient balance")` 직접 — 동작은 하지만 AnswerForm이 `err.message.includes("...")`로 분기해야 해 타입이 약함. 만약 다른 에러 메시지가 우연히 같은 문자열을 포함하면 오작동.
3. 클래스를 같은 파일 안에 두되 export 하지 않고 내부 사용만 — actions.ts에선 동작하지만 client component가 `err instanceof InsufficientBalanceError`로 분기 못 함 (import 불가).

근본 원인: **`"use server"` 디렉티브는 그 파일을 server action으로 marking**. Next.js의 server action 규약상 모듈 export는 모두 RPC endpoint가 됨. 클래스는 RPC endpoint가 될 수 없으니 컴파일러가 거부한다. 같은 이유로 상수, 타입 alias도 export 불가.

## 최종 해결법

**클래스를 별도 `"use server"` 아닌 파일로 분리**:

```ts
// lib/tokens/errors.ts (use server 아님)
export class InsufficientBalanceError extends Error {
  constructor() {
    super("insufficient balance");
    this.name = "InsufficientBalanceError";
  }
}
```

`actions.ts`는 import만:

```ts
// app/memory/[eventId]/actions.ts
"use server";

import { InsufficientBalanceError } from "@/lib/tokens/errors";

export async function submitMemoryAnswer(formData: FormData) {
  // ...
  throw new InsufficientBalanceError();
}
```

AnswerForm은 그대로 `err.message.includes("insufficient balance")`로 분기 유지 (instanceof는 client/server 경계 넘어 안 동작할 수 있어 message 비교가 더 견고).

검증: dev 페이지 진입 + 답변 제출 시 잔액 부족 안내 카드 정상 표시.

## 핵심 학습

`"use server"` 파일의 제약:
- export 허용: **async 함수만**
- export 거부: 클래스, 상수, 타입(런타임 값), 변수
- 같은 파일에서 internal use는 OK — 다만 client에서 import 불가

권장 분리 패턴:
- `lib/.../errors.ts` — 에러 클래스, 상수
- `lib/.../types.ts` — TypeScript 타입 (이건 `type` keyword면 빌드 시 사라져 use server에서도 OK)
- `app/.../actions.ts` — server action 함수만

이번 경우는 errors.ts로 클래스 분리 + actions.ts는 import. server/client 양쪽이 같은 클래스 식별자에 접근하지만, 클래스 정의 자체는 use server 밖에 있어 RPC marking 안 됨.

## 이력서 소재 한 줄

Next.js App Router의 `"use server"` 모듈 제약("async 함수만 export 가능")을 빌드 에러 메시지에서 발견 → 에러 클래스를 별도 모듈로 분리해 server action ↔ client component 간 타입 안전한 에러 분기 패턴 정립.
