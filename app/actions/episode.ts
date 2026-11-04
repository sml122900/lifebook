"use server";

// Episode 도메인 액션 — auth 게이트 + revalidate 만 씌운다(본체는 lib/episode.ts).
// 2026-11-03 옛 온보딩 이야기 대화(/onboarding-episode-chat)·옛 /story-review 카드가 쓰던 이어하기·마무리·장소 저장·
// 지우기 액션 삭제(앱 안 호출 0 — docs/phase/my-life-restructure.md §15.4). 지금 쓰는 곳 = My Life 이야기 패널
// [이야기 고치기](app/my-life/MyLifeView.tsx). 이야기 지우기는 My Life 지우기(app/my-life/actions.ts).

import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { updateEpisodeContent as updateEpisodeContentCore, type UpdateEpisodeContentResult } from "@/lib/episode";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// v3 P23-2 — Episode 정정은 /people/[personId] 상세("함께한 인생의 순간들")가 읽는 content 를 바꾸지만, 그 페이지
// 쪽은 아무 revalidation 도 없었다. /people 목록이 상세 페이지를 평범한 <Link>(기본 prefetch)로 가리키므로, 먼저
// /people 을 방문해 프리페치가 캐시된 뒤 여기서 내용이 바뀌면 라우터 캐시가 옛 내용을 계속 보여줄 수 있다.
// 경로 패턴(동적 세그먼트 전체)으로 한 번에 무효화.
function revalidatePeopleDetail() {
  revalidatePath("/people/[personId]", "page");
}

// 이야기 고치기(본문). 화면(My Life)은 저장 뒤 router.refresh 로 다시 읽는다. base = 패널이 읽은 글 버전·평문(충돌 확인).
export async function updateEpisodeContentAction(
  episodeId: string,
  content: string,
  base: { version: number; content: string },
): Promise<UpdateEpisodeContentResult> {
  const userId = await requireUserId();
  const result = await updateEpisodeContentCore(userId, episodeId, content, base);
  if (result.ok) revalidatePeopleDetail();
  return result;
}
