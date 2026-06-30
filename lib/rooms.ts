// Phase 9 — 가족 룸 헬퍼.
//
// 멤버십 확인의 단일 진실 원천. 룸 범위 데이터를 읽는 앱의 모든 곳은
// 먼저 getMembership() 을 거쳐야 한다. boolean 이 아니라 멤버십 행을
// 반환하므로 호출자가 두 번째 쿼리 없이 role/consent 로 분기할 수 있다.

import { randomBytes } from "node:crypto";

import { prisma } from "./db";
import { CREATED_VIA_PHOTO } from "./photos";

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

export async function createRoom(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed === "") throw new Error("room name required");
  if (trimmed.length > 50) throw new Error("room name too long");

  return await prisma.$transaction(async (tx) => {
    const room = await tx.sharedRoom.create({
      data: { name: trimmed, ownerId: userId },
      select: { id: true, name: true, createdAt: true },
    });
    // 방장은 룸을 만드는 행위로 묵시적 동의 — 자기 데이터는 원래 본인
    // 것이었으니 동의 시각만 기록한다.
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

/**
 * 룸의 개인 추억 모음: 동의한 모든 멤버의 UserMemory 행을, 작성자를
 * 함께 붙여 반환.
 *
 * 범위 안전성:
 *   - viewer 는 동의 멤버여야 함 (아니면 null)
 *   - WHERE 절이 userId 를 "이" 룸 멤버로만 제한 → A+B 두 룸에 속한
 *     viewer 라도, 작성자가 지금 보는 그 룸에도 속해야만 데이터가 보인다
 *   - 무시/미응답 트리거는 여기 무관 — 카탈로그가 아니라 개인 추억이다
 */
export async function listRoomMemories(roomId: string, viewerUserId: string) {
  const membership = await getMembership(viewerUserId, roomId);
  if (!membership) return null;

  const members = await prisma.roomMember.findMany({
    where: { roomId, consentAt: { not: null } },
    select: { userId: true },
  });
  const memberIds = members.map((m) => m.userId);
  if (memberIds.length === 0) return [];

  return prisma.userMemory.findMany({
    where: {
      userId: { in: memberIds },
      // Phase Photo — 독립 사진 메모리(createdVia="photo")는 가족 룸에 이미지
      // 없는 텍스트 카드로 새지 않게 제외. 사진의 룸 공유는 6단계에서 이미지와
      // 함께 설계한다. life_event 에 첨부된 사진은 life_event 행으로 정상
      // 노출(본문만, 이미지는 6단계), era_event 는 E2/E3 정책상 노출 유지.
      createdVia: { not: CREATED_VIA_PHOTO },
    },
    select: {
      id: true,
      userId: true,
      year: true,
      month: true,
      title: true,
      content: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      // Pull the linked event's domain so the UI can decide whether
      // a "들어보기" button applies (only when domain === "music").
      // Title + description carry the song / artist text we feed into
      // the YouTube search URL.
      event: { select: { title: true, description: true, domain: true } },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }, { createdAt: "asc" }],
  });
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
