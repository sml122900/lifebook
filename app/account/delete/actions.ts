"use server";

import { redirect } from "next/navigation";

import { auth, signOut } from "@/auth";
import { deleteAccountTx } from "@/lib/account-deletion";

// PIPA 동의 철회권 — 회원 탈퇴. 트랜잭션 본체는 lib/account-deletion.ts 로
// 추출해 검증 스크립트(db/test-withdrawal*.ts)와 공유한다 — 정책 주석도
// 그쪽에 있다.
export async function deleteAccountAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("not authenticated");
  }
  const userId = session.user.id;

  const confirmation = formData.get("confirmation");
  if (confirmation !== "탈퇴") {
    throw new Error("confirmation mismatch");
  }

  await deleteAccountTx(userId);

  await signOut({ redirect: false });
  redirect("/?withdrawn=1");
}
