// 이메일 가입 본체 — app/signup/actions.ts(쿠키 읽기·자동 로그인)가 감싸고, 회귀(db/test-auth.ts)가 같은 함수를 부른다.
// 동의가 먼저(2026-11-03 — docs/phase/my-life-restructure.md §16.3): 유효한 가입 동의가 없으면 계정을 만들지 않고,
// 있으면 동의 칸을 같은 insert 로 채운다. 입력 검사·문구·V3 트랙·가입 토큰 지급은 옮기기 전(app/signup/actions.ts)과 같다.

import bcrypt from "bcryptjs";

import { prisma } from "./db";
import { signupConsentFields, type SignupConsent } from "./signup-consent";
import { ensureWalletWithSignupGrant } from "./tokens/wallet";

export type EmailSignupResult = { ok: true; userId: string; email: string } | { ok: false; error: string; needConsent?: true };

export async function createEmailAccount(
  input: { email: unknown; password: unknown; name: unknown },
  consent: SignupConsent | null,
): Promise<EmailSignupResult> {
  if (!consent) return { ok: false, error: "가입 전에 이용 동의가 필요해요.", needConsent: true };
  const email = (typeof input.email === "string" ? input.email : "").trim().toLowerCase();
  const password = typeof input.password === "string" ? input.password : "";
  const name = (typeof input.name === "string" ? input.name : "").trim() || null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "올바른 이메일 주소를 입력해주세요." };
  }
  if (password.length < 8) {
    return { ok: false, error: "비밀번호는 8자 이상이어야 해요." };
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) return { ok: false, error: "이미 사용 중인 이메일이에요." };

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? email.split("@")[0],
      passwordHash,
      onboardingTrack: "V3", // v3 P17 — 신규 가입은 V3 파이프라인
      ...signupConsentFields(consent),
    },
    select: { id: true },
  });

  await ensureWalletWithSignupGrant(user.id);
  return { ok: true, userId: user.id, email };
}
