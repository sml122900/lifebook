// 기억 에이전트 — 페르소나 원본 key → 색인 원본(유형+id) 매핑. 시드가 같으면 같은 원본을 가리킨다.
// 평가기(db/lab-eval.ts)가 쓴다. 골격은 유형+제목(정정 제목 우선)으로 찾는다 — CUSTOM 골격이
// 여럿인 페르소나(B)에서 유형만으로는 구분이 안 되기 때문. 인물은 이름+관계.

import { normText, type SourceUnit } from "../../lib/lab/sources";
import type { LabPersona } from "./personas/registry";

export const unitKey = (u: { sourceType: string; sourceId: string }) =>
  `${u.sourceType}\u0000${u.sourceId}`;

export function mapPersonaKeys(
  units: SourceUnit[],
  p: LabPersona,
): Map<string, string> {
  const map = new Map<string, string>();
  const find = (pred: (u: SourceUnit) => boolean) => units.find(pred);
  for (const ev of p.skeleton) {
    const u = find(
      (x) =>
        x.sourceType === "SKELETON_EVENT" &&
        x.extra.type === ev.type &&
        x.title === (ev.correctedLabel ?? ev.label),
    );
    if (u) map.set(ev.key, unitKey(u));
  }
  for (const ep of p.episodes) {
    const u = find(
      (x) =>
        x.sourceType === "EPISODE" && x.fields.content === normText(ep.content),
    );
    if (u) map.set(ep.key, unitKey(u));
  }
  for (const m of p.lifeMemories) {
    const u = find(
      (x) =>
        x.sourceType === "LIFE_EVENT_MEMORY" &&
        x.fields.content === normText(m.content),
    );
    if (u) map.set(m.key, unitKey(u));
  }
  for (const e of p.eraMemories) {
    const u = find(
      (x) =>
        x.sourceType === "ERA_MEMORY" &&
        x.fields.content === normText(e.content),
    );
    if (u) map.set(e.key, unitKey(u));
  }
  for (const ph of p.photoMemories ?? []) {
    const u = find(
      (x) =>
        x.sourceType === "PHOTO_MEMORY" &&
        x.fields.content === normText(ph.caption),
    );
    if (u) map.set(ph.key, unitKey(u));
  }
  for (const person of p.people) {
    const u = find(
      (x) =>
        x.sourceType === "PERSON_MEMO" &&
        x.title === person.name &&
        x.extra.relation === person.relation,
    );
    if (u) map.set(person.key, unitKey(u));
  }
  const profile = find((x) => x.sourceType === "PROFILE");
  if (profile) map.set("PROFILE", unitKey(profile));
  return map;
}
