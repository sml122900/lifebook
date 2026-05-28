# 결정 — 쌓이는 재미(진척 시각화) 설계

동기부여 핵심 루프 ①. 기획: `phase/동기부여_핵심루프_기획.md` (2장).

## Problem

②(가족 반응)는 자녀가 와야 작동하는 의존성이 있다. ①은 자녀 없이
첫날부터 혼자 작동하는 토대 — "혼자서도 쓸 이유". 어르신이 자기 기록이
쌓이는 걸 눈으로 보고 더 채우고 싶게.

요구:
- 채운 달 수 / 기록량 / 진척 시각화 / 가벼운 이정표.
- 기존 T6 저장 데이터로 — **새 데이터 거의 안 만들기**.
- 매 페이지 로드라 **가벼운 쿼리**.
- **압박 금지** — "아직 N개월 비었어요" ❌ → "N개월 쌓였어요" ✓.
- 시니어 친화 — 큰 글씨, 색으로 직관(퍼센트·그래프보다 "채워진 칸").

## Action

### 새 모델 0 — 기존 UserMemory 읽기 집계

T6 의 `createdVia in (timemachine_event, timemachine_month)` 행만 집계.
Phase 7 `ai_chat`/`manual` 은 제외(타임머신 진척과 무관).

- `getTimemachineProgress(userId)` — 채운 달 수 / 사건 수 / 글자 수 +
  12개월 셀(filled / eventCount / hasStory). 시드 범위(2025.6~2026.5)
  최신→과거.
- `getFilledMonthKeys(userId)` — 월 화면 prev/next 배지용 distinct.

### 결정 1 — 글자 수는 DB 집계, 본문 미로드 (M4)

처음엔 `findMany({ content })` 후 JS `.trim().length` 합산 → 글자 수 하나
세려고 회고 본문 전체를 메모리로 끌어옴(긴 회고 사용자일수록 무거움).
자체 검토(M4)에서 `$queryRaw` 로 전환:

```sql
SELECT year, month, "createdVia",
       COUNT(*)::int AS cnt,
       COALESCE(SUM(LENGTH(BTRIM(COALESCE(content,''), ' '||chr(9)||chr(10)||chr(13))))::int, 0) AS chars
FROM "UserMemory"
WHERE "userId" = $1 AND "createdVia" IN ('timemachine_event','timemachine_month')
GROUP BY year, month, "createdVia"
```

행 수(사건/회고 유무)와 글자 수를 한 번에. 본문 텍스트는 전송 0.

### 결정 2 — 0개월은 압박 대신 초대

`ProgressCard` (서버 컴포넌트):
- 채운 달 > 0: "지금까지 **N개월**의 이야기를 남기셨어요" + 사건/글자 칩.
- 채운 달 = 0: "여기에 당신의 이야기가 하나씩 쌓일 거예요" (압박 X).
- 12개월 그리드: 채움 = amber, **빈 칸 = 연한 회색(부정 라벨 없음)**, 각 달
  클릭 → 그 달로 이동.
- 이정표: 첫 / 5 / 10개월 — 한두 단계만 따뜻하게.

### 결정 3 — 노출 지점

- `/timemachine` 메인 출석 카드 아래 `ProgressCard`.
- 사이드 "내 기록" 메뉴 → `/timeline` 대신 `/timemachine` 허브.
- 월 화면 prev/next 에 **"기록 있음" 배지(채운 달만, 긍정)**. 빈 달엔 배지
  없음(죄책감 유발 회피).

## Result

- 검증 `db/test-timemachine-progress.ts` 14/14 — 기록 있는/없는 달 정확
  구분(ai_chat·manual 제외 확인), 채운 달 3·사건 3·글자 12 정확, filledKeys
  정확. SQL 전환 후에도 글자 수 12 동일.
- 기존 T6 저장·가족 룸 회귀 0.

### 트레이드오프

- **SQL BTRIM vs JS trim** — BTRIM(space/tab/nl/cr)으로 근사. 다른 유니코드
  공백은 미세하게 다를 수 있으나 "쌓은 양" 표시라 무해.
- **시드 범위 하드코드(12개월)** — page/layout 과 동일 정책. `new Date()`
  기반 통합은 후속(CLAUDE.md L8).

### 일반화된 학습

1. **시각화는 기존 데이터 집계로 충분** — 새 모델 없이 UserMemory 만으로
   동기부여 표면을 만들 수 있다.
2. **집계용 길이/카운트는 DB 에서** — 표시용 숫자 하나 때문에 대용량 텍스트
   컬럼을 앱으로 끌어오지 않는다.
3. **동기부여 카피는 채운 것만 강조** — 빈 칸은 중립(회색·무라벨), 0 상태는
   초대 문구. 시니어 회상 도메인의 압박 금지 원칙.
