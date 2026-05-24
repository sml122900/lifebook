import { getTheme, setTheme } from "./theme-actions";

// 헤더에 두는 다크/라이트 토글. form action(server)으로 동작해 JS 없이도
// 작동하고, 쿠키 기반이라 다음 요청부터 즉시 반영된다.
// 버튼 라벨은 "다음에 바뀔 모드"를 보여준다 — 시니어가 동작 결과를
// 예상하기 쉽도록.
export async function ThemeToggle() {
  const current = await getTheme();
  const next = current === "dark" ? "light" : "dark";
  const label = next === "dark" ? "다크모드" : "라이트모드";

  return (
    <form
      action={async () => {
        "use server";
        await setTheme(next);
      }}
    >
      <button
        type="submit"
        aria-label={`${label}로 전환`}
        className="rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-900 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        {label}
      </button>
    </form>
  );
}
