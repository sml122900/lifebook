"use server";
import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";

import { signIn } from "@/auth";
import { prisma } from "@/lib/db";
import { ensureWalletWithSignupGrant } from "@/lib/tokens/wallet";

export async function signupAction(
  _prevState: string | null,
  formData: FormData
): Promise<string | null> {
  const email = ((formData.get("email") as string) ?? "").trim().toLowerCase();
  const password = (formData.get("password") as string) ?? "";
  const name = ((formData.get("name") as string) ?? "").trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "올바른 이메일 주소를 입력해주세요.";
  }
  if (password.length < 8) {
    return "비밀번호는 8자 이상이어야 해요.";
  }

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) return "이미 사용 중인 이메일이에요.";

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? email.split("@")[0],
      passwordHash,
    },
  });

  await ensureWalletWithSignupGrant(user.id);

  // 가입 직후 자동 로그인 — 성공 시 /enter 로 redirect(NEXT_REDIRECT 재throw)
  try {
    await signIn("credentials", { email, password, redirectTo: "/enter" });
  } catch (e) {
    if (e instanceof AuthError) {
      // 자동 로그인 실패는 드문 경우 — 로그인 페이지로 유도
      return "가입은 완료됐어요. 아래 로그인 페이지에서 계속해주세요.";
    }
    throw e; // NEXT_REDIRECT
  }
  return null; // unreachable
}
