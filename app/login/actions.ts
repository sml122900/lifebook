"use server";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";
import { enterAfterLogin, safeLoginReturnTo } from "@/lib/return-to";

export async function credentialsSignInAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      // 돌아갈 주소는 폼 값이라 여기서 다시 검사(우리 사이트 안 경로만 — lib/return-to).
      redirectTo: enterAfterLogin(safeLoginReturnTo(formData.get("returnTo") as string | null)),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return "이메일 또는 비밀번호가 맞지 않아요.";
    }
    throw e; // NEXT_REDIRECT — Next.js 가 처리
  }
  return null;
}
