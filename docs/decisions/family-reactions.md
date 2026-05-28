# 결정 — 가족 반응(감정 스탬프 + 새 소식) 설계

동기부여 핵심 루프 ②. 기획: `phase/동기부여_핵심루프_기획.md` (3·8장).

## Problem

회상 서비스의 가장 강력한 동기는 "누가 내 이야기를 들어준다"는 연결.
기존 가족 룸(Phase 9)엔 댓글이 있지만, 글쓰기는 자녀에게 부담 → 루프가
자주 안 돈다. 어르신이 그 반응을 **보러 다시 올** 고리도 없다.

요구:
- 한 탭짜리 가벼운 반응(스탬프) — 자녀가 바빠도 가볍게.
- 같은 사람이 같은 추억에 같은 스탬프 중복 금지 + 토글, **race-safe**.
- 어르신이 다음 접속 때 "새 반응"을 눈에 띄게. 자녀는 "부모님 새 이야기".
- **앱 안 표시만** (어르신은 푸시 설정 어려움). 푸시는 나중.
- 반응 0건일 때 **서운하게 하지 않기**.
- 같은 룸 멤버만 서로 반응 — 남의 룸·기록 못 건드림.

## Action

### 새 모델 2개 (최소)

```prisma
model MemoryReaction {                 // Comment 와 동일 polymorphic
  roomId; targetType; targetId; authorId; stamp; createdAt
  @@unique([roomId, targetType, targetId, authorId, stamp])
}
model FamilyFeedSeen { userId @unique; reactionsSeenAt; recordsSeenAt }
```

### 결정 1 — 스탬프는 **룸별**(roomId 포함), 전역 아님

자체 검토(M1)에서 처음 unique 가 `(targetType,targetId,authorId,stamp)` 로
roomId 를 빼고, 조회(`listReactionsByTarget`)는 roomId 로 걸렀다 → 같은
추억이 두 룸에 보일 때 **저장/조회 기준 불일치로 스탬프 버튼이 먹통**
(A 룸에서 누른 게 B 룸엔 안 보이고, B 에서 다시 누르면 전역 unique 위반
P2002 로 조용히 무시 → 아무 일도 안 일어남).

두 방향 비교:
- **(b) 전역** (어느 룸에서 보든 같은 반응) — "내가 이 추억에 ❤️" 의
  자연스러움. 단점: A 룸에만 있는 사람의 반응이 B 룸 화면에 노출 →
  B 멤버가 모르는 사람(다른 가족방 멤버)의 이름·활동을 봄. **크로스룸
  프라이버시 누수.**
- **(a) 룸별** (roomId 포함) — 룸마다 독립 반응. 같은 추억이라도 가족방
  A·B 가 각자의 반응을 가짐. 룸 = 프라이버시 경계 유지.

→ **(a) 선택.** Lifebook 의 "가족 범위 한정" 원칙상 누수가 더 큰 위험.
저장(unique)·조회·삭제를 모두 roomId 기준으로 맞추면 먹통도 사라진다.

### 결정 2 — 토글은 클라가 의도를 보내고 서버는 idempotent (race-safe)

서버에서 read-then-write(토글)하면 경합 창. 대신:
- 클라(`StampBar`)가 현재 상태의 **반대**(`active`)를 보냄(옵티미스틱).
- `active=true` → `create` (P2002 = 이미 있음 → 무시).
- `active=false` → `deleteMany({roomId,…,stamp})` (count 0 → 무시).

동시·중복 클릭에도 결과 일관. 출석체크의 `@@unique` race-safe 패턴과 동형.

### 결정 3 — 읽음 추적: lazy baseline + DB 시계

- "새것" = 활동 `createdAt > seenAt`.
- `FamilyFeedSeen` 은 첫 접근(`getFeedSeen`) 때 `@default(now())` 로 생성
  → **가입/첫 사용 이전 활동이 소급으로 "새것" 폭주하는 것 방지.**
- `markSeen` 은 raw `UPDATE … SET …SeenAt = NOW()` (DB 시계). 검토(M2)에서
  처음 Node `new Date()` 를 썼는데, baseline·createdAt 이 DB 시계라 서버/DB
  시계가 어긋나면 "봤는데 안 빠짐"이 생김 → 같은 DB 시계로 통일.
- markSeen 시점: 어르신이 `/timemachine` 메인에서 소식 카드를 실제로 볼 때
  (`FamilyNewsSeen` client mount effect). prefetch·월 화면 방문에선 안 빠짐.

### 결정 4 — 양방향 소식을 한 표면에, 0건 숨김

`getFamilyNews` 가 두 종류를 한 번에:
- A. 내 기록에 달린 새 반응(스탬프+댓글) — 어르신 관점.
- B. 같은 룸 가족의 새 타임머신 기록 — 자녀 관점. 한 달 저장이 여러 행이라
  **(작성자, 연, 월) 단위로 묶어** 과다 카운트 방지.

한 사용자가 두 역할 동시 가능 → 카드가 둘 다 표시. **total=0 이면 카드·
배지 전부 숨김**(서운함 0).

### 권한 — 댓글과 동일 가드

`setReaction`/`listReactionsByTarget` 모두 `getMembership` + 대상이 그 룸의
동의 멤버 소유인지 확인. `setReactionAction`/`markSeen` 액션은 **userId 를
세션에서만** — 클라가 보낸 roomId·targetId·active 를 검증 후 서버 재확인.

## Result

- 검증 `db/test-family-reactions.ts` 20/20 — 토글 on/off, 중복·동시(Promise.all)
  안전, 다른 종류 동시 2행, 새 반응 카운트(자기 반응 제외)+나비게이션 정확,
  읽으면 0, 비멤버·룸 밖 대상 차단, 룸 없는 사용자 0.
- 기존 댓글·룸·UserMemory·T6 회귀 0 (comments/room-timeline/t6 테스트 통과).
- 토큰/지갑 무관 — 결제 이중지급 위험 없음.

### 트레이드오프

- **룸별 반응** = 같은 추억이 두 룸에 있으면 반응이 분리(약간 중복)되지만
  프라이버시 우선. 전역의 "한 번 누르면 어디서나" 편의는 포기.
- **lazy baseline** = 첫 사용자는 과거 활동을 "새것"으로 못 봄(의도). 가입
  전 받은 반응은 알림으로 안 뜸 — 폭주 방지의 대가.
- **markSeen on mount** = 스크롤로 지나쳐도 "봤음" 처리. "다음 접속 때 빠짐"
  의미와 일치하나, 정밀한 per-item 읽음은 아님(후속 후보).

### 일반화된 학습

1. **저장 기준과 조회 기준은 같아야** — unique 키와 WHERE 필터가 어긋나면
   "눌러도 안 되는" 류의 먹통이 난다. 프라이버시 결정이 곧 키 설계.
2. **읽음 추적은 baseline 시각 하나로 충분** — per-item read flag 없이
   "마지막으로 본 시각 이후"가 가볍고 폭주를 막는다. 단, baseline·활동·
   markSeen 이 **같은 시계**여야 경계 버그가 없다.
3. **race-safe 토글 = 클라가 의도, 서버는 idempotent** — DB unique +
   create/deleteMany 가 트랜잭션 잠금보다 단순.
