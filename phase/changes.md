# Changes — 코드 검토 후속 작업 (바구니 2~)

> 2026-05-24 코드 검토 6회(보안·결제·개인정보·데이터모델·안정성·품질)에서 발견된 약 55건 중,
> 바구니 1(즉시 수정 4건)을 제외한 나머지 약 50건을 우선순위별로 정리.
> 다시 작업 시작할 때 이 파일 한 곳만 보면 컨텍스트 복원 가능하도록 작성.
>
> **태그 기준점**: `review-pass-1` (commit `027e5dd`) — 바구니 1 완료 직후.
> 여기서 시작해 새 가지로 작업하면 됨.

---

## 처리 상태

| 영역 | 발견 | 바구니 1 처리 | 미처리 |
|------|----|-------------|------|
| 1/6 보안·권한 | 12 | 1 (charge race) | 11 |
| 2/6 결제·토큰 | 11 | 1 (charge race, 1/6과 동일) | 10 |
| 3/6 개인정보·동의 | 8 | 1 (marketing UI) | 7 |
| 4/6 데이터 모델 | 10 | 0 | 10 |
| 5/6 안정성 | 10 | 2 (Voyage 격리 + error 바운더리) | 8 |
| 6/6 코드 품질 | 10 | 0 | 10 |
| **합계** | **~55 (중복 제외)** | **4** | **~50** |

---

## 우선순위 그룹

| 그룹 | 의미 | 권장 시점 |
|------|------|---------|
| **A** | 출시 전 필수 (법·정책 risk) | 실제 출시 결정 시점 |
| **B** | 데이터 무결성 (중기) | 출시 후 1~2개월 이내 |
| **C** | 운영·관측성 | production deploy 직전 또는 직후 |
| **D** | 코드 정리 (점진적) | 다음 phase 진행하면서 자연스럽게 |
| **E** | UX/접근성 (점진적) | 사용자 피드백 받으면서 |

---

# A 그룹 — 출시 전 필수 (법·정책 리스크)

## A-1. Leave Room + 회원 탈퇴 기능 (PIPA 동의 철회권)

- **출처**: 검토 3/6 #2, #6
- **문제**: 한 번 룸 가입하면 동의 철회 불가. 회원 탈퇴 액션도 없음.
  - PIPA 제22조(동의 철회권) 미준수
  - PIPA 제21조(파기 의무) 미준수
  - GDPR Article 17 (잊혀질 권리) 미준수
- **영향**: 출시 직전 법무 검토에서 차단 사항. 사용자가 가족 갈등 등으로 룸 떠나고 싶어도 방법 없음.
- **해결 방안**:
  1. `lib/rooms.ts`에 `leaveRoom(userId, roomId)` helper 추가
     - 정책 결정: RoomMember row 삭제(완전 탈퇴) vs `consentAt = null`로 reset(재합류 가능)
     - 떠나는 사람의 SharedMemory 작성 분 처리 정책 — 보존(권장) vs `createdById`를 null로
  2. 룸 상세 페이지에 "이 룸 떠나기" 버튼 (확인 다이얼로그)
  3. `/settings/account` 페이지 + `deleteAccount(userId)` helper
     - LifeProfile, UserMemory 명시 삭제 (RESTRICT FK 때문)
     - SharedMemory.createdById 처리 (A-2와 묶임)
     - 모든 RoomMember 일괄 제거
     - cascade로 wallet, conversations, comments 등 자동 정리
  4. 약관에 동의 철회 절차 명시
- **변경 범위**: 중간 (helper 2개 + UI 2개 + 약관 텍스트)
- **선행 결정**: A-2와 묶어 결정해야 함 (owner 양도 정책이 회원 탈퇴 path에 영향)
- **관련 파일**: `lib/rooms.ts`, `app/rooms/[roomId]/page.tsx`, 새 `app/settings/account/page.tsx`

## A-2. SharedRoom Owner 양도 메커니즘

- **출처**: 검토 4/6 #3
- **문제**: 현재 `prisma/schema.prisma:204` `SharedRoom.ownerId: Cascade`. owner User 삭제 시 cascade로:
  - SharedRoom 삭제
  - 모든 RoomMember 삭제
  - 모든 RoomInvite 삭제
  - 모든 Comment 삭제
  - 모든 SharedMemory 삭제 (다른 멤버가 작성한 것 포함)
- **영향**: 시나리오 — 가족 룸 만든 사용자가 회원 탈퇴 → 가족 전체의 추억·댓글 일괄 소멸.
- **해결 방안 (선택지)**:
  1. **양도 패턴**: `transferOwnership(roomId, fromUserId, toUserId)` helper + 룸 상세 페이지에 owner 전용 "방장 넘기기" UI. 회원 탈퇴 시 양도 강제.
  2. **SET NULL 패턴**: schema 변경 `ownerId String?` + `onDelete: SetNull` → owner 떠나도 룸은 보존. "방장 없는 룸" 정책 (다음 member 자동 승격? 또는 일정 시간 후 룸 삭제?)
  3. **혼합**: owner 탈퇴 시 자동으로 가장 오래된 member에게 양도. 양도 가능한 member 없으면 룸 삭제.
- **권장**: (1) — 명시적 양도가 가장 안전. UI 추가 필요.
- **변경 범위**: 중간
- **관련 파일**: `prisma/schema.prisma` (선택적), `lib/rooms.ts`, `app/rooms/[roomId]/page.tsx`

---

# B 그룹 — 데이터 무결성 (중기)

## B-1. submitMemoryAnswer Idempotency Key

- **출처**: 검토 2/6 재점검 #1 (바구니 1-1의 후속)
- **문제**: 바구니 1-1로 토큰 차감 race는 해결됐지만, **UserMemory 자체 중복 생성은 여전**.
  - 시나리오: 사용자가 "추억 남기기" 더블 클릭 → submitMemoryAnswer 두 번 동시 실행 → UserMemory 2 row 생성 + AIMessage 2 row 생성. 차감은 (race-safe하게) 한 번만 되지만 추억 카드는 두 개 표시.
- **영향**: UI 혼란. 사용자가 같은 답변 두 번 보임. 또 잔액 손해는 없지만 같은 conversation에 user message 2개 append됨.
- **해결 방안**:
  1. Schema 변경: `UserMemory`에 `idempotencyKey String?` 컬럼 + `@@unique([userId, idempotencyKey])`
  2. AnswerForm mount 시점에 `crypto.randomUUID()` 생성 → hidden input
  3. submitMemoryAnswer에서 try/catch P2002 → 기존 UserMemory 조회 + 그대로 redirect
  4. (선택) AIMessage에도 같은 가드
- **변경 범위**: 작음~중간 (마이그레이션 1 + form 1 + action 1)
- **관련 파일**: `prisma/schema.prisma`, `app/memory/[eventId]/AnswerForm.tsx`, `app/memory/[eventId]/actions.ts`

## B-2. Comment Polymorphic FK Orphan Cleanup

- **출처**: 검토 4/6 #4
- **문제**: `Comment.targetType + targetId`는 polymorphic. 실제 FK 제약 없음.
  - `lib/shared-memories.ts:168`의 `deleteSharedMemory`가 이미 production. 삭제 시 그 SharedMemory에 달린 Comment는 dangling.
  - 향후 UserMemory 삭제 액션 추가 시 같은 문제.
- **영향**: 데이터 audit/통계에서 회계 안 맞음. UI 영향은 거의 없음(known target만 lookup).
- **해결 방안 (선택지)**:
  1. **Cleanup 호출**: `deleteSharedMemory` 안에서 `prisma.comment.deleteMany({ where: { targetType: "shared_memory", targetId: memoryId } })` 동시 호출. 한 줄.
  2. **Schema 분리**: Comment를 두 nullable FK로 (`userMemoryId String?`, `sharedMemoryId String?`) → 진짜 FK + Cascade. 마이그레이션 비용 + 기존 row migration.
- **권장**: (1) — 가장 작은 변경. 향후 UserMemory 삭제 액션 추가 시도 같이 처리.
- **변경 범위**: 작음
- **관련 파일**: `lib/shared-memories.ts`, (향후) UserMemory 삭제 추가 시 helper

## B-3. PENDING TokenOrder Garbage Collection

- **출처**: 검토 2/6 #2
- **문제**: 사용자가 결제창 열고 그냥 닫으면 PENDING 주문 영원히 누적.
  - 회계 노이즈, 거래 내역 무거워짐
  - 같은 패키지 재시도 시 PENDING이 여러 개 쌓임
- **해결 방안**:
  1. cron 또는 lazy cleanup: `createdAt < now - 24h && status=pending` → "expired" status로 마킹
  2. `createPendingOrder` 시작에서 같은 사용자의 24h+ PENDING을 먼저 expired 처리
  3. (필요 시) TokenOrderStatus enum에 `expired` 값 추가
- **변경 범위**: 작음
- **관련 파일**: `lib/tokens/orders.ts`, `prisma/schema.prisma` (enum 확장)

## B-4. Refund 흐름 구현

- **출처**: 검토 2/6 #11
- **문제**: `TokenTransaction.reason`에 `"refund"` 정의됐고 UI(`/billing` reason label)에 "환불" 매핑 있지만 실제 호출처 없음.
- **영향**: 결제 실패·이중 청구·운영 환불 처리 시 수동 SQL 필요 → balance ↔ tx sum 어긋남 위험.
- **해결 방안**:
  1. `lib/tokens/refund.ts` 또는 `wallet.ts`에 `refund(userId, originalTxId, amount, reason)` helper
  2. `$transaction(wallet decrement + tx insert negative delta + 원본 tx 마킹)`
  3. 운영자만 호출 가능하도록 admin 게이트
- **변경 범위**: 중간 (helper + admin UI 또는 CLI)
- **관련 파일**: 새 `lib/tokens/refund.ts`, (필요 시) admin 페이지

## B-5. signup_grant 우회 가능성 막기

- **출처**: 검토 2/6 #6
- **문제**: 정상 흐름에선 jwt callback이 매 로그인마다 `ensureWalletWithSignupGrant`. wallet 누락 거의 없음. 다만 corner case로 wallet 없는 상태에서 결제 도달 시:
  - `settleOrderAfterToss`의 `upsert` `create: { balance: order.tokens }` 분기 발동
  - wallet은 생성되지만 signup_grant tx 누락 → 무료 30토큰 영영 못 받음
- **해결 방안**:
  - `settleOrderAfterToss` 진입 시 `ensureWalletWithSignupGrant(userId)` 선행 호출
- **변경 범위**: 매우 작음 (한 줄)
- **관련 파일**: `lib/tokens/orders.ts`

## B-6. 잔액 검증 audit cron

- **출처**: 검토 2/6 #9
- **문제**: `reconcileBalance` 함수는 정의돼 있지만 production 호출 없음. balance ↔ tx sum 어긋남 발생해도 감지 못 함.
- **해결 방안**:
  - 일일 cron으로 전체 사용자 reconcile + Sentry/log alert
  - 또는 결제 직전 lazy check
- **변경 범위**: 중간 (cron 인프라 필요)
- **관련 파일**: 새 cron handler, `lib/tokens/wallet.ts:reconcileBalance` (이미 있음)

---

# C 그룹 — 운영·관측성 (production 진입 시)

## C-1. console.log NODE_ENV 가드 + PII 마스킹

- **출처**: 검토 6/6 #6
- **문제**:
  - `lib/ai.ts:75` `[ai] model=... in=... out=...` — 모든 AI 호출마다
  - `app/memory/[eventId]/actions.ts:140` `[tokens] user=... -N → ...` — 차감 시마다
  - dev에서는 유용하지만 production stdout에 그대로. **userId가 PII로 노출**.
- **해결 방안**:
  1. `if (process.env.NODE_ENV !== "production") console.log(...)` 가드
  2. 또는 structured logger (pino 등) 도입해 production은 별도 destination
  3. userId는 로그에서 마스킹 (`cmpi...g3oezx` → `cmp***ezx`)
- **변경 범위**: 매우 작음
- **관련 파일**: `lib/ai.ts`, `app/memory/[eventId]/actions.ts`

## C-2. PG vector HNSW Index (catalog 확장 시점)

- **출처**: 검토 4/6 #9
- **문제**: 현재 69 trigger rows로 exact cosine kNN 충분. 1000+ rows 시 sequential scan 성능 저하.
- **해결 방안**:
  - 마이그레이션 추가: `CREATE INDEX ON "Event" USING hnsw (embedding vector_cosine_ops);`
  - trigger 카탈로그 확장 시점에 추가 (영화/게임 도메인 추가 시)
- **변경 범위**: 작음 (마이그레이션 1줄)
- **관련 파일**: 새 prisma migration

## C-3. Anthropic SDK timeout/retry 명시

- **출처**: 검토 5/6 #11
- **문제**: `lib/ai.ts:24` `new Anthropic({ apiKey: key })` 기본 옵션만 사용. 네트워크 일시 장애 시 사용자가 무한 대기 가능. 자동 재시도 정책도 없음.
- **해결 방안**:
  - `new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 })` 명시
- **변경 범위**: 매우 작음 (한 줄)
- **관련 파일**: `lib/ai.ts`

---

# D 그룹 — 코드 정리 (점진적, 다음 phase 진행하면서)

## D-1. 중복 헬퍼 통합 (4건 묶음)

- **출처**: 검토 6/6 #2, #3, #4, #5
- **문제**: 같은 함수가 여러 곳에 중복 정의되어 한 곳만 고치고 다른 곳 누락하는 risk.

### D-1-a. `authorLabel` 4 곳 중복

| 파일:줄 | 시그니처 | 본인 라벨 |
|---------|---------|----------|
| `app/rooms/[roomId]/page.tsx:32` | `authorLabel(authorId, name, email, viewerId)` | "나" |
| `app/rooms/[roomId]/PersonalMemoryCard.tsx:29` | `authorLabel(authorId, name, email, viewerId)` | **"나의 추억"** (다름!) |
| `app/rooms/[roomId]/CommentThread.tsx:25` | `authorLabel(authorId, name, email, viewerId)` | "나" |
| `app/rooms/[roomId]/SharedMemoryCard.tsx:26` | `name(u, viewerId, authorId)` | "나" |

- **해결**: `lib/display.ts`에 `personLabel({authorId, name, email, viewerId, selfLabel = "나"})` 단일 helper

### D-1-b. `{artist} · {context}` split 3 곳 중복

- `lib/triggers.ts:40` (splitArtist 함수)
- `app/rooms/[roomId]/PersonalMemoryCard.tsx:45` (artistFromDescription)
- `app/timeline/page.tsx:202` (inline `m.event?.description?.split(" · ")[0]?.trim()`)

- **해결 (선택지)**:
  1. `Event.artist String?` 컬럼 추가 + 시드 작성 시 분리 저장 → split 제거 (마이그레이션 + 시드 변경)
  2. `lib/display.ts:parseSongMeta(description) → {artist, context}` 단일 helper로 통합 (작음)

### D-1-c. `indexByYear` 2 곳 중복

- `app/timeline/page.tsx:17`
- `app/rooms/[roomId]/page.tsx:35`

- **해결**: `lib/timeline-utils.ts`로 추출

### D-1-d. `DATE_FMT` 3 곳 중복 (포맷 미세 차이)

- `app/billing/page.tsx:24` (date + time)
- `app/rooms/page.tsx:17` (date only)
- `app/rooms/[roomId]/CommentThread.tsx:14` (date + time)

- **해결**: `lib/format.ts`에 `formatDate / formatDateTime` 두 helper

- **묶음 변경 범위**: 작음 (한 번에 정리 가능)
- **묶음 관련 파일**: 새 `lib/display.ts`, `lib/timeline-utils.ts`, `lib/format.ts` + 위 6 파일 import 정리

## D-2. UserMemory.visibility Dead Column 결정

- **출처**: 검토 3/6 #3 / 검토 4/6 #10
- **문제**: `prisma/schema.prisma:382` `visibility String @default("private")` 컬럼 존재. 코멘트에 "Phase 9에서 사용" 명시. 그러나:
  - `lib/rooms.ts:listRoomMemories`는 visibility 무시 (`where: { userId: { in: memberIds } }`만)
  - 어디서도 visibility set/update 안 함
  - 사용자에게 "추억 단위 공유 제어 가능"이라는 잘못된 기대
- **해결 방안 (선택지)**:
  1. **활용**: 추억별 룸 공유 토글 UI + `listRoomMemories`에 `visibility !== "private"` 필터. `UserMemoryRoomShare(memoryId, roomId)` n-to-n 테이블 추가 시 더 정교 (B 그룹 수준 변경).
  2. **제거**: 마이그레이션으로 DROP COLUMN + 코멘트 정리. 정책 "룸 가입 = 전체 공유" 못박기.
- **권장**: 출시 직전에 결정. 기본 정책 동의 게이트 명시적이면 (2) 가능.
- **변경 범위**: (2) 작음, (1) 중간

## D-3. dev 스크립트 폴더 정리

- **출처**: 검토 6/6 #1, #11
- **문제**: `db/` 평면에 19개(1,343줄):
  - production seed (`seed.ts`, `seed-music-triggers.ts`, `seed/anchorEvents.ts`, `seed/musicEvents.ts`, `seed/musicEvents.enriched.json`)
  - one-off enrich (`enrich-music.ts`)
  - dev verification (`test-*.ts` 17개, `ping.ts`, `listAnchors.ts`)
  - 평면 배치로 새 contributor 혼란
- **해결 방안**:
  1. 폴더 분리:
     - `db/seed/` (운영 seed)
     - `db/scripts/dev/` (test, ping, listAnchors)
  2. `package.json` scripts에 명시:
     - `"verify:wallet": "tsx db/scripts/dev/test-wallet-grant.ts"` 등
  3. 또는 의도 끝난 것들은 git history에 두고 working tree에서 삭제
- **변경 범위**: 작음 (mv + import path 수정)

## D-4. getMembership 중복 호출 감소

- **출처**: 검토 4/6 #5
- **문제**: 룸 상세 페이지 한 번 로드에 `getMembership`이 4번:
  - 페이지 자체 (line 54)
  - `listRoomMemories` 내부 (lib/rooms.ts:146)
  - `listSharedMemories` 내부 (lib/shared-memories.ts:37)
  - `listRoomCommentsByTarget` 내부 (lib/comments.ts:25)
- **해결 방안 (선택지)**:
  1. helper들이 optional `verifiedMembership: Membership` 받음 — 페이지가 이미 검증했으면 전달
  2. React `cache()` wrapper
  3. request-scoped cache (Next.js `unstable_cache`)
- **변경 범위**: 작음~중간 (helper 시그니처 변경)
- **관련 파일**: `lib/rooms.ts`, `lib/shared-memories.ts`, `lib/comments.ts`

## D-5. memory page aIConversation.findUnique 중복

- **출처**: 검토 4/6 #6
- **문제**: `app/memory/[eventId]/page.tsx:72`에서 existingConv 체크용 1회, line 109 `getOrCreateConversation` 안에서 또 1회. 같은 row 두 번 조회.
- **해결**:
  - `getOrCreateConversation`이 결과에 `wasExisting: boolean` 추가 반환
  - 페이지의 existingConv 별도 조회 제거
- **변경 범위**: 작음
- **관련 파일**: `lib/memory-chat.ts`, `app/memory/[eventId]/page.tsx`

## D-6. shared-actions.ts dead code 제거

- **출처**: 검토 6/6 #7
- **문제**: `app/rooms/[roomId]/shared-actions.ts:58-60` `void roomId;` — redirect throws, 뒤 코드 unreachable. type-checker 만족용 코멘트로 마킹됐지만 사실 불필요.
- **해결**: 해당 라인 제거
- **변경 범위**: 매우 작음

## D-7. generated artifact 정책

- **출처**: 검토 6/6 #9
- **문제**: `db/seed/musicEvents.enriched.json`이 generated artifact인데 git에 commit됨.
- **해결 방안 (선택지)**:
  1. 현 상태 유지 + 파일 상단에 "DO NOT EDIT — regenerate with `tsx db/enrich-music.ts`" comment
  2. `db/seed-music-triggers.ts`가 시작 시 enriched.json 없으면 자동 생성
- **변경 범위**: 매우 작음

## D-8. RoomInvite.invitedBy 인덱스

- **출처**: 검토 4/6 #7
- **문제**: `@@index([roomId])`만 있음. 본인이 만든 invite 조회(1/6 #9 수정 시) 또는 사용자별 invite 통계 시 full scan.
- **해결**: schema에 `@@index([invitedBy])` 또는 `@@index([roomId, invitedBy])` 추가 + 마이그레이션
- **변경 범위**: 작음

---

# E 그룹 — UX/접근성 (점진적, 사용자 피드백 받으면서)

## E-1. 영어 throw 메시지 23개 → 한국어 또는 client 매핑

- **출처**: 검토 5/6 #4
- **문제**: server action throw가 영어 raw text:
  - `"Unauthorized"`, `"missing eventId"`, `"conversation mismatch"`
  - `"not a member of this room"`, `"only the author or room owner can delete"`
  - etc. (총 23개 위치, 1/6 grep 결과 참조)
- **현재 상태**: 바구니 1-3의 error.tsx가 generic 한국어 fallback. 다만 throw 메시지 자체는 영어. AnswerForm/TopupButton 같은 catch 처리 form은 message로 분기 — 영어 그대로 사용자에게 노출 가능.
- **해결 방안**:
  - throw 메시지는 영어 코드 유지 (안정적 비교용) + client catch에서 한국어 매핑
  - 또는 한국어 메시지로 직접 throw (3/6 #1의 saveConsent 패턴)
- **변경 범위**: 작음~중간 (23개 위치)

## E-2. 외부 API raw response body 노출 제거

- **출처**: 검토 5/6 #5
- **문제**:
  - `lib/embeddings.ts:50` `throw new Error("Voyage error ${res.status}: ${body}")`
  - `lib/musicbrainz.ts:73` 마찬가지
  - body에 무엇이 들어있을지 모름 (API 키 echo, user data echo 가능). 누설 risk.
- **해결**:
  - status code만 throw 메시지에 노출
  - body는 `console.error`로 server log만
- **변경 범위**: 작음
- **관련 파일**: `lib/embeddings.ts`, `lib/musicbrainz.ts`

## E-3. Toss SDK raw error → 한국어 매핑

- **출처**: 검토 5/6 #6
- **문제**: `app/billing/TopupButton.tsx:53` `setError(message)`로 Toss SDK throw 메시지(`"CARD_PROCESSING_ERROR"`, `"PAY_PROCESS_CANCELED"` 등) 영어 코드 그대로 화면 표시.
- **해결**: code → 한국어 매핑 ("결제가 취소됐어요" / "카드 처리 중 오류가 났어요")
- **변경 범위**: 작음

## E-4. 환경 변수 누락 generic 처리

- **출처**: 검토 5/6 #9
- **문제**: 환경변수 누락 시 페이지 진입에서 영어 throw → 사용자에게 500. 영어 메시지.
  - `lib/ai.ts:22`, `lib/embeddings.ts:23`, `lib/tokens/toss.ts:11`, `app/billing/page.tsx:46`
- **해결**:
  - 시작 시점(`instrumentation.ts` 또는 build time)에 env 검증해 빠르게 발견
  - 사용자 경로엔 generic 메시지
- **변경 범위**: 작음

## E-5. Prisma 에러 사용자 노출 방지

- **출처**: 검토 5/6 #10
- **문제**: server action 안 prisma 호출이 throw (FK violation, unique constraint, connection drop)하면 raw `PrismaClientKnownRequestError`가 propagate. Prisma 에러 메시지에 SQL/model 이름 포함.
- **해결**: lib helper 또는 server action에 prisma error를 catch해 generic 메시지로 변환
- **변경 범위**: 중간

## E-6. invite 동의 본문에 "기존 추억 포함" 명시

- **출처**: 검토 3/6 #4
- **문제**: 안내 박스에는 "기존에 적어두신 추억도 마찬가지로 공유됩니다" 있지만, 체크박스 본문은 "내가 작성한 추억이 룸 멤버에게 보입니다"만.
- **해결**: 체크박스 라벨에 "지금까지 작성한 추억과 앞으로 작성할 추억 모두"를 명시
- **변경 범위**: 매우 작음 (텍스트 한 줄)
- **관련 파일**: `app/invite/[token]/ConsentForm.tsx`

## E-7. JWT 갱신 실패 시 ConsentForm catch

- **출처**: 검토 3/6 #5
- **문제**: `app/consent/ConsentForm.tsx:41-49` `await update()` (line 47)이 throw해도 try/catch 없음. update 실패 시 router.push 안 실행되고 사용자는 동의 화면에 그대로. 다만 saveConsent는 이미 commit → 회복 가능.
- **해결**: `update()` try/catch + 에러 시 router.refresh()로 ConsentPage가 처리하도록 위임
- **변경 범위**: 매우 작음

## E-8. 사용자 자발적 민감정보 입력 안내

- **출처**: 검토 3/6 #7
- **문제**: AI는 민감정보 안 묻지만 사용자가 자발적으로 "그때 우울증으로 입원" 같은 내용 입력 가능. 입력 시점 경고 없음.
- **해결**: 답변 form 아래에 작은 안내 — "건강·종교·정치 같은 민감한 내용은 신중히 적어주세요. 룸에 가입하시면 멤버에게도 보입니다."
- **변경 범위**: 매우 작음
- **관련 파일**: `app/memory/[eventId]/AnswerForm.tsx`

## E-9. 타인 정보 별명 안내 — 추억 입력 단계

- **출처**: 검토 3/6 #8
- **문제**: 온보딩 질문(siblings/parents/closeFriends)에 nicknameHint 있지만, 추억 답변·공동 추억·댓글 입력 시점엔 별명 안내 없음.
- **해결**: 추억 입력 폼들에 작은 hint — "타인 이름은 별명이나 이니셜로 적어도 좋아요"
- **변경 범위**: 작음 (form 3 곳)

## E-10. saveConsent 재호출 시 timestamp 정책

- **출처**: 검토 3/6 #12 / 1/6 #12
- **문제**: `app/consent/actions.ts:21-29` 동의 완료 사용자가 saveConsent 재호출 시 3개 consentAt 모두 now()로 갱신. 감사 추적 약화.
- **해결 방안 (선택지)**:
  1. 기존 값이 null일 때만 set
  2. ConsentHistory 테이블 분리해 변경 이력 보관
- **변경 범위**: (1) 매우 작음, (2) 중간

## E-11. 룸 invite 노출 정책

- **출처**: 검토 1/6 #9
- **문제**: `app/rooms/[roomId]/page.tsx:75-79` 모든 invite 토큰을 모든 멤버에게 노출. 한 멤버가 외부에 무단 공유 시 추적 불가.
- **해결**:
  - `where: { invitedBy: viewerId }`로 자신이 만든 것만 노출
  - 또는 invitedBy + createdAt 함께 표시해 추적 가능하게
- **변경 범위**: 매우 작음
- **관련 파일**: `app/rooms/[roomId]/page.tsx`

## E-12. AI 실패 fallback 영구 캐시 문제

- **출처**: 검토 2/6 #4
- **문제**: `getOrCreateConversation`이 generateGuidedQuestionsRaw 실패 시 fallback questions를 첫 assistant message로 저장(tokens=0). 다음 진입 시 캐시된 fallback 영구 표시. 사용자가 영영 AI 가이드 못 받음.
- **해결 방안**:
  - 실패 시 AI 메시지 자체를 저장 안 함 + 다음 진입에서 retry
  - 또는 메타 컬럼(`generationFailed: true`)로 표시해 재시도
- **변경 범위**: 작음~중간
- **관련 파일**: `lib/memory-chat.ts`

---

# F 그룹 — 권한·검증 (별도)

## F-1. shared_memory 댓글 target 검증 추가

- **출처**: 검토 1/6 #1
- **문제**: `lib/comments.ts:75` `createComment`가 `targetType === "user_memory"`만 target 검증. `"shared_memory"` 분기는 검증 없이 INSERT.
  - 현재 SharedMemoryCard에 CommentThread 미연결이라 노출 0
  - 다만 액션은 `TARGET_TYPES`에 "shared_memory" 허용 → 핸드크래프트 POST 가능
- **해결**: user_memory와 동일한 검증 — target SharedMemory 조회 후 `target.roomId === roomId` 확인
- **변경 범위**: 작음
- **관련 파일**: `lib/comments.ts`

## F-2. markOrderFailed userId 검증

- **출처**: 검토 1/6 #3
- **문제**: `app/billing/fail/page.tsx:32` + `lib/tokens/orders.ts:152` `markOrderFailed(orderId, reason)`이 userId 받지 않음. orderId만 알면 누구나 다른 사용자 PENDING 주문을 FAILED로 만들 수 있음. 잔액 영향 없으나 결제 차단 DoS 가능.
- **해결**: `markOrderFailed(orderId, userId, reason)` 시그니처로 + `where: { id, userId, status: pending }` 추가
- **변경 범위**: 작음
- **관련 파일**: `lib/tokens/orders.ts`, `app/billing/fail/page.tsx`

## F-3. /invite/[token] 미로그인 callbackUrl 누락

- **출처**: 검토 1/6 #4
- **문제**: `/invite/[token]`가 `PUBLIC_PATHS`에 없어 proxy가 미로그인 → `/login` (callbackUrl 없음)으로 보냄. 신규 사용자가 초대 링크 클릭 → 로그인 → 다시 invite 링크 찾아 클릭 필요.
  - `app/invite/[token]/page.tsx:24`의 `redirect("/login?callbackUrl=...")`는 proxy 가로채는 이상 절대 실행되지 않는 **dead code**.
- **해결**: proxy.ts에서 `pathname.startsWith("/invite/")` 통과, invite page가 자체적으로 auth + callbackUrl 처리
- **변경 범위**: 작음
- **관련 파일**: `proxy.ts`, `app/invite/[token]/page.tsx`

## F-4. confirmTrigger event category 검증

- **출처**: 검토 1/6 #5
- **문제**: `app/timeline/actions.ts:23` eventId의 category 검증 없음. anchor event id로 confirm/dismiss 시도 가능. UI 노출 X지만 데이터 무결성 노이즈.
- **해결**: upsert 전 event 조회 + `category === "trigger"` 검증
- **변경 범위**: 매우 작음

## F-5. birthYear 범위 검증

- **출처**: 검토 1/6 #6
- **문제**: `app/onboarding/actions.ts:39` `pickInt`이 type만 검사. `birthYear=99999` 같은 값 그대로 User에 저장.
- **해결**: `if (v < 1900 || v > currentYear) return undefined`
- **변경 범위**: 매우 작음

## F-6. Toss status 검증

- **출처**: 검토 1/6 #7 / 검토 2/6 #7
- **문제**: `app/billing/success/page.tsx:49` `confirmTossPayment` 응답 `status` 필드 검증 없음. 200이지만 비정상 status도 settle 진행.
- **해결**: `if (confirmed.status !== "DONE") throw`
- **변경 범위**: 매우 작음

## F-7. Toss customerKey 해시화

- **출처**: 검토 1/6 #8
- **문제**: `app/billing/TopupButton.tsx:32` `customerKey: userId` (User.id 그대로 토스에 노출).
- **해결**: `customerKey: hash(userId + salt)` derived value (토스 측 customer 추적은 deterministic hash 유지 필요)
- **변경 범위**: 작음

## F-8. page-level auth defense-in-depth

- **출처**: 검토 1/6 #10, #11
- **문제**: proxy가 보호하지만 page 자체 가드 부재:
  - `app/timeline/page.tsx:30-69` — session === null 시 anchor만 보임 (실제 도달 불가하지만)
  - `app/onboarding/page.tsx:3` — page-level auth check 전혀 없음
- **해결**: 파일 상단에서 `if (!session?.user?.id) redirect("/login");`
- **변경 범위**: 매우 작음

## F-9. submitMemoryAnswer 부분 실패 transaction

- **출처**: 검토 2/6 #1
- **문제**: `app/memory/[eventId]/actions.ts:97-138` 4-step mutation이 트랜잭션 밖:
  - userMemory.create → appendUserAnswer → aIMessage.create → settleConversationCharges
  - 부분 실패 시 데이터 일관성 깨짐
- **해결**: `prisma.$transaction(async (tx) => { ... })` 한 묶음 (settle helper도 tx 인자 받게 시그니처 변경 필요)
- **변경 범위**: 중간 (charge.ts 시그니처 변경 동반)
- **관련 파일**: `app/memory/[eventId]/actions.ts`, `lib/tokens/charge.ts`

## F-10. cascade 정책 일관화

- **출처**: 검토 4/6 #1, #2, #8
- **문제**: 자식 모델 onDelete 정책 불일치:
  - LifeProfile, UserMemory: RESTRICT (다른 child는 모두 Cascade)
  - SharedMemory.createdById: RESTRICT vs lastEditedById: SET NULL (같은 모델 비대칭)
  - AIConversation.eventId: Cascade vs UserMemory.eventId: SET NULL (같은 Event를 가리키는데 다름)
- **해결**: 정책을 명시 — "user 데이터 보존 vs 자유 삭제" 한 줄 결정 후 일관 적용
- **변경 범위**: 중간 (마이그레이션 필요)

---

# 항목별 시급도 한눈 표

| ID | 항목 | 시급도 | 변경 범위 | 비고 |
|---|------|------|---------|------|
| A-1 | leave room + 회원 탈퇴 | 🔴 출시 전 필수 | 중간 | PIPA 동의 철회권 |
| A-2 | SharedRoom owner 양도 | 🔴 출시 전 필수 | 중간 | A-1과 묶음 |
| B-1 | submitMemoryAnswer idempotency key | 🟠 중기 | 작음~중간 | 바구니 1-1 후속 |
| B-2 | Comment polymorphic orphan cleanup | 🟠 중기 | 작음 | 한 줄 |
| B-3 | PENDING TokenOrder GC | 🟠 중기 | 작음 | cron 또는 lazy |
| B-4 | refund 흐름 구현 | 🟠 중기 | 중간 | helper + admin |
| B-5 | signup_grant 우회 방지 | 🟠 중기 | 매우 작음 | 한 줄 |
| B-6 | reconcileBalance audit | 🟠 중기 | 중간 | cron 인프라 |
| C-1 | console.log NODE_ENV 가드 | 🟡 production 진입 | 매우 작음 | PII 마스킹 포함 |
| C-2 | HNSW index | 🟡 catalog 확장 시 | 작음 | 마이그레이션 1줄 |
| C-3 | Anthropic SDK timeout/retry | 🟡 production 진입 | 매우 작음 | 한 줄 |
| D-1 | 중복 helper 통합 (4건 묶음) | 🟢 점진적 | 작음 | 일관성 ↑ |
| D-2 | UserMemory.visibility 결정 | 🟢 점진적 | 작음~중간 | 출시 직전 결정 |
| D-3 | dev 스크립트 폴더 정리 | 🟢 점진적 | 작음 | mv + path |
| D-4 | getMembership 중복 호출 감소 | 🟢 점진적 | 작음~중간 | 성능 ↑ |
| D-5 | aIConversation.findUnique 중복 | 🟢 점진적 | 작음 | helper 1개 변경 |
| D-6 | shared-actions.ts dead code | 🟢 점진적 | 매우 작음 | 라인 제거 |
| D-7 | generated artifact 정책 | 🟢 점진적 | 매우 작음 | comment 또는 lazy gen |
| D-8 | RoomInvite.invitedBy 인덱스 | 🟢 점진적 | 작음 | 마이그레이션 |
| E-1 | 영어 throw 메시지 → 한국어 | 🟢 점진적 | 작음~중간 | 23개 위치 |
| E-2 | 외부 API raw body 노출 제거 | 🟢 점진적 | 작음 | embeddings, musicbrainz |
| E-3 | Toss SDK 한국어 매핑 | 🟢 점진적 | 작음 | code → label |
| E-4 | env 누락 generic 처리 | 🟢 점진적 | 작음 | instrumentation |
| E-5 | Prisma 에러 사용자 비노출 | 🟢 점진적 | 중간 | wrapping |
| E-6 | invite 동의 본문 보강 | 🟢 점진적 | 매우 작음 | 텍스트 1줄 |
| E-7 | ConsentForm update() catch | 🟢 점진적 | 매우 작음 | try/catch |
| E-8 | 민감정보 입력 시점 안내 | 🟢 점진적 | 매우 작음 | hint 1줄 |
| E-9 | 별명 안내 추억 입력에도 | 🟢 점진적 | 작음 | form 3 곳 |
| E-10 | saveConsent timestamp 정책 | 🟢 점진적 | 매우 작음 | if 한 줄 |
| E-11 | invite 노출 정책 | 🟢 점진적 | 매우 작음 | where 변경 |
| E-12 | AI fallback 영구 캐시 문제 | 🟢 점진적 | 작음~중간 | 정책 결정 |
| F-1 | shared_memory 댓글 target 검증 | 🟡 보안 | 작음 | 한 분기 |
| F-2 | markOrderFailed userId 검증 | 🟡 보안 | 작음 | 시그니처 변경 |
| F-3 | /invite callbackUrl 누락 | 🟡 UX | 작음 | proxy + page |
| F-4 | confirmTrigger event 검증 | 🟢 점진적 | 매우 작음 | 한 분기 |
| F-5 | birthYear 범위 검증 | 🟢 점진적 | 매우 작음 | guard 1줄 |
| F-6 | Toss status 검증 | 🟢 점진적 | 매우 작음 | guard 1줄 |
| F-7 | Toss customerKey 해시화 | 🟢 점진적 | 작음 | hash 함수 |
| F-8 | page auth defense-in-depth | 🟢 점진적 | 매우 작음 | redirect 1줄 |
| F-9 | submitMemoryAnswer transaction | 🟠 중기 | 중간 | charge 시그니처 변경 |
| F-10 | cascade 정책 일관화 | 🟠 중기 | 중간 | 마이그레이션 |

---

# 권장 진행 순서 (출시 시점별)

## 곧 출시 (1개월 이내)

| 순서 | 항목 | 이유 |
|-----|------|------|
| 1 | A-1 + A-2 (묶음) | 법 risk |
| 2 | B-5 (signup_grant 우회 방지) | 1줄, 회계 정확성 |
| 3 | C-1 (log 가드) | PII production 노출 |
| 4 | F-2 (markOrderFailed userId) | DoS risk |
| 5 | F-3 (/invite callbackUrl) | 신규 가입 UX |
| 6 | F-6 (Toss status) | 1줄, 안전망 |
| 7 | E-3 (Toss 한국어 매핑) | 사용자 보는 영어 코드 |
| 8 | E-6 (invite 본문 보강) | 1줄, 동의 명확성 |
| 9 | D-2 (visibility 결정) | 출시 정책 명확화 |

## 3-6개월 후 출시

위 + 다음 추가:

| 순서 | 항목 |
|-----|------|
| 10 | B-1 (idempotency key) |
| 11 | B-2 (comment orphan cleanup) |
| 12 | B-3 (PENDING GC) |
| 13 | B-6 (reconcile audit) |
| 14 | F-1 (shared_memory 댓글 검증) |
| 15 | F-9 (memory action transaction) |
| 16 | F-10 (cascade 정책 일관화) |

## 출시 미정 / 학습 단계

위 모두 보류. 다음 phase 진행하면서 손이 갈 때 D 그룹부터 (D-1 중복 helper 가장 효과 큼).

---

# 시작 방법

```bash
# 새 가지 시작
git checkout review-pass-1
git checkout -b basket-2-some-name

# 또는 main에서 그대로 작업
git checkout main
```

작업 후 commit 메시지 컨벤션:
- `fix:` 또는 `feat:` (변경 성격에 따라)
- 본문에 "basket 2 / changes.md의 [ID]"라고 명시해 추적성 확보
- 검증 스크립트 가능하면 `db/test-X.ts` 함께
