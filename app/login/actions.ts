"use server";
import { AuthError } from "next-auth";

import { signIn } from "@/auth";

export async function credentialsSignInAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/enter",
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return "이메일 또는 비밀번호가 맞지 않아요.";
    }
    throw e; // NEXT_REDIRECT — Next.js 가 처리
  }
  return null;
}
