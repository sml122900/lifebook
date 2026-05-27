# 결정 — 출석체크 + 연속 보너스

## Problem

회상 서비스는 "한 번 둘러보고 끝" 위험이 큼. 매일 들르는 동기가 약함.
시니어 타깃이라 **부드러운 동기부여** 가 필요 — 게임화는 과하면 압박 +
시니어 거부감.

요구:
- 매일 들렀을 때 작은 보상
- 연속 며칠 채우면 더 큰 보상 — "오늘도 와야지" 의 자연스러운 이유
- **끊겨도 비난·압박 표현 0** — "연속 기록이 끊겼어요" 같은 부정 톤 금지
- race-safe — 같은 날 두 번 눌러도 1회 적립, 동시 요청에도 중복 X

기존 토큰 시스템과 연동 — 새 결제 흐름 X, 기존 wallet/ledger 재사용.

## Action

### 정책

| 항목 | 값 | reason |
|---|---|---|
| 매일 출석 보상 | 5토큰 | `daily_attendance` |
| 연속 7일마다 보너스 | +30토큰 | `attendance_streak_bonus` |
| 끊김 처리 | streak = 1 리셋 | (보상은 그대로 5토큰 지급) |
| 사이클 | 7의 배수마다 보너스 (7, 14, 21…) | "계속 누적" 정책 |

대안 "7일 채우면 streak 1로 리셋" 도 검토. 누적 정책 선택 이유:
- UI 의 "다음 보너스까지" 계산 단순: `7 - streak%7`
- 사용자가 100일 연속 출석 같은 자랑 데이터 보존
- streak 자체는 모든 연속 일수, 보너스는 7배수 마다 한 번

### 데이터 모델 — UserAttendance (단일 신규 모델)

```prisma
model UserAttendance {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(...)
  date       String   // KST "YYYY-MM-DD"
  streak     Int      // 이 날 출석 후 누적 연속일
  bonusToken Int      @default(0)  // 0 또는 30 (이 날 받은 보너스)
  createdAt  DateTime @default(now())

  @@unique([userId, date])
}
```

`wallet`/`TokenTransaction` 무변경. 새 ledger reason 두 종만 추가.
`bonusToken` 컬럼은 감사·재계산 용도 — wallet ledger 와 cross-check 가능.

### KST 처리 — 라이브러리 의존 0

```ts
export function kstDateString(d = new Date()): string {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
```

UTC 시각에 +9h 더한 뒤 ISO 의 날짜 부분만 슬라이스. 서버가 어느 timezone
에 있든 일관. dayjs/luxon/date-fns 의존 X.

### race-safe — `@@unique([userId, date])` 가 단일 결정자

```ts
try {
  await $transaction(async (tx) => {
    await tx.userAttendance.create({ data: { userId, date, streak, bonusToken } });
    await tx.$queryRaw`UPDATE "TokenWallet" SET balance = balance + ${credit} ...`;
    await tx.tokenTransaction.create({ data: { userId, delta: credit, reason } });
    if (bonus > 0) {
      await tx.tokenTransaction.create({ data: { delta: bonus, reason: 'attendance_streak_bonus' } });
    }
  });
} catch (e) {
  if (e.code === 'P2002') {
    // 이미 오늘 출석 — 친화적 안내 반환
    return { alreadyChecked: true, ... };
  }
  throw e;
}
```

핵심:
- `wallet += credit` 은 음수 불가 (credit > 0) — 조건부 UPDATE 불필요
- attendance 행 create 실패 (`P2002`) = race 패배자 = "이미 출석" 분기
- 트랜잭션 하나 안에서 attendance + wallet + ledger — 원자적

### 시각 — 동그라미 7개 진행도

UI 가 streak 으로 `attendanceCyclePosition` 계산:
```ts
function attendanceCyclePosition(streak: number): number {
  if (streak <= 0) return 0;
  const mod = streak % 7;
  return mod === 0 ? 7 : mod;
}
```

7개 동그라미 중 `cyclePos` 만큼 채움. 마지막 채워진 동그라미에 ring →
"오늘 받음" 강조. streak=7 다음 출석은 streak=8 → cyclePos=1 → 새 사이클
1일째.

`attendanceCycleEarnedTokens(streak) = cyclePos * 5 + (cyclePos === 7 ? 30 : 0)`
— "이번 사이클에서 받은 토큰" 표시. 정확 누적은 ledger 가 진실 — UI 추정.

### 시니어 친화 카피

- streak=0: "오늘부터 시작해 보세요" (압박 X)
- 미체크 (streak ≥ 1): "오늘도 와주셨네요" (어제 받았든 안 받았든)
- 받음: "오늘 출석 완료! 5토큰 받으셨어요"
- 보너스: "🎉 7일 연속 출석! 오늘은 5토큰 + 보너스 30토큰을 받으셨어요"
- 끊김 직후: streak=1 로 리셋되지만 메시지엔 "끊겼다" 표현 0. 그저
  "오늘도 와주셨네요" + "1일째".

## Result

### 검증 결과 (`db/test-attendance.ts`)

| 시나리오 | 결과 |
|---|---|
| 같은 날 두 번 클릭 | 두 번째 alreadyChecked=true, wallet 무변동 |
| 7일 연속 streak | 1→2→...→7 정확 |
| 7일째 +30 보너스 | ledger daily 7건 + bonus 1건 |
| 동시 Promise.all 2번 | 한 번만 credit, DB 행 정확히 1개 |
| 거른 후 reset | streak=1 |
| 14일째 또 보너스 | day9~15 (1→7) → day15 보너스 30 |
| 기존 chargeOneShot 무영향 | voice_cleanup 차감 정상 |

### UI 배치

- `/timemachine` 메인 페이지 (redirect 에서 실제 콘텐츠로 변경)
- 사이드 패널의 출석 미니 (작은 동그라미 7개 + N/7)
- `/timemachine/[year]/[month]` 진입은 그대로 — 회귀 없음

### 트레이드오프

- **누적 streak vs 7일 cycle 리셋** — 누적 선택. 100일 연속 사용자에게
  자랑 데이터. 단점: streak 숫자가 커지면 UI 표시 (예: "100일 연속") 의
  의미 단위가 변할 가능성 — 추후 30일·100일 milestone 추가 검토.
- **UI 추정 토큰 vs ledger 진실** — UI 가 `cyclePos * 5 + bonus` 추정,
  실제는 ledger. 차이는 사용자가 거른 날이 있을 때 cycle 안에서 발생 X
  (cycle = 연속이라 거르면 새 cycle). 따라서 일치 보장.
- **bonusToken 컬럼 vs ledger 만 의존** — 비정규화 — 감사 용이 vs 일관성
  부담. 단일 트랜잭션에서 함께 쓰므로 일관성 OK.

### 일반화된 학습

1. **DB unique 가 race-safe 의 가장 단순·강력한 도구**. 트랜잭션 + 잠금
   설계보다 자연키 unique 가 우선.
2. **동기부여 게임화는 절대 압박 톤 X** — 시니어 회상 도메인. "끊겼어요"
   같은 부정 표현은 사용자 이탈 위험.
3. **시각으로 진행도** — 7개 동그라미가 텍스트보다 즉각적. 모든 화면
   (메인 카드 + 사이드 미니) 일관 패턴.
4. **추정 누적 정수 정책** — 7배수 단순화로 `streak % 7` 계산 한 줄.
   복잡한 milestone (월간 출석률 등) 도입 전 검증.
