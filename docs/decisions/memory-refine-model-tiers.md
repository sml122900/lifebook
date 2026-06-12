# 결정 — 문장 다듬기 모델 선택 + 차등 차감

2026-06-13. 전날(6-12) 무료 단일(Haiku) 다듬기를 정밀도 3종 + 차등 차감으로
확장. `docs/decisions/memory-refine.md`(원문 비파괴·게이트·길이 가드)를
이어받는다.

## Problem

다듬기를 무료 Haiku 하나로 두니 두 한계가 보였다:

- 어려운 글(자모 깨짐·복잡한 비문·긴 회상)은 Haiku 품질이 들쭉날쭉. "더
  꼼꼼히 봐줬으면" 하는 회상이 분명히 있는데 선택지가 없었다.
- 무료 전면은 남용 표면 + 좋은 모델(Sonnet/Opus)을 무제한 태우면 운영
  비용이 통제 불능. 회상 1건에 Opus를 쓰는 건 의미 있지만 공짜로는 못 연다.

이미 비서(타임머신)에 "답의 깊이"(Haiku/Sonnet/Opus) + 차등 차감
인프라가 있다(`MODEL_MULTIPLIER`, `tokensFromUsageForModel`,
`chargeOneShot.surcharge`). 다듬기도 같은 틀을 재사용하면 된다.

## Action

### 결정 1 — tier 3종, 모델 이름 비노출

`tier: "haiku" | "sonnet" | "opus"`. UI 라벨은 **"빠르게 / 꼼꼼하게 /
가장 정밀"** + 토큰 비용("1토큰 / 3토큰 / 5토큰"). 비서의 depth 라벨
정책과 동일 — 어르신에게 모델 이름은 의미 없고 "비용과 정성"만 보이면 된다.
기본은 빠르게(Haiku, 현행 비용).

### 결정 2 — 무료 → 유료 (Haiku도 1토큰)

전날의 "무료" 결정을 뒤집는다. tier가 생기면 무료 유지가 불가능 —
Sonnet/Opus는 반드시 과금해야 하고, Haiku만 무료로 두면 "비용 차등"이라는
멘탈 모델이 깨진다(왜 빠르게는 공짜인데 꼼꼼하게는 돈?). 일관되게 셋 다
과금하되 Haiku는 가장 싼 1토큰. 신규 30토큰이면 충분히 체험 가능.

### 결정 3 — 차감은 chargeOneShot + surcharge 트릭

`tokensFromUsageForModel`을 직접 새 차감 함수로 만들지 않고, 기존
`chargeOneShot`에 surcharge로 배수를 표현:

```
surcharge = tokensFromUsageForModel(tier, in, out) - tokensFromUsage(in, out)
          = base * (MULTIPLIER[tier] - 1)
→ 총 cost = base + surcharge = tokensFromUsageForModel(tier)
```

Haiku는 multiplier=1 → surcharge=0 → 기존 차감 경로와 동일. 비서의
`depthSurcharge`와 같은 패턴. `reason: "memory_refine_{tier}"`,
`refId: memoryId`로 ledger 추적.

### 결정 4 — 실제 교정본 저장될 때만 과금

NO_CHANGE·길이 가드 탈락(왜곡 의심)이면 **차감 0**. 모델은 이미 실행돼
Anthropic 비용은 발생하지만, 사용자에겐 "결과를 못 받았는데 돈을 떼였다"가
없어야 한다(전날 무료 no-change 정책의 톤 계승). 그래서 차감을 저장 *앞*에
둔다 — 검증 통과 → `chargeOneShot`(잔액 부족이면 throw) → 저장. 잔액
부족은 저장 없이 `InsufficientBalanceError` → API가 **402 + "토큰이
부족해요. 충전 후 다시 시도해주세요"**로 변환.

### 결정 5 — opus 4.7 temperature 가드 재사용

다듬기는 `temperature: 0.2`(창작 최소화)인데 Opus 4.7은 temperature를
거부한다. `lib/ai.ts`의 `supportsTemperature(model)` 가드가 이미
opus-4-7 prefix를 자동 제외 → 다듬기 코드가 따로 분기할 필요 없음.
실측에서 opus 호출 시 temperature 에러 0 확인.

## Result

- 마이그 0(새 컬럼 없음). 재사용 = `MODEL_MULTIPLIER`,
  `tokensFromUsageForModel`, `chargeOneShot`, `supportsTemperature`.
- 실측: haiku 1토큰(100→99) / sonnet 3토큰(100→97) / opus no_change
  0토큰(100→100, 저장 안 돼 과금 0 — 결정 4 입증).
- tsc 0, `test-life-events`(7)·`test-era-stash`(17) 회귀 0.

### 트레이드오프

- no_change에서 Anthropic 비용은 흡수(특히 Opus). 자주 발생하면 손해 —
  호출 전 사전 게이트(잔액·길이 체크)는 비서도 안 하는 패턴이라 미도입.
- 토큰 수 라벨(1/3/5)은 안내용 근사치 — 실제 차감은 사용량 기반이라 긴
  회상은 더 나올 수 있다. "약 N토큰" 식 표현으로 기대치만 관리.

### 일반화된 학습

1. **차등 정책은 한 번 만들면 재사용된다** — 비서용으로 만든 tier·차감
   인프라가 다듬기에 거의 그대로 이식됐다. surcharge 인자 하나로 정책 함수
   무수정 확장.
2. **"결과 없으면 과금 0"은 차감을 저장 앞에 두는 것으로 강제** — 순서가
   곧 정책이다. 저장 후 과금이면 부족 잔액에 결과만 주는 누수가 생긴다.
3. **무료→유료 전환은 멘탈 모델 일관성으로 판단** — Haiku만 무료로 남기면
   "비용 차등"이 안 읽힌다. 셋 다 과금하되 최저가로.
