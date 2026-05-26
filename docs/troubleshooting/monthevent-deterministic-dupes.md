# 트러블슈팅 — MonthEvent 자연키 중복 (deterministic id 도입 잔재)

## 문제 상황

V1 비서 백엔드 검증 (`db/test-assistant.ts`) 의 (a) BIG/DB 답에서 같은
사건이 두 번 나옴:

```
2025년 8월에는 이런 일이 있었어요.

• 한미 정상회담(워싱턴) — 이재명-트럼프 첫 회담, 관세·조선 협력 논의
• 한일 정상회담(도쿄) — 이재명-이시바 2차 회담
• 한미 정상회담(워싱턴) — 이재명-트럼프 첫 회담, 관세·조선 협력 논의   ← 중복
```

원인 가설:
- `getMonthScreen` 의 OR SQL이 한 행을 양쪽 분기에서 잡는다? → `isPeriod`
  분기가 mutex 라 불가능.
- 시드에 같은 사건이 중복 입력? → 가능성 높음.

## 시도한 것들

### 1. groupBy 진단

```sql
SELECT year, month, section, title, COUNT(*) FROM "MonthEvent"
GROUP BY year, month, section, title HAVING COUNT(*) > 1
```

→ **46개 그룹**, 각 정확히 2건씩. 원인 확정.

### 2. id 형태 분석

각 그룹 두 행의 id 를 보니 패턴 일관:

```
- 9823bc266e1125f56cbd3ec0  (24-hex)
- cmpjyr0qa000fvwv8uivyddpz  (cuid)
```

- **24-hex** = `db/seed-timemachine.ts` 의 `monthEventDeterministicId()` —
  `sha256(section|year|month|title).slice(0,24)`. H1 픽스(시드 재실행 안전)
  도입 후 새 id 형식.
- **cuid** = Prisma `@default(cuid())`. H1 픽스 전 첫 시드 실행 때 들어감.

→ 시드 첫 실행은 cuid, H1 픽스 후 재실행은 deterministic id. 자연키 충돌
검사가 없었으므로 같은 사건이 두 번 들어갔다.

### 3. 사용자 추억 안전성 확인

`UserMemory.monthEventId` 가 deterministic 행을 가리키는지 cuid 행을
가리키는지 검사:

```ts
const memCount = await prisma.userMemory.count({
  where: { monthEventId: r.id }
});
```

→ **모든 그룹에서 추억 연결 0건**. 진짜 사용자(=내 dev 환경) 가 아직
타임머신 저장을 충분히 안 했고, T6 통합 테스트도 끝나면 cleanup 함.

자동 정리 안전 확정.

### 4. 안전 규칙 + 트랜잭션

수동 검토를 트랜잭션 내부에서 한 번 더 확인:

```ts
await prisma.$transaction(async (tx) => {
  const rows = await tx.$queryRaw`SELECT id FROM "MonthEvent" WHERE ...`;
  const linked = await tx.userMemory.findMany({
    where: { monthEventId: { in: ids } },
    select: { id: true, monthEventId: true },
  });
  const linkedSet = new Set(linked.map(m => m.monthEventId));

  if (linkedSet.size > 1) return { kind: "skipped_memory" };  // 위험
  const keeperId = linkedSet.size === 1
    ? [...linkedSet][0]
    : ids.find(isDeterministicId) ?? null;
  if (!keeperId) return { kind: "skipped_ambiguous" };

  await tx.monthEvent.deleteMany({ where: { id: { in: ids.filter(i => i !== keeperId) } } });
});
```

규칙 우선순위:
1. 추억 다행에 흩어짐 → skip + 경고 (사용자 검토 필요)
2. 추억 1행에 있음 → 그 행 보존
3. 추억 없음 → deterministic 보존, 옛 cuid 삭제
4. 둘 다 같은 종류 → skip (자동 판단 불가)

이번엔 전부 케이스 3.

## 최종 해결법

`db/cleanup-monthevent-dupes.ts` 실행 → **46행(옛 cuid) 삭제**.

검증:
- 재진단 → "중복 그룹: 0개" ✓
- 비서 (a) BIG 답 → "한미 정상회담" 1번만 출력 ✓
- T6 통합 테스트(15체크) 전부 통과 ✓

## 핵심 학습

1. **자연키 도입 전후 데이터는 공존 가능성을 가정**한다. H1 픽스로
   deterministic id 를 도입했지만 옛 cuid 행은 그대로 살아 있었음. 도입
   당시 `seedIds set` 으로 "사라진 시드"만 경고하고 자연키 중복은 못 봤음.

2. **삭제 결정은 추억 연결을 기준으로**. 데이터 정리에서 가장 비싼 손실은
   사용자 데이터. id 종류는 그 다음 기준. "옛 cuid 무조건 삭제" 가
   아니라 "추억 있는 쪽 보존, 그 외엔 deterministic 보존".

3. **진단·정리 스크립트는 분리**. `diagnose-` 는 read-only, `cleanup-` 은
   write. diag 결과를 사람이 확인하고 cleanup 을 실행하는 2단계 — 자동
   삭제로 한 번에 가면 잘못된 가정이 데이터 손실로 직결.

4. **트랜잭션 안에서 한 번 더 검사**. diag 시점과 cleanup 시점 사이에
   누가 추억을 새로 만들 수 있다 (현실: dev 환경엔 없지만 운영엔 가능).
   트랜잭션 안에서 추억 연결 재확인 → 신규 추억이 끼면 skip.

## 회피 패턴

향후 같은 사고 방지:

- T2 시드 (`db/seed-timemachine.ts`) 는 이미 deterministic id 로 upsert
  하므로 재실행해도 신규 행 안 생김. **단, 첫 도입 시 기존 행 cleanup
  스크립트도 같이 마련**해야 함.
- `MonthEvent` 에 `(section, year, month, title)` UNIQUE 제약을 추가하면
  근본 방어. 마이그레이션은 후속에서 검토 (지금은 cleanup 됐고 시드가
  안전하니 보류).

## 이력서 소재 한 줄

자연키 시드 정책 변경(cuid → deterministic sha256) 이후 데이터 중복 46건을
2단계(read-only 진단 + 트랜잭션 cleanup) 로 안전 정리. 사용자 추억
연결을 우선 보존하는 규칙으로 데이터 손실 0건.
