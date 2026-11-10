// My Life 인쇄본 회귀(2026-11-08 — docs/phase/print-mylife.md §10 P1·P2·P4). LLM 0 · 결제 호출 0.
//
//   ① 배치(합성 지도) — 중앙값·최대 계정 장수가 설계 어림 안 · 장 안 계 상자 겹침 0 · 본문 밖 0 · 위성이 열 안 · 이야기는 한 번씩 ·
//      시기 행성 크기(이야기 0~1·2~3·4 이상) · 표지 차례
//   ② 빼기(출력본에만) — 시기(이야기 함께)·이야기·사람·장소·모임·장소 묶음·사용자 카테고리·항목 · 없는 노드 키 무시
//   ③ 간선 켜고 끄기 — 사람 끄면 사람·모임 위성·점선 0, 오른쪽 목록은 남음 · 장소 끄기 따로 · 한 장 계 상자 최대 6(§2.3 "6번 넘게" 규칙 불필요)
//   ④ 다른 분 이름 첫 글자 — 위성·목록·인물록만 · 장소·주인 이름 그대로
//   ⑤ 장 이어짐(나누기) — 이어서·다음 장 이름·앞 장 이름 · 나온 장 번호
//   ⑥ 장수 상한·가격(2026-11-09 장당 8,000원·배송비 포함 — 구간 폐기) — 20장 넘으면 overLimit · 장수 × 8,000원 · 1~20장 밖 = 금액 없음 ·
//      최고가 160,000원 = 20장 · 금액 없거나 최고가 넘으면 판매 안 함 · 상품 공개(장당 표시·무료배송) · 화면 금액 줄 = 서버 주문과 같은 함수
//   ⑦ PDF 묶기 — 머리·쪽 수·xref 위치·표지만 재단선
//   ⑧ DB(픽스처 계정) — 편집 상태 저장·불러오기(이상한 키 거름) · 금액 없으면 주문 거절(행 0) · 주문 = 서버가 다시 센 장수·금액(장당 × 장수)·스냅샷 ·
//      배송지 없음·상한 넘음 거절 · 편집·주문 뒤에도 실제 지도 그대로 · 남의 계정 편집 상태 안 보임
//   ⑨ 화면·결제 — 성공 화면이 인쇄 주문만 위젯 시크릿 키로 확인 · 주문 제작 청약철회 제한 문구 없음 · 숨긴 상품 상세 404 ·
//      인쇄 상품 주문 화면 → /my-life/print · 실결제 꺼짐 · 문구 확정
//   ⑪ 결제 수단 미선택 연타(2026-11-09) — 대기 주문 1건(재사용·동시 잠금) · 위젯 거절 = 결제 수단 안내
//   ⑫ 토큰 충전(2026-11-09 비공개 → 2026-11-10 다시 엶 — 토스 포인트충전 업종 심사) — 충전 주문 = 서버 정본 금액 · 결제위젯 v2(옛 결제창 없음)·
//      성공 화면 위젯 시크릿 키 · 충전 진입 버튼·충전 안내는 TOPUP_OPEN 한 값으로 · 환불 문장 한 곳(환불정책·약관 제25조·충전 화면·상점·고객센터) ·
//      "충전한 토큰은 환불이 어렵습니다" 없음 · 환불 계산(원장 → 무료 먼저·먼저 충전한 것부터 · 7일 안 안 쓴 충전 전액 · 그 밖 남은 토큰 비율) ·
//      상점 카테고리(인쇄본 · 토큰 충전) 각 1개 이상 ·
//      (2026-11-10 2차) 하루 충전 한도 49,999원(주문 만들 때·승인 전 두 번 거절) · 환불 실행(관리자 — 가짜 토스 취소로: 미사용 전액·일부 사용 비례·
//      무료 토큰 제외·같은 충전 두 번 거절·토스 취소 실패 시 원장·지갑 그대로) · 테스트 계정 AI 한도 문구 = 일반 문구 · 랜딩 상점 링크
//   ⑩ 강물 포스터 판매 종료(2026-11-08 — test-v3-poster-bridge 퇴역, 주문 막기 검사는 여기로) — 숨긴 상품(책·씨앗·포스터) 주문 거절 ·
//      인쇄본은 일반 주문 경로 거절(인쇄본 화면 경로만 — 2026-11-09) ·
//      포스터 그리기 코드 없음 · 옛 /poster 주소 → 인쇄본 · 보존 주문 2건만 그림(관리자·주인 주문 상세)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

import { deleteAccountTx } from "../lib/account-deletion";
import { createPendingPrintOrder, getPrintDraft, PRINT_PAYMENT_LIVE_ENABLED, PRINT_PRODUCT_ID, sanitizePrintOptions, savePrintDraft, type PrintSnapshot } from "../lib/commerce/print-orders";
import { PRINT_MAX_TOTAL_KRW, PRINT_MIN_PAGES, PRINT_PAGE_KRW, PRINT_SHIPPING_KRW, printOnSale, printPrice } from "../lib/commerce/print-price";
import { getProduct, shippingKrwOf } from "../lib/commerce/products";
import { createPendingProductOrder } from "../lib/commerce/orders";
import { PRODUCTS } from "../lib/commerce/products";
import { TOKEN_REFUND_LINES } from "../lib/commerce/order-display";
import { createPendingOrder } from "../lib/tokens/orders";
import { checkTopupDailyLimit, settleOrderAfterToss, topupRemainingTodayKrw, TopupDailyLimitError } from "../lib/tokens/orders";
import { lowBalanceTail, TOPUP_DAILY_LIMIT_KRW, TOPUP_OPEN, TOPUP_PACKAGES } from "../lib/tokens/policy";
import { quoteTopupRefunds, type LedgerRow } from "../lib/tokens/refund";
import { refundTopupOrder, type TopupCancelArgs } from "../lib/tokens/refund-exec";
import { TossConfirmError } from "../lib/tokens/toss";
import { chargeOneShot } from "../lib/tokens/charge";
import { ensureWalletWithSignupGrant } from "../lib/tokens/wallet";
import { BUDGET_COPY } from "../lib/budget-copy";
import { FREE_CHAT_COPY } from "../lib/free-chat-copy";
import { INTERVIEW_COPY } from "../lib/interview/copy";
import { MY_LIFE_COPY } from "../lib/my-life-copy";
import { keptPosterImages } from "../lib/commerce/kept-poster";
import { CURRENT_CONSENT_VERSION } from "../lib/consent-version";
import { prisma } from "../lib/db";
import type { MyLifeData } from "../lib/my-life";
import { getMyLifeData } from "../lib/my-life";
import { addLink, createGroupNode, createPeriodNode, createPersonNode, createPlaceNode, createStoryNode } from "../lib/my-life-edit";
import { DEFAULT_PRINT_OPTIONS, initialName, layoutPrint, liveKeys, PRINT, printKey, type PrintLayout, type PrintOptions, type PrintPage } from "../lib/print-layout";
import { buildPdf } from "../lib/print-pdf";

const ROOT = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), "utf8");
let failed = 0;
let count = 0;
function check(label: string, ok: boolean, detail?: unknown) {
  count += 1;
  console.log(`${ok ? "PASS" : "FAIL"} — ${label}${!ok && detail !== undefined ? ` :: ${JSON.stringify(detail)}` : ""}`);
  if (!ok) failed += 1;
}

// ── 합성 지도 ─────────────────────────────────────────────
type Spec = { periods: number; stories: number[]; people: number; places: number; chipsPerStory: number };
function synth(spec: Spec): MyLifeData {
  const people = Array.from({ length: spec.people }, (_, i) => ({ id: `p${i}`, name: `김영${i}희`, relation: i % 2 ? "친구" : null, metYear: null, groupIds: [], body: "", birthYear: null, memo: null }));
  const places = Array.from({ length: spec.places }, (_, i) => ({ id: `l${i}`, name: `장소${i}`, address: null, source: null, lat: null, lng: null, groupIds: [] }));
  let k = 0;
  const events = Array.from({ length: spec.periods }, (_, i) => {
    const id = `e${i}`;
    const stories = Array.from({ length: spec.stories[i] ?? 0 }, (_, j) => {
      const chips = Array.from({ length: spec.chipsPerStory }, () => {
        const n = k++;
        return n % 3 === 2 && places.length
          ? { kind: "place" as const, id: places[n % places.length].id, name: "" }
          : people.length
            ? { kind: "person" as const, id: people[n % people.length].id, name: "" }
            : null;
      }).filter((c): c is NonNullable<typeof c> => !!c);
      return { id: `s${i}_${j}`, kind: "STORY" as const, title: `이야기 ${i}-${j}`, content: "", primaryEventId: id, otherEventIds: [], subjectPersonId: null, chips, richBody: false, bodyVersion: 0, decor: j === 0 ? "ring" : null };
    });
    return { id, type: "CUSTOM" as const, label: `시기 ${i}`, year: 1960 + i * 5, endYear: 1963 + i * 5, stories, decor: null, personIds: people.length ? [people[i % people.length].id] : [], placeIds: [], groupIds: [] };
  });
  return { events, people, groups: [], places, placeGroups: [] } as unknown as MyLifeData;
}

const periodPages = (l: PrintLayout) => l.pages.filter((p): p is Extract<PrintPage, { kind: "period" }> => p.kind === "period");
function geometryProblems(l: PrintLayout): string[] {
  const out: string[] = [];
  periodPages(l).forEach((p, i) => {
    let prevEnd = -1;
    for (const s of p.systems) {
      const top = s.y - PRINT.SYS_PAD;
      if (top < prevEnd) out.push(`장${i} 겹침 ${s.key}`);
      if (top + s.h > PRINT.BODY_H) out.push(`장${i} 본문 밖 ${s.key}`);
      for (const sat of s.sats) if (sat.x - PRINT.SAT_CELL_W / 2 < 0 || sat.x + PRINT.SAT_CELL_W / 2 > PRINT.COL_W || sat.y + PRINT.SAT_D / 2 + 48 > top + s.h) out.push(`장${i} 위성 밖 ${sat.key}`);
      prevEnd = top + s.h;
    }
    for (const e of p.list) if (e.y > PRINT.BODY_H) out.push(`장${i} 목록 밖`);
  });
  return out;
}
const storyKeys = (l: PrintLayout) => periodPages(l).flatMap((p) => p.systems.filter((s) => s.kind === "story").map((s) => s.key));
const allSatNames = (l: PrintLayout) => periodPages(l).flatMap((p) => [...p.systems.flatMap((s) => s.sats.map((x) => x.name)), ...p.list.map((x) => x.name)]);

const EMAIL = "fixture-print@lifebook.invalid";
const EMAIL_B = "fixture-print-b@lifebook.invalid";
const EMAIL_C = "fixture-print-c@lifebook.invalid"; // ⑫ 토큰 환불(2026-11-10)
async function removeFixtures() {
  for (const email of [EMAIL, EMAIL_B, EMAIL_C]) {
    const u = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) continue;
    await prisma.tokenOrder.deleteMany({ where: { userId: u.id } }); // 결제된 충전은 탈퇴해도 남으므로(5년 보존) 픽스처 것은 먼저 지움
    await deleteAccountTx(u.id);
  }
}

async function main() {
  // ① 배치
  const median = synth({ periods: 8, stories: [1, 0, 1, 0, 1, 0, 1, 0], people: 2, places: 0, chipsPerStory: 1 });
  const maxSpec = synth({ periods: 8, stories: [3, 3, 3, 3, 3, 3, 3, 2], people: 12, places: 14, chipsPerStory: 2 });
  const lMed = layoutPrint(median, "주인", DEFAULT_PRINT_OPTIONS);
  const lMax = layoutPrint(maxSpec, "주인", DEFAULT_PRINT_OPTIONS);
  console.log(`  (장수 — 중앙값 ${lMed.pageCount}장 · 최대 ${lMax.pageCount}장)`);
  // 장 채움 = 시기 장마다 마지막 계 끝 ÷ 본문 높이(계 상자 경계에서만 나누므로 빈칸이 생김 — 평균 60% 이상이면 장이 헛되이 늘지 않음).
  // 실제 지도(2026-11-08 운영 V3 4계정, 전부 테스트 계정 — 읽기만): 7·7·8·12장. 아래 무거운 합성(이야기마다 위성 2 + 시기마다 사람)은 실제 최대보다 무거움.
  const fill = (l: PrintLayout) => {
    const ps = periodPages(l);
    return ps.reduce((n, p) => n + (p.systems[p.systems.length - 1].y - PRINT.SYS_PAD + p.systems[p.systems.length - 1].h) / PRINT.BODY_H, 0) / ps.length;
  };
  check("① 장수 — 중앙값 합성 4~7장 · 무거운 합성 ≤ 20장 · 시기 장 채움 평균 60% 이상", lMed.pageCount >= 4 && lMed.pageCount <= 7 && lMax.pageCount <= PRINT.MAX_PAGES && fill(lMax) >= 0.6, { med: lMed.pageCount, max: lMax.pageCount, fill: fill(lMax) });
  check("① 장 안 계 상자 겹침 0 · 본문 밖 0 · 위성이 시간 줄기 열 안 · 목록 본문 안", [...geometryProblems(lMed), ...geometryProblems(lMax)].length === 0, [...geometryProblems(lMed), ...geometryProblems(lMax)].slice(0, 5));
  const wantStories = maxSpec.events.flatMap((e) => e.stories.map((s) => printKey.story(s.id))).sort();
  check("① 이야기는 주 소속 시기에서 한 번씩", JSON.stringify([...storyKeys(lMax)].sort()) === JSON.stringify(wantStories));
  const p0 = periodPages(lMax)[0].systems[0];
  const big = layoutPrint(synth({ periods: 1, stories: [5], people: 0, places: 0, chipsPerStory: 0 }), "", DEFAULT_PRINT_OPTIONS);
  check("① 시기 행성 크기 = 이야기 0~1·2~3·4 이상 → 128·144·160 · 이야기 128", periodPages(lMed)[0].systems[0].d === 128 && p0.d === 144 && periodPages(big)[0].systems[0].d === 160 && periodPages(big)[0].systems[1].d === 128);
  const cover = lMax.pages[0];
  check("① 표지 = 첫 장 · 차례에 시기마다 한 줄(장 번호)", cover.kind === "cover" && cover.toc.length === 8 && cover.toc.every((t) => t.page >= 2 && t.page <= lMax.pageCount) && cover.owner === "주인");

  // ② 빼기
  const ex1 = layoutPrint(maxSpec, "주인", { ...DEFAULT_PRINT_OPTIONS, excluded: [printKey.event("e0"), printKey.story("s1_0"), printKey.person("p0"), printKey.place("l2"), "ev:없는노드", "pe:없는사람"] });
  const keysEx1 = periodPages(ex1).flatMap((p) => [...p.systems.map((s) => s.key), ...p.systems.flatMap((s) => s.sats.map((x) => x.key)), ...p.list.map((x) => x.key)]);
  const peopleRows = ex1.pages.filter((p) => p.kind === "people").flatMap((p) => (p.kind === "people" ? p.rows.map((r) => r.name) : []));
  check("② 빼기 — 시기(그 이야기 함께)·이야기·사람·장소가 계·위성·목록·인물록에서 빠짐 · 없는 노드 키 무시",
    !keysEx1.some((k) => ["ev:e0", "st:s0_0", "st:s0_1", "st:s0_2", "st:s1_0", "pe:p0", "pl:l2"].includes(k)) && !peopleRows.includes("김영0희") && keysEx1.includes("st:s1_1") && ex1.pages.every((p) => p.kind !== "period" || p.systems.length > 0));
  const withGroups = { ...maxSpec, groups: [{ id: "g0", name: "동창회", memberIds: ["p1", "p2"] }], placeGroups: [{ id: "pg0", name: "고향", memberIds: ["l0"] }], custom: { categories: [{ id: "c0", name: "물건", refs: [] }], groups: [], items: [{ id: "i0", name: "라디오", categoryId: "c0", body: "", related: [] }, { id: "i1", name: "자전거", categoryId: "c0", body: "", related: [] }], builtinNames: { PEOPLE: null, PLACES: null } } } as MyLifeData;
  const rowsOf = (l: PrintLayout, kind: "people" | "places" | "custom") => l.pages.flatMap((p) => (p.kind === kind ? p.rows.map((r) => r.name) : []));
  const g0 = layoutPrint(withGroups, "", DEFAULT_PRINT_OPTIONS);
  const g1 = layoutPrint(withGroups, "", { ...DEFAULT_PRINT_OPTIONS, excluded: ["gl:g0", "pgl:pg0", "cn:i1"] });
  const g2 = layoutPrint(withGroups, "", { ...DEFAULT_PRINT_OPTIONS, excluded: ["cat:c0"] });
  check("② 모임·장소 묶음 빼기 = 묶음만 빠지고 안의 분·곳은 남음 · 항목 빼기 · 카테고리 빼기 = 그 장 없음",
    rowsOf(g0, "people").includes("동창회") && !rowsOf(g1, "people").includes("동창회") && rowsOf(g1, "people").includes("김영1희") &&
      rowsOf(g0, "places").includes("고향") && !rowsOf(g1, "places").includes("고향") && rowsOf(g1, "places").includes("장소0") &&
      rowsOf(g0, "custom").join() === "물건,라디오,자전거" && rowsOf(g1, "custom").join() === "물건,라디오" && rowsOf(g2, "custom").length === 0,
    { g0: rowsOf(g0, "custom"), g1: rowsOf(g1, "custom") });
  const live = liveKeys(withGroups);
  check("② 지금 지도 키 — 시기·이야기·사람·장소·모임·장소 묶음·카테고리·항목", ["ev:e0", "st:s0_0", "pe:p0", "pl:l0", "gl:g0", "pgl:pg0", "cat:c0", "cn:i0"].every((k) => live.has(k)) && !live.has("ev:없는노드"));

  // ③ 간선
  const offPeople = layoutPrint(maxSpec, "", { ...DEFAULT_PRINT_OPTIONS, showPeopleEdges: false });
  const offPlace = layoutPrint(maxSpec, "", { ...DEFAULT_PRINT_OPTIONS, showPlaceEdges: false });
  const kinds = (l: PrintLayout) => new Set(periodPages(l).flatMap((p) => [...p.systems.flatMap((s) => s.sats.map((x) => x.kind)), ...p.edges.map((e) => `edge:${e.kind}`)]));
  const listKinds = (l: PrintLayout) => new Set(periodPages(l).flatMap((p) => p.list.map((x) => x.kind)));
  check("③ 사람 간선 끄기 = 사람 위성·점선 0 · 장소는 그대로 · 오른쪽 목록에 사람 남음",
    !kinds(offPeople).has("person") && !kinds(offPeople).has("edge:person") && kinds(offPeople).has("place") && listKinds(offPeople).has("person"));
  check("③ 장소 간선 끄기 = 장소 위성·점선 0 · 사람 그대로 · 목록에 장소 남음",
    !kinds(offPlace).has("place") && !kinds(offPlace).has("edge:place") && kinds(offPlace).has("person") && listKinds(offPlace).has("place") && kinds(lMax).has("edge:person"));
  // §2.3 "한 분이 한 장에 6번 넘게 나오면 점선 없이 이야기 N편" — 한 장 계 상자가 최대 6개(위성 없는 계 144 × 6 + 사이 16 × 5 = 944 ≤ 1028)라
  // 생기지 않는다 → 규칙을 두지 않음. 그 전제(가장 작은 계로만 채워도 한 장 6개)를 확인.
  const tiny = layoutPrint(synth({ periods: 1, stories: [20], people: 1, places: 0, chipsPerStory: 1 }), "", { ...DEFAULT_PRINT_OPTIONS, showPeopleEdges: false });
  check("③ 한 장 계 상자 최대 6개(가장 작은 계로 채워도) → 한 분 점선 최대 6", Math.max(...periodPages(tiny).map((p) => p.systems.length)) === 6 && Math.max(...periodPages(lMax).map((p) => p.edges.length)) > 0);

  // ④ 이니셜
  const ini = layoutPrint(withGroups, "주인", { ...DEFAULT_PRINT_OPTIONS, initials: true });
  const names = allSatNames(ini).filter((n) => n.startsWith("김"));
  check("④ 다른 분 이름 첫 글자 — 위성·목록·인물록 \"김○○\" · 장소·모임·주인 이름 그대로 · 한 글자 이름 = ○",
    names.length > 0 && names.every((n) => n === "김○○") && rowsOf(ini, "people").filter((n) => n.startsWith("김")).every((n) => n === "김○○") &&
      allSatNames(ini).some((n) => n.startsWith("장소")) && rowsOf(ini, "people").includes("동창회") && ini.pages[0].kind === "cover" && ini.pages[0].owner === "주인" &&
      initialName("솔") === "○" && initialName("남궁민수") === "남○○");

  // ⑤ 장 이어짐
  const long = layoutPrint(synth({ periods: 2, stories: [12, 1], people: 6, places: 0, chipsPerStory: 3 }), "", DEFAULT_PRINT_OPTIONS);
  const lp = periodPages(long);
  check("⑤ 나누기 — 한 시기가 넘치면 다음 장 \"이어서\" · 앞 장은 다음 장으로 이어짐 · 앞 장·다음 장 이름 · 나온 장 번호",
    lp.length >= 3 && lp[0].continues && lp[1].continued && !lp[0].continued && lp[0].nextLabel === "시기 0" && lp[1].prevLabel === "시기 0" &&
      long.pages.some((p) => p.kind === "people" && p.rows.some((r) => r.pages.length > 1)),
    lp.map((p) => [p.continued, p.continues, p.periods.map((x) => x.label)]));

  // ⑥ 상한·가격(2026-11-09 장당 8,000원 · 배송비 포함)
  const huge = layoutPrint(synth({ periods: 40, stories: Array(40).fill(3), people: 4, places: 2, chipsPerStory: 3 }), "", DEFAULT_PRINT_OPTIONS);
  const p7 = printPrice(7);
  check("⑥ 20장 넘으면 overLimit · 금액 = 장당 8,000원 × 장수 + 배송 0(최소 2장 16,000 · 7장 56,000 · 20장 160,000) · 1장(표지만)·21장·소수 = 금액 없음",
    huge.overLimit && huge.pageCount > PRINT.MAX_PAGES && !lMax.overLimit && PRINT_PAGE_KRW === 8_000 && PRINT_SHIPPING_KRW === 0 &&
      !!p7 && p7.unitKrw === 8_000 && p7.quantity === 7 && p7.shippingKrw === 0 && p7.totalKrw === 56_000 && PRINT_MIN_PAGES === 2 && printPrice(2)?.totalKrw === 16_000 && printPrice(1) === null &&
      printPrice(20)?.totalKrw === 160_000 && printPrice(21) === null && printPrice(0) === null && printPrice(2.5) === null && printPrice(huge.pageCount) === null);
  const product = getProduct(PRINT_PRODUCT_ID);
  check("⑥ 최고가 160,000원 = 20장 · 판매 중(상품 공개 · 목록 장당 8,000원 · 무료배송) · 금액 0 또는 최고가 넘는 장당 금액 = 판매 안 함",
    PRINT_MAX_TOTAL_KRW === 160_000 && PRINT_PAGE_KRW * PRINT.MAX_PAGES === PRINT_MAX_TOTAL_KRW && printOnSale() && product?.orderable === true &&
      product.unitKrw === 8_000 && product.pricePrefix === "장당" && shippingKrwOf(product) === 0 && !printOnSale(0) && !printOnSale(8_001));
  const editor6 = read("app/my-life/print/PrintEditor.tsx");
  check("⑥ 화면 금액 줄·주문 단계 = 서버 주문과 같은 함수(printPrice) — 화면에 금액 계산식 따로 없음",
    editor6.includes("printPrice(layout.pageCount)") && editor6.includes("total={price.totalKrw}") && read("lib/commerce/print-orders.ts").includes("printPrice(layout.pageCount, pageKrw)") &&
      !/8_?000|tierFor/.test(editor6));

  const detail6 = read("app/shop/[productId]/page.tsx");
  check("⑥ 최소 2장(2026-11-09 성민) — 인쇄본 화면 금액 줄에 최소 장수 안내 · 상품 상세에 최소 2장 · 교환·반품·환불 요약 줄 + 환불정책 링크",
    editor6.includes("layout.pageCount < PRINT_MIN_PAGES") && editor6.includes("T.minPages(") && read("lib/print-copy.ts").includes("minPages:") &&
      detail6.includes("최소 {PRINT_MIN_PAGES}장") && detail6.includes("REFUND_SUMMARY_LINES.map") && detail6.includes('href="/refund"') &&
      read("lib/commerce/order-display.ts").includes("export const REFUND_SUMMARY_LINES"));

  // ⑦ PDF
  const fake = (n: number) => new Uint8Array(Array.from({ length: n }, (_, i) => (i * 7) % 256));
  const pdf = buildPdf([
    { jpeg: fake(500), pxW: 10, pxH: 14, mmW: 216, mmH: 303, trimMm: 3 },
    { jpeg: fake(300), pxW: 10, pxH: 14, mmW: 210, mmH: 297 },
    { jpeg: fake(200), pxW: 10, pxH: 14, mmW: 210, mmH: 297 },
  ]);
  const s = Buffer.from(pdf).toString("latin1");
  const xrefAt = Number(/startxref\n(\d+)/.exec(s)?.[1]);
  const offs = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  check("⑦ PDF — 머리 %PDF-1.4 · 쪽 3 · xref 가 객체 시작을 가리킴 · 재단선(TrimBox)은 표지만 · A4 = 595×842pt",
    s.startsWith("%PDF-1.4") && s.includes("/Count 3") && s.slice(xrefAt).startsWith("xref") && offs.length === 11 && offs.every((o, i) => s.slice(o).startsWith(`${i + 1} 0 obj`)) &&
      (s.match(/\/TrimBox/g) ?? []).length === 1 && s.includes("/MediaBox [0 0 595.28 841.89]") && s.trimEnd().endsWith("%%EOF"));

  // ⑧ DB(픽스처 계정)
  await removeFixtures();
  try {
    const now = new Date();
    const mk = async (email: string, name: string) =>
      (await prisma.user.create({ data: { email, name, birthYear: 1950, onboardingTrack: "V3", isTestAccount: true, termsConsentAt: now, privacyConsentAt: now, overseasTransferConsentAt: now, privacyConsentVersion: CURRENT_CONSENT_VERSION }, select: { id: true } })).id;
    const a = await mk(EMAIL, "[fixture] 인쇄");
    const b = await mk(EMAIL_B, "[fixture] 인쇄 남");
    const per1 = await createPeriodNode(a, { label: "[fixture] 국민학교", year: 1957, endYear: 1962 });
    const per2 = await createPeriodNode(a, { label: "[fixture] 첫 직장", year: 1970, endYear: null });
    if (!per1.ok || !per2.ok) throw new Error("시기 만들기 실패: " + JSON.stringify([per1, per2]));
    const mom = await createPersonNode(a, { name: "[fixture] 어머니", relation: "어머니" });
    const mate = await createPersonNode(a, { name: "[fixture] 짝꿍", relation: "친구" });
    const place = await createPlaceNode(a, { name: "[fixture] 학교 운동장" });
    if (!mom.ok || !("personId" in mom) || !mate.ok || !("personId" in mate) || !place.ok) throw new Error("사람·장소 만들기 실패");
    const st1 = await createStoryNode(a, { lifeEventId: per1.eventId, kind: "STORY", title: "[fixture] 운동회", content: "[fixture] 운동회 날 달리기를 했다.", personIds: [mom.personId], placeIds: [place.placeId] });
    const st2 = await createStoryNode(a, { lifeEventId: per2.eventId, kind: "STORY", title: "[fixture] 첫 월급", content: "[fixture] 첫 월급으로 내복을 샀다.", personIds: [mate.personId] });
    if (!st1.ok || !st2.ok) throw new Error("이야기 만들기 실패: " + JSON.stringify([st1, st2]));
    const grp = await createGroupNode(a, { name: "[fixture] 동네 친구들", memberIds: [mate.personId] });
    if (grp.ok) await addLink(a, { type: "EPISODE", id: st2.episodeId }, { type: "PERSON_GROUP", id: grp.groupId });

    const mapBefore = JSON.stringify(await getMyLifeData(a));
    const draftEmpty = await getPrintDraft(a);
    const saved = await savePrintDraft(a, { excluded: [printKey.story(st1.episodeId), "evil:<script>", 42, "pe:../../x"], showPeopleEdges: false, showPlaceEdges: true, initials: true, extra: "무시" });
    const back = await getPrintDraft(a);
    check("⑧ 편집 상태 — 처음 = 기본값 · 저장·불러오기 같음 · 모양 틀린 키·값 거름 · 남의 계정은 기본값",
      JSON.stringify(draftEmpty) === JSON.stringify(DEFAULT_PRINT_OPTIONS) && JSON.stringify(saved) === JSON.stringify(back) &&
        JSON.stringify(back.excluded) === JSON.stringify([printKey.story(st1.episodeId)]) && back.initials && !back.showPeopleEdges &&
        JSON.stringify(await getPrintDraft(b)) === JSON.stringify(DEFAULT_PRINT_OPTIONS),
      back);

    const ship = { recipientName: "[fixture] 받는 분", recipientPhone: "010-0000-0000", postalCode: "00000", address1: "[fixture] 주소", address2: null, jibunAddress: null, deliveryMemo: null };
    const notSale = await createPendingPrintOrder(a, back, ship, 0);
    const rowsAfterNotSale = await prisma.productOrder.count({ where: { userId: a } });
    check("⑧ 금액 없음(장당 0원) = 주문 거절 · 주문 행 0", !notSale.ok && rowsAfterNotSale === 0, notSale);
    const hidden = await Promise.all([
      createPendingProductOrder(a, "book", ship, "bank_transfer"),
      createPendingProductOrder(a, "charm", ship, "card"),
      createPendingProductOrder(a, "poster", ship, "card"),
      createPendingProductOrder(a, PRINT_PRODUCT_ID, ship, "card"),
    ]);
    check("⑩ 숨긴 상품(책 무통장·씨앗·판매 종료 포스터) · 인쇄본(인쇄본 화면 경로만) 일반 주문 경로 거절 · 주문 행 0",
      hidden.every((r) => !r.ok) && (await prisma.productOrder.count({ where: { userId: a } })) === 0, hidden);

    const noShip = await createPendingPrintOrder(a, back, { ...ship, address1: " " });
    const tooDear = await createPendingPrintOrder(a, back, ship, PRINT_MAX_TOTAL_KRW); // 장당 금액이 최고가를 넘게 — 판매 안 함
    // 화면이 보낸 값엔 지도에 없는 키를 섞음 — 서버는 지금 지도 키만 씀
    const opts: PrintOptions = { excluded: [printKey.story(st1.episodeId), "pe:cxxxxxxxxxxxxxxxxxxxxxxxxx"], showPeopleEdges: true, showPlaceEdges: true, initials: false };
    const ok = await createPendingPrintOrder(a, opts, ship);
    const order = ok.ok ? await prisma.productOrder.findUnique({ where: { id: ok.order.orderId } }) : null;
    const snap = order?.printSnapshot as unknown as PrintSnapshot | null;
    const recompute = layoutPrint(await getMyLifeData(a), "[fixture] 인쇄", sanitizePrintOptions(opts, liveKeys(await getMyLifeData(a))));
    const price = printPrice(recompute.pageCount)!;
    check("⑧ 배송지 없음·최고가 넘는 금액 = 거절(행 0)", !noShip.ok && !tooDear.ok && rowsAfterNotSale === 0, { noShip, tooDear });
    check("⑧ 주문 = 서버가 다시 센 장수 × 장당 8,000원 · 배송 0 · 화면 금액(printPrice)과 같음 · 결제창 상품명에 장수 · 상품 mylife-print · 카드·대기 · 테스트 결제(실결제 꺼짐) · 스냅샷 = 그 배치 · 지도에 없는 키는 버림",
      ok.ok && !!order && order.productId === PRINT_PRODUCT_ID && order.optionId === null && order.unitKrw === 8_000 && order.quantity === recompute.pageCount &&
        order.totalKrw === recompute.pageCount * 8_000 && order.totalKrw === price.totalKrw && ok.order.totalKrw === price.totalKrw && ok.order.orderName === `My Life 인쇄본 (${recompute.pageCount}장)` &&
        order.shippingKrw === 0 && order.paymentMethod === "card" && order.status === "pending" && order.paymentLive === false && PRINT_PAYMENT_LIVE_ENABLED === false &&
        !!snap && snap.layout.pageCount === recompute.pageCount && JSON.stringify(snap.options.excluded) === JSON.stringify([printKey.story(st1.episodeId)]) &&
        !JSON.stringify(snap.layout).includes("[fixture] 운동회") && JSON.stringify(snap.layout).includes("[fixture] 첫 월급") && snap.owner === "[fixture] 인쇄",
      { ok, order: order && { optionId: order.optionId, unit: order.unitKrw, qty: order.quantity, total: order.totalKrw }, pages: recompute.pageCount });
    // ⑪ 결제 수단 미선택 연타(2026-11-09) — [결제하기]를 여러 번(동시에도) 눌러도 미결제 대기 주문은 하나(같은 번호 다시 씀),
    //    배송지 등은 마지막 값. 화면은 위젯 거절을 "주문 실패"가 아니라 결제 수단 안내로, 창 닫기는 안내 없음.
    const taps = await Promise.all([1, 2, 3].map((k) => createPendingPrintOrder(a, opts, { ...ship, deliveryMemo: `[fixture] 연타 ${k}` })));
    const again = await createPendingPrintOrder(a, opts, { ...ship, recipientName: "[fixture] 마지막 받는 분" });
    const pendings = await prisma.productOrder.findMany({ where: { userId: a, productId: PRINT_PRODUCT_ID, status: "pending" }, select: { id: true, recipientName: true } });
    const ids = new Set([ok, ...taps, again].map((r) => (r.ok ? r.order.orderId : "x")));
    const editor11 = read("app/my-life/print/PrintEditor.tsx");
    check("⑪ 결제 수단 미선택 연타 — 대기 주문 1건(같은 주문 번호 다시 씀 · 동시에 눌러도) · 배송지 = 마지막 값 · 화면 = 결제 수단 안내(주문 실패 아님)·창 닫기 안내 없음",
      pendings.length === 1 && ids.size === 1 && !ids.has("x") && pendings[0].recipientName === "[fixture] 마지막 받는 분" &&
        editor11.includes(`setError(code === "USER_CANCEL" ? null : T.pickMethod);`) && read("lib/print-copy.ts").includes("pickMethod:"),
      { pendings, ids: [...ids] });
    // ⑫ 토큰 충전 열림 — 충전 주문 = 서버 정본 금액(패키지 id 만 받음) · 모르는 패키지 거절
    const topup = await createPendingOrder(a, "value");
    const topupRow = await prisma.tokenOrder.findUnique({ where: { id: topup.orderId }, select: { krw: true, tokens: true, status: true } });
    const unknownRefused = await createPendingOrder(a, "free-money").then(() => false, () => true);
    check("⑫ 토큰 충전 열림 — 충전 주문 = 서버 정본 금액(3,000원 330토큰 · 대기) · 모르는 패키지 거절",
      TOPUP_OPEN && topup.krw === 3_000 && topup.tokens === 330 && topup.orderName === "3,000원 330토큰" && topupRow?.krw === 3_000 && topupRow.tokens === 330 && topupRow.status === "pending" && unknownRefused,
      { topup, topupRow });

    // ⑫ 하루 충전 한도(2026-11-10) — 결제된 충전 합계 49,000원(10,000 × 4 + 5,000 + 3,000 + 1,000)이면 1,000원도 거절(50,000 > 49,999) ·
    //    미리 만든 대기 주문은 승인 전 확인에서 거절 · 다음 날(한국 시간)은 다시 49,999원
    let pkSeq = 0;
    const pay = async (userId: string, pkg: string) => {
      const o = await createPendingOrder(userId, pkg);
      const st = await settleOrderAfterToss(userId, o.orderId, `fixture-pk-${Date.now()}-${++pkSeq}`, o.krw);
      if (!st.ok) throw new Error("settle 실패: " + JSON.stringify(st));
      return o.orderId;
    };
    const earlyPending = await createPendingOrder(a, "starter");
    for (const pkg of ["max", "max", "max", "max", "popular", "value", "starter"]) await pay(a, pkg);
    const overErr = await createPendingOrder(a, "starter").then(() => null, (e) => e);
    const remainingNow = await topupRemainingTodayKrw(a);
    const tomorrow = await topupRemainingTodayKrw(a, new Date(Date.now() + 86_400_000));
    const preConfirm = await checkTopupDailyLimit(a, earlyPending.orderId);
    check("⑫ 하루 충전 한도 — 결제된 합계 49,000원이면 1,000원 주문 거절(남은 999원) · 먼저 만든 대기 주문도 승인 전 거절 · 다음 날 49,999원 · 한도 값 49,999",
      TOPUP_DAILY_LIMIT_KRW === 49_999 && overErr instanceof TopupDailyLimitError && overErr.remainingKrw === 999 && remainingNow === 999 && tomorrow === 49_999 && preConfirm === 999 &&
        read("app/billing/success/page.tsx").includes("checkTopupDailyLimit(userId, orderId)") && read("app/billing/TopupCheckout.tsx").includes("disabled={!ok}"),
      { remainingNow, tomorrow, preConfirm, over: overErr && String(overErr) });

    // ⑫ 환불 실행(2026-11-10) — 가짜 토스 취소(결제 호출 0). 무료 50(가입) → 충전 3,000원 330토큰(o1) → 30 사용(무료에서) → 환불 = 전액 3,000원·330토큰, 무료 20 남음.
    const c = await mk(EMAIL_C, "[fixture] 환불");
    await ensureWalletWithSignupGrant(c);
    const calls: TopupCancelArgs[] = [];
    const okCancel = async (x: TopupCancelArgs) => {
      calls.push(x);
    };
    const failCancel = async (x: TopupCancelArgs) => {
      calls.push(x);
      throw new TossConfirmError("FIXTURE_REJECT", "fixture cancel fail", 400);
    };
    const bal = async () => (await prisma.tokenWallet.findUnique({ where: { userId: c }, select: { balance: true } }))?.balance ?? -1;
    const ledgerCount = async () => prisma.tokenTransaction.count({ where: { userId: c } });
    const o1 = await pay(c, "value");
    await chargeOneShot(c, 0, 0, "fixture_use", undefined, 30);
    const r1 = await refundTopupOrder(o1, { cancel: okCancel });
    const b1 = await bal();
    check("⑫ 환불 — 안 쓴 충전(7일 안) = 결제 금액 전부(3,000원 · 330토큰 · 전액 취소 · 위젯 키 · 주문마다 중복 방지 키) · 무료 토큰 20은 남음(환불 대상 아님 · 무료 먼저 씀)",
      r1.ok && r1.refundKrw === 3_000 && r1.refundTokens === 330 && b1 === 20 && calls.length === 1 && calls[0].fullCancel && calls[0].cancelAmount === 3_000 &&
        calls[0].widget && calls[0].idempotencyKey === `token-refund-${o1}`,
      { r1, b1, calls });
    // 일부 사용 — 충전 3,000원 330토큰(o2) → 130 사용(무료 20 먼저 + 충전 110) → 남은 220 → 2,000원 부분 취소
    const o2 = await pay(c, "value");
    await chargeOneShot(c, 0, 0, "fixture_use", undefined, 130);
    const r2 = await refundTopupOrder(o2, { cancel: okCancel });
    const b2 = await bal();
    check("⑫ 환불 — 일부 쓴 충전 = 결제 금액 × 남은 ÷ 받은 토큰(3,000 × 220 ÷ 330 = 2,000원 · 부분 취소) · 지갑 0",
      r2.ok && r2.refundKrw === 2_000 && r2.refundTokens === 220 && b2 === 0 && calls.length === 2 && !calls[1].fullCancel && calls[1].cancelAmount === 2_000, { r2, b2, call: calls[1] });
    // 같은 충전 두 번 — 거절 · 토스 호출 없음
    const r3 = await refundTopupOrder(o1, { cancel: okCancel });
    check("⑫ 환불 — 같은 충전 두 번 = 거절(already_refunded) · 토스 취소 다시 안 부름", !r3.ok && r3.reason === "already_refunded" && calls.length === 2, r3);
    // 토스 취소 실패 — 원장·지갑 그대로 · 다시 성공하면 그때 처리
    const o3 = await pay(c, "starter");
    const [lc0, b0] = [await ledgerCount(), await bal()];
    const r4 = await refundTopupOrder(o3, { cancel: failCancel });
    const [lc1, b1x] = [await ledgerCount(), await bal()];
    const r5 = await refundTopupOrder(o3, { cancel: okCancel });
    check("⑫ 환불 — 토스 취소 실패 = 원장 줄 수·지갑 그대로(cancel_failed · 코드) → 다시 하면 그때 환불(1,000원 · 100토큰)",
      !r4.ok && r4.reason === "cancel_failed" && "code" in r4 && r4.code === "FIXTURE_REJECT" && lc1 === lc0 && b1x === b0 && b0 === 100 &&
        r5.ok && r5.refundKrw === 1_000 && r5.refundTokens === 100 && (await bal()) === 0,
      { r4, r5, lc0, lc1, b0, b1x });
    // 다 쓴 충전 = 돌려드릴 것 없음 · 내역 = "충전 환불" · 원장 계산이 환불 줄을 알아봄(환불한 충전 남은 0 · 다시 환불 금액 0)
    const o4 = await pay(c, "starter");
    await chargeOneShot(c, 0, 0, "fixture_use", undefined, 100);
    const r6 = await refundTopupOrder(o4, { cancel: okCancel });
    const led = await prisma.tokenTransaction.findMany({ where: { userId: c }, select: { id: true, delta: true, reason: true, refId: true, createdAt: true } });
    const paidC = await prisma.tokenOrder.findMany({ where: { userId: c, status: "paid" }, select: { id: true, krw: true, tokens: true, approvedAt: true } });
    const qC = quoteTopupRefunds(led, paidC);
    check("⑫ 환불 — 다 쓴 충전 = 거절(nothing_to_refund) · 환불 줄 3개(topup_refund · refId = 주문) · 다시 계산해도 환불한 충전은 0원 · 무료 + 유료 = 지갑 · 토큰 화면 라벨 \"충전 환불\"",
      !r6.ok && r6.reason === "nothing_to_refund" && led.filter((t) => t.reason === "topup_refund").length === 3 &&
        qC.quotes.filter((q) => q.refundedTokens > 0).every((q) => q.refundKrw === 0 && q.remaining === 0) && qC.free + qC.paid === (await bal()) &&
        read("app/account/tokens/page.tsx").includes('topup_refund: "충전 환불"') && (await prisma.tokenOrder.count({ where: { userId: c, status: "paid" } })) === 4,
      { r6, quotes: qC.quotes.map((q) => [q.krw, q.remaining, q.refundedTokens, q.refundKrw]) });
    const mapAfter = JSON.stringify(await getMyLifeData(a));
    check("⑧ 편집 저장·주문 뒤에도 실제 지도 그대로(getMyLifeData 같음)", mapBefore === mapAfter);
  } finally {
    await removeFixtures();
  }
  check("⑧ 픽스처 정리 — 탈퇴 경로로 편집 상태·대기 주문 함께 삭제", (await prisma.printDraft.count({ where: { user: { email: { in: [EMAIL, EMAIL_B, EMAIL_C] } } } })) === 0 && (await prisma.user.count({ where: { email: { in: [EMAIL, EMAIL_B, EMAIL_C] } } })) === 0 &&
    (await prisma.tokenOrder.count({ where: { paymentKey: { startsWith: "fixture-pk-" } } })) === 0);

  // ⑨ 화면·결제 소스
  const success = read("app/shop/order/success/page.tsx");
  const toss = read("lib/tokens/toss.ts");
  const editor = read("app/my-life/print/PrintEditor.tsx");
  check("⑨ 성공 화면 — 인쇄 주문만 결제위젯 시크릿 키로 확인(서버가 주문 상품을 보고 정함) · 위젯은 금액 먼저·결제수단·약관",
    success.includes("widget: kind === PRINT_PRODUCT_ID") && toss.includes("TOSS_WIDGET_SECRET_KEY") && editor.includes("setAmount") && editor.includes("renderPaymentMethods") && editor.includes("renderAgreement") && editor.includes("requestPayment"));
  check("⑨ 인쇄 주문 화면에 주문 제작 청약철회 제한 문구 없음(법률 검토 필요 — 성민 2026-11-08)", !/청약철회|제17조/.test(editor));
  check("⑨ 숨긴 상품(orderable false) 상세 404 · 인쇄 상품 주문 화면 → /my-life/print · 문구 확정(2026-11-10 — [임시] 표시 없음)",
    /orderable === false\) notFound\(\)/.test(read("app/shop/[productId]/page.tsx")) && read("app/shop/[productId]/order/page.tsx").includes('redirect("/my-life/print")') &&
      !read("lib/print-copy.ts").includes("[임시") && !read("lib/commerce/products.ts").includes("[임시"));

  // ⑫ 토큰 충전 — 화면·문구·결제위젯
  const billingLinkFiles = ["app/account/tokens/page.tsx", "app/account/delete/page.tsx", "app/components/VoiceTextarea.tsx", "app/life-timeline/free-record/FreeRecordClient.tsx",
    "app/memory/[eventId]/AnswerForm.tsx", "app/timemachine/[year]/[month]/AssistantPanel.tsx", "components/InsufficientBalanceCard.tsx"];
  const faq = read("app/help/HelpFaq.tsx");
  const checkout = read("app/billing/TopupCheckout.tsx");
  const billing = read("app/billing/page.tsx");
  check("⑫ 충전 진입 버튼·충전 권유·투어·서버 부족 안내 = TOPUP_OPEN 한 값(지금 열림 — 끝말 \"충전 후 다시\") · 차감 코드는 TOPUP_OPEN 모름",
    billing.includes("if (!TOPUP_OPEN) {") && billingLinkFiles.every((f) => read(f).includes("TOPUP_OPEN")) && faq.includes("filter((qa) => TOPUP_OPEN || !qa.topup)") &&
      read("lib/tours.ts").includes("(TOPUP_OPEN ?") && lowBalanceTail() === " 충전 후 다시 시도해 주세요." &&
      ["app/api/clova-stt/charge/route.ts", "app/api/companion/route.ts", "app/api/memory/[memoryId]/refine/route.ts", "app/api/refine-text/route.ts"].every((f) => read(f).includes("lowBalanceTail(")) &&
      !read("lib/tokens/charge.ts").includes("TOPUP_OPEN") && !read("lib/tokens/wallet.ts").includes("TOPUP_OPEN"));
  check("⑫ 충전 = 결제위젯 v2(인쇄본과 같은 위젯 키) — 금액 먼저·결제수단·약관·결제 요청 · 결제 금액 = 서버 주문 금액 · 옛 결제창(payment()) 없음 · 성공 화면 위젯 시크릿 키 · 위젯 거절 = 결제 수단 안내",
    !fs.existsSync(path.join(ROOT, "app/billing/TopupButton.tsx")) && checkout.includes("tp.widgets({ customerKey })") && checkout.includes("renderPaymentMethods") && checkout.includes("renderAgreement") &&
      checkout.includes('await w.setAmount({ currency: "KRW", value: order.krw });') && checkout.includes("requestPayment") && !/\.payment\(/.test(checkout) &&
      billing.includes("process.env.TOSS_WIDGET_CLIENT_KEY") && !billing.includes("TOSS_CLIENT_KEY;") && read("app/billing/success/page.tsx").includes("{ widget: true }") &&
      checkout.includes('setError(code === "USER_CANCEL" ? null : T.pickMethod);'));
  const refundUsers = ["app/refund/page.tsx", "app/terms/page.tsx", "app/billing/page.tsx", "app/shop/tokens/page.tsx", "app/help/HelpFaq.tsx"];
  const srcFiles = (dir: string): string[] =>
    fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((d) =>
      d.isDirectory() ? (d.name === "generated" ? [] : srcFiles(path.join(dir, d.name))) : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : []);
  const oldNoRefund = ["app", "lib", "components"].flatMap(srcFiles).filter((f) => /충전한 토큰은 환불이 어렵/.test(read(f).replace(/\/\/[^\n]*/g, "")));
  check("⑫ 토큰 환불 문장 한 곳(TOKEN_REFUND_LINES) — 환불정책·약관 제25조·충전 화면·상점 토큰 상세·고객센터 · 7일 안 안 쓴 충전 전액 · 남은 토큰만큼 · 무료 토큰 제외·무료 먼저 · 쓰는 곳 Lifebook 한 곳 · 옛 \"환불이 어렵습니다\" 없음",
    refundUsers.every((f) => read(f).includes("TOKEN_REFUND_LINES")) && read("app/terms/page.tsx").includes("제25조 (토큰의 충전·사용·환불)") &&
      TOKEN_REFUND_LINES[0].includes("7일 안에 하나도 쓰지 않은 충전은 결제 금액 전부") && TOKEN_REFUND_LINES[1].includes("남은 토큰만큼") &&
      TOKEN_REFUND_LINES[2].includes("무료로 받은 토큰은 환불하지 않아요") && TOKEN_REFUND_LINES[2].includes("무료로 받은 것부터 먼저") &&
      TOKEN_REFUND_LINES[3].includes("Lifebook 서비스 한 곳뿐") && oldNoRefund.length === 0 && (faq.match(/topup: true,/g) ?? []).length === 2,
    oldNoRefund);

  // ⑫ 환불 계산(원장 → 무료 먼저 · 먼저 충전한 것부터) — 순수 함수
  const day = (n: number) => new Date(Date.UTC(2030, 0, 1) + n * 86_400_000);
  let seq = 0;
  const row = (delta: number, reason: string, refId: string | null, d: number): LedgerRow => ({ id: `t${String(++seq).padStart(3, "0")}`, delta, reason, refId, createdAt: day(d) });
  const o1 = { id: "o1", krw: 3_000, tokens: 330, approvedAt: day(1) };
  const o2 = { id: "o2", krw: 1_000, tokens: 100, approvedAt: day(2) };
  const base = [row(50, "signup_grant", null, 0), row(330, "topup", "o1", 1)];
  const q1 = quoteTopupRefunds([...base, row(-30, "companion_haiku", null, 1)], [o1], day(3));
  const q2 = quoteTopupRefunds([...base, row(-30, "companion_haiku", null, 1), row(-140, "companion_sonnet", null, 2)], [o1], day(3));
  const q3 = quoteTopupRefunds(base, [o1], day(9));
  const q4 = quoteTopupRefunds([row(330, "topup", "o1", 1), row(-110, "companion_sonnet", null, 2)], [o1], day(3));
  const fifo = quoteTopupRefunds([row(100, "topup", "o2", 1), row(330, "topup", "o1", 2), row(-150, "companion_opus", null, 3)], [{ ...o2, approvedAt: day(1) }, { ...o1, approvedAt: day(2) }], day(4));
  const back = [row(330, "topup", "o1", 1), row(-50, "timemachine_assistant_context_miss_sonnet", null, 2)];
  const q6 = quoteTopupRefunds([...back, row(50, "timemachine_assistant_context_miss_refund", back[1].id, 2)], [o1], day(3));
  const q7 = quoteTopupRefunds([row(330, "topup", "o1", 1), row(5, "daily_attendance", null, 2), row(-5, "companion_haiku", null, 2)], [o1], day(3));
  check("⑫ 환불 계산 — 무료 먼저(가입 50 안에서 쓰면 충전 그대로 → 7일 안 전액) · 넘게 쓰면 남은 비율(3,000 × 210 ÷ 330 = 1,909) · 7일 지나도 안 썼으면 전액 · 화면 예시(330 중 110 씀 → 2,000원) · 먼저 충전한 것부터 · 차감 되돌림 = 원래 칸 · 출석 = 무료 · 무료 + 유료 = 원장 합",
    q1.quotes[0].unused && q1.quotes[0].within7Days && q1.quotes[0].refundKrw === 3_000 && q1.free === 20 &&
      q2.quotes[0].remaining === 210 && q2.quotes[0].refundKrw === 1_909 && q2.free === 0 && q2.free + q2.paid === 50 + 330 - 170 &&
      !q3.quotes[0].within7Days && q3.quotes[0].refundKrw === 3_000 &&
      q4.quotes[0].refundKrw === 2_000 && TOKEN_REFUND_LINES[1].includes("330토큰을 충전해 110토큰을 쓰셨다면 2,000원") &&
      fifo.quotes[0].remaining === 0 && fifo.quotes[0].refundKrw === 0 && fifo.quotes[1].remaining === 280 && fifo.quotes[1].refundKrw === 2_545 &&
      q6.quotes[0].unused && q6.quotes[0].refundKrw === 3_000 && q6.free === 0 && q7.quotes[0].unused && q7.free === 0,
    { q1: q1.quotes, q2: q2.quotes, q4: q4.quotes, fifo: fifo.quotes, q6: q6.quotes, q7: q7.quotes });
  // ⑫ 관리자 환불 화면 — ADMIN_EMAILS 재검증 · 금액 확인 체크 · 실행 = refundTopupOrder · 관리자 머리 줄 링크
  const adminAct = read("app/admin/tokens/actions.ts");
  check("⑫ 관리자 환불 화면(/admin/tokens) — 액션마다 관리자 확인 · 금액 확인 체크 없으면 실행 안 함 · 실행 = refundTopupOrder · 머리 줄 [토큰 충전]",
    adminAct.includes("isAdminEmail(session?.user?.email)") && adminAct.includes(`formData.get("confirm") !== "on"`) && adminAct.includes("await refundTopupOrder(orderId)") &&
      read("app/admin/layout.tsx").includes('href="/admin/tokens"') && read("app/admin/tokens/page.tsx").includes("listTopupOrdersForAdmin()"));
  // ⑫ 테스트 계정 AI 한도 문구 = 일반 문구(2026-11-10 — 심사관 계정도 테스트 계정) · "테스트 계정" 말 없음
  check("⑫ 테스트 계정 AI 한도 문구 4곳 = 일반 문구(공통·이야기 나누기·지도 AI·인터뷰) · 화면 문구에 \"테스트 계정\" 없음",
    BUDGET_COPY.test === BUDGET_COPY.daily && FREE_CHAT_COPY.testBudgetPaused === FREE_CHAT_COPY.budgetPaused &&
      MY_LIFE_COPY.ask.errors.testBudget === MY_LIFE_COPY.ask.errors.budget && INTERVIEW_COPY.testBudget === BUDGET_COPY.daily &&
      ["lib/budget-copy.ts", "lib/free-chat-copy.ts", "lib/my-life-copy.ts", "lib/interview/copy.ts"].every((f) => !/"[^"\n]*테스트 계정[^"\n]*"/.test(read(f).replace(/\/\/[^\n]*/g, ""))));
  // ⑫ 로그인 전 메인 → 상점 직접 링크(2026-11-10) · 토큰 소개 = 지금 쓰는 곳(AI에게 물어보기) · V2 전용 기능 이름 없음
  check("⑫ 랜딩 상품 칸 — 토큰 카드(→ /shop/tokens) · [상점 전체 보기](→ /shop) · 토큰 소개 = AI에게 물어보기(그 시절 검색 포함) 등 일부 AI 기능(글 다듬기·말동무 없음)",
    read("lib/landing-copy.ts").includes('href: "/shop/tokens"') && read("lib/landing-copy.ts").includes('shopAll: { label: "상점 전체 보기", href: "/shop" }') &&
      read("app/page.tsx").includes("{PRODUCT.shopAll.label} →") && read("lib/tokens/policy.ts").includes("AI에게 물어보기(그 시절 검색 포함) 등 일부 AI 기능") &&
      !/글 다듬기|말동무/.test(read("lib/tokens/policy.ts").match(/blurb: "[^"]*"/)?.[0] ?? "x"));
  const shopPage = read("app/shop/page.tsx");
  check("⑫ 상점 카테고리 — 인쇄본(공개 상품 = My Life 인쇄본) · 토큰 충전(패키지 4개 → /shop/tokens → [충전하러 가기] /billing) 각 1개 이상",
    JSON.stringify(PRODUCTS.filter((p) => p.orderable !== false).map((p) => p.id)) === JSON.stringify(["mylife-print"]) && TOPUP_PACKAGES.length === 4 &&
      shopPage.includes('id="shop-print"') && shopPage.includes('id="shop-tokens"') && shopPage.includes('href="/shop/tokens"') && read("app/shop/tokens/page.tsx").includes('href="/billing"'));

  // ⑩ 강물 포스터 판매 종료
  const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));
  check("⑩ 포스터 — 상품 숨김(목록·상세·주문 없음) · 그리기 코드·맞춤 배경·포스터 주문 모듈 없음 · 옛 /poster 주소 → /my-life/print",
    getProduct("poster")?.orderable === false && !exists("app/poster") && !exists("lib/poster") && !exists("app/api/poster") && !exists("lib/commerce/poster-orders.ts") &&
      !exists("public/poster/river-bg.png") && read("next.config.ts").includes('{ source: "/poster/:path*", destination: "/my-life/print", permanent: false }'));
  check("⑩ 보존 주문 그림 — 2건만(다른 주문 = 그림 없음, Storage 호출 0) · 관리자 발주·주인 주문 상세가 보여 줌",
    (await keptPosterImages("cxxxxxxxxxxxxxxxxxxxxxxxx")) === null && read("app/admin/orders/[orderId]/page.tsx").includes("await keptPosterImages(order.id)") &&
      read("app/account/orders/[orderId]/page.tsx").includes("await keptPosterImages(order.id)"));

  console.log(failed ? `\nFAIL ${failed} / ${count}` : `\nALL PASS (${count})`);
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await removeFixtures().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
