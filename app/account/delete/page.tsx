import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";

import { WithdrawForm } from "./WithdrawForm";

// 회원 탈퇴 안내 + 확인. PIPA 동의 철회권에 대응.
// 사라지는 것 / 보존되는 것을 시니어 친화 톤으로 명확히 보여준다.
export default async function AccountDeletePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;

  // 탈퇴 시 영향을 받는 데이터 카운트 — 사용자가 무엇이 사라지는지 직접 확인.
  const [memoryCount, ownedRooms, sharedMemoryCount, paidOrderCount] =
    await Promise.all([
      prisma.userMemory.count({ where: { userId } }),
      prisma.sharedRoom.findMany({
        where: { ownerId: userId },
        select: {
          id: true,
          name: true,
          members: {
            where: { userId: { not: userId }, consentAt: { not: null } },
            select: { id: true },
          },
        },
      }),
      prisma.sharedMemory.count({ where: { createdById: userId } }),
      prisma.tokenOrder.count({ where: { userId, status: "paid" } }),
    ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-10">
      <Link
        href="/billing"
        className="self-start rounded-md border-2 border-zinc-300 px-4 py-2 text-base font-semibold text-zinc-800 hover:bg-zinc-100 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-500 focus-visible:ring-offset-2"
      >
        ← 돌아가기
      </Link>

      <header>
        <h1 className="text-3xl font-bold text-zinc-900">회원 탈퇴</h1>
        <p className="mt-3 text-lg text-zinc-700">
          탈퇴하면 아래 안내에 따라 정보가 처리됩니다. 한 번 진행하면 되돌릴 수
          없어요.
        </p>
      </header>

      <section className="rounded-md border-2 border-rose-200 bg-rose-50 p-5">
        <h2 className="text-2xl font-bold text-rose-900">사라지는 것</h2>
        <ul className="mt-3 space-y-2 text-lg text-zinc-900">
          <li>· 내가 적은 추억 <b>{memoryCount}건</b> (전부)</li>
          <li>· 남은 토큰 잔액</li>
          <li>· AI 대화 기록 · 트리거 응답 · 생애 정보</li>
          <li>· 로그인 정보 (소셜 연동 포함)</li>
        </ul>
      </section>

      <section className="rounded-md border-2 border-amber-200 bg-amber-50 p-5">
        <h2 className="text-2xl font-bold text-amber-900">가족 룸</h2>
        {ownedRooms.length === 0 ? (
          <p className="mt-3 text-lg text-zinc-900">
            소유한 가족 룸이 없어요. 멤버로 있던 룸에서는 자동으로 나갑니다.
          </p>
        ) : (
          <div className="mt-3 space-y-3 text-lg text-zinc-900">
            <p>회원님이 만든 가족 룸은 이렇게 처리됩니다:</p>
            <ul className="space-y-2">
              {ownedRooms.map((r) => {
                const hasSuccessor = r.members.length > 0;
                return (
                  <li key={r.id}>
                    · <b>{r.name}</b> —{" "}
                    {hasSuccessor
                      ? "다른 가족 멤버에게 룸 소유권이 자동으로 넘어가요."
                      : "다른 멤버가 없어 룸이 사라져요 (안의 공동 추억 포함)."}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-md border-2 border-emerald-200 bg-emerald-50 p-5">
        <h2 className="text-2xl font-bold text-emerald-900">남는 것</h2>
        <ul className="mt-3 space-y-2 text-lg text-zinc-900">
          {sharedMemoryCount > 0 && (
            <li>
              · 가족과 함께 채운 공동 추억 <b>{sharedMemoryCount}건</b>은
              남고, 작성자는 <b>"탈퇴한 사용자"</b>로 표시돼요.
            </li>
          )}
          {paidOrderCount > 0 && (
            <li>
              · 결제 영수증 <b>{paidOrderCount}건</b>은 전자상거래법에 따라
              5년간 익명으로 보관돼요.
            </li>
          )}
          {sharedMemoryCount === 0 && paidOrderCount === 0 && (
            <li>· 남는 정보가 없어요. 모든 개인정보가 삭제됩니다.</li>
          )}
        </ul>
      </section>

      <WithdrawForm />
    </main>
  );
}
