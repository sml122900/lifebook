"use server";

// STAGE4 — 에피소드 심화 대화 + 저장. v3 P19-1/P19-3 — 삭제/정정도 이 파일에
// 함께 둔다(Episode 도메인 액션).
//
// 대화 진행·요약·저장 본체는 lib/episode-chat.ts(순수, auth 없음)로 옮겼다
// (2026-10-25 — 오늘의 인터뷰·검증 스크립트가 같은 함수를 userId 로 직접 부른다).
// 이 파일은 auth 게이트 + revalidate 만 씌운다.

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import {
  deleteEpisode as deleteEpisodeCore,
  saveEpisodePlaces as saveEpisodePlacesDb,
  updateEpisodeContent as updateEpisodeContentCore,
  type DeleteEpisodeResult,
  type UpdateEpisodeContentResult,
} from "@/lib/episode";
import {
  continueEpisodeChatCore,
  finishEpisodeChatCore,
  type ContinueEpisodeResult,
  type EpisodeTopic,
  type EpisodeTurn,
  type FinishEpisodeResult,
} from "@/lib/episode-chat";
import type { PlaceInfo } from "@/lib/place-types";

export type {
  ContinueEpisodeResult,
  EpisodeTopic,
  EpisodeTurn,
  FinishEpisodeResult,
} from "@/lib/episode-chat";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// v3 P23-2 — Episode 생성/삭제/정정은 /people/[personId] 상세("함께한 인생의
// 순간들")가 읽는 content 를 바꾸지만, 그 페이지 쪽은 아무 revalidation 도
// 없었다. /people 목록이 상세 페이지를 평범한 <Link>(기본 prefetch)로
// 가리키므로, 먼저 /people 을 방문해 프리페치가 캐시된 뒤 여기서 내용이
// 바뀌면 라우터 캐시가 옛 내용을 계속 보여줄 수 있다(실측 — 이번엔 진단용
// 스크립트로 직접 지운 뒤 확인해 DB 는 비어 있었는데 화면엔 남아 있었다).
// 경로 패턴(동적 세그먼트 전체)으로 한 번에 무효화 — 이 Episode 가 어느
// personId 에 노출되는지(personId 태그 유무 + 폴백) 역산할 필요 없음.
// /story-review 의 P20-1(자기 자신 재계산 비용)과는 다른 페이지·다른
// 문제라 그 결정과 배치되지 않는다.
function revalidatePeopleDetail() {
  revalidatePath("/people/[personId]", "page");
}

export async function continueEpisodeChat(
  lifeEventId: string,
  history: EpisodeTurn[],
  followUpCount: number,
  topicOverride?: EpisodeTopic,
): Promise<ContinueEpisodeResult> {
  const userId = await requireUserId();
  return continueEpisodeChatCore(userId, lifeEventId, history, followUpCount, topicOverride);
}

export async function finishEpisodeChat(
  lifeEventId: string,
  transcriptHistory: EpisodeTurn[],
  personId?: string,
  topicOverride?: EpisodeTopic,
): Promise<FinishEpisodeResult> {
  const userId = await requireUserId();
  const result = await finishEpisodeChatCore(userId, lifeEventId, transcriptHistory, personId, topicOverride);
  if (result.ok) revalidatePeopleDetail();
  return result;
}

export async function saveEpisodePlaces(
  memoryId: string,
  places: PlaceInfo[],
): Promise<boolean> {
  const userId = await requireUserId();
  return saveEpisodePlacesDb(userId, memoryId, places);
}

// v3 P19-1 — /story-review 카드에서 이야기 지우기.
//
// P20-1 — revalidatePath("/story-review") 를 여기 두면, 호출자(/story-review
// 자신)가 Server Action 응답에 최신 RSC 페이로드를 함께 실어 보내려고 그
// 자리에서 getStoryReviewData+detectGaps(무거운 재계산)를 통째로 다시
// 돌린다. 호출부(EpisodeCard)가 성공 후 router.refresh() 로 이미 같은
// 갱신을 별도 요청으로 하고 있어(=v2 컴포넌트 무수정 정책과 무관하게 v3
// 자체 컴포넌트) 실질적으로 매 클릭마다 같은 무거운 쿼리를 두 번 태우고
// 있었다 — Vercel 함수 응답이 그 안에서 타임아웃/503 나면 "DB 는 반영됐는데
// 화면엔 안 보이는" 상태로 남는다(P20 재현). /story-review 는 auth() 로
// 이미 항상 동적 렌더(정적 캐시 대상 아님)라 revalidatePath("/story-review")
// 는 여기서 실질적 이점 없이 비용만 더한다 — 그건 제거하고 router.refresh()
// 단독으로 맡긴다. 아래 revalidatePeopleDetail() 은 그것과 별개(P23-2) —
// /people/[personId] 는 다른 페이지고, 렌더 비용도 가벼워 같은 우려가
// 적용 안 된다.
export async function deleteEpisodeAction(episodeId: string): Promise<DeleteEpisodeResult> {
  const userId = await requireUserId();
  const result = await deleteEpisodeCore(userId, episodeId);
  // v3 P22-1 — "이야기가 사라졌는데 원인이 유실인지 삭제인지" 를 다음엔
  // Vercel 함수 로그로 구분할 수 있도록(이번엔 삭제 이력을 남길 방법이
  // 없어 대조 불가했다).
  console.log("[episode-delete]", { userId, episodeId, ok: result.ok });
  if (result.ok) revalidatePeopleDetail();
  return result;
}

// v3 P19-3 — /story-review 카드에서 이야기 고치기. P20-1 이유로
// revalidatePath("/story-review") 는 없음(위 deleteEpisodeAction 주석
// 참조) — 그러나 /people/[personId] 쪽은 P23-2 로 무효화한다.
export async function updateEpisodeContentAction(
  episodeId: string,
  content: string,
): Promise<UpdateEpisodeContentResult> {
  const userId = await requireUserId();
  const result = await updateEpisodeContentCore(userId, episodeId, content);
  if (result.ok) revalidatePeopleDetail();
  return result;
}
