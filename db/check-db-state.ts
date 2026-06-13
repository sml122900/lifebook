// 배포 전 운영 DB 점검 — 읽기 전용 (SELECT/count 만). 삭제·수정 없음.
//   실행: npx tsx db/check-db-state.ts
import "dotenv/config";

import { prisma } from "../lib/db";

function h(title: string) {
  console.log("\n" + "─".repeat(60) + "\n" + title);
}

async function main() {
  // ── 1. 테스트 데이터 잔존 ──────────────────────────────────
  h("1. 테스트 데이터 잔존");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      accounts: { select: { provider: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`User 총 ${users.length}명:`);
  for (const u of users) {
    const providers = u.accounts.map((a) => a.provider).join(",") || "(none)";
    console.log(
      `  - ${u.id} | name=${u.name ?? "null"} | email=${u.email ?? "null"} | provider=${providers} | ${u.createdAt.toISOString().slice(0, 10)}`,
    );
  }

  const testKeys = ["pk-1", "pk-2", "pk-4"];
  const testTokenOrders = await prisma.tokenOrder.findMany({
    where: { paymentKey: { in: testKeys } },
    select: { id: true, paymentKey: true, userId: true, status: true, krw: true },
  });
  console.log(`\nTokenOrder (pk-1/2/4 테스트 키): ${testTokenOrders.length}행`);
  testTokenOrders.forEach((o) =>
    console.log(`  - ${o.id} | ${o.paymentKey} | userId=${o.userId ?? "null"} | ${o.status} | ${o.krw}원`),
  );

  const allTokenOrders = await prisma.tokenOrder.findMany({
    select: { id: true, paymentKey: true, userId: true, status: true, krw: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nTokenOrder 전체: ${allTokenOrders.length}행`);
  allTokenOrders.forEach((o) =>
    console.log(`  - ${o.id} | key=${o.paymentKey ?? "null"} | userId=${o.userId ?? "null"} | ${o.status} | ${o.krw}원 | ${o.createdAt.toISOString().slice(0, 10)}`),
  );

  const productOrders = await prisma.productOrder.findMany({
    select: { id: true, paymentKey: true, userId: true, status: true, productId: true, totalKrw: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nProductOrder 전체: ${productOrders.length}행`);
  productOrders.forEach((o) =>
    console.log(`  - ${o.id} | key=${o.paymentKey ?? "null"} | userId=${o.userId ?? "null"} | ${o.status} | ${o.productId} | ${o.totalKrw}원 | ${o.createdAt.toISOString().slice(0, 10)}`),
  );

  // ── 2. 스키마 정합성 ──────────────────────────────────────
  h("2. 스키마 정합성");

  const migrations = await prisma.$queryRawUnsafe<
    { migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]
  >(
    `SELECT migration_name, finished_at, rolled_back_at FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 8`,
  );
  console.log("최근 마이그 8건 (finished_at / rolled_back):");
  migrations.forEach((m) =>
    console.log(`  - ${m.migration_name} | finished=${m.finished_at ? "Y" : "N"} | rolledback=${m.rolled_back_at ? "Y" : "N"}`),
  );
  const unfinished = migrations.filter((m) => !m.finished_at || m.rolled_back_at);
  console.log(unfinished.length === 0 ? "  → 미완료/롤백 마이그 없음 ✅" : `  ⚠️ 미완료/롤백 ${unfinished.length}건`);

  const productOrderTable = await prisma.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='ProductOrder') AS exists`,
  );
  console.log(`\nProductOrder 테이블 존재: ${productOrderTable[0]?.exists ? "✅" : "❌"}`);

  const enumVals = await prisma.$queryRawUnsafe<{ enumlabel: string }[]>(
    `SELECT enumlabel FROM pg_enum e JOIN pg_type t ON e.enumtypid=t.oid WHERE t.typname='ProductOrderStatus' ORDER BY e.enumsortorder`,
  );
  console.log(`ProductOrderStatus enum 값: [${enumVals.map((e) => e.enumlabel).join(", ")}]`);

  const indexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE tablename IN ('ProductOrder','TokenOrder','Account') ORDER BY tablename, indexname`,
  );
  console.log("ProductOrder/TokenOrder/Account 인덱스:");
  indexes.forEach((i) => console.log(`  - ${i.indexname}`));

  // ── 3. 운영 데이터 무결성 ─────────────────────────────────
  h("3. 운영 데이터 무결성");

  const negWallets = await prisma.tokenWallet.findMany({
    where: { balance: { lt: 0 } },
    select: { userId: true, balance: true },
  });
  console.log(`음수 잔액 지갑: ${negWallets.length}개 ${negWallets.length === 0 ? "✅" : "⚠️"}`);
  negWallets.forEach((w) => console.log(`  - userId=${w.userId} | balance=${w.balance}`));

  const allWallets = await prisma.tokenWallet.findMany({ select: { userId: true, balance: true } });
  console.log(`전체 지갑 ${allWallets.length}개:`);
  allWallets.forEach((w) => console.log(`  - userId=${w.userId} | balance=${w.balance}`));

  // 동의는 별도 테이블이 아니라 User 컬럼 3종(privacy/overseas/terms).
  const partialConsent = await prisma.user.findMany({
    where: {
      OR: [
        { AND: [{ privacyConsentAt: { not: null } }, { OR: [{ overseasTransferConsentAt: null }, { termsConsentAt: null }] }] },
        { AND: [{ overseasTransferConsentAt: { not: null } }, { OR: [{ privacyConsentAt: null }, { termsConsentAt: null }] }] },
        { AND: [{ termsConsentAt: { not: null } }, { OR: [{ privacyConsentAt: null }, { overseasTransferConsentAt: null }] }] },
      ],
    },
    select: { id: true, email: true, privacyConsentAt: true, overseasTransferConsentAt: true, termsConsentAt: true },
  });
  console.log(`\n불완전 동의(일부만 채워짐) User: ${partialConsent.length}명 ${partialConsent.length === 0 ? "✅" : "⚠️"}`);
  partialConsent.forEach((u) =>
    console.log(`  - ${u.id} | email=${u.email ?? "null"} | privacy=${u.privacyConsentAt ? "Y" : "N"} overseas=${u.overseasTransferConsentAt ? "Y" : "N"} terms=${u.termsConsentAt ? "Y" : "N"}`),
  );

  const providerCounts = await prisma.account.groupBy({
    by: ["provider"],
    _count: { _all: true },
  });
  console.log("\nAccount.provider 종류:");
  providerCounts.forEach((p) => console.log(`  - ${p.provider}: ${p._count._all}개`));
  const known = new Set(["google", "kakao", "naver"]);
  const unknown = providerCounts.filter((p) => !known.has(p.provider));
  console.log(unknown.length === 0 ? "  → 알려진 provider 만 ✅" : `  ⚠️ 미지의 provider ${unknown.length}종`);

  // ── 4. 고아 데이터 ────────────────────────────────────────
  h("4. 고아 데이터");

  const orphanTokenOrders = await prisma.tokenOrder.findMany({
    where: { userId: null },
    select: { id: true, paymentKey: true, status: true },
  });
  console.log(`userId=null TokenOrder: ${orphanTokenOrders.length}행`);
  orphanTokenOrders.forEach((o) => console.log(`  - ${o.id} | key=${o.paymentKey ?? "null"} | ${o.status}`));

  const orphanProductOrders = await prisma.productOrder.findMany({
    where: { userId: null },
    select: { id: true, paymentKey: true, status: true },
  });
  console.log(`userId=null ProductOrder: ${orphanProductOrders.length}행`);
  orphanProductOrders.forEach((o) => console.log(`  - ${o.id} | key=${o.paymentKey ?? "null"} | ${o.status}`));

  // Account 있는데 User 없는 행 (FK Cascade 라 정상이면 0)
  const danglingAccounts = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "Account" a LEFT JOIN "User" u ON a."userId"=u.id WHERE u.id IS NULL`,
  );
  console.log(`\nUser 없는 Account(dangling): ${Number(danglingAccounts[0]?.count ?? 0)}행 ${Number(danglingAccounts[0]?.count ?? 0) === 0 ? "✅" : "⚠️"}`);

  console.log("\n" + "═".repeat(60) + "\n점검 완료 (읽기 전용 — 변경 없음)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
