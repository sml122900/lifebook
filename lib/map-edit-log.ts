// AI 지도 편집 기록(custom-graph Q92 B안 — 2026-11-07 성민 확정). 잘못 바뀐 것을 되짚고 되돌림 비율을 보려고 남긴다.
// 도구 실행 1번 = 1행: 명령 id·도구 이름·노드 종류·노드 id·시각(+ 되돌린 시각). 요청 문장·이름·본문은 칸이 없다 — 처리방침 1항 마.
// 90일 보관: 쓸 때 그 사용자의 지난 행을 같이 지운다(크론 없음). 탈퇴 = User FK Cascade.
// 원가 원장(ChatV3Usage)과 따로다. 실패해도 편집은 막지 않는다(기록 누락 < 편집 중단 — 원장과 같은 판단).

import { prisma } from "./db";
import type { NodeRef } from "./node-graph";

export const MAP_EDIT_LOG_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export type MapEditTool = "create_node" | "rename_node" | "link" | "unlink" | "put_in" | "take_out" | "move" | "delete_node" | "merge_nodes";

export async function recordMapEdit(userId: string, entry: { commandId: string; tool: MapEditTool; node: NodeRef }, now: Date = new Date()): Promise<void> {
  try {
    await prisma.mapEditLog.deleteMany({ where: { userId, createdAt: { lt: new Date(now.getTime() - MAP_EDIT_LOG_DAYS * DAY_MS) } } });
    await prisma.mapEditLog.create({ data: { userId, commandId: entry.commandId, tool: entry.tool, nodeType: entry.node.type, nodeId: entry.node.id } });
  } catch (e) {
    console.error("[map-edit-log] record failed", e instanceof Error ? e.message : e);
  }
}

// 결과 카드 [되돌리기] — 그 명령의 행에 되돌린 시각(내 행만, 처음 한 번).
export async function markMapEditUndone(userId: string, commandId: string, now: Date = new Date()): Promise<void> {
  try {
    await prisma.mapEditLog.updateMany({ where: { userId, commandId, undoneAt: null }, data: { undoneAt: now } });
  } catch (e) {
    console.error("[map-edit-log] undone failed", e instanceof Error ? e.message : e);
  }
}
