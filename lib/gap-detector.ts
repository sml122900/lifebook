// v3 통합 채팅(P2→P3) — 갭 감지 엔진. 순수 읽기 전용 계산 — DB 쓰기 없음.
// app/actions/gaps.ts("use server")가 감싸서 클라에 노출한다.
//
// P3 — cardLabel(카드/칩에 보이는 문구, 결핍 프레이밍 금지)과 userPrompt
// (클릭 시 실제로 묻는 질문)를 분리했다. 이전엔 단일 label 을 그대로
// addBot 해버려 "출생(1963) 이후로 12년 동안 이야기가 비어있어요 편하게
// 말씀해주세요." 처럼 내부 진단 문구가 사용자에게 그대로 노출되던 버그가
// 있었다(unconfirmed/needs_review 는 getConfirmQuestionForEvent 가 별도로
// 자연스러운 질문을 생성하므로 userPrompt 를 안 씀 — 여기 값은 미사용
// placeholder).

import { prisma } from "./db";
import type { LifeEventType } from "./generated/prisma/enums";
import { withJosa } from "./josa";

// v3 P6 — person: confirmed 이벤트인데 연결된 Person 이 0명(그 시절 주변
// 사람을 아직 안 물어봄). person_episode: Person 은 있는데 그 사람과의
// Episode 가 0건(이름은 남겼지만 이야기는 아직 못 들음).
export type GapType =
  | "needs_review"
  | "unconfirmed"
  | "time_gap"
  | "episode"
  | "person"
  | "person_episode";

export type Gap = {
  type: GapType;
  // time_gap 은 "사이"를 가리키므로 구간의 앞쪽 이벤트를 anchor 로 삼는다
  // (P3-2 — /story-review 딥링크에 필요). person 은 대상 이벤트, person_episode
  // 는 그 인물이 처음 연결된 이벤트(대화 문맥용) — 어느 경우든 LifeEvent id.
  targetEventId?: string;
  // person_episode 전용 — 대상 인물. targetEventId 와 함께 있어야 유효.
  targetPersonId?: string;
  // 카드/칩에 보이는 문구. 결핍 프레이밍("~비어있어요") 금지.
  cardLabel: string;
  // P7-5 — 카드를 클릭했을 때 사용자 발화 버블에 넣을 문구. cardLabel 은
  // 시스템이 사용자에게 건네는 초대/질문형("~들어볼까요?")이라 그대로
  // addUser 하면 "사용자가 자기 자신에게 되묻는" 것처럼 어색했다(실제로는
  // 하지 않은 말). 1인칭 진술체("~해볼게요")로 분리.
  announceText: string;
  // 클릭 시 실제로 묻는 질문(episode/unconfirmed/needs_review/person/
  // person_episode 는 각자 전용 엔진이 자체 생성하므로 미사용 — time_gap 만
  // 이 값을 그대로 addBot).
  userPrompt: string;
  // 낮을수록 우선(정리 화면 상위 노출).
  priority: number;
};

// confirmed 이벤트 사이(또는 마지막 이벤트→현재)가 이 년수 이상 비면 시간 공백.
const TIME_GAP_YEARS = 10;

export async function detectGaps(userId: string): Promise<Gap[]> {
  const events = await prisma.lifeEvent.findMany({
    where: { userId },
    orderBy: { sequenceOrder: "asc" },
    include: { people: { select: { id: true }, take: 1 } },
  });

  const gaps: Gap[] = [];

  for (const e of events) {
    const label = e.correctedLabel ?? e.label;
    if (e.status === "UNCONFIRMED" && e.needsReview) {
      gaps.push({
        type: "needs_review",
        targetEventId: e.id,
        cardLabel: `${label} 이야기, 다시 한번 여쭤봐도 될까요?`,
        announceText: `${label} 이야기 다시 해볼게요`,
        userPrompt: "",
        priority: 1,
      });
    } else if (e.status === "UNCONFIRMED") {
      gaps.push({
        type: "unconfirmed",
        targetEventId: e.id,
        cardLabel: `${label} 이야기를 아직 못 들었어요`,
        announceText: `${label} 이야기 해볼게요`,
        userPrompt: "",
        priority: 2,
      });
    } else if (e.status === "CONFIRMED" || e.status === "CORRECTED") {
      // v3 P6 — 뼈대 갭(1·2) 다음, 에피소드 갭(6)보다 앞. 한 이벤트가 인물
      // 갭과 에피소드 갭을 동시에 가질 수 있다(둘 다 독립 조건).
      // P8-4 — personAsked 는 "이미 물어봤다"(인물을 저장했든 "없어요"로
      // 거절했든)는 기록. 한 번 물어본 이벤트는 갭 카드로 다시 안 뜬다.
      if (e.people.length === 0 && !e.personAsked) {
        gaps.push({
          type: "person",
          targetEventId: e.id,
          cardLabel: `${label} 시절, 곁에 계셨던 분 이야기도 들어볼까요?`,
          announceText: `${label} 시절 이야기도 해볼게요`,
          userPrompt: "",
          priority: 4,
        });
      }
      if (!e.hasEpisode) {
        gaps.push({
          type: "episode",
          targetEventId: e.id,
          cardLabel: `${label} 이야기를 더 들어볼까요?`,
          announceText: `${label} 이야기 해볼게요`,
          userPrompt: "",
          priority: 6,
        });
      }
    }
  }

  // v3 P6 — person_episode: 이 v3 흐름으로 연결된 인물(≥1 PersonLifeEvent)
  // 중 아직 그 사람과의 Episode 가 없는 경우. /people 에서 직접 추가한
  // 인물(PersonLifeEvent 링크 없음)은 이 갭 대상이 아니다 — 대화 문맥으로
  // 쓸 이벤트가 없어 자연스러운 질문을 못 만든다.
  //
  // P7-2 — 새 person(4)/time_gap(5) 보다 앞(priority 3). 이미 이름까지 받아둔
  // "거의 다 채운" 이야기가, 다른 이벤트의 새 person 질문에 밀려 topGaps(3)
  // 밖으로 밀려나던 버그 — 이름을 준 사람의 이야기를 마무리하는 게 새로 사람을
  // 캐묻는 것보다 자연스럽다.
  const personsWithoutEpisode = await prisma.person.findMany({
    where: { userId, subjectType: "person", isDraft: false, lifeEvents: { some: {} } },
    select: {
      id: true,
      name: true,
      episodes: { select: { id: true }, take: 1 },
      lifeEvents: {
        take: 1,
        orderBy: { createdAt: "asc" },
        select: { lifeEventId: true },
      },
    },
  });
  for (const p of personsWithoutEpisode) {
    if (p.episodes.length > 0) continue;
    const link = p.lifeEvents[0];
    if (!link) continue;
    gaps.push({
      type: "person_episode",
      targetEventId: link.lifeEventId,
      targetPersonId: p.id,
      cardLabel: `${p.name}${withJosa(p.name, "과/와")} 있었던 일도 들어볼까요?`,
      announceText: `${p.name}${withJosa(p.name, "이랑/랑")} 있었던 이야기 해볼게요`,
      userPrompt: "",
      priority: 3,
    });
  }

  // 시간 공백 — confirmed/corrected 이면서 연도가 있는 이벤트만 시간순으로.
  // anchor(구간 앞쪽 이벤트)가 BIRTH 인지로 어린 시절/그 이후를 구분해
  // userPrompt 톤을 다르게 한다.
  type TimedEvent = { id: string; type: LifeEventType; label: string; year: number };

  const timed: TimedEvent[] = events
    .filter((e) => e.status === "CONFIRMED" || e.status === "CORRECTED")
    .map((e) => ({
      id: e.id,
      type: e.type,
      label: e.correctedLabel ?? e.label,
      year: e.correctedYear ?? e.year,
    }))
    .filter((e): e is TimedEvent => e.year !== null)
    .sort((a, b) => a.year - b.year);

  // P4-2 — "그 무렵엔"은 사용자가 어느 구간인지 알 수 없어 모호했다. 앵커
  // 이벤트 기준으로 자연스럽게 구간을 녹인다. 연도 숫자 직접 노출은 피하고
  // 사건 기준 표현만 쓴다.
  function timeGapPrompt(anchor: TimedEvent): string {
    if (anchor.type === "BIRTH") return "국민학교 들어가기 전, 어릴 적엔 어떻게 지내셨어요?";
    if (anchor.type === "MARRIAGE") return "결혼하시고 나서는 어떻게 지내셨어요?";
    return `${anchor.label} 이후로는 어떻게 지내셨어요?`;
  }

  for (let i = 0; i < timed.length - 1; i++) {
    const anchor = timed[i];
    const span = timed[i + 1].year - anchor.year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        targetEventId: anchor.id,
        cardLabel: `${anchor.label}(${anchor.year}) 이후 이야기를 아직 못 들었어요`,
        announceText: `${anchor.label} 이후 이야기도 해볼게요`,
        userPrompt: timeGapPrompt(anchor),
        priority: 5,
      });
    }
  }
  if (timed.length > 0) {
    const anchor = timed[timed.length - 1];
    const span = new Date().getFullYear() - anchor.year;
    if (span >= TIME_GAP_YEARS) {
      gaps.push({
        type: "time_gap",
        targetEventId: anchor.id,
        cardLabel: `${anchor.label}(${anchor.year}) 이후 이야기를 아직 못 들었어요`,
        announceText: `${anchor.label} 이후 이야기도 해볼게요`,
        userPrompt: timeGapPrompt(anchor),
        priority: 5,
      });
    }
  }

  gaps.sort((a, b) => a.priority - b.priority);
  return gaps;
}

// P7-8 — story-review/getTopGaps 가 detectGaps 결과를 그냥 `.slice(0, N)`
// 하면, 인물이 많은 계정처럼 어느 한 타입(person/person_episode)이 수가
// 많을 때 그 타입이 topN 슬롯을 전부 차지해 다른 타입(특히 time_gap)이
// 화면에 영영 안 보이는 문제가 있었다(우선순위 숫자 하나로만 정렬하는
// 한, 항상 어떤 타입이든 다른 타입을 가릴 수 있다 — person_episode 를
// 올리면 person 이 가려지고, person 을 올리면 time_gap 이 가려지는
// 식). 타입별로 최소 1장은 먼저 채우고, 그러고도 자리가 남으면 우선순위
// 순으로 마저 채운다 — 어느 타입도 완전히 안 보이는 일은 없게 한다.
export function pickTopGaps(gaps: Gap[], limit: number): Gap[] {
  const picked: Gap[] = [];
  const seenTypes = new Set<GapType>();

  for (const g of gaps) {
    if (picked.length >= limit) break;
    if (seenTypes.has(g.type)) continue;
    seenTypes.add(g.type);
    picked.push(g);
  }
  if (picked.length < limit) {
    for (const g of gaps) {
      if (picked.length >= limit) break;
      if (picked.includes(g)) continue;
      picked.push(g);
    }
  }

  return picked.sort((a, b) => a.priority - b.priority);
}
