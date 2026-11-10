import { ButtonLink } from "@/components/ui/Button";

// 없는 주소(#11, 2026-11-08) — 로그인 전에도 로그인 화면 대신 이 안내(proxy 가 모르는 맨 위 경로는 그대로 보냄 — lib/app-routes).
export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-start gap-6 px-6 py-16">
      <h1 className="text-ink">찾으시는 화면이 없어요</h1>
      <p className="text-xl text-ink-soft">주소가 바뀌었거나 없어진 화면이에요. 처음 화면에서 다시 찾아 주세요.</p>
      <ButtonLink href="/" variant="primary" size="lg">
        처음 화면으로
      </ButtonLink>
    </main>
  );
}
