import { signIn } from "@/auth";

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
          await signIn("google", { redirectTo: "/timeline" });
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
