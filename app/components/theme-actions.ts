"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

// 테마 쿠키 — 서버에서 읽어 <html class="dark">에 반영하므로 새로고침 시
// 깜빡임이 없다. 1년 만료, httpOnly 아님(클라가 직접 읽을 일은 없지만
// 그래도 단순화).
const COOKIE = "lifebook-theme";
const ONE_YEAR = 60 * 60 * 24 * 365;

export type Theme = "light" | "dark";

export async function getTheme(): Promise<Theme> {
  const c = await cookies();
  return c.get(COOKIE)?.value === "dark" ? "dark" : "light";
}

export async function setTheme(next: Theme) {
  const c = await cookies();
  c.set(COOKIE, next, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
  });
  // 모든 페이지가 <html> 클래스를 함께 받으므로 루트 revalidate.
  revalidatePath("/", "layout");
}
