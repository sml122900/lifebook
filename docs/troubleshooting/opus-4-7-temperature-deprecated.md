# 트러블슈팅 — Claude Opus 4.7 의 temperature 파라미터 거부

## 문제 상황

V4 (답의 깊이) 검증 중 (`db/test-assistant-depth.ts`). Haiku/Sonnet 까지
정상 통과, **precise (Opus)** 시나리오에서 SDK 400 에러:

```
BadRequestError: 400 {
  "type":"error",
  "error":{
    "type":"invalid_request_error",
    "message":"`temperature` is deprecated for this model."
  },
  "request_id":"req_011CbTKGYk4xtSUxXLMQeN8G"
}
    at chatWithWebSearch (lib/ai.ts:143:15)
    at askAssistant (lib/timemachine-assistant.ts:564:18)
```

지금까지 모든 호출에 기본 `temperature: 0.4 ~ 0.7` 전송. Haiku/Sonnet 은
받지만 Opus 4.7 (reasoning 모델) 은 거부.

## 시도한 것들

### 1. Anthropic 공식 정보 확인

Opus 4.7 같은 reasoning 모델은 model-level temperature 제어가 아닌 내부
sampling 으로 동작. SDK 의 `messages.create` 가 `temperature` 키를 보면
400. (다른 reasoning 모델군에도 같은 패턴 — `o*-mini` OpenAI 도 비슷.)

### 2. 모든 호출에서 temperature 제거 vs 조건부

**A. 모든 호출 제거** — Haiku/Sonnet 도 default temperature 로. 단점:
환각 제어 손실, V3 컨텍스트 답의 `temperature: 0.3` 같은 정밀 튜닝 무효화.

**B. 모델별 조건부 전송** — 모델 prefix 로 판정. 더 안전.

B 선택.

### 3. 가드 위치

세 후보:
- 각 호출부 (`askAssistant` 안의 chat/chatWithWebSearch 호출 4곳)
- `lib/ai.ts` 의 `chat()`/`chatWithWebSearch()` 함수 내부
- options 객체 처리 헬퍼

호출부 분기 → 4곳 동기화 부담. options 헬퍼 → 추가 추상화. **함수
내부 prefix 가드** 가 가장 단순.

## 최종 해결법

`lib/ai.ts` 에 `supportsTemperature(model: string)` 헬퍼 + 양쪽 함수에서
조건부 spread:

```ts
function supportsTemperature(model: string): boolean {
  return !model.startsWith("claude-opus-4-7");
}

// chat()
const res = await client.messages.create({
  model,
  max_tokens: opts.maxTokens ?? 1024,
  ...(supportsTemperature(model)
    ? { temperature: opts.temperature ?? 0.7 }
    : {}),
  system: opts.system,
  messages,
});

// chatWithWebSearch() — 동일 패턴
```

검증 재실행 → Opus 호출 정상 (in=19731, out=554, 차감 56 = 11*5 + 1).
ledger 에 `timemachine_assistant_web_precise -56` 기록.

## 핵심 학습

1. **모델별 quirk 는 중앙 함수 안 prefix 가드 한 곳에**. 호출부마다
   분기하면 새 모델 추가 시 다 손봐야 함. SDK 가 throw 하는 케이스를
   한 곳에서 흡수.

2. **prefix 매칭이 dated suffix 보다 안전**. `claude-opus-4-7` 으로 시작
   하면 `claude-opus-4-7-20260101` 같은 dated alias 도 자동 매칭. Anthropic
   의 모델 ID 관례.

3. **reasoning 모델 특성 = sampling 파라미터 제한**. temperature 외에도
   `top_p` 같은 게 제한될 수 있음. 향후 다른 sampling 옵션 추가 시 같은
   가드 패턴 확장.

4. **조건부 spread (`...(cond ? {key: v} : {})`) 가 객체 빌드의 깔끔한
   방법**. delete 패턴보다 immutable 친화 + JSX-style 가독성.

## 회피 패턴

향후 새 reasoning 모델 추가 (예: `claude-opus-5-0`) 시:
- `supportsTemperature` 에 prefix 추가:
  ```ts
  function supportsTemperature(model: string): boolean {
    return !model.startsWith("claude-opus-4-7")
        && !model.startsWith("claude-opus-5-0");
  }
  ```
- 또는 화이트리스트로 뒤집기 — reasoning 모델군이 늘면 더 깔끔:
  ```ts
  const REASONING_PREFIXES = ["claude-opus-4-7", "claude-opus-5-0"];
  function supportsTemperature(model: string): boolean {
    return !REASONING_PREFIXES.some(p => model.startsWith(p));
  }
  ```

향후 `top_p` 등 다른 파라미터도 같은 패턴: `supportsTopP(model)`,
`supportsTopK(model)` 등.

## 이력서 소재 한 줄

Anthropic SDK 의 모델별 파라미터 제약(Opus 4.7 의 temperature deprecated)
을 중앙 가드 함수 + 조건부 spread 패턴으로 흡수해 호출부 4곳 동기화
부담 없이 신모델 지원.
