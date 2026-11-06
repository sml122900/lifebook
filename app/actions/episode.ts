"use server";

// Episode 도메인 액션 — auth 게이트만 씌운다(본체는 lib/episode.ts). 화면(My Life)은 저장 뒤 router.refresh.
// 2026-11-03 옛 온보딩 이야기 대화(/onboarding-episode-chat)·옛 /story-review 카드가 쓰던 이어하기·마무리·장소 저장·
// 지우기 액션 삭제(앱 안 호출 0 — docs/phase/my-life-restructure.md §15.4). 지금 쓰는 곳 = My Life 이야기 패널
// [이야기 고치기](app/my-life/MyLifeView.tsx). 이야기 지우기는 My Life 지우기(app/my-life/actions.ts).

import { auth } from "@/auth";
import { updateEpisodeContent as updateEpisodeContentCore, type UpdateEpisodeContentResult } from "@/lib/episode";

async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Unauthorized");
  return userId;
}

// 2026-11-06 인물록 통합 — /people 인물 상세 무효화 삭제(V3 사용자는 /people → My Life, 이야기는 V3 만 있음).

// 이야기 고치기(본문). 화면(My Life)은 저장 뒤 router.refresh 로 다시 읽는다. base = 패널이 읽은 글 버전·평문(충돌 확인).
export async function updateEpisodeContentAction(
  episodeId: string,
  content: string,
  base: { version: number; content: string },
): Promise<UpdateEpisodeContentResult> {
  const userId = await requireUserId();
  const result = await updateEpisodeContentCore(userId, episodeId, content, base);
  return result;
}
