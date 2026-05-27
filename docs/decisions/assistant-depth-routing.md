# 결정 — 비서 "답의 깊이" 3단 모델 라우팅

## Problem

V1~V3 까지 비서는 Haiku 고정. 단일 모델로 묶으면 두 사용자 그룹을 다 못
잡는다:

- **A 그룹** — 가벼운 회상, 빠르게 토큰 절약 (Haiku 로 충분)
- **B 그룹** — 정확도가 중요, 환각 줄이고 싶음 (더 비싼 모델 필요)

게다가 검색 답에서 오정보 (예: 인물 직책·연도 혼동) 가 종종 나옴. 모델
업그레이드 효과를 사용자가 직접 선택할 수 있어야 함.

제약:
- **사용자에게 모델 이름 절대 노출 X** — 시니어 타깃, "Haiku/Sonnet/Opus"
  는 의미 불명. UI 어휘로만 표현.
- **DB 답은 영향 X** — 검증된 시드라 모델 무관, 무료 유지.
- **회귀 0** — 기존 Haiku 호출부의 비용·동작 그대로.

## Action

### 사용자 어휘 — "간단히 / 자세히 / 가장 정확하게"

| 사용자 라벨 | 백엔드 enum | 실제 모델 ID |
|---|---|---|
| 간단히 | `simple` | `claude-haiku-4-5-20251001` (default) |
| 자세히 | `detailed` | `claude-sonnet-4-6` |
| 가장 정확하게 | `precise` | `claude-opus-4-7` |

라벨/매핑은 `lib/timemachine-assistant.ts` 의 `DEPTH_TO_MODEL` 한 곳.

### 토큰 정책 — `chargeOneShot.surcharge` 로 차이 흡수

기존 `tokensFromUsage(in, out) = ceil((in+out) / 2000)` 무수정. Haiku 단가
($1/$5 per MTok) 에 calibrate 된 정책. Sonnet/Opus 는 단가 비례 multiplier.

`lib/tokens/policy.ts`:
```ts
export const MODEL_PRICING = {
  haiku:  { input: 1, output: 5 },
  sonnet: { input: 3, output: 15 },
  opus:   { input: 5, output: 25 },
};
export const MODEL_MULTIPLIER = { haiku: 1, sonnet: 3, opus: 5 };
```

호출부 (`timemachine-assistant.ts`):
```ts
const base = tokensFromUsage(in, out);
const surcharge = base * (MULTIPLIER[depth] - 1) + WEB_SEARCH_SURCHARGE;
chargeOneShot(userId, in, out, `..._${depth}`, undefined, surcharge);
```

총 비용 = `base * MULTIPLIER[depth] + WEB_SEARCH_SURCHARGE`.

**Haiku 일 땐 multiplier=1 → surcharge=base*0 + 1 = 1 → 기존과 동일.**
회귀 없음.

### 단가 비율 단순화 — in/out 가중치 무시

이론적으론 `in * P_in + out * P_out` 가중. 실측에선 검색 답이 in≈17k,
out≈360 → in 토큰이 압도. in 단가 비율 (1:3:5) 로 multiplier 단순화.
사용자에게 "약 N토큰" 미리 표시할 때도 깔끔.

### Opus 4.7 — temperature 거부

reasoning 모델은 `temperature` 파라미터 거부 (`400: deprecated for this
model`). `lib/ai.ts` 의 `supportsTemperature(model)` 가드 — 모델 prefix
검사 후 조건부 spread:

```ts
const res = await client.messages.create({
  model,
  max_tokens,
  ...(supportsTemperature(model) ? { temperature: opts.temperature ?? 0.7 } : {}),
  ...
});
```

향후 다른 reasoning 모델이 추가되어도 이 함수만 확장.

### UI — 모델 이름 노출 X, 추정 토큰 미리

칩 토글 3개. 각 옵션에 추정 토큰 ("약 10토큰" / "약 30토큰" / "약 50토큰")
표시. 답 카드 상단 배지에 `[간단히 답]` 등 라벨만.

응답 schema 에 `model: string` 필드 추가 X — depth 만 echo. UI 가 모델
이름을 알 방법 자체를 차단.

### ledger reason 에 depth suffix

`timemachine_assistant_web_simple` / `_detailed` / `_precise` (검색),
`timemachine_assistant_context_simple` / `_detailed` / `_precise` (컨텍스트).
운영 분석 시 depth 별 비용 분리 가능 + 검증 스크립트가 모델 라우팅을
간접 확인.

## Result

### 실측 (V4 검증)

| depth | model | 검색 답 in/out | 차감 |
|---|---|---|---|
| simple | Haiku | 16000 / 309 | 10 (= 9+1) |
| detailed | Sonnet | 26975 / 604 | 43 (= 14*3+1) |
| precise | Opus | 19731 / 554 | 56 (= 11*5+1) |

(in 토큰이 모델마다 다른 이유: 검색 결과 적재량이 비결정적)

컨텍스트 답:
| depth | 차감 |
|---|---|
| simple | 1 |
| precise | 5 |

정확히 1× : 5× 비율.

### 트레이드오프

- **단가 비율 단순화** — 출력 가중치 무시. 출력이 비싼 모델(특히 reasoning)
  에서 약간 저평가 가능. 실측 후 조정 여지.
- **"가장 정확하게" 가 항상 더 정확하지 않음** — 검색 결과 자체가 빈약하면
  Opus 도 빈약한 답. UI 안내문구로 "더 정확한 답이 필요하면" 정도.
- **`temperature` 가드 prefix 매칭** — 새 모델군 추가 시 함수 확장 필요.
  중앙화로 영향 최소.

### 일반화된 학습

1. **사용자 어휘와 백엔드 enum 분리**. 모델 이름은 내부 식별자. 사용자
   라벨은 의미 어휘 ("간단히/자세히/가장 정확하게"). 매핑은 한 곳.
2. **회귀 0 변경의 가장 안전한 패턴**: 새 차원의 default 가 기존 동작과
   identical 하도록 multiplier 설계 (Haiku=1).
3. **운영 비용 가산은 곱셈 밖에**. web_search 1회 비용은 모델 무관 →
   `base * multiplier + extra` (extra 가 multiplier 곱해지지 않음).
4. **모델별 SDK quirk 는 prefix 가드 한 곳에**. 호출부마다 분기하면
   유지가 안 됨.
