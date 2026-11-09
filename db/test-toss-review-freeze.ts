// 토스 카드사 심사 기간 고정 점검(2026-11-09 성민 — CLAUDE.md 맨 위 "토스 카드사 심사 중"). 쓰기 0 · 모델 호출 0 · 결제 호출 0.
// 심사 기간에 바뀌면 카드사 반려가 나는 것이 그대로인지 본다. 기준값은 이 파일에 글자 그대로 고정 — 코드 상수를 다시 읽어 비교하면
// 상수와 화면이 같이 바뀌어 못 잡으므로. 여기서 FAIL 이면 커밋·배포하지 말고 성민에게 보고(기준값을 고쳐 통과시키지 않는다).
//
//   ① 판매 설정값(코드) — 사업자 정보 · 공개 상품 = 인쇄본 하나 · 인쇄본 가격(장당 8,000원·배송비 0·최소 2장·최대 20장·최고가 160,000원) ·
//      토큰 충전 닫힘(TOPUP_OPEN)
//   ② 비로그인 화면(쿠키 없이 받은 HTML) — /shop · /shop/mylife-print 본문 글자 전체가 기준과 같음(가격 표시 포함) · 견본 그림 ·
//      푸터 글자 전체(/ · /shop · 상세)와 링크 3개 · 숨긴 상품 상세 404 · 품절 표시 없음 · 주문 진입(/shop/mylife-print/order) = 로그인으로
//   ③ 심사관 계정(test111@test.com — DB 읽기만) — 이름 "김순자"·테스트 표시·V3·출생연도 · 지도 수(시기·이야기·사람·장소·모임) ·
//      인쇄본 10장·표지 이름·80,000원
//
// 실행(배포 전): `npx next build` 뒤 `npx tsx db/test-toss-review-freeze.ts` — 이 빌드로 로컬 next start 를 스스로 띄웠다 끈다.
// 운영 확인: `npx tsx db/test-toss-review-freeze.ts --url https://lifebook-mauve.vercel.app`. `--show` = 뽑은 화면 글자 출력.

import "dotenv/config";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import { BUSINESS_INFO } from "../lib/commerce/business";
import { printOwnerName } from "../lib/commerce/print-orders";
import { PRINT_MAX_TOTAL_KRW, PRINT_MIN_PAGES, PRINT_PAGE_KRW, PRINT_SHIPPING_KRW, printOnSale, printPrice } from "../lib/commerce/print-price";
import { PRODUCTS } from "../lib/commerce/products";
import { prisma } from "../lib/db";
import { getMyLifeData } from "../lib/my-life";
import { DEFAULT_PRINT_OPTIONS, layoutPrint, PRINT } from "../lib/print-layout";
import { TOPUP_OPEN } from "../lib/tokens/policy";

// ── 기준값(2026-11-09 심사 시작 때 운영 화면·DB 그대로) ───────────────────────
const FROZEN_BUSINESS = {
  companyName: "라이프북",
  ceoName: "이성민",
  bizRegNo: "147-02-03988",
  address: "서울특별시 강남구 일원로9길 70, 402호(일원동)",
  csPhone: "010-5539-1947",
  csEmail: "sml122900@gmail.com",
  mailOrderRegNo: "2026-서울강남-04436",
  privacyOfficerName: "이성민",
  privacyOfficerTitle: "대표",
  hostingProvider: "Vercel Inc.",
};
const FROZEN_FOOTER_TEXT =
  "라이프북 대표자: 이성민 · 사업자등록번호: 147-02-03988 주소: 서울특별시 강남구 일원로9길 70, 402호(일원동) " +
  "고객센터: 010-5539-1947 · sml122900@gmail.com 통신판매업 신고번호: 2026-서울강남-04436 개인정보 처리방침 · 환불정책 · 이용약관";
const PRODUCT_LINE =
  "My Life 인쇄본 A4 세로 · 표지 포함 최대 20장 · 배송비 포함 내 My Life 지도를 시기별로 한 장씩 담은 인쇄본 — 가족과 한 장씩 넘기며 이야기해요.";
const FROZEN_SHOP_TEXT =
  "← 처음 화면으로 기록을 손에 잡히게 My Life 지도를 시기마다 한 장씩 담은 인쇄본으로 남겨 드려요. " +
  `${PRODUCT_LINE} 장당 8,000원 배송비는 따로 받지 않아요.`;
const FROZEN_DETAIL_TEXT =
  `← 상점으로 ${PRODUCT_LINE} 상품 · 한 장 8,000원 배송비 무료 합계 장수 × 8,000원 ` +
  "표지를 포함해 최소 2장(16,000원)부터 최대 20장(160,000원)까지예요. 장수와 결제 금액은 인쇄본 화면의 미리보기에서 확인하신 뒤 주문해요. 예: 7장이면 56,000원. " +
  "결제일로부터 최대 14일 이내에 배송해 드려요. " +
  "교환·반품·환불 · 주문 확인을 받으신 날(상품을 그보다 늦게 받으시면 받으신 날)부터 7일 안에 주문을 취소하거나 반품하실 수 있어요. " +
  "· 하자가 있거나 주문과 다르게 만들어졌으면 받으신 날부터 3개월, 아신 날부터 30일 안에 무상으로 다시 만들어 드리거나 환불해 드려요. " +
  "· 반품하신 상품을 돌려받은 날부터 3영업일 안에 환불해 드려요. 마음이 바뀐 반품은 반품 배송비를 고객님이 부담해요. " +
  "환불·교환 정책 자세히 보기 주문하기";
const LISTED_PRODUCT = "mylife-print";
const HIDDEN_PRODUCTS = ["poster", "charm", "book"];
const REVIEWER = {
  email: "test111@test.com",
  name: "김순자",
  isTestAccount: true,
  onboardingTrack: "V3",
  birthYear: 1950,
  // 시기(확정) · 시기(미확정) · 이야기 · 사람 · 장소 · 모임 · 장소 묶음 · 사용자 카테고리 항목
  counts: [7, 0, 11, 7, 6, 1, 0, 0],
  pages: 10,
  totalKrw: 80_000,
};

const ROOT = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const urlArg = args.includes("--url") ? args[args.indexOf("--url") + 1] : null;
const SHOW = args.includes("--show");
const PORT = 3197;

let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

// HTML → 보이는 글자(스크립트·주석 빼고, 태그 = 띄어쓰기, 공백 하나로).
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}
const part = (html: string, tag: string) => html.match(new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`))?.[0] ?? "";

async function get(base: string, p: string) {
  const res = await fetch(base + p, { redirect: "manual", headers: { "user-agent": "lifebook-toss-review-freeze" } });
  return { status: res.status, location: res.headers.get("location") ?? "", html: await res.text() };
}

// ① 판매 설정값(코드)
function checkSettings() {
  check("① 사업자 정보(푸터·처리방침 원천) = 기준", JSON.stringify(BUSINESS_INFO) === JSON.stringify(FROZEN_BUSINESS), BUSINESS_INFO);
  const listed = PRODUCTS.filter((p) => p.orderable !== false).map((p) => p.id);
  check("① 공개 상품 = 인쇄본 하나", JSON.stringify(listed) === JSON.stringify([LISTED_PRODUCT]), listed);
  check("① 상품 구성(정의된 상품) 그대로", JSON.stringify(PRODUCTS.map((p) => p.id)) === JSON.stringify(["poster", "charm", "book", "mylife-print"]), PRODUCTS.map((p) => p.id));
  check(
    "① 인쇄본 가격 = 장당 8,000원 · 배송비 0 · 최소 2장 · 최대 20장 · 최고가 160,000원 · 판매 중",
    PRINT_PAGE_KRW === 8_000 && PRINT_SHIPPING_KRW === 0 && PRINT_MIN_PAGES === 2 && PRINT.MAX_PAGES === 20 && PRINT_MAX_TOTAL_KRW === 160_000 && printOnSale(),
    { PRINT_PAGE_KRW, PRINT_SHIPPING_KRW, PRINT_MIN_PAGES, max: PRINT.MAX_PAGES, PRINT_MAX_TOTAL_KRW, onSale: printOnSale() },
  );
  check("① 토큰 충전 닫힘(TOPUP_OPEN = false)", TOPUP_OPEN === false);
}

// ② 비로그인 화면
async function checkScreens(base: string) {
  const shop = await get(base, "/shop");
  const detail = await get(base, `/shop/${LISTED_PRODUCT}`);
  const home = await get(base, "/");
  check("② /shop 비로그인 200", shop.status === 200, shop.status);
  check(`② /shop/${LISTED_PRODUCT} 비로그인 200`, detail.status === 200, detail.status);
  check("② / 비로그인 200", home.status === 200, home.status);

  const shopMain = part(shop.html, "main");
  const detailMain = part(detail.html, "main");
  const shopText = textOf(shopMain);
  const detailText = textOf(detailMain);
  if (SHOW) console.log(`\n[/shop 본문]\n${shopText}\n\n[/shop/${LISTED_PRODUCT} 본문]\n${detailText}\n`);
  check("② /shop 본문 글자 = 기준(상품 이름·규격·소개·장당 8,000원·배송비 안내)", shopText === FROZEN_SHOP_TEXT, shopText);
  check(`② /shop/${LISTED_PRODUCT} 본문 글자 = 기준(가격 표·최소·최대 장수·배송 기간·교환·반품·환불)`, detailText === FROZEN_DETAIL_TEXT, detailText);

  const productLinks = [...new Set([...shopMain.matchAll(/href="(\/shop\/[^"/?#]+)"/g)].map((m) => m[1]))];
  check("② /shop 상품 링크 = 인쇄본 하나", JSON.stringify(productLinks) === JSON.stringify([`/shop/${LISTED_PRODUCT}`]), productLinks);
  check("② 상세 견본 그림·대체 글자 그대로", detailMain.includes("print-cover.webp") && detailMain.includes('alt="My Life 인쇄본 표지와 차례 견본"'));
  check("② 상세 [주문하기] → 주문 경로", detailMain.includes(`href="/shop/${LISTED_PRODUCT}/order"`));
  check("② 품절 표시 없음(/shop·상세)", !/품절|일시 ?중단|판매 ?중지/.test(shopText + detailText));

  for (const [name, page] of [["/", home], ["/shop", shop], [`/shop/${LISTED_PRODUCT}`, detail]] as const) {
    const footer = part(page.html, "footer");
    const footerText = textOf(footer);
    if (SHOW && name === "/shop") console.log(`[푸터]\n${footerText}\n`);
    check(`② 푸터 글자 = 기준(${name})`, footerText === FROZEN_FOOTER_TEXT, footerText);
    check(`② 푸터 링크 처리방침·환불정책·이용약관(${name})`, ["/privacy", "/refund", "/terms"].every((h) => footer.includes(`href="${h}"`)));
  }

  for (const id of HIDDEN_PRODUCTS) {
    const r = await get(base, `/shop/${id}`);
    check(`② 숨긴 상품 상세 404(${id})`, r.status === 404, r.status);
  }
  const order = await get(base, `/shop/${LISTED_PRODUCT}/order`);
  check("② 주문 진입(비로그인) → 로그인으로", order.status >= 300 && order.status < 400 && order.location.includes("/login"), { status: order.status, location: order.location });
}

// ③ 심사관 계정(DB 읽기만)
async function checkReviewer() {
  const u = await prisma.user.findUnique({
    where: { email: REVIEWER.email },
    select: { id: true, name: true, isTestAccount: true, onboardingTrack: true, birthYear: true },
  });
  check("③ 심사관 계정 있음", !!u);
  if (!u) return;
  check(
    `③ 이름 "${REVIEWER.name}" · 테스트 표시 · V3 · 출생연도 ${REVIEWER.birthYear}`,
    u.name === REVIEWER.name && u.isTestAccount === REVIEWER.isTestAccount && u.onboardingTrack === REVIEWER.onboardingTrack && u.birthYear === REVIEWER.birthYear,
    u,
  );
  const userId = u.id;
  const counts = await Promise.all([
    prisma.lifeEvent.count({ where: { userId, status: { in: ["CONFIRMED", "CORRECTED"] } } }),
    prisma.lifeEvent.count({ where: { userId, status: "UNCONFIRMED" } }),
    prisma.episode.count({ where: { lifeEvent: { userId } } }),
    prisma.person.count({ where: { userId } }),
    prisma.place.count({ where: { userId } }),
    prisma.personGroup.count({ where: { userId } }),
    prisma.placeGroup.count({ where: { userId } }),
    prisma.customNode.count({ where: { userId } }),
  ]);
  check("③ 견본 지도 수 = 기준(시기 7 · 이야기 11 · 사람 7 · 장소 6 · 모임 1)", JSON.stringify(counts) === JSON.stringify(REVIEWER.counts), counts);
  const owner = await printOwnerName(userId);
  const layout = layoutPrint(await getMyLifeData(userId), owner, DEFAULT_PRINT_OPTIONS);
  const price = printPrice(layout.pageCount);
  const cover = layout.pages[0];
  const coverOwner = cover?.kind === "cover" ? cover.owner : null;
  check(
    `③ 인쇄본 ${REVIEWER.pages}장 · 표지 "${REVIEWER.name} 님의 이야기" · ${REVIEWER.totalKrw.toLocaleString()}원`,
    layout.pageCount === REVIEWER.pages && coverOwner === REVIEWER.name && price?.totalKrw === REVIEWER.totalKrw,
    { pages: layout.pageCount, owner: coverOwner, total: price?.totalKrw },
  );
}

// 로컬 next start(지금 빌드) — 배포 전 확인용
async function startLocal(): Promise<ChildProcess> {
  if (!fs.existsSync(path.join(ROOT, ".next", "BUILD_ID"))) throw new Error("빌드가 없어요 — `npx next build` 뒤에 실행하세요(또는 --url).");
  const base = `http://localhost:${PORT}`;
  const busy = await fetch(base, { redirect: "manual" }).then(() => true, () => false);
  if (busy) throw new Error(`포트 ${PORT} 이 이미 쓰이고 있어요.`);
  const child = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
    detached: process.platform !== "win32",
    env: { ...process.env, AUTH_TRUST_HOST: "true" },
  });
  const until = Date.now() + 90_000;
  while (Date.now() < until) {
    const ok = await fetch(`${base}/shop`, { redirect: "manual" }).then((r) => r.status === 200, () => false);
    if (ok) return child;
    await new Promise((r) => setTimeout(r, 1_000));
  }
  stopLocal(child);
  throw new Error("로컬 next start 가 90초 안에 뜨지 않았어요.");
}
function stopLocal(child: ChildProcess) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${child.pid} /T /F`, { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // 이미 끝남
  }
}

async function main() {
  console.log(`토스 심사 기간 고정 점검 — 화면: ${urlArg ?? `로컬 빌드(next start :${PORT})`}`);
  checkSettings();
  let child: ChildProcess | null = null;
  try {
    const base = urlArg ? urlArg.replace(/\/$/, "") : `http://localhost:${PORT}`;
    if (!urlArg) child = await startLocal();
    await checkScreens(base);
  } finally {
    if (child) stopLocal(child);
  }
  await checkReviewer();
  console.log(failed ? `\nFAIL ${failed} / ${count} — 심사 중 수정 금지 범위가 바뀜. 커밋·배포하지 말고 보고.` : `\nALL PASS (${count})`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
