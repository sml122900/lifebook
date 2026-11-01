// My Life 개편 2단계 — "노드로 만들까요?" 제안 카드. docs/phase/my-life-restructure.md §3.3.
// 순수 모듈(auth 없음) — /chat-v3 자유 대화(lib/free-chat.ts)·오늘의 인터뷰(lib/interview/session.ts)·
// 회귀(db/test-chat-proposal.ts)가 같은 함수를 userId 로 부른다.
//
// 만들기(Sonnet 고정, 1회): 구간 대화 → 제목·본문·시기·사람·장소·종류. AI 에 보내는 후보 = 확정 중심과
// 확정 인물의 id·이름(·연도·관계)만(Q70 — 장소 이름 목록은 처리방침 v1.2 전까지 보내지 않는다. 대화에서
// 장소 이름을 뽑는 건 허용, 기존 장소와의 맞춤은 코드가 이름으로).
//
// 저장([만들기]): 이야기 본문이 먼저(createEpisodeBridge), 사람·장소 연결은 하나씩(실패해도 이야기는 남는다).
// 사람은 카드에서 이미 확인했으므로 확정 인물 + CONFIRMED 연결 — 초안(isDraft)·PROPOSED 를 만들지 않는다.
// 같은 이름 확정 인물이 있으면 자동으로 합치지 않고 되묻는다(2b-2 규칙: 새 이름·고친 이름이면 이름만 같아도).

import { chat } from "./ai";
import { recordChatUsage, type ChatUsagePurpose } from "./chat-v3-usage";
import { prisma } from "./db";
import { createEpisodeBridge } from "./episode";
import { isSummaryGuidance, stripEpisodeDoneSignal } from "./episode-text";
import type { EpisodeKind } from "./generated/prisma/enums";
import { saveNodeLink } from "./node-graph";
import { createCustomLifeEvent } from "./open-chat-promote";
import { findCompatiblePerson, findSameNamePeople } from "./person-chat";
import { isRelationCompatible, relationGroup } from "./person-relation";
import { EPISODE_SUMMARY_NO_CONTENT } from "./prompts/episode-chat";
import { buildProposalUserMessage, PROPOSAL_SYSTEM_PROMPT } from "./prompts/free-chat";

const PROPOSAL_MODEL = process.env.LIFE_EVENT_CONFIRM_MODEL ?? "claude-sonnet-4-6";
export const TITLE_MAX = 40;
export const SUMMARY_MAX = 3000;
export const CENTER_LABEL_MAX = 30;
export const NAME_MAX = 50;
export const RELATION_MAX = 30;
export const PLACE_NAME_MAX = 50;
const MAX_PEOPLE = 8;
const MAX_PLACES = 6;
// 요약 모델의 "내용 없음" 표식을 믿는 본인 발화 길이 상한(공백 제외) — lib/episode-chat.ts 와 같은 값.
const NO_CONTENT_MAX_CHARS = 12;
// 만난 해를 비우는 가족 관계(출생 시기에 만난 비가족은 연도가 틀리기 쉬워 비운다 — Q33).
const FAMILY_GROUPS = new Set(["parent", "grandparent", "sibling", "relative", "spouse", "child"]);

export type SameNamePerson = { id: string; name: string; relation: string | null };

export type CardPerson = {
  name: string;
  relation: string | null;
  // 이미 계신 분(확정 인물) — null 이면 새로 만든다.
  personId: string | null;
  // 새 이름인데 같은 이름 확정 인물이 있음 → 카드 행에서 같은 분/다른 분을 묻는다.
  sameName: SameNamePerson[];
};

export type CardPlace = { name: string; placeId: string | null };

export type CardCenter = { id: string; label: string; year: number | null } | { new: { label: string; year: number | null } };

export type ProposalCard = {
  v: 1;
  title: string;
  summary: string;
  center: CardCenter;
  // 오늘의 인터뷰 — 문항이 시기를 정함(카드에서 못 바꿈).
  centerFixed: boolean;
  people: CardPerson[];
  places: CardPlace[];
  kind: EpisodeKind;
  // Episode.rawTranscript 로 남길 대화(카드가 다룬 구간).
  transcript: string;
  // 자유 대화 — 이 카드가 다룬 마지막 시각(ISO). 결정하면 구간이 여기서 다시 시작한다.
  until: string | null;
  // 이야기의 대상 인물(Episode.personId) — 인물과의 이야기로 시작한 대화.
  targetPersonId: string | null;
  isPeriod: boolean;
};

export type TranscriptTurn = { role: "assistant" | "user"; text: string };

function stripJsonFence(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*|^```\s*/i, "")
    .replace(/\s*```$/, "");
}

function norm(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, "");
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export function transcriptText(turns: TranscriptTurn[], personLine = ""): string {
  return (
    personLine +
    turns.map((t) => `[${t.role === "assistant" ? "동반자" : "본인"}] ${t.text}`).join("\n")
  );
}

// 본인 턴에서 마무리 말뿐인 문장을 뗀다(요약·판정 입력 — lib/episode-chat.ts 와 같은 기준).
export function cleanTurns(turns: TranscriptTurn[]): TranscriptTurn[] {
  return turns.flatMap((t): TranscriptTurn[] => {
    if (t.role !== "user") return [t];
    const kept = stripEpisodeDoneSignal(t.text);
    return kept ? [{ role: "user", text: kept }] : [];
  });
}

async function birthYearOf(userId: string): Promise<number | null> {
  const [p, u] = await Promise.all([
    prisma.onboardingProfile.findUnique({ where: { userId }, select: { birthYear: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { birthYear: true } }),
  ]);
  return p?.birthYear ?? u?.birthYear ?? null;
}

export function yearInRange(year: unknown, birthYear: number | null, now = new Date()): number | null {
  if (typeof year !== "number" || !Number.isInteger(year)) return null;
  const min = (birthYear ?? 1900) - 1;
  return year >= min && year <= now.getFullYear() ? year : null;
}

async function confirmedCenters(userId: string) {
  const rows = await prisma.lifeEvent.findMany({
    where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
    orderBy: { sequenceOrder: "asc" },
    select: { id: true, label: true, correctedLabel: true, year: true, correctedYear: true },
  });
  return rows.map((r) => ({ id: r.id, label: r.correctedLabel ?? r.label, year: r.correctedYear ?? r.year }));
}

async function confirmedPeople(userId: string) {
  return prisma.person.findMany({
    where: { userId, subjectType: "person", isDraft: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, relation: true },
  });
}

async function placeIdByName(userId: string, name: string): Promise<string | null> {
  const n = norm(name);
  const rows = await prisma.place.findMany({ where: { userId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  return rows.find((r) => norm(r.name) === n)?.id ?? null;
}

// 사람 한 명을 카드 행으로 — 이미 계신 분(AI 의 matchId 또는 이름·관계 호환)이면 그분, 아니면 새 이름 +
// 같은 이름 확정 인물 목록(있으면 되묻기). 2b-2 와 같은 규칙.
export async function personRow(
  userId: string,
  name: string,
  relation: string | null,
  matchId: string | null,
  people: { id: string; name: string; relation: string | null }[],
): Promise<CardPerson> {
  // 모델이 이미 계신 분이라고 해도 믿기 전에 두 가지를 본다 — 그때는 새 이름으로 보고 아래 규칙(관계 호환 →
  // 같은 이름 되묻기)을 탄다.
  //   ① 관계: 대화 속 관계가 그분 관계와 안 맞으면 아님(실측: "동네 친구 정다운"을 정다운(외삼촌)으로 맞춤)
  //   ② 이름: 모델이 쓴 이름이 그분 이름과 안 맞으면 아님(실측: "박영수"에 다른 분 김민수(친구)의 id 를 붙임).
  //      "민수" ↔ "김민수"처럼 한쪽이 다른 쪽을 품으면 같은 이름으로 본다(호칭만 나온 분은 프롬프트가 그분
  //      이름을 쓰게 한다).
  const matched = matchId ? people.find((p) => p.id === matchId) : undefined;
  const nameAgrees = (a: string, b: string) => {
    const x = norm(a);
    const y = norm(b);
    return x === y || (Math.min(x.length, y.length) >= 2 && (x.includes(y) || y.includes(x)));
  };
  if (matched && nameAgrees(matched.name, name) && isRelationCompatible(matched.relation, relation)) {
    return { name: matched.name, relation: matched.relation, personId: matched.id, sameName: [] };
  }
  const compatible = await findCompatiblePerson(prisma, userId, name, relation, false);
  if (compatible) return { name: compatible.name, relation: compatible.relation, personId: compatible.id, sameName: [] };
  return { name, relation, personId: null, sameName: await findSameNamePeople(prisma, userId, name) };
}

export type BuildProposalInput = {
  turns: TranscriptTurn[];
  // 주제 문구(모델 참고) — 예: "1974 고등학교 입학", "김민수 님과의 이야기".
  topic: string | null;
  // 시기 기본값(주제의 중심). fixed 면 모델 답과 무관하게 이 시기(오늘의 인터뷰).
  centerId: string | null;
  centerFixed: boolean;
  // 이야기의 대상 인물(인물과의 이야기로 시작) — 카드 사람 목록 맨 앞에 넣는다.
  targetPersonId: string | null;
  kind?: EpisodeKind; // 주면 고정(오늘의 인터뷰 "관계별 나")
  isPeriod?: boolean;
  titleHint?: string | null;
  // 주면 모델 제목 대신 이 제목(오늘의 인터뷰 — 문항 주제가 제목, 지금까지와 같다). 카드에서 고칠 수 있다.
  fixedTitle?: string | null;
  until: string | null;
  purpose: ChatUsagePurpose;
};

export type BuildProposalResult = { kind: "card"; card: ProposalCard } | { kind: "empty" } | { kind: "error" };

// 제안 카드 만들기. 본인 이야기 내용이 없으면 empty(카드 없음).
export async function buildProposal(userId: string, input: BuildProposalInput): Promise<BuildProposalResult> {
  const turns = cleanTurns(input.turns);
  const rawUserText = turns
    .filter((t) => t.role === "user")
    .map((t) => t.text)
    .join(" ")
    .trim();
  if (!rawUserText) return { kind: "empty" };

  const [centers, people, birthYear, target] = await Promise.all([
    confirmedCenters(userId),
    confirmedPeople(userId),
    birthYearOf(userId),
    input.targetPersonId
      ? prisma.person.findFirst({ where: { id: input.targetPersonId, userId }, select: { id: true, name: true, relation: true } })
      : null,
  ]);
  const personLine = target ? `[이 이야기의 인물] ${target.name}${target.relation ? ` (관계: ${target.relation})` : ""}\n` : "";
  const transcript = transcriptText(turns, personLine);

  // 모델 호출 — 요약이 안내문이거나, 긴 답에 "내용 없음"이면 한 번 더(lib/episode-chat.ts 와 같은 규칙).
  let parsed: Record<string, unknown> | null = null;
  const attempts = [
    "",
    '\n\n[지시] summary 는 위 대화의 본인 발화를 "-다"체 서술문으로만 바꿔 쓰세요(맞장구·마무리 말은 빼고). 사용자에게 말을 걸거나 내용이 부족하다고 쓰지 마세요.',
  ];
  for (const extra of attempts) {
    try {
      const res = await chat(
        [
          {
            role: "user",
            content:
              buildProposalUserMessage({ centers, people, topic: input.topic, birthYear, transcript }) + extra,
          },
        ],
        { system: PROPOSAL_SYSTEM_PROMPT, model: PROPOSAL_MODEL, maxTokens: 1200, temperature: 0.3 },
      );
      await recordChatUsage(userId, input.purpose, res);
      const obj = JSON.parse(stripJsonFence(res.text).match(/\{[\s\S]*\}/)?.[0] ?? "") as Record<string, unknown>;
      const summary = str(obj.summary, SUMMARY_MAX);
      if (summary.includes(EPISODE_SUMMARY_NO_CONTENT)) {
        if (rawUserText.replace(/\s+/g, "").length <= NO_CONTENT_MAX_CHARS) return { kind: "empty" };
        console.warn("[node-proposal] NO_CONTENT on long user text — retry");
        continue;
      }
      if (!summary || isSummaryGuidance(summary)) {
        console.warn("[node-proposal] summary rejected:", summary.slice(0, 80));
        continue;
      }
      parsed = obj;
      break;
    } catch (e) {
      console.error("[node-proposal] model/parse", e instanceof Error ? e.message : e);
    }
  }
  // 두 번 다 실패하면 본인 발화 원문으로라도 카드를 만든다(내용 유실 > 군말 한 줄).
  const obj = parsed ?? {};
  const summary = parsed ? str(obj.summary, SUMMARY_MAX) : rawUserText.slice(0, SUMMARY_MAX);

  // 시기.
  let center: CardCenter | null = null;
  const fixed = input.centerId ? centers.find((c) => c.id === input.centerId) : undefined;
  if (input.centerFixed && fixed) {
    center = fixed;
  } else {
    const c = (obj.center ?? {}) as Record<string, unknown>;
    const matchId = typeof c.matchId === "string" ? c.matchId : null;
    const byId = matchId ? centers.find((x) => x.id === matchId) : undefined;
    const fresh = (c.new ?? null) as Record<string, unknown> | null;
    const freshLabel = fresh ? str(fresh.label, CENTER_LABEL_MAX) : "";
    if (byId) center = byId;
    else if (freshLabel) center = { new: { label: freshLabel, year: yearInRange(fresh?.year, birthYear) } };
    else if (fixed) center = fixed;
  }
  if (!center) {
    // 모델이 시기를 못 정했고 주제도 없음 — 연도 모름 새 시기(카드에서 고칠 수 있다).
    center = { new: { label: (str(obj.title, CENTER_LABEL_MAX) || "기억 속 이야기"), year: null } };
  }

  // 사람 — 대상 인물이 맨 앞, 같은 사람은 한 번만.
  const rows: CardPerson[] = [];
  const seen = new Set<string>();
  const push = (r: CardPerson) => {
    const k = r.personId ?? `n:${norm(r.name)}`;
    if (seen.has(k) || rows.length >= MAX_PEOPLE) return;
    seen.add(k);
    rows.push(r);
  };
  if (target) push({ name: target.name, relation: target.relation, personId: target.id, sameName: [] });
  for (const raw of Array.isArray(obj.people) ? obj.people : []) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const name = str(p.name, NAME_MAX);
    if (!name) continue;
    const relation = str(p.relation, RELATION_MAX) || null;
    push(await personRow(userId, name, relation, typeof p.matchId === "string" ? p.matchId : null, people));
  }

  // 장소 — 이름으로 기존 장소와 맞춤(코드), 없으면 새로.
  const places: CardPlace[] = [];
  const seenPlace = new Set<string>();
  for (const raw of Array.isArray(obj.places) ? obj.places : []) {
    const name = str((raw as Record<string, unknown> | null)?.name, PLACE_NAME_MAX);
    if (!name || seenPlace.has(norm(name)) || places.length >= MAX_PLACES) continue;
    seenPlace.add(norm(name));
    places.push({ name, placeId: await placeIdByName(userId, name) });
  }

  const title =
    input.fixedTitle?.trim().slice(0, TITLE_MAX) || str(obj.title, TITLE_MAX) || input.titleHint?.slice(0, TITLE_MAX) || summary.slice(0, 20);
  const kind: EpisodeKind = input.kind ?? (obj.kind === "SELF" ? "SELF" : "STORY");

  return {
    kind: "card",
    card: {
      v: 1,
      title,
      summary,
      center,
      centerFixed: input.centerFixed && !!fixed,
      people: rows,
      places,
      kind,
      transcript,
      until: input.until,
      targetPersonId: target?.id ?? null,
      isPeriod: input.isPeriod ?? false,
    },
  };
}

// 저장된 카드(JSON)를 다시 읽는다 — 모양이 틀리면 null.
export function parseCard(v: unknown): ProposalCard | null {
  if (!v || typeof v !== "object") return null;
  const c = v as Partial<ProposalCard>;
  if (c.v !== 1 || typeof c.title !== "string" || typeof c.summary !== "string" || !c.center) return null;
  if (!Array.isArray(c.people) || !Array.isArray(c.places) || typeof c.transcript !== "string") return null;
  return c as ProposalCard;
}

// ─── [만들기] ───────────────────────────────────────────────────────────

// 카드 화면이 보내는 값([고치기] 반영). 저장 쪽은 이 값을 믿지 않고 전부 다시 확인한다.
export type CardEdit = {
  title: string;
  summary: string;
  center: { id: string } | { new: { label: string; year: number | null } };
  people: {
    name: string;
    relation: string | null;
    personId: string | null;
    // 같은 이름 되묻기 답 — same 이면 samePersonId 로 합침, different 면 새 분.
    decision?: "same" | "different";
    samePersonId?: string;
  }[];
  places: { name: string; placeId: string | null }[];
};

export type CreateFromCardResult =
  | { ok: true; episodeId: string; eventId: string; title: string; created: { center: boolean; people: number; places: number } }
  | { ok: false; reason: "invalid"; message: string }
  // 같은 이름 확정 인물이 있는 새 이름 — 행 번호별 후보. 아무것도 저장하지 않았다.
  | { ok: false; reason: "ask"; ask: { index: number; candidates: SameNamePerson[] }[] }
  | { ok: false; reason: "failed" };

export function cardToEdit(card: ProposalCard): CardEdit {
  return {
    title: card.title,
    summary: card.summary,
    center: "id" in card.center ? { id: card.center.id } : { new: { ...card.center.new } },
    people: card.people.map((p) => ({ name: p.name, relation: p.relation, personId: p.personId })),
    places: card.places.map((p) => ({ ...p })),
  };
}

type ResolvedPerson = { personId: string | null; name: string; relation: string | null };

export async function createFromCard(
  userId: string,
  card: ProposalCard,
  edit: CardEdit,
): Promise<CreateFromCardResult> {
  const birthYear = await birthYearOf(userId);
  const title = str(edit.title, TITLE_MAX);
  const summary = str(edit.summary, SUMMARY_MAX);
  if (!title || !summary) return { ok: false, reason: "invalid", message: "제목과 내용이 필요해요." };

  // 시기 — 고정 카드는 카드의 시기만.
  let centerId: string | null = null;
  let newCenter: { label: string; year: number | null } | null = null;
  const wantCenter = card.centerFixed ? ("id" in card.center ? { id: card.center.id } : null) : edit.center;
  if (!wantCenter) return { ok: false, reason: "invalid", message: "시기를 골라 주세요." };
  if ("id" in wantCenter) {
    const ev = await prisma.lifeEvent.findFirst({
      where: { id: wantCenter.id, userId, status: { in: ["CONFIRMED", "CORRECTED"] } },
      select: { id: true },
    });
    if (!ev) return { ok: false, reason: "invalid", message: "그 시기를 찾지 못했어요." };
    centerId = ev.id;
  } else {
    const label = str(wantCenter.new?.label, CENTER_LABEL_MAX);
    if (!label) return { ok: false, reason: "invalid", message: "새 시기 이름이 필요해요." };
    newCenter = { label, year: yearInRange(wantCenter.new?.year, birthYear) };
  }

  // 사람 — 전부 다시 확인. 새 이름에 같은 이름 확정 인물이 있으면 답을 받을 때까지 아무것도 저장 안 함.
  const people: ResolvedPerson[] = [];
  const ask: { index: number; candidates: SameNamePerson[] }[] = [];
  const seen = new Set<string>();
  const list = Array.isArray(edit.people) ? edit.people.slice(0, MAX_PEOPLE) : [];
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const name = str(p?.name, NAME_MAX);
    if (!name) continue;
    const relation = str(p.relation, RELATION_MAX) || null;
    let personId: string | null = null;
    if (p.personId) {
      const owned = await prisma.person.findFirst({
        where: { id: p.personId, userId, subjectType: "person", isDraft: false },
        select: { id: true, name: true },
      });
      // 이름을 고쳤으면 그분이 아니다(새 이름으로 다시 판단).
      if (owned && norm(owned.name) === norm(name)) personId = owned.id;
    }
    if (!personId) {
      const same = await findSameNamePeople(prisma, userId, name);
      if (p.decision === "same") {
        const pick = same.find((s) => s.id === p.samePersonId);
        if (!pick) return { ok: false, reason: "invalid", message: "같은 분을 다시 골라 주세요." };
        personId = pick.id;
      } else if (p.decision !== "different" && same.length > 0) {
        ask.push({ index: i, candidates: same });
        continue;
      }
    }
    const key = personId ?? `n:${norm(name)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    people.push({ personId, name, relation });
  }
  if (ask.length > 0) return { ok: false, reason: "ask", ask };

  // 시기 → 이야기(먼저). 새 시기를 만들었는데 이야기 저장이 실패하면 그 시기를 지운다.
  let createdCenter = false;
  if (!centerId && newCenter) {
    centerId = (await createCustomLifeEvent(userId, newCenter.label, newCenter.year)).id;
    createdCenter = true;
  }
  const center = await prisma.lifeEvent.findUniqueOrThrow({
    where: { id: centerId! },
    select: { id: true, type: true, year: true, correctedYear: true },
  });
  const centerYear = center.correctedYear ?? center.year;
  const targetPersonId =
    card.targetPersonId && people.some((p) => p.personId === card.targetPersonId) ? card.targetPersonId : undefined;

  let saved: { episodeId: string; memoryId: string } | null = null;
  try {
    saved = await createEpisodeBridge(
      userId,
      center.id,
      title,
      centerYear,
      summary,
      card.transcript,
      targetPersonId,
      card.isPeriod,
      card.kind,
    );
  } catch (e) {
    console.error("[node-proposal] episode", e);
  }
  if (!saved) {
    if (createdCenter) await prisma.lifeEvent.deleteMany({ where: { id: center.id, userId, type: "CUSTOM" } });
    return { ok: false, reason: "failed" };
  }
  const episodeRef = { type: "EPISODE" as const, id: saved.episodeId };

  // 사람 — 하나씩(실패해도 이야기는 남음). 만난 해 = 시기 연도, 출생 시기 + 비가족이면 비움(Q33).
  let linkedPeople = 0;
  for (const p of people) {
    try {
      let id = p.personId;
      if (!id) {
        const family = FAMILY_GROUPS.has(relationGroup(p.relation) ?? "");
        id = (
          await prisma.person.create({
            data: {
              userId,
              subjectType: "person",
              name: p.name,
              relation: p.relation,
              metYear: center.type === "BIRTH" && !family ? null : centerYear,
            },
            select: { id: true },
          })
        ).id;
      }
      if (id !== targetPersonId) {
        const r = await saveNodeLink(userId, episodeRef, { type: "PERSON", id }, { status: "CONFIRMED" });
        if (!r.ok) console.error("[node-proposal] person link", r.reason);
      }
      const r2 = await saveNodeLink(userId, { type: "LIFE_EVENT", id: center.id }, { type: "PERSON", id });
      if (!r2.ok) console.error("[node-proposal] person-center link", r2.reason);
      linkedPeople += 1;
    } catch (e) {
      console.error("[node-proposal] person", e);
    }
  }

  // 장소 — 있는 곳은 그대로, 없으면 이름만으로 새로(같은 이름이면 재사용).
  let linkedPlaces = 0;
  const seenPlace = new Set<string>();
  for (const pl of (Array.isArray(edit.places) ? edit.places : []).slice(0, MAX_PLACES)) {
    try {
      const name = str(pl?.name, PLACE_NAME_MAX);
      if (!name || seenPlace.has(norm(name))) continue;
      seenPlace.add(norm(name));
      let placeId: string | null = null;
      if (pl.placeId) {
        const owned = await prisma.place.findFirst({ where: { id: pl.placeId, userId }, select: { id: true, name: true } });
        if (owned && norm(owned.name) === norm(name)) placeId = owned.id;
      }
      placeId ??= await placeIdByName(userId, name);
      placeId ??= (await prisma.place.create({ data: { userId, name }, select: { id: true } })).id;
      const r = await saveNodeLink(userId, episodeRef, { type: "PLACE", id: placeId });
      if (r.ok) linkedPlaces += 1;
      else console.error("[node-proposal] place link", r.reason);
    } catch (e) {
      console.error("[node-proposal] place", e);
    }
  }

  return {
    ok: true,
    episodeId: saved.episodeId,
    eventId: center.id,
    title,
    created: { center: createdCenter, people: linkedPeople, places: linkedPlaces },
  };
}
