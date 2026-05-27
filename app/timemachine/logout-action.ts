"use server";

import { signOut } from "@/auth";

// 사이드 패널의 로그아웃 form action. NextAuth v5 signOut 그대로.
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
