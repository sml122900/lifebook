// Phase 9 — 가족 룸 헬퍼.
//
// 멤버십 확인의 단일 진실 원천. 룸 범위 데이터를 읽는 앱의 모든 곳은
// 먼저 getMembership() 을 거쳐야 한다. boolean 이 아니라 멤버십 행을
// 반환하므로 호출자가 두 번째 쿼리 없이 role/consent 로 분기할 수 있다.
//
// 2026-11-09 V3 연결(성민 결정 A~E — docs/phase/family-room-v3.md): 룸에 보이는 개인 기록 = 동의한 멤버의
//   · V3 사용자 — My Life 이야기(Episode STORY)만. "그때의 나"(SELF) 빼고(A), 연도 없으면 "연도 모름" 묶음(B — year null),
//     이야기만(제목·본문·연도 — 사람·장소·사진·연결은 읽지도 않음, D). V3 사용자의 옛 V2 기록(life_event 등)은 안 보임.
//   · V2 사용자 — 지금까지 그대로(UserMemory, 사진·브릿지 메모리 제외).
//   룸 주인도 만들 때 동의 체크칸을 거쳐야 룸이 생긴다(C — 주인 consentAt = 그 동의). 보이는 판단은 roomCanSeeMemory 와 한 규칙.

import { randomBytes } from "node:crypto";

import { prisma } from "./db";
import { CREATED_VIA_EPISODE } from "./episode";
import { CREATED_VIA_NODE_BODY } from "./node-body";
import { CREATED_VIA_PHOTO } from "./photos";
import { CREATED_VIA_V3_BRIDGE } from "./life-events";

export type Membership = Awaited<
  ReturnType<typeof prisma.roomMember.findUnique>
>;

/**
 * 사용자가 룸의 "동의한" 멤버면 멤버십 행을, 아니면 null 을 반환.
 * 초대만 받고 아직 동의 안 한 멤버는 룸 데이터 접근에선 비멤버로 취급.
 */
export async function getMembership(userId: string, roomId: string) {
  const member = await prisma.roomMember.findUnique({
    where: { roomId_userId: { roomId, userId } },
    select: {
      id: true,
      roomId: true,
      userId: true,
      role: true,
      consentAt: true,
      joinedAt: true,
    },
  });
  if (!member || !member.consentAt) return null;
  return member;
}

/**
 * 룸 만들기. 2026-11-09(성민 C) — 룸 주인도 "내 이야기가 멤버에게 보여요" 동의 체크칸을 거쳐야 한다(전에는 만들기 = 묵시적 동의).
 * 동의가 없으면 룸을 만들지 않는다. 주인 consentAt = 이 동의 시각.
 */
export async function createRoom(userId: string, name: string, shareConsent: boolean) {
  if (shareConsent !== true) throw new Error("share consent required");
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("room name required");
  if (trimmed.length > 50) throw new Error("room name too long");

  return await prisma.$transaction(async (tx) => {
    const room = await tx.sharedRoom.create({
      data: { name: trimmed, ownerId: userId },
      select: { id: true, name: true, createdAt: true },
    });
    await tx.roomMember.create({
      data: {
        roomId: room.id,
        userId,
        role: "owner",
        consentAt: new Date(),
      },
    });
    return room;
  });
}

/**
 * 기존 룸에 새 초대를 발급. 동의한 멤버만 초대 가능. URL 토큰은 256비트
 * 난수를 base64url 로 인코딩(순차 id 없음, 추측 불가). 만료/일회용은
 * Phase 9.2 에서 일부러 범위 밖으로 둔다.
 */
export async function createInvite(
  userId: string,
  roomId: string,
): Promise<{ token: string }> {
  const membership = await getMembership(userId, roomId);
  if (!membership) {
    throw new Error("not a member of this room");
  }
  const token = randomBytes(32).toString("base64url");
  await prisma.roomInvite.create({
    data: { token, roomId, invitedBy: userId },
  });
  return { token };
}

export async function getInviteForJoin(token: string) {
  return prisma.roomInvite.findUnique({
    where: { token },
    select: {
      id: true,
      roomId: true,
      room: { select: { id: true, name: true } },
      inviter: { select: { name: true, email: true } },
    },
  });
}

/**
 * idempotent 합류. 처음이면 consentAt=now() 로 RoomMember 행을 생성,
 * 재진입이면 동의 안 된 행을 동의로 뒤집는다. 이미 동의한 멤버면 no-op
 * (호출자가 리다이렉트하도록 roomId 만 반환).
 *
 * 동의는 상위의 실제 사용자 동작(합류 페이지의 체크박스+제출)에서 와야
 * 한다 — 이 헬퍼는 사용자가 명시 동의한 뒤에만 불린다고 신뢰한다.
 */
export async function joinViaInvite(
  userId: string,
  token: string,
): Promise<{ roomId: string }> {
  return await prisma.$transaction(async (tx) => {
    const invite = await tx.roomInvite.findUnique({
      where: { token },
      select: { roomId: true },
    });
    if (!invite) throw new Error("invalid invite");

    await tx.roomMember.upsert({
      where: { roomId_userId: { roomId: invite.roomId, userId } },
      create: {
        roomId: invite.roomId,
        userId,
        role: "member",
        consentAt: new Date(),
      },
      update: {
        // 재동의 시 시각 갱신 — 여기 도달할 땐 매번 명시적 사용자 동작.
        consentAt: new Date(),
      },
    });
    return { roomId: invite.roomId };
  });
}

// V2 기록 중 룸에 안 보이는 종류:
//   photo — 독립 사진 메모리는 이미지 없는 텍스트 카드로 새지 않게(사진 공유는 아직 — D 사진 비공개와 같은 방향).
//   episode — V3 이야기 브릿지 메모리. V3 이야기는 아래 Episode 경로로만(SELF 거르고 연도 규칙 적용).
//   v3_bridge — 포스터용 v3 사건 사본(2026-10-24). node_body — 인물 글 사진 메모리(2026-11-03).
// life_event 첨부 사진은 life_event 행으로(본문만), era_event 는 E2/E3 정책상 노출.
const ROOM_HIDDEN_VIA = [CREATED_VIA_PHOTO, CREATED_VIA_EPISODE, CREATED_VIA_V3_BRIDGE, CREATED_VIA_NODE_BODY];
// V3 이야기가 붙는 시기 상태 — My Life 와 같은 기준(lib/my-life getMyLifeData).
const STORY_EVENT_STATUS = ["CONFIRMED", "CORRECTED"] as const;

async function consentedMembers(roomId: string): Promise<{ userId: string; v3: boolean }[]> {
  const rows = await prisma.roomMember.findMany({
    where: { roomId, consentAt: { not: null } },
    select: { userId: true, user: { select: { onboardingTrack: true } } },
  });
  return rows.map((r) => ({ userId: r.userId, v3: r.user.onboardingTrack === "V3" }));
}

// 룸 카드 한 장 — V2 기록·V3 이야기 같은 모양. year null = 연도 모름(V3 이야기만). 댓글·스탬프 대상 = id(user_memory).
export type RoomMemory = {
  id: string;
  userId: string;
  year: number | null;
  month: number | null;
  title: string; // 빈 문자열 = 제목 없음(V3 이야기 — 카드가 제목 줄 생략)
  content: string | null;
  createdAt: Date;
  user: { name: string | null; email: string | null };
  // 연결된 시대 사건(V2 — 음악이면 "들어보기"). V3 이야기는 null.
  event: { title: string; description: string | null; domain: string } | null;
};

/**
 * 룸의 개인 기록 모음: 동의한 모든 멤버의 기록을, 작성자를 함께 붙여 반환(위 규칙).
 *
 * 범위 안전성:
 *   - viewer 는 동의 멤버여야 함 (아니면 null)
 *   - 작성자를 "이" 룸의 동의 멤버로만 제한 → A+B 두 룸에 속한 viewer 라도, 작성자가 지금 보는 그 룸에도 속해야만 보인다
 * 정렬: 연도(없음 = 맨 뒤) → 월 → 만든 때.
 */
export async function listRoomMemories(roomId: string, viewerUserId: string): Promise<RoomMemory[] | null> {
  const membership = await getMembership(viewerUserId, roomId);
  if (!membership) return null;

  const members = await consentedMembers(roomId);
  const v2Ids = members.filter((m) => !m.v3).map((m) => m.userId);
  const v3Ids = members.filter((m) => m.v3).map((m) => m.userId);

  const [memories, stories] = await Promise.all([
    v2Ids.length === 0
      ? []
      : prisma.userMemory.findMany({
          where: { userId: { in: v2Ids }, createdVia: { notIn: ROOM_HIDDEN_VIA } },
          select: {
            id: true,
            userId: true,
            year: true,
            month: true,
            title: true,
            content: true,
            createdAt: true,
            user: { select: { name: true, email: true } },
            // 연결된 사건의 분야 — 음악이면 "들어보기"(제목·설명 = 유튜브 검색어)
            event: { select: { title: true, description: true, domain: true } },
          },
        }),
    v3Ids.length === 0
      ? []
      : prisma.episode.findMany({
          // 이야기만(A — SELF 빼고). 확정 시기에 붙은 것만(My Life 와 같음). 사람·장소·사진은 고르지도 않음(D).
          where: { kind: "STORY", lifeEvent: { userId: { in: v3Ids }, status: { in: [...STORY_EVENT_STATUS] } } },
          select: {
            year: true,
            content: true,
            createdAt: true,
            memoryId: true,
            memory: { select: { title: true } },
            lifeEvent: { select: { userId: true, year: true, correctedYear: true, user: { select: { name: true, email: true } } } },
          },
        }),
  ]);

  const rows: RoomMemory[] = [
    ...memories,
    ...stories.map((s) => ({
      id: s.memoryId,
      userId: s.lifeEvent.userId,
      // B — 이야기 연도 ?? 시기 연도(정정값 우선). 없으면 null = 연도 모름 묶음(브릿지 메모리의 "올해" 대신값은 안 씀)
      year: s.year ?? s.lifeEvent.correctedYear ?? s.lifeEvent.year,
      month: null,
      title: s.memory.title.trim(),
      content: s.content,
      createdAt: s.createdAt,
      user: s.lifeEvent.user,
      event: null,
    })),
  ];
  return rows.sort(
    (a, b) =>
      (a.year ?? Infinity) - (b.year ?? Infinity) ||
      (a.month ?? 13) - (b.month ?? 13) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

/**
 * 이 기록이 이 룸에 보이는지 — listRoomMemories 와 같은 규칙(댓글·스탬프 대상 확인용).
 * 작성자가 동의 멤버 · V3 = 확정 시기의 이야기(STORY) 브릿지만 · V2 = 안 보이는 종류 아님.
 */
export async function roomCanSeeMemory(roomId: string, memoryId: string): Promise<boolean> {
  const [members, m] = await Promise.all([
    consentedMembers(roomId),
    prisma.userMemory.findUnique({
      where: { id: memoryId },
      select: { userId: true, createdVia: true, episode: { select: { kind: true, lifeEvent: { select: { status: true } } } } },
    }),
  ]);
  const author = m ? members.find((x) => x.userId === m.userId) : undefined;
  if (!m || !author) return false;
  if (author.v3) {
    return m.createdVia === CREATED_VIA_EPISODE && m.episode?.kind === "STORY" && (STORY_EVENT_STATUS as readonly string[]).includes(m.episode.lifeEvent.status);
  }
  return !ROOM_HIDDEN_VIA.includes(m.createdVia);
}

/**
 * 룸 나가기(멤버 — 2026-11-09 성민). 멤버십 행을 지워 그 사람의 이야기가 즉시 룸에서 빠지고(목록 = 동의 멤버만),
 * 그 사람이 이 룸에 남긴 댓글·반응·초대 링크도 지운다. 다시 들어오려면 초대 → 동의 체크(행이 없으니 처음과 같은 길).
 * 룸 주인은 나가기 대신 closeRoom. 공동 추억(SharedMemory — 룸 소유)은 그대로.
 */
export async function leaveRoom(userId: string, roomId: string): Promise<"left" | "not_member" | "owner"> {
  return await prisma.$transaction(async (tx) => {
    const m = await tx.roomMember.findUnique({ where: { roomId_userId: { roomId, userId } }, select: { role: true, room: { select: { ownerId: true } } } });
    if (!m) return "not_member";
    if (m.role === "owner" || m.room.ownerId === userId) return "owner";
    await tx.comment.deleteMany({ where: { roomId, authorId: userId } });
    await tx.memoryReaction.deleteMany({ where: { roomId, authorId: userId } });
    await tx.roomInvite.deleteMany({ where: { roomId, invitedBy: userId } });
    await tx.roomMember.delete({ where: { roomId_userId: { roomId, userId } } });
    return "left";
  });
}

/**
 * 룸 닫기(주인만 — 2026-11-09 성민). 룸을 지운다 — 멤버십·초대·댓글·반응·공동 추억은 DB Cascade 로 함께.
 * 모든 멤버의 이야기가 즉시 빠지고, 룸 주소·초대 링크는 없는 것이 된다.
 */
export async function closeRoom(userId: string, roomId: string): Promise<"closed" | "not_owner"> {
  const r = await prisma.sharedRoom.deleteMany({ where: { id: roomId, ownerId: userId } });
  return r.count === 1 ? "closed" : "not_owner";
}

/**
 * 사용자가 합류(동의)한 룸 목록. 방장 행도 포함 — 생성 시 consentAt 가
 * 채워지므로.
 */
export async function listUserRooms(userId: string) {
  return await prisma.roomMember.findMany({
    where: { userId, consentAt: { not: null } },
    select: {
      role: true,
      joinedAt: true,
      room: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { joinedAt: "desc" },
  });
}
