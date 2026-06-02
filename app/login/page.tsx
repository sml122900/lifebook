import { signIn } from "@/auth";

// 로그인 페이지. 구글 OAuth 한 가지(추후 카카오/네이버 추가 예정).
// form action(server) 으로 signIn 을 호출하고, 성공 후 /timeline 으로 보낸다.
export default function LoginPage() {
  return (
    <main className="mx-auto flex max-w-md flex-col items-center gap-8 px-6 py-20">
      <header className="text-center">
        <h1 className="text-4xl font-bold text-zinc-900">로그인</h1>
        <p className="mt-3 text-zinc-800">
          Google 계정으로 안전하게 시작합니다.
        </p>
      </header>

      <form
        action={async () => {
          "use server";
          // L7 — /enter 가 인생 이벤트 유무를 보고 /life-timeline 또는
          // /life-record(신규) 로 분기. /timeline (v2 페이지) 은 직접
          // URL 접근으로만 도달.
          await signIn("google", { redirectTo: "/enter" });
        }}
        className="w-full"
      >
        <button
          type="submit"
          className="min-h-[56px] w-full rounded-md bg-zinc-900 px-6 py-4 text-lg font-semibold text-white hover:bg-zinc-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
        >
          Google로 시작하기
        </button>
      </form>
    </main>
  );
}
