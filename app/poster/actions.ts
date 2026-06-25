"use server";

// 포스터 템플릿 선택 — /poster 템플릿 카드에서 호출.
//
// 고른 종(template)을 Poster.template 에 upsert 한 뒤 /poster/select 로 이동.
// 지금은 river(강물)만 실제 합성(P4 엔진) 대상 → READY_TEMPLATES 가드.
// zelkova·sephirot·custom 은 "준비 중"이라 저장·이동 안 함(무시).

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

// 실제 합성 가능한 템플릿만(나머지는 준비 중). zelkova/sephirot 합성·맞춤형(P5)은 후속.
const READY_TEMPLATES = new Set(["river"]);

export async function chooseTemplate(template: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // 막힌 템플릿이면 아무것도 안 함(클라에서 비활성이라 정상 흐름선 도달 X).
  if (!READY_TEMPLATES.has(template)) return;
  const userId = session.user.id;

  await prisma.poster.upsert({
    where: { userId },
    create: { userId, template },
    update: { template },
  });

  revalidatePath("/poster");
  redirect("/poster/select");
}
