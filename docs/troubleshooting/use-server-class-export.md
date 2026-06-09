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

---

## 재발 사례 — number export (2026-06-10)

같은 제약의 **숫자** 변형. `app/era/actions.ts`("use server")가 회상 길이 상한을 클라(`EraMemoryEditor`)에 넘기려고 상수를 재노출하고 있었다:

```ts
// app/era/actions.ts  ("use server")
export const ERA_MEMORY_LIMIT = ERA_MEMORY_MAX_LENGTH; // = 500
```

```
Error: A "use server" file can only export async functions, found number.
```

### 왜 그동안 안 터졌나 (핵심)

이 export 는 처음부터 잘못이었지만, 한동안 페이지를 깨뜨리지 않았다. **사진 장소 저장 액션(`updatePhotoPlaceAction`)이 같은 `/life-timeline` 의 server-action 번들에 새로 합류**하면서 번들 전체가 재검증 → 그제서야 number export 가 걸렸다. 교훈: **모듈 그래프에 새 액션을 더하면 기존 "use server" 파일까지 재검증**된다. 잠재 위반은 "새 진입점"에서 표면화한다.

### 왜 액션 파일을 통로로 썼었나

클라 컴포넌트(`EraMemoryEditor`)가 상수를 필요로 하는데, 정의처 `lib/era-stash.ts` 는 **prisma 를 import(서버 전용)** 해서 클라가 직접 못 가져온다. 그래서 "use server" 액션 파일을 우회 통로로 쓰고 있었다 — 우회 자체가 폭탄이었다.

### 해결 — 순수 상수 모듈

```ts
// lib/era-constants.ts  (use server 아님, prisma 의존 0 → 클라/서버 공용)
export const ERA_MEMORY_MAX_LENGTH = 500;
```

- 서버(`lib/era-stash.ts`)는 `import` 후 `export { ERA_MEMORY_MAX_LENGTH }` 재노출 → 기존 `@/lib/era-stash` 호출자 무수정.
- 클라(`EraMemoryEditor`)는 `@/lib/era-constants` 에서 직접 import.

`lib/place-types.ts`(클라/서버 공용 순수 타입·상수) 와 같은 패턴. **클라가 서버 전용 모듈의 상수를 필요로 하면 → 순수 모듈로 추출**(액션 파일을 통로로 쓰지 말 것).

### 핵심 학습 (추가)

- `"use server"` 가 거부하는 건 클래스뿐 아니라 **모든 비-async 값**(number/string/객체/변수). 에러 메시지가 타입을 알려줌(`found number`).
- 상수의 단일 진실 원천은 prisma 의존 여부로 가른다: 서버 전용이면 lib 안, 클라 공용이면 prisma 없는 별도 순수 모듈.
