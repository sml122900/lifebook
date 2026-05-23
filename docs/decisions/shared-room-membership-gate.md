# 결정 — 공유 룸 = "consentAt이 있는 RoomMember"만 멤버

## Problem

Phase 9에서 가족·배우자가 한 룸에 모여 서로의 추억을 함께 보고 댓글로 떠드는 기능이 들어왔다. 핵심 제약:

1. **솔로 콘텐츠는 비공개 기본**(Phase 3 약속). 룸 가입 = 명시 동의가 있어야만 공유 시작.
2. 룸은 한 사람이 여러 개 가입 가능. 룸 A 멤버가 룸 B 데이터를 본다든가, 룸 A에 공유한 추억이 의도치 않게 룸 B 멤버에게 노출되면 안 됨.
3. 초대 링크가 노출되거나 추측되면 의도하지 않은 사람이 들어올 수 있음. 링크 자체로 자동 합류되면 안 됨.
4. 데이터는 룸 owner / 룸 member / 비멤버로 권한이 갈리고, 모든 read/write가 그 경계를 지켜야 함.

기본 패턴 후보:
- (A) `User.isInRoom: boolean` 같은 flat 플래그 — 가장 단순하나 다중 룸 지원 불가, 동의 시점 추적 불가.
- (B) `RoomMember(roomId, userId)` 다대다 + role — 다중 룸 가능, 동의 timestamp 컬럼 추가 가능.
- (C) RoomMember + Invite + Consent를 세 모델로 분리 — 가장 명확하나 작은 가족 룸에 과한 복잡도.

## Action

**B를 채택하되 `consentAt: DateTime?`을 멤버십의 사실상 게이트로 둠**.

### 모델 핵심

```prisma
model RoomMember {
  id        String         @id @default(cuid())
  roomId    String
  userId    String
  role      RoomMemberRole // owner | member
  consentAt DateTime?      // null = 초대 수신, but 미동의
  joinedAt  DateTime       @default(now())

  @@unique([roomId, userId])
  @@index([userId])
}

model RoomInvite {
  token     String @unique // randomBytes(32).toString("base64url") = 256 bit
  roomId    String
  invitedBy String
}
```

핵심 의미:
- **`consentAt = null` = 비멤버로 취급**. `getMembership()`이 null consentAt을 비멤버로 반환 → 모든 룸 데이터 read의 게이트.
- **초대 = RoomInvite token 발행**. 토큰은 256bit randomBytes(base64url 43자) — 순차 ID 절대 X.
- **합류 = `joinViaInvite`가 RoomMember row를 upsert하면서 consentAt=now() 설정**. 별도 모델 없이 RoomMember 한 테이블로 "초대됨" / "동의 완료" 두 상태 표현.

### 단일 진실의 게이트 — `getMembership()`

`lib/rooms.ts`의 한 함수가 룸 데이터 접근의 단일 진실:

```ts
export async function getMembership(userId: string, roomId: string) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: { ..., consentAt: true },
  });
  if (!member || !member.consentAt) return null;
  return member;
}
```

모든 룸 helper (`listRoomMemories`, `listSharedMemories`, `listRoomCommentsByTarget`, `createSharedMemory`, `updateSharedMemory`, `deleteSharedMemory`, `createComment`, `deleteComment`)가 진입 시 `getMembership` 호출 — 함수 자체로 안전.

페이지 레벨 + helper 레벨 이중 게이트(defense-in-depth)지만 비용은 SELECT 한 번씩 (검토 4/6 #5로 중복 호출 감소 여지 식별).

### 다중 룸 누수 방지

룸 A 화면이 룸 B 데이터를 보지 않게:

- `listRoomMemories`의 `WHERE userId IN (SELECT userId FROM RoomMember WHERE roomId = ? AND consentAt IS NOT NULL)` — **그 룸의** consented 멤버만
- `Comment.roomId` 직접 컬럼 — comment의 privacy boundary는 roomId, 절대 targetId 단독으로 lookup 안 함
- `SharedMemory.roomId` 직접 컬럼 — room-owned이므로 자연스러움
- `createComment`에 추가 검증: target memory의 author가 같은 룸 멤버여야 함 (room A 멤버가 room B SharedMemory id를 알아도 room A 댓글로 못 묶음)

### 동의 게이트 (Phase 3 원칙 이행)

- `/invite/[token]` 페이지는 **동의 화면**일 뿐, 도달만으로 멤버 안 됨
- ConsentForm의 체크박스는 사전 체크 X (`useState(false)` 초기)
- 동의 체크 안 하면 "동의하고 참여" 버튼 disabled
- `joinRoomAction` 서버 액션이 `agree === "on"` 재검증 — 핸드크래프트 POST 거부

## Result

- 두 계정 + 비멤버(eve)로 트랙 A 전체 walkthrough 검증 (`db/test-comments.ts`, `db/test-room-timeline.ts`, `db/test-shared-memory.ts`). 비멤버는 모든 read 차단(null), 모든 write 차단("not a member of this room") 확인.
- 멤버 간 댓글·공동 추억 작성·편집은 정상 동작. 작성자/owner만 삭제.
- 256bit invite token이 URL에 안전하게 들어감(base64url) + 추측 불가.

### 트레이드오프

- **`getMembership` 호출 중복** (페이지 1회 + helper 3회 = 4회/페이지). React `cache()` 또는 helper에 `viewerId + verifiedMembership` 파라미터로 감소 가능 — 검토 4/6 #5.
- **`SharedRoom.ownerId: Cascade`** — owner 회원 탈퇴 시 룸 전체 + 모든 멤버 작성 데이터 cascade 삭제. transfer ownership 메커니즘 부재 — 검토 4/6 #3.
- **추억 단위 공유 제어 없음** — 룸 가입 시 그 사람의 모든 UserMemory가 룸 멤버에게 일괄 노출. 동의 문구가 이걸 명시("내가 작성한 추억이 룸 멤버에게 보입니다") + 안내 박스에 "기존에 적어두신 추억도" 명시. 단, 체크박스 본문은 "내가 작성한"이라 일부 모호 (검토 3/6 #4).
- **`UserMemory.visibility` 컬럼이 schema에 있지만 사용 안 됨**. Phase 3에서 미리 만들어둔 컬럼. 향후 추억-룸 매핑(`UserMemoryRoomShare` n-to-n) 도입 시 활용 가능.
- **leave room 액션 미구현** — 한 번 가입하면 동의 철회 불가. PIPA 동의 철회권(제22조) 미준수 — 바구니 2 후보.

### 다음 작업과의 연결

- `Comment.targetType + targetId`는 polymorphic — UserMemory/SharedMemory 둘 다 가리킬 수 있도록 한 모델로 통합. 다만 FK 제약 부재로 SharedMemory 삭제 시 dangling 가능 (검토 4/6 #4).
- `RoomMember.consentAt`을 사용해 향후 "이 룸을 떠나기" 기능 추가 시: row 삭제(완전 탈퇴) vs consentAt=null로 reset(re-consent 가능) 둘 중 정책 결정 필요.
