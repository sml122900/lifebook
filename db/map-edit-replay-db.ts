// AI 지도 편집 재생 세트 — 지우기·합치기(3c) 문항용 실제 DB 지도. 가상 인물 파일(persona.json)은 DB 에 없어서
// 영향 수를 셀 수도, 실행해 볼 수도 없다. 그래서 이 문항(db: true)만 픽스처 계정에 작은 지도를 심고 그 위에서 계획·실행한다.
// db/replay-map-edit.ts(실제 모델)·db/test-map-edit.ts ②(모의 응답)가 같이 쓴다. 이름은 가상 인물 파일과 겹치지 않게.

import { deleteAccountTx } from "../lib/account-deletion";
import { createCategory, createCustomNode } from "../lib/custom-node";
import { prisma } from "../lib/db";
import { createEpisodeBridge } from "../lib/episode";
import type { MapEditPlanResult } from "../lib/map-edit";
import { planLine } from "../lib/map-edit-plan";
import type { MapView } from "../lib/map-agent-view";
import { addLink } from "../lib/my-life-edit";

export type EditCase = {
  name: string;
  request: string;
  db?: boolean; // 실제 DB 지도(seedEditMap) 위에서
  expectLines?: string[];
  alsoQuestion?: boolean; // expectLines 대신 되묻기도 적중(§6.3 "넣기 또는 되묻기")
  execute?: boolean; // 계획을 실행해 본다 — 카드의 영향 수가 실행 때 수와 같아야 성공(§6.10 ②)
  expectQuestion?: boolean;
  expectUnsupported?: boolean;
  expectPersonNote?: boolean; // 사람 지우기 = 담지 않고 지도 패널 안내(Q87)
  expectNoPlan?: boolean; // 계획 없이 끝나기만 하면 됨(되묻기·못 하는 일 어느 쪽이든)
  expectEmpty?: boolean;
  recorded: { name: string; input: unknown }[][];
};

// 계획 단계 판정(실행은 따로). 거부 문항 = expectLines 가 없는 문항.
export function judgePlan(c: EditCase, r: MapEditPlanResult): { pass: boolean; lines: string[] } {
  const lines = r.ok ? r.plan.map((p) => planLine(p, "will")) : [];
  if (!r.ok) return { pass: false, lines };
  const pass = c.expectLines
    ? JSON.stringify(lines) === JSON.stringify(c.expectLines) || (!!c.alsoQuestion && !!r.question && lines.length === 0)
    : c.expectPersonNote
      ? lines.length === 0 && !r.question && !!r.note && r.note.includes("[이 노드 지우기]")
      : c.expectQuestion
        ? !!r.question && lines.length === 0
        : c.expectUnsupported
          ? r.unsupported && lines.length === 0
          : lines.length === 0;
  return { pass, lines };
}

// 모의 응답의 별칭 자리표시 "@종류:이름[:관계]" → 이 지도의 실제 별칭(같은 이름 두 분은 관계로 가림 — 순서는 DB 마다 다를 수 있다).
export function resolveRecorded(rounds: EditCase["recorded"], view: MapView): EditCase["recorded"] {
  const text = JSON.stringify(rounds).replace(/"@([^:"]+):([^:"]+)(?::([^"]+))?"/g, (_, kind: string, name: string, relation?: string) => {
    const n = view.nodes.find((x) => x.kind === kind && x.name === name && (!relation || x.relation === relation));
    if (!n) throw new Error(`재생 세트 자리표시를 못 찾음: ${kind}:${name}:${relation ?? ""}`);
    return JSON.stringify(n.alias);
  });
  return JSON.parse(text);
}

// 픽스처 계정 하나를 새로 만들고 작은 지도를 심는다(문항마다 처음 상태에서 — 실행해 본 뒤 다시 심는다).
export async function freshEditMap(email: string): Promise<string> {
  const old = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (old) {
    await prisma.chatV3Usage.updateMany({ where: { userId: old.id }, data: { userId: null } }); // 원가 기록은 남김(TEST_)
    await deleteAccountTx(old.id);
  }
  const now = new Date();
  const userId = (await prisma.user.create({ data: { email, name: "[fixture] 지도 편집 재생 DB", onboardingTrack: "V3" }, select: { id: true } })).id;
  await prisma.lifeEvent.create({ data: { userId, type: "BIRTH", label: "출생", year: 1950, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 0, personAsked: true } });
  const factory = (await prisma.lifeEvent.create({ data: { userId, type: "CUSTOM", label: "공장 시절", year: 1975, endYear: 1980, status: "CONFIRMED", confirmedAt: now, sequenceOrder: 1 }, select: { id: true } })).id;
  const story = (await createEpisodeBridge(userId, factory, "첫 출근", 1975, "첫 출근 날 아침 버스를 두 번 갈아탔다.", ""))!.episodeId;
  const person = async (name: string, relation: string) => (await prisma.person.create({ data: { userId, name, relation }, select: { id: true } })).id;
  const friend = await person("철수", "친구");
  const neighbor = await person("영희", "이웃");
  await person("영희", "사촌");
  const market = (await prisma.place.create({ data: { userId, name: "읍내 시장" }, select: { id: true } })).id;
  const cat = await createCategory(userId, { name: "살림" });
  if (!cat.ok) throw new Error("살림 카테고리");
  const item = async (name: string) => {
    const r = await createCustomNode(userId, { kind: "ITEM", name, parentId: cat.id });
    if (!r.ok) throw new Error(`항목 ${name}`);
    return r.id;
  };
  const sewing = await item("재봉틀");
  const sewing2 = await item("재봉기");
  const pot = await item("화분");
  await addLink(userId, { type: "EPISODE", id: story }, { type: "PERSON", id: friend });
  await addLink(userId, { type: "CUSTOM", id: sewing }, { type: "EPISODE", id: story });
  await addLink(userId, { type: "CUSTOM", id: sewing2 }, { type: "PERSON", id: neighbor });
  await addLink(userId, { type: "CUSTOM", id: pot }, { type: "PLACE", id: market });
  await addLink(userId, { type: "PERSON", id: neighbor }, { type: "PLACE", id: market });
  return userId;
}

export async function removeEditMap(email: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) return;
  await prisma.chatV3Usage.updateMany({ where: { userId: u.id }, data: { userId: null } });
  await deleteAccountTx(u.id);
}
