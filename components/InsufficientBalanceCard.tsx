import Link from "next/link";

// 토큰 부족 안내 카드 (시니어 친화). 따뜻한 톤, 큰 글씨, 큰 터치 영역,
// 죄책감 유발 표현 없음. 잔액 부족으로 막힌 흐름에서 충전을 부드럽게 권한다.

type Props = {
  balance: number;
  required: number;
};

export function InsufficientBalanceCard({ balance, required }: Props) {
  return (
    <section className="rounded-md border-2 border-amber-300 bg-amber-50 p-6">
      <p className="text-2xl font-bold text-zinc-900">
        토큰이 부족해요. 충전하시겠어요?
      </p>
      <p className="mt-3 text-lg text-zinc-800">
        지금 남은 토큰은 {balance.toLocaleString()}개예요. 추억 한 번을 시작하려면
        {" "}{required}개가 필요해요.
      </p>
      <p className="mt-2 text-base text-zinc-700">
        걱정하지 마세요. 잠깐 충전하시고 다시 오시면 그대로 이어집니다.
      </p>
      <Link
        href="/billing"
        className="mt-5 inline-block rounded-md bg-amber-700 px-6 py-4 text-lg font-semibold text-white hover:bg-amber-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-amber-400 focus-visible:ring-offset-2"
      >
        토큰 충전하러 가기
      </Link>
    </section>
  );
}
