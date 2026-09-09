import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ButtonLink } from "@/components/ui/Button";
import { getOnboardingTrack } from "@/lib/onboarding-track";

// v3 통합 채팅 인트로 화면 — /chat-v3(뼈대+확인질문 통합 채팅)로 넘어가기
// 전 딱 한 화면. 로그인·동의 게이트는 proxy.ts 가 이미 전역으로 걸어주므로
// (PUBLIC_PATHS 밖) 여기선 세션 유무만 방어적으로 한 번 더 확인한다
// (/enter·/onboarding-v2 등 기존 페이지와 같은 패턴).
//
// v3 P17 — /enter 가 이제 이 경로를 가리킨다(V3 트랙). V2 사용자가 직접
// URL로 들어오면 전환(배너) 없이 /enter 로 돌려보낸다(자동 전환 금지).
export default async function StartPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const track = await getOnboardingTrack(session.user.id);
  if (track !== "V3") {
    redirect("/enter");
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-ink">잠깐 이야기 나눠요</h1>
        <p className="text-xl leading-relaxed text-ink-soft">
          사소한 이야기가 모여 한 사람의 기록이 됩니다.
          <br />
          편하게 대답만 해주세요. 나머지는 저희가 정리할게요.
        </p>
      </div>

      <ButtonLink href="/chat-v3" variant="primary" size="lg" className="w-full max-w-xs">
        시작하기
      </ButtonLink>
    </main>
  );
}
